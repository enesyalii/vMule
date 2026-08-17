const config = require("./config");

let pool = null;
let schemaPromise = null;

function getPool() {
  if (!config.DATABASE_URL) return null;
  if (pool) return pool;
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: config.isServerless ? 2 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err.message);
  });
  return pool;
}

async function ensureSchema() {
  const database = getPool();
  if (!database) return null;
  if (schemaPromise) return schemaPromise;
  schemaPromise = database.query(`
    CREATE TABLE IF NOT EXISTS vmule_users (
      id UUID PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(254) NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'user',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS vmule_users_email_unique
      ON vmule_users (LOWER(email)) WHERE email <> '';

    CREATE TABLE IF NOT EXISTS vmule_runtime_state (
      scope VARCHAR(64) PRIMARY KEY,
      state JSONB NOT NULL,
      version BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vmule_purchases (
      id VARCHAR(255) PRIMARY KEY,
      account_id VARCHAR(255),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS vmule_purchases_account_idx
      ON vmule_purchases (account_id);
  `);
  try {
    await schemaPromise;
  } catch (err) {
    schemaPromise = null;
    throw err;
  }
  return database;
}

async function checkDatabase() {
  const database = await ensureSchema();
  if (!database) return { configured: false, ok: false };
  const started = Date.now();
  await database.query("SELECT 1");
  return {
    configured: true,
    ok: true,
    latencyMs: Date.now() - started,
  };
}

module.exports = { getPool, ensureSchema, checkDatabase };
