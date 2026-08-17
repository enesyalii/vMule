const express = require("express");
const { v4: uuid } = require("uuid");
const store = require("../store");
const { PLANS, createCheckoutSession } = require("../stripe");
const config = require("../config");

function createClientRoutes(engine, stripe) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: "vMule",
      version: "0.50.0",
      protocol: "VMLF",
      stripe: Boolean(stripe),
      tcp: config.VMLF_TCP_ENABLED ? config.VMLF_TCP_PORT : null,
    });
  });

  router.get("/updates", (_req, res) => {
    res.json(store.readJson("updates.json", []).filter((u) => u.published));
  });

  router.get("/catalog", (_req, res) => {
    res.json({ items: engine.getCatalog() });
  });

  router.get("/state", (_req, res) => {
    res.json(engine.snapshot());
  });

  router.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const push = (snap) => {
      res.write(`data: ${JSON.stringify(snap)}\n\n`);
    };
    push(engine.snapshot());
    engine.on("update", push);
    req.on("close", () => engine.off("update", push));
  });

  router.post("/connect", (_req, res) => res.json(engine.connect()));
  router.post("/disconnect", (_req, res) => res.json(engine.disconnect()));
  router.post("/kad/start", (_req, res) => res.json(engine.kadStart()));
  router.post("/kad/stop", (_req, res) => res.json(engine.kadStop()));

  router.post("/downloads/:id/:cmd", (req, res) => {
    const st = engine.downloadCmd(req.params.id, req.params.cmd);
    if (!st) return res.status(404).json({ error: "not found" });
    res.json(st);
  });

  router.post("/search", (req, res) => res.json(engine.search(req.body)));
  router.post("/search/download", (req, res) => {
    const hash = req.body?.hash;
    const st = engine.searchDownload(hash);
    if (!st) return res.status(404).json({ error: "result not found" });
    res.json(st);
  });

  const addLink = (req, res) => {
    const result = engine.addVmlfLink(req.body?.link);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result.state);
  };
  router.post("/vmlf", addLink);
  router.post("/ed2k", addLink);

  router.post("/servers", (req, res) => {
    const result = engine.addServer(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  router.post("/servers/:id/connect", (req, res) => {
    const st = engine.connectServer(req.params.id);
    if (!st) return res.status(404).json({ error: "not found" });
    res.json(st);
  });

  router.post("/servers/:id/remove", (req, res) => {
    res.json(engine.removeServer(req.params.id));
  });

  router.post("/shared/reload", (_req, res) => res.json(engine.reloadShared()));

  router.get("/logs", (req, res) => {
    if (req.query.reset === "1") engine.resetLogs();
    res.json({ logs: engine.getLogs() });
  });

  router.put("/settings", (req, res) => res.json(engine.updateSettings(req.body)));

  router.post("/messages", (req, res) => {
    const text = String(req.body?.text || "").trim();
    const result = engine.addMessage(text);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  router.get("/irc", (_req, res) => res.json(engine.getIrc()));

  router.post("/irc", (req, res) => {
    const text = String(req.body?.text || "").trim();
    const result = engine.addIrcMessage(text);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  router.post("/panel/login", (req, res) => {
    const password = req.body?.password;
    if (!config.PANEL_PASSWORD || password !== config.PANEL_PASSWORD) {
      return res.status(401).json({ error: "Wrong password" });
    }
    res.json({ ok: true, token: "panel-ok" });
  });

  return router;
}

function createShopRoutes(engine, stripe) {
  const router = express.Router();

  router.get("/plans", (_req, res) => {
    res.json({
      plans: PLANS,
      stripeConfigured: Boolean(stripe),
      purchases: engine.purchases.filter((p) => p.status === "paid"),
    });
  });

  router.post("/checkout", async (req, res) => {
    const planId = req.body?.planId;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Unknown plan" });

    if (!stripe) {
      const demo = {
        id: `demo_${uuid()}`,
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        customerEmail: "demo@vmule.local",
        mode: plan.mode,
        paidAt: new Date().toISOString(),
        demo: true,
      };
      engine.fulfillPurchase(demo);
      return res.json({
        demo: true,
        url: `${config.BASE_URL}/shop-success.html?session_id=${demo.id}&demo=1`,
      });
    }

    try {
      const session = await createCheckoutSession(stripe, plan, config.BASE_URL);
      res.json({ url: session.url, id: session.id });
    } catch (err) {
      res.status(500).json({ error: err.message || "Stripe error" });
    }
  });

  router.get("/checkout/session/:id", async (req, res) => {
    const id = req.params.id;
    const local = engine.purchases.find((p) => p.id === id);
    if (local) return res.json(local);
    if (!stripe) return res.status(404).json({ error: "not found" });
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      res.json({
        id: session.id,
        status: session.payment_status,
        amount: session.amount_total,
        currency: session.currency,
        planId: session.metadata?.plan_id,
      });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createClientRoutes, createShopRoutes };
