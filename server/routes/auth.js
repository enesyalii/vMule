const express = require("express");
const config = require("../config");
const {
  requireUser,
  setSessionCookie,
  clearSessionCookie,
} = require("../auth/session");

const attempts = new Map();

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function checkRateLimit(req, res, next) {
  const key = clientKey(req);
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + 10 * 60_000 };
  if (record.resetAt <= now) {
    record.count = 0;
    record.resetAt = now + 10 * 60_000;
  }
  if (record.count >= 15) {
    res.setHeader("Retry-After", Math.ceil((record.resetAt - now) / 1000));
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }
  req.loginAttempt = record;
  attempts.set(key, record);
  next();
}

function recordFailure(req) {
  if (req.loginAttempt) req.loginAttempt.count += 1;
}

function recordSuccess(req) {
  attempts.delete(clientKey(req));
}

function createAuthRoutes(accounts) {
  const router = express.Router();

  router.get("/auth/status", async (req, res, next) => {
    try {
      res.json({
        authenticated: Boolean(req.user),
        user: req.user || null,
        registrationEnabled: config.ALLOW_REGISTRATION,
        setupRequired: await accounts.setupRequired(),
        storage: accounts.store.mode,
        persistent:
          accounts.store.mode === "postgres" || (!config.isServerless && accounts.store.mode === "file"),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/register", checkRateLimit, async (req, res, next) => {
    try {
      const result = await accounts.register(req.body || {});
      if (result.error) {
        recordFailure(req);
        return res.status(400).json({ error: result.error });
      }
      recordSuccess(req);
      setSessionCookie(res, result.user);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/login", checkRateLimit, async (req, res, next) => {
    try {
      const user = await accounts.authenticate(
        req.body?.login,
        req.body?.password
      );
      if (!user) {
        recordFailure(req);
        return res.status(401).json({ error: "Invalid username/email or password" });
      }
      recordSuccess(req);
      setSessionCookie(res, user);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/auth/me", requireUser, (req, res) => {
    res.json({ user: req.user });
  });

  router.put("/auth/profile", requireUser, async (req, res, next) => {
    try {
      const result = await accounts.updateProfile(req.user, req.body || {});
      if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.put("/auth/password", requireUser, async (req, res, next) => {
    try {
      const result = await accounts.changePassword(
        req.user,
        req.body?.currentPassword,
        req.body?.newPassword
      );
      if (result.error) return res.status(400).json({ error: result.error });
      clearSessionCookie(res);
      res.json({ ok: true, signInAgain: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAuthRoutes };
