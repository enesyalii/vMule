const crypto = require("crypto");
const config = require("../config");
const {
  AccountStore,
  publicUser,
  hashPassword,
  verifyPassword,
  validateAccountInput,
} = require("./accounts");

function secureTextEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left)).digest();
  const b = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

class AccountManager {
  constructor() {
    this.store = new AccountStore();
  }

  envAdmin() {
    if (!config.ADMIN_PASSWORD) return null;
    return {
      id: "env-admin",
      username: config.ADMIN_USER.toLowerCase(),
      email: config.ADMIN_EMAIL,
      role: "admin",
      status: "active",
      createdAt: null,
      updatedAt: null,
      lastLoginAt: null,
      source: "environment",
    };
  }

  async hasAdmin() {
    if (this.envAdmin()) return true;
    return (await this.store.list()).some(
      (user) => user.role === "admin" && user.status === "active"
    );
  }

  async setupRequired() {
    return !(await this.hasAdmin());
  }

  async getById(id) {
    if (id === "env-admin") return this.envAdmin();
    return publicUser(await this.store.findById(id));
  }

  async authenticate(login, password) {
    const normalized = String(login || "").trim().toLowerCase();
    const envAdmin = this.envAdmin();
    if (
      envAdmin &&
      (normalized === envAdmin.username ||
        (envAdmin.email && normalized === envAdmin.email.toLowerCase())) &&
      secureTextEqual(password, config.ADMIN_PASSWORD)
    ) {
      return envAdmin;
    }

    const user = await this.store.findByLogin(normalized);
    if (
      !user ||
      user.status !== "active" ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      return null;
    }
    await this.store.update(user.id, {
      lastLoginAt: new Date().toISOString(),
    });
    return publicUser(user);
  }

  async register(input) {
    if (!config.ALLOW_REGISTRATION) {
      return { error: "Registration is disabled" };
    }
    const valid = validateAccountInput(input);
    if (valid.error) return valid;

    const role = (await this.setupRequired()) ? "admin" : "user";
    try {
      const user = await this.store.create({
        username: valid.username,
        email: valid.email,
        passwordHash: await hashPassword(valid.password),
        role,
        status: "active",
      });
      return { user: publicUser(user), firstAdmin: role === "admin" };
    } catch (err) {
      return {
        error:
          err.code === "DUPLICATE"
            ? "Username or email is already in use"
            : "Could not create account",
      };
    }
  }

  async list() {
    const users = (await this.store.list()).map(publicUser);
    const envAdmin = this.envAdmin();
    return envAdmin ? [envAdmin, ...users] : users;
  }

  async create(input) {
    const valid = validateAccountInput(input);
    if (valid.error) return valid;
    try {
      const user = await this.store.create({
        username: valid.username,
        email: valid.email,
        passwordHash: await hashPassword(valid.password),
        role: input.role === "admin" ? "admin" : "user",
        status: input.status === "disabled" ? "disabled" : "active",
      });
      return { user: publicUser(user) };
    } catch (err) {
      return {
        error:
          err.code === "DUPLICATE"
            ? "Username or email is already in use"
            : "Could not create account",
      };
    }
  }

  async update(id, patch, actorId) {
    if (id === "env-admin") {
      return { error: "Environment administrator is managed through server variables" };
    }
    const current = await this.store.findById(id);
    if (!current) return { error: "Account not found", status: 404 };
    if (
      id === actorId &&
      (patch.status === "disabled" || (patch.role && patch.role !== "admin"))
    ) {
      return { error: "You cannot disable or demote your own account" };
    }

    const update = {};
    if (patch.email !== undefined) {
      const valid = validateAccountInput(
        { username: current.username, email: patch.email, password: "" },
        { passwordRequired: false }
      );
      if (valid.error) return valid;
      update.email = valid.email;
    }
    if (patch.role !== undefined) {
      if (!["user", "admin"].includes(patch.role)) return { error: "Invalid role" };
      update.role = patch.role;
    }
    if (patch.status !== undefined) {
      if (!["active", "disabled"].includes(patch.status)) {
        return { error: "Invalid status" };
      }
      update.status = patch.status;
    }
    if (patch.password !== undefined) {
      if (String(patch.password).length < 10) {
        return { error: "Password must be at least 10 characters" };
      }
      update.passwordHash = await hashPassword(patch.password);
    }

    return { user: publicUser(await this.store.update(id, update)) };
  }

  async updateProfile(user, patch) {
    return this.update(user.id, { email: patch.email }, user.id);
  }

  async changePassword(user, currentPassword, nextPassword) {
    if (user.id === "env-admin") {
      return { error: "Change ADMIN_PASSWORD in the server environment" };
    }
    const stored = await this.store.findById(user.id);
    if (!stored || !(await verifyPassword(currentPassword, stored.passwordHash))) {
      return { error: "Current password is incorrect" };
    }
    if (String(nextPassword || "").length < 10) {
      return { error: "New password must be at least 10 characters" };
    }
    await this.store.update(user.id, {
      passwordHash: await hashPassword(nextPassword),
    });
    return { ok: true };
  }

  async delete(id, actorId) {
    if (id === "env-admin") {
      return { error: "Environment administrator cannot be deleted here" };
    }
    if (id === actorId) return { error: "You cannot delete your own account" };
    if (!(await this.store.delete(id))) {
      return { error: "Account not found", status: 404 };
    }
    return { ok: true };
  }
}

module.exports = { AccountManager };
