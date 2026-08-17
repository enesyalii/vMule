const express = require("express");
const cors = require("cors");
const { Stripe } = require("stripe");
const config = require("./config");
const { VmuleEngine } = require("./engine/VmuleEngine");
const { PLANS } = require("./plans");
const { createClientRoutes, createShopRoutes } = require("./routes/api");
const { mountStatic } = require("./routes/static");
const { errorHandler } = require("./middleware/errors");
const { tickServerless } = require("./middleware/serverless");
const { createVmlfTcpServer } = require("./protocol/vmlf-tcp");
const {
  createPolarClient,
  verifyPolarWebhook,
  polarWebhookError,
  planIdFromPolarPayload,
} = require("./polar");

function createApp() {
  const engine = new VmuleEngine();
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
    if (event.type === "checkout.session.completed") {
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
        paidAt: new Date().toISOString(),
      });
    }
    res.json({ received: true });
  }

  function fulfillPolarWebhook(req, res) {
    try {
      const event = verifyPolarWebhook(req.body, req.headers);
      if (event.type === "order.paid") {
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
          paidAt: new Date().toISOString(),
        });
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

  app.use("/api", apiTick);
  app.use("/api", createShopRoutes(engine, stripe, polar));
  app.use("/api", createClientRoutes(engine, stripe, polar));

  mountStatic(app);
  app.use(errorHandler);

  return { app, engine, stripe, polar };
}

function startServer() {
  const boot = createApp();

  if (!config.isServerless) {
    setInterval(() => boot.engine.tick(), 1000);
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
    if (config.isServerless) console.log(`Serverless     tick-on-request enabled`);
  });

  boot.httpServer = httpServer;
  boot.tcpServer = tcpServer;
  return boot;
}

module.exports = { createApp, startServer };
