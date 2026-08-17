const express = require("express");
const config = require("../config");
const { requireAdmin } = require("../auth/session");

function adminSnapshot(engine, accounts, runtime) {
  const state = engine.snapshot();
  return {
    generatedAt: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
      serverless: config.isServerless,
    },
    storage: {
      accounts: accounts.store.mode,
      runtime: runtime.mode,
      persistent:
        (accounts.store.mode === "postgres" && runtime.mode === "postgres") ||
        (!config.isServerless &&
          accounts.store.mode === "file" &&
          runtime.mode === "file"),
    },
    payments: {
      stripe: Boolean(config.STRIPE_SECRET_KEY),
      polar: Boolean(config.POLAR_ACCESS_TOKEN),
    },
    network: {
      connected: state.vmlf.connected,
      connectionId: state.vmlf.id,
      kadConnected: state.kad.connected,
      kadFirewalled: state.kad.firewalled,
      users: state.kad.users,
      files: state.kad.files,
      downloadSpeed: state.currentDown,
      uploadSpeed: state.currentUp,
    },
    counts: {
      downloads: state.downloads.length,
      activeDownloads: state.downloads.filter(
        (item) => item.status === "downloading"
      ).length,
      uploads: state.uploads.length,
      shared: state.shared.length,
      servers: state.servers.length,
      purchases: engine.purchases.length,
    },
    settings: state.settings,
    downloads: state.downloads,
    servers: state.servers,
    purchases: engine.purchases,
    logs: state.logs.slice(0, 200),
  };
}

function createAdminRoutes(engine, accounts, runtime) {
  const router = express.Router();
  router.use("/admin", requireAdmin);

  router.get("/admin/overview", async (_req, res, next) => {
    try {
      const snapshot = adminSnapshot(engine, accounts, runtime);
      snapshot.counts.accounts = (await accounts.list()).length;
      snapshot.storage.health = await runtime.health();
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/action", (req, res) => {
    const action = String(req.body?.action || "");
    const actions = {
      connect: () => engine.connect(),
      disconnect: () => engine.disconnect(),
      "kad-start": () => engine.kadStart(),
      "kad-stop": () => engine.kadStop(),
      "reload-shared": () => engine.reloadShared(),
      "reset-logs": () => engine.resetLogs(),
      tick: () => {
        engine.tick();
        return engine.snapshot();
      },
    };
    if (!actions[action]) return res.status(400).json({ error: "Unknown action" });
    res.json(actions[action]());
  });

  router.put("/admin/settings", (req, res) => {
    const body = req.body || {};
    const patch = {};
    if (body.nickname !== undefined) {
      patch.nickname = String(body.nickname).trim().slice(0, 40);
    }
    for (const key of ["maxDown", "maxUp", "port", "udpPort", "maxConnections"]) {
      if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
        patch[key] = Math.max(0, Math.round(Number(body[key])));
      }
    }
    if (body.obfuscation !== undefined) patch.obfuscation = Boolean(body.obfuscation);
    if (["classic", "luna", "polar"].includes(body.skin)) patch.skin = body.skin;
    res.json(engine.updateSettings(patch));
  });

  router.post("/admin/servers", (req, res) => {
    const result = engine.addServer(req.body || {}, req.user);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  router.post("/admin/servers/:id/connect", (req, res) => {
    const result = engine.connectServer(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: "Server not found" });
    res.json(result);
  });

  router.delete("/admin/servers/:id", (req, res) => {
    const result = engine.removeServer(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: "Server not found" });
    res.json(result);
  });

  router.post("/admin/downloads/:id/:command", (req, res) => {
    const command = req.params.command;
    if (!["pause", "resume", "cancel", "prioup", "priodown"].includes(command)) {
      return res.status(400).json({ error: "Unknown download action" });
    }
    const result = engine.downloadCmd(req.params.id, command);
    if (!result) return res.status(404).json({ error: "Download not found" });
    res.json(result);
  });

  router.get("/admin/users", async (_req, res, next) => {
    try {
      res.json({ users: await accounts.list() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/users", async (req, res, next) => {
    try {
      const result = await accounts.create(req.body || {});
      if (result.error) return res.status(400).json({ error: result.error });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/admin/users/:id", async (req, res, next) => {
    try {
      const result = await accounts.update(
        req.params.id,
        req.body || {},
        req.user.id
      );
      if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/admin/users/:id", async (req, res, next) => {
    try {
      const result = await accounts.delete(req.params.id, req.user.id);
      if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAdminRoutes };
