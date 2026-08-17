const crypto = require("crypto");
const { promisify } = require("util");
const { v4: uuid } = require("uuid");
const store = require("../store");
const config = require("../config");
const { getPool, ensureSchema } = require("../db");

const scrypt = promisify(crypto.scrypt);
const FILE_NAME = "accounts.json";
const VALID_ROLES = new Set(["user", "admin"]);
const VALID_STATUSES = new Set(["active", "disabled"]);

function publicUser(user) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedHex] = String(encoded || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = Buffer.from(await scrypt(String(password), salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

function validateAccountInput(input, { passwordRequired = true } = {}) {
  const username = String(input.username || "").trim().toLowerCase();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");

  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
    return { error: "Username must be 3–32 letters, numbers, dots, dashes, or underscores" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address" };
  }
  if (passwordRequired && password.length < 10) {
    return { error: "Password must be at least 10 characters" };
  }
  if (password.length > 256) return { error: "Password is too long" };
  return { username, email, password };
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || "",
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastLoginAt: row.last_login_at
      ? new Date(row.last_login_at).toISOString()
      : null,
  };
}

class AccountStore {
  constructor() {
    this.mode = config.DATABASE_URL ? "postgres" : "file";
    this.users = store.readJson(FILE_NAME, []);
    this.pool = null;
    this.ready = null;
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = this._init();
    return this.ready;
  }

  async _init() {
    if (this.mode !== "postgres") return;
    this.pool = getPool();
    await ensureSchema();
  }

  async list() {
    await this.init();
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT * FROM vmule_users ORDER BY created_at ASC"
      );
      return result.rows.map(fromRow);
    }
    return this.users.map((user) => ({ ...user }));
  }

  async findById(id) {
    await this.init();
    if (this.pool) {
      return fromRow(
        (await this.pool.query("SELECT * FROM vmule_users WHERE id = $1", [id]))
          .rows[0]
      );
    }
    return this.users.find((user) => user.id === id) || null;
  }

  async findByLogin(login) {
    await this.init();
    const normalized = String(login || "").trim().toLowerCase();
    if (this.pool) {
      return fromRow(
        (
          await this.pool.query(
            "SELECT * FROM vmule_users WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1",
            [normalized]
          )
        ).rows[0]
      );
    }
    return (
      this.users.find(
        (user) =>
          user.username.toLowerCase() === normalized ||
          (user.email && user.email.toLowerCase() === normalized)
      ) || null
    );
  }

  async create(input) {
    await this.init();
    const now = new Date().toISOString();
    const user = {
      id: uuid(),
      username: input.username,
      email: input.email || "",
      passwordHash: input.passwordHash,
      role: VALID_ROLES.has(input.role) ? input.role : "user",
      status: VALID_STATUSES.has(input.status) ? input.status : "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    try {
      if (this.pool) {
        const result = await this.pool.query(
          `INSERT INTO vmule_users
            (id, username, email, password_hash, role, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
           RETURNING *`,
          [
            user.id,
            user.username,
            user.email,
            user.passwordHash,
            user.role,
            user.status,
            now,
          ]
        );
        return fromRow(result.rows[0]);
      }

      const duplicate = this.users.some(
        (item) =>
          item.username.toLowerCase() === user.username.toLowerCase() ||
          (user.email &&
            item.email &&
            item.email.toLowerCase() === user.email.toLowerCase())
      );
      if (duplicate) throw Object.assign(new Error("Account already exists"), { code: "DUPLICATE" });
      this.users.push(user);
      store.writeJson(FILE_NAME, this.users);
      return { ...user };
    } catch (err) {
      if (err.code === "23505") {
        throw Object.assign(new Error("Username or email is already in use"), {
          code: "DUPLICATE",
        });
      }
      throw err;
    }
  }

  async update(id, patch) {
    await this.init();
    const allowed = {};
    if (patch.email !== undefined) allowed.email = String(patch.email).trim().toLowerCase();
    if (VALID_ROLES.has(patch.role)) allowed.role = patch.role;
    if (VALID_STATUSES.has(patch.status)) allowed.status = patch.status;
    if (patch.passwordHash) allowed.passwordHash = patch.passwordHash;
    if (patch.lastLoginAt) allowed.lastLoginAt = patch.lastLoginAt;

    if (this.pool) {
      const fields = [];
      const values = [];
      const columnNames = {
        email: "email",
        role: "role",
        status: "status",
        passwordHash: "password_hash",
        lastLoginAt: "last_login_at",
      };
      for (const [key, value] of Object.entries(allowed)) {
        values.push(value);
        fields.push(`${columnNames[key]} = $${values.length}`);
      }
      if (!fields.length) return this.findById(id);
      values.push(id);
      const result = await this.pool.query(
        `UPDATE vmule_users SET ${fields.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length} RETURNING *`,
        values
      );
      return fromRow(result.rows[0]);
    }

    const user = this.users.find((item) => item.id === id);
    if (!user) return null;
    Object.assign(user, allowed, { updatedAt: new Date().toISOString() });
    store.writeJson(FILE_NAME, this.users);
    return { ...user };
  }

  async delete(id) {
    await this.init();
    if (this.pool) {
      return (await this.pool.query("DELETE FROM vmule_users WHERE id = $1", [id]))
        .rowCount > 0;
    }
    const length = this.users.length;
    this.users = this.users.filter((user) => user.id !== id);
    if (this.users.length !== length) store.writeJson(FILE_NAME, this.users);
    return this.users.length !== length;
  }
}

module.exports = {
  AccountStore,
  publicUser,
  hashPassword,
  verifyPassword,
  validateAccountInput,
};
