const config = require("../config");
const { ensureSchema, getPool, checkDatabase } = require("../db");
const { snapshot } = require("../persist");

class RuntimeRepository {
  constructor() {
    this.mode = config.DATABASE_URL
      ? "postgres"
      : config.isServerless
        ? "ephemeral"
        : "file";
    this.hydrated = false;
    this.hydrating = null;
    this.saving = Promise.resolve();
  }

  async hydrate(engine, { force = false } = {}) {
    if (this.mode !== "postgres") return;
    if (this.hydrated && !force) return;
    if (this.hydrating) return this.hydrating;

    this.hydrating = this._hydrate(engine);
    try {
      await this.hydrating;
      this.hydrated = true;
    } finally {
      this.hydrating = null;
    }
  }

  async _hydrate(engine) {
    await ensureSchema();
    const database = getPool();
    const [stateResult, purchasesResult] = await Promise.all([
      database.query(
        "SELECT state, version, updated_at FROM vmule_runtime_state WHERE scope = $1",
        ["global"]
      ),
      database.query(
        "SELECT data FROM vmule_purchases ORDER BY updated_at DESC"
      ),
    ]);

    const row = stateResult.rows[0];
    if (!row) {
      await this.persist(engine);
      return;
    }

    engine.hydrate(
      row.state,
      purchasesResult.rows.map((item) => item.data)
    );
  }

  async persist(engine) {
    if (this.mode !== "postgres") return;
    const state = snapshot(engine.state);
    const purchases = engine.purchases.map((purchase) => ({ ...purchase }));

    this.saving = this.saving.then(async () => {
      await ensureSchema();
      const database = getPool();
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO vmule_runtime_state (scope, state, version, updated_at)
           VALUES ($1, $2::jsonb, 1, NOW())
           ON CONFLICT (scope) DO UPDATE
             SET state = EXCLUDED.state,
                 version = vmule_runtime_state.version + 1,
                 updated_at = NOW()`,
          ["global", JSON.stringify(state)]
        );
        for (const purchase of purchases) {
          await client.query(
            `INSERT INTO vmule_purchases (id, account_id, data, updated_at)
             VALUES ($1, $2, $3::jsonb, NOW())
             ON CONFLICT (id) DO UPDATE
               SET account_id = EXCLUDED.account_id,
                   data = EXCLUDED.data,
                   updated_at = NOW()`,
            [
              purchase.id,
              purchase.accountId || null,
              JSON.stringify(purchase),
            ]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    });
    return this.saving;
  }

  async health() {
    if (this.mode !== "postgres") {
      return {
        configured: false,
        ok: this.mode === "file",
        mode: this.mode,
      };
    }
    return { ...(await checkDatabase()), mode: this.mode };
  }
}

module.exports = { RuntimeRepository };
