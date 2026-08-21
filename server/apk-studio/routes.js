const express = require("express");
const multer = require("multer");
const { ApkManager } = require("./apk-manager");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 * 1024 },
});

function createApkStudioRoutes() {
  const router = express.Router();
  const manager = new ApkManager();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, app: "apk-studio" });
  });

  router.post("/open", upload.single("apk"), (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No APK file uploaded" });
      }
      const info = manager.openFromBuffer(req.file.buffer, req.file.originalname || "upload.apk");
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  router.post("/create", (req, res, next) => {
    try {
      const info = manager.createBlankApk(req.body || {});
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  router.get("/session/:id", (req, res) => {
    const session = manager.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(manager.sessionInfo(session));
  });

  router.delete("/session/:id", (req, res) => {
    manager.closeSession(req.params.id);
    res.json({ ok: true });
  });

  router.get("/session/:id/entry", (req, res, next) => {
    try {
      const entryPath = req.query.path;
      if (!entryPath) return res.status(400).json({ error: "path required" });
      res.json(manager.readEntry(req.params.id, entryPath));
    } catch (err) {
      next(err);
    }
  });

  router.get("/session/:id/hex", (req, res, next) => {
    try {
      const entryPath = req.query.path;
      if (!entryPath) return res.status(400).json({ error: "path required" });
      res.json(manager.readHex(req.params.id, entryPath, req.query.offset, req.query.length));
    } catch (err) {
      next(err);
    }
  });

  router.put("/session/:id/entry", express.json({ limit: "32mb" }), (req, res, next) => {
    try {
      const { path: entryPath, content, encoding } = req.body || {};
      if (!entryPath || content === undefined) {
        return res.status(400).json({ error: "path and content required" });
      }
      res.json(manager.writeEntry(req.params.id, entryPath, content, encoding || "utf8"));
    } catch (err) {
      next(err);
    }
  });

  router.get("/session/:id/export", (req, res, next) => {
    try {
      const { buffer, filename } = manager.exportApk(req.params.id);
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.get("/session/:id/download-entry", (req, res, next) => {
    try {
      const entryPath = req.query.path;
      if (!entryPath) return res.status(400).json({ error: "path required" });
      const { buffer, filename } = manager.extractEntry(req.params.id, entryPath);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createApkStudioRoutes };
