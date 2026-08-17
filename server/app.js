const express = require("express");
const cors = require("cors");
const { Stripe } = require("stripe");
const config = require("./config");
const { VmuleEngine } = require("./engine/VmuleEngine");
const { RuntimeRepository } = require("./backend/runtime-repository");
const { PLANS } = require("./plans");
const { createClientRoutes, createShopRoutes } = require("./routes/api");
const { createAuthRoutes } = require("./routes/auth");
const { createAdminRoutes } = require("./routes/admin");
const { mountStatic } = require("./routes/static");
const { errorHandler } = require("./middleware/errors");
const { tickServerless } = require("./middleware/serverless");
const { AccountManager } = require("./auth/manager");
const {
  createAuthMiddleware,
  requireUser,
} = require("./auth/session");
const { createVmlfTcpServer } = require("./protocol/vmlf-tcp");
const {
  createPolarClient,
  verifyPolarWebhook,
  polarWebhookError,
  planIdFromPolarPayload,
} = require("./polar");

function createApp() {
  const engine = new VmuleEngine();
  const runtime = new RuntimeRepository();
  const accounts = new AccountManager();
  const stripe = config.STRIPE_SECRET_KEY
    ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" })
    : null;
  const polar = createPolarClient();

  function apiTick(_req, _res, next) {
    tickServerless(engine);
    next();
  }

  async function fulfillStripeWebhook(req, res) {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({ error: "Stripe webhooks are not configured" });
    }
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      if (event.type === "checkout.session.completed") {
        await runtime.hydrate(engine, { force: config.isServerless });
        const session = event.data.object;
        const planId = session.metadata?.plan_id;
        const plan = PLANS[planId];
        engine.fulfillPurchase({
          id: session.id,
          planId,
          planName: plan ? plan.name : "vMule server",
          amount: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_details?.email,
          mode: session.mode,
          provider: "stripe",
          accountId: session.metadata?.account_id || null,
          paidAt: new Date().toISOString(),
        });
        await runtime.persist(engine);
      }
      res.json({ received: true });
    } catch (err) {
      console.error("Stripe webhook persistence error:", err.message);
      res.status(500).json({ error: "Could not persist checkout" });
    }
  }

  async function fulfillPolarWebhook(req, res) {
    try {
      const event = verifyPolarWebhook(req.body, req.headers);
      if (event.type === "order.paid") {
        await runtime.hydrate(engine, { force: config.isServerless });
        const order = event.data;
        const planId = planIdFromPolarPayload(order);
        const plan = PLANS[planId];
        engine.fulfillPurchase({
          id: order.id,
          planId,
          planName: plan ? plan.name : order.product?.name || "vMule server",
          amount: order.total_amount ?? order.amount,
          currency: order.currency,
          customerEmail: order.customer?.email,
          mode: order.subscription_id ? "subscription" : "payment",
          provider: "polar",
          accountId:
            order.metadata?.account_id ||
            order.checkout?.metadata?.account_id ||
            null,
          paidAt: new Date().toISOString(),
        });
        await runtime.persist(engine);
      }
      res.status(202).send("");
    } catch (err) {
      if (polarWebhookError(err)) return res.status(403).send("");
      console.error("Polar webhook error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }

  const app = express();
  app.use(cors());

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), fulfillStripeWebhook);
  app.post(
    "/api/polar/webhook",
    express.raw({ type: "application/json" }),
    fulfillPolarWebhook
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", async (_req, res, next) => {
    try {
      await runtime.hydrate(engine, { force: config.isServerless });
      const revision = engine.revision;
      const sendJson = res.json.bind(res);
      let sending = false;
      res.json = (body) => {
        if (sending) return res;
        if (engine.revision === revision) return sendJson(body);
        sending = true;
        runtime
          .persist(engine)
          .then(() => sendJson(body))
          .catch((err) => {
            res.json = sendJson;
            next(err);
          });
        return res;
      };
      next();
    } catch (err) {
      next(err);
    }
  });
  app.use("/api", apiTick);
  app.use("/api", createAuthMiddleware(accounts));
  app.use("/api", createAuthRoutes(accounts));
  app.use("/api", createAdminRoutes(engine, accounts, runtime));
  app.use("/api", createShopRoutes(engine, stripe, polar, requireUser));
  app.use(
    "/api",
    createClientRoutes(engine, stripe, polar, requireUser, runtime)
  );

  mountStatic(app);
  app.use(errorHandler);

  return { app, engine, stripe, polar, accounts, runtime };
}

function startServer() {
  const boot = createApp();

  if (!config.isServerless) {
    boot.runtime.hydrate(boot.engine).catch((err) => {
      console.error(`Backend hydration failed: ${err.message}`);
    });
    let ticks = 0;
    setInterval(() => {
      boot.engine.tick();
      ticks += 1;
      if (ticks % 5 === 0) {
        boot.runtime.persist(boot.engine).catch((err) => {
          console.error(`Backend persistence failed: ${err.message}`);
        });
      }
    }, 1000);
  }

  let tcpServer = null;
  if (config.VMLF_TCP_ENABLED) {
    try {
      tcpServer = createVmlfTcpServer(boot.engine, config.VMLF_TCP_PORT);
    } catch (err) {
      console.warn(`VMLF TCP bind failed (${config.VMLF_TCP_PORT}): ${err.message}`);
    }
  }

  const httpServer = boot.app.listen(config.PORT, () => {
    console.log(`vMule site     http://localhost:${config.PORT}/`);
    console.log(`vMule client   http://localhost:${config.PORT}/client/`);
    console.log(`Shop           http://localhost:${config.PORT}/shop.html`);
    console.log(`API events     http://localhost:${config.PORT}/api/events (SSE)`);
    console.log(`Stripe         ${boot.stripe ? "keys loaded" : "demo mode (no STRIPE_SECRET_KEY)"}`);
    console.log(`Polar          ${boot.polar ? "keys loaded" : "demo mode (no POLAR_ACCESS_TOKEN)"}`);
    console.log(`Backend        ${boot.runtime.mode}`);
    if (config.isServerless) console.log(`Serverless     tick-on-request enabled`);
  });

  boot.httpServer = httpServer;
  boot.tcpServer = tcpServer;
  return boot;
}

module.exports = { createApp, startServer };
