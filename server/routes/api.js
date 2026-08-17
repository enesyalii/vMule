const express = require("express");
const { v4: uuid } = require("uuid");
const store = require("../store");
const { PLANS } = require("../plans");
const { createCheckoutSession } = require("../stripe");
const { createPolarCheckout } = require("../polar");
const config = require("../config");

function createClientRoutes(engine, stripe, polar, requireUser, runtime) {
  const router = express.Router();

  router.get("/health", async (_req, res, next) => {
    try {
      res.json({
        ok: true,
        name: "vMule",
        version: "0.51.0",
        protocol: "VMLF",
        stripe: Boolean(stripe),
        polar: Boolean(polar),
        backend: await runtime.health(),
        serverless: config.isServerless,
        tcp: config.VMLF_TCP_ENABLED ? config.VMLF_TCP_PORT : null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/updates", (_req, res) => {
    res.json(store.readJson("updates.json", []).filter((u) => u.published));
  });

  router.get("/catalog", (_req, res) => {
    res.json({ items: engine.getCatalog() });
  });

  // Network state, logs, and all mutations require an account.
  router.use(requireUser);

  router.get("/state", (_req, res) => {
    res.json(engine.snapshot(_req.user));
  });

  router.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const push = () => {
      res.write(`data: ${JSON.stringify(engine.snapshot(req.user))}\n\n`);
    };
    push();
    engine.on("update", push);
    req.on("close", () => engine.off("update", push));
  });

  router.post("/connect", (req, res) => {
    engine.connect();
    res.json(engine.snapshot(req.user));
  });
  router.post("/disconnect", (req, res) => {
    engine.disconnect();
    res.json(engine.snapshot(req.user));
  });
  router.post("/kad/start", (req, res) => {
    engine.kadStart();
    res.json(engine.snapshot(req.user));
  });
  router.post("/kad/stop", (req, res) => {
    engine.kadStop();
    res.json(engine.snapshot(req.user));
  });

  router.post("/downloads/:id/:cmd", (req, res) => {
    const st = engine.downloadCmd(req.params.id, req.params.cmd);
    if (!st) return res.status(404).json({ error: "not found" });
    res.json(engine.snapshot(req.user));
  });

  router.post("/search", (req, res) => {
    engine.search(req.body);
    res.json(engine.snapshot(req.user));
  });
  router.post("/search/download", (req, res) => {
    const hash = req.body?.hash;
    const st = engine.searchDownload(hash);
    if (!st) return res.status(404).json({ error: "result not found" });
    res.json(engine.snapshot(req.user));
  });

  const addLink = (req, res) => {
    const result = engine.addVmlfLink(req.body?.link);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(engine.snapshot(req.user));
  };
  router.post("/vmlf", addLink);
  router.post("/ed2k", addLink);

  router.post("/servers", (req, res) => {
    const result = engine.addServer(req.body || {}, req.user);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(engine.snapshot(req.user));
  });

  router.post("/servers/:id/connect", (req, res) => {
    const st = engine.connectServer(req.params.id, req.user);
    if (!st) return res.status(404).json({ error: "not found" });
    res.json(engine.snapshot(req.user));
  });

  router.post("/servers/:id/remove", (req, res) => {
    const result = engine.removeServer(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: "Server not found or unavailable" });
    res.json(engine.snapshot(req.user));
  });

  router.post("/shared/reload", (req, res) => {
    engine.reloadShared();
    res.json(engine.snapshot(req.user));
  });

  router.get("/logs", (req, res) => {
    if (req.query.reset === "1") engine.resetLogs();
    res.json({ logs: engine.getLogs() });
  });

  router.put("/settings", (req, res) => {
    engine.updateSettings(req.body);
    res.json(engine.snapshot(req.user));
  });

  router.post("/messages", (req, res) => {
    const text = String(req.body?.text || "").trim();
    const result = engine.addMessage(text);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(engine.snapshot(req.user));
  });

  router.get("/irc", (_req, res) => res.json(engine.getIrc()));

  router.post("/irc", (req, res) => {
    const text = String(req.body?.text || "").trim();
    const result = engine.addIrcMessage(text);
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(engine.snapshot(req.user));
  });

  return router;
}

function demoCheckout(engine, plan, user) {
  const demo = {
    id: `demo_${uuid()}`,
    planId: plan.id,
    planName: plan.name,
    amount: plan.amount,
    currency: plan.currency,
    customerEmail: user.email || "demo@vmule.local",
    accountId: user.id,
    mode: plan.mode,
    provider: "demo",
    paidAt: new Date().toISOString(),
    demo: true,
  };
  engine.fulfillPurchase(demo);
  return {
    demo: true,
    url: `${config.BASE_URL}/shop-success.html?session_id=${demo.id}&demo=1`,
    id: demo.id,
  };
}

function createShopRoutes(engine, stripe, polar, requireUser) {
  const router = express.Router();

  router.get("/plans", (req, res) => {
    res.json({
      plans: PLANS,
      stripeConfigured: Boolean(stripe),
      polarConfigured: Boolean(polar),
      purchases: req.user
        ? engine.purchases.filter(
            (purchase) =>
              purchase.status === "paid" &&
              (purchase.accountId === req.user.id || req.user.role === "admin")
          )
        : [],
    });
  });

  router.post("/checkout", requireUser, async (req, res) => {
    const planId = req.body?.planId;
    const provider = String(req.body?.provider || "stripe").toLowerCase();
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Unknown plan" });

    if (provider === "polar") {
      if (!polar) return res.json(demoCheckout(engine, plan, req.user));
      try {
        const session = await createPolarCheckout(
          polar,
          plan,
          config.BASE_URL,
          req.user
        );
        return res.json({ url: session.url, id: session.id, provider: "polar" });
      } catch (err) {
        return res.status(500).json({ error: err.message || "Polar error" });
      }
    }

    if (!stripe) return res.json(demoCheckout(engine, plan, req.user));

    try {
      const session = await createCheckoutSession(
        stripe,
        plan,
        config.BASE_URL,
        req.user
      );
      res.json({ url: session.url, id: session.id, provider: "stripe" });
    } catch (err) {
      res.status(500).json({ error: err.message || "Stripe error" });
    }
  });

  router.get("/checkout/session/:id", async (req, res) => {
    const id = req.params.id;
    const local = engine.purchases.find((p) => p.id === id);
    if (local) return res.json(local);

    const provider = String(req.query.provider || "").toLowerCase();

    if (provider === "polar" && polar) {
      try {
        const checkout = await polar.checkouts.get({ id });
        const planId = checkout.metadata?.plan_id;
        const plan = PLANS[planId];
        return res.json({
          id: checkout.id,
          status: checkout.status === "succeeded" ? "paid" : checkout.status,
          planId,
          planName: plan?.name,
          amount: checkout.totalAmount,
          currency: checkout.currency,
          provider: "polar",
        });
      } catch (err) {
        return res.status(404).json({ error: err.message });
      }
    }

    if (!stripe) return res.status(404).json({ error: "not found" });
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      res.json({
        id: session.id,
        status: session.payment_status,
        amount: session.amount_total,
        currency: session.currency,
        planId: session.metadata?.plan_id,
        provider: "stripe",
      });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createClientRoutes, createShopRoutes };
