const express = require("express");
const cors = require("cors");
const { Stripe } = require("stripe");
const config = require("./config");
const { VmuleEngine } = require("./engine/VmuleEngine");
const { PLANS } = require("./stripe");
const { createClientRoutes, createShopRoutes } = require("./routes/api");
const { mountStatic } = require("./routes/static");
const { errorHandler } = require("./middleware/errors");
const { createVmlfTcpServer } = require("./protocol/vmlf-tcp");

function createApp() {
  const engine = new VmuleEngine();
  const stripe = config.STRIPE_SECRET_KEY
    ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" })
    : null;

  async function fulfillWebhook(req, res) {
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
        paidAt: new Date().toISOString(),
      });
    }
    res.json({ received: true });
  }

  const app = express();
  app.use(cors());

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), fulfillWebhook);

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", createShopRoutes(engine, stripe));
  app.use("/api", createClientRoutes(engine, stripe));

  mountStatic(app);
  app.use(errorHandler);

  return { app, engine, stripe };
}

function startServer() {
  const boot = createApp();

  setInterval(() => boot.engine.tick(), 1000);

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
  });

  boot.httpServer = httpServer;
  boot.tcpServer = tcpServer;
  return boot;
}

module.exports = { createApp, startServer };
