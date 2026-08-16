const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { Stripe } = require("stripe");
const store = require("./store");
const { PLANS, createCheckoutSession } = require("./stripe");
const {
  createInitialState,
  tick,
  publicState,
  runSearch,
  catalogItem,
  stamp,
} = require("./state");

const PORT = Number(process.env.PORT || 4242);
const BASE_URL =
  process.env.BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${PORT}`);
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const INSTALLER_URL =
  process.env.INSTALLER_URL ||
  "https://github.com/enesyalii/vMule/releases/latest/download/vMule-Setup-0.50.0.exe";

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" })
  : null;

const app = express();
const publicDir = path.join(__dirname, "..", "public");

app.use(cors());
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

let state = createInitialState();
const purchases = store.readJson("purchases.json", []);
state.purchases = purchases;
applyPurchasesToServers(state, purchases);

setInterval(() => {
  tick(state);
  if (state.logs.length > 400) state.logs.length = 400;
}, 1000);

function getUpdates() {
  return store.readJson("updates.json", []).filter((u) => u.published);
}

function applyPurchasesToServers(st, list) {
  for (const p of list) {
    if (p.status !== "paid") continue;
    if (p.planId === "kadboost") {
      st.kad.boost = true;
      continue;
    }
    const exists = st.servers.some((s) => s.purchaseId === p.id);
    if (exists) continue;
    const plan = PLANS[p.planId];
    if (!plan) continue;
    st.servers.unshift({
      id: `paid-${p.id.slice(0, 8)}`,
      name: p.serverName || plan.name,
      desc: "Purchased vMule node",
      ip: p.ip || randomIp(),
      port: 4661,
      users: plan.dedicated ? 12 : 4200,
      maxUsers: plan.connections,
      files: plan.dedicated ? 0 : 1_200_000,
      ping: 12,
      static: true,
      premium: true,
      purchaseId: p.id,
    });
  }
}

function randomIp() {
  return `45.${80 + Math.floor(Math.random() * 40)}.${Math.floor(Math.random() * 200)}.${10 + Math.floor(Math.random() * 200)}`;
}

function fulfillPurchase(record) {
  const existing = purchases.find((p) => p.id === record.id);
  if (existing) {
    Object.assign(existing, record, { status: "paid" });
  } else {
    purchases.unshift({ ...record, status: "paid" });
  }
  store.writeJson("purchases.json", purchases);
  state.purchases = purchases;
  applyPurchasesToServers(state, purchases);
  state.logs.unshift(`[${stamp()}] Server purchase activated: ${record.planName}`);
}

async function handleStripeWebhook(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: "Stripe webhooks are not configured" });
  }
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const planId = session.metadata && session.metadata.plan_id;
    const plan = PLANS[planId];
    fulfillPurchase({
      id: session.id,
      planId,
      planName: plan ? plan.name : "vMule server",
      amount: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details && session.customer_details.email,
      mode: session.mode,
      paidAt: new Date().toISOString(),
    });
  }
  res.json({ received: true });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "vMule", stripe: Boolean(stripe) });
});

app.get("/api/updates", (_req, res) => {
  res.json(getUpdates());
});

app.get("/api/state", (_req, res) => {
  res.json(publicState(state));
});

app.post("/api/connect", (_req, res) => {
  state.connected = true;
  state.ed2k.connected = true;
  state.ed2k.id = "High ID";
  if (!state.ed2k.serverId && state.servers[0]) state.ed2k.serverId = state.servers[0].id;
  state.logs.unshift(`[${stamp()}] Connecting... High ID`);
  res.json(publicState(state));
});

app.post("/api/disconnect", (_req, res) => {
  state.connected = false;
  state.ed2k.connected = false;
  state.ed2k.id = "Disconnected";
  state.logs.unshift(`[${stamp()}] Disconnected from ED2K`);
  res.json(publicState(state));
});

app.post("/api/kad/start", (_req, res) => {
  state.kad.connected = true;
  state.kad.firewalled = false;
  state.logs.unshift(`[${stamp()}] Kad started (bootstrap from nodes.dat)`);
  res.json(publicState(state));
});

app.post("/api/kad/stop", (_req, res) => {
  state.kad.connected = false;
  state.logs.unshift(`[${stamp()}] Kad stopped`);
  res.json(publicState(state));
});

app.post("/api/downloads/:id/:cmd", (req, res) => {
  const d = state.downloads.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: "not found" });
  const cmd = req.params.cmd;
  if (cmd === "pause") d.status = "paused";
  else if (cmd === "resume") d.status = d.progress >= 1 ? "complete" : "downloading";
  else if (cmd === "cancel") {
    state.downloads = state.downloads.filter((x) => x.id !== d.id);
    state.logs.unshift(`[${stamp()}] Cancelled ${d.name}`);
    return res.json(publicState(state));
  } else if (cmd === "prioup") d.prio = d.prio === "Low" ? "Normal" : "High";
  else if (cmd === "priodown") d.prio = d.prio === "High" ? "Normal" : "Low";
  res.json(publicState(state));
});

app.post("/api/search", (req, res) => {
  runSearch(state, req.body || {});
  res.json(publicState(state));
});

app.post("/api/search/download", (req, res) => {
  const { hash } = req.body || {};
  const found = state.search.results.find((r) => r.hash === hash);
  if (!found) return res.status(404).json({ error: "result not found" });
  if (state.downloads.some((d) => d.hash === hash)) {
    return res.json(publicState(state));
  }
  state.downloads.unshift({
    ...found,
    status: "downloading",
    progress: 0,
    complete: false,
  });
  state.logs.unshift(`[${stamp()}] Added to download: ${found.name}`);
  res.json(publicState(state));
});

app.post("/api/ed2k", (req, res) => {
  const link = String((req.body && req.body.link) || "").trim();
  const match = link.match(/ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([0-9A-Fa-f]+)\|/i);
  if (!match) return res.status(400).json({ error: "Invalid ed2k link" });
  const item = catalogItem({
    name: decodeURIComponent(match[1]),
    size: Number(match[2]),
    type: "Any",
    ext: (match[1].split(".").pop() || "").toLowerCase(),
    sources: 1,
  });
  item.hash = match[3].toUpperCase();
  item.ed2k = link;
  item.status = "downloading";
  state.downloads.unshift(item);
  state.logs.unshift(`[${stamp()}] ed2k link added: ${item.name}`);
  res.json(publicState(state));
});

app.post("/api/servers", (req, res) => {
  const { ip, port, name } = req.body || {};
  if (!ip || !port) return res.status(400).json({ error: "ip and port required" });
  state.servers.push({
    id: uuid(),
    name: name || ip,
    desc: "User added",
    ip,
    port: Number(port),
    users: 0,
    maxUsers: 0,
    files: 0,
    ping: 0,
    static: false,
    premium: false,
  });
  res.json(publicState(state));
});

app.post("/api/servers/:id/connect", (req, res) => {
  const srv = state.servers.find((s) => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: "not found" });
  state.connected = true;
  state.ed2k.connected = true;
  state.ed2k.serverId = srv.id;
  state.ed2k.id = "High ID";
  state.logs.unshift(`[${stamp()}] Connected to ${srv.name} (${srv.ip}:${srv.port})`);
  res.json(publicState(state));
});

app.post("/api/servers/:id/remove", (req, res) => {
  state.servers = state.servers.filter((s) => s.id !== req.params.id);
  res.json(publicState(state));
});

app.post("/api/shared/reload", (_req, res) => {
  state.logs.unshift(`[${stamp()}] Reloaded shared files`);
  res.json(publicState(state));
});

app.get("/api/logs", (req, res) => {
  if (req.query.reset === "1") state.logs = [`[${stamp()}] Log reset`];
  res.json({ logs: state.logs });
});

app.put("/api/settings", (req, res) => {
  state.settings = { ...state.settings, ...(req.body || {}) };
  state.nickname = state.settings.nickname || state.nickname;
  state.logs.unshift(`[${stamp()}] Preferences saved`);
  res.json(publicState(state));
});

app.post("/api/messages", (req, res) => {
  const text = String((req.body && req.body.text) || "").trim();
  if (!text) return res.status(400).json({ error: "empty" });
  state.messages.push({
    id: uuid(),
    from: state.nickname,
    text,
    time: new Date().toISOString(),
  });
  res.json(publicState(state));
});

app.post("/api/panel/login", (req, res) => {
  const password = req.body && req.body.password;
  if (!PANEL_PASSWORD || password !== PANEL_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }
  res.json({ ok: true, token: "panel-ok" });
});

app.get("/api/plans", (_req, res) => {
  res.json({
    plans: PLANS,
    stripeConfigured: Boolean(stripe),
    purchases: purchases.filter((p) => p.status === "paid"),
  });
});

app.post("/api/checkout", async (req, res) => {
  const planId = req.body && req.body.planId;
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
    fulfillPurchase(demo);
    return res.json({
      demo: true,
      url: `${BASE_URL}/shop-success.html?session_id=${demo.id}&demo=1`,
    });
  }

  try {
    const session = await createCheckoutSession(stripe, plan, BASE_URL);
    res.json({ url: session.url, id: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message || "Stripe error" });
  }
});

app.get("/api/checkout/session/:id", async (req, res) => {
  const id = req.params.id;
  const local = purchases.find((p) => p.id === id);
  if (local) return res.json(local);
  if (!stripe) return res.status(404).json({ error: "not found" });
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    res.json({
      id: session.id,
      status: session.payment_status,
      amount: session.amount_total,
      currency: session.currency,
      planId: session.metadata && session.metadata.plan_id,
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "website", "index.html"));
});

const websitePages = [
  "news",
  "download",
  "screenshots",
  "help",
  "skins",
  "forum",
  "contentdb",
  "team",
  "contact",
  "shop",
  "shop-success",
  "shop-cancel",
];
for (const page of websitePages) {
  app.get(`/${page}.html`, (_req, res) => {
    res.sendFile(path.join(publicDir, "website", `${page}.html`));
  });
  app.get(`/${page}`, (_req, res) => {
    res.sendFile(path.join(publicDir, "website", `${page}.html`));
  });
}

app.use("/client", express.static(path.join(publicDir, "client")));
app.use("/panel", express.static(path.join(publicDir, "panel")));
app.use("/website", express.static(path.join(publicDir, "website")));
app.use(express.static(path.join(publicDir, "website")));

app.get("/downloads/:file", (_req, res) => {
  res.redirect(INSTALLER_URL);
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`vMule site     http://localhost:${PORT}/`);
    console.log(`vMule client   http://localhost:${PORT}/client/`);
    console.log(`Control panel  http://localhost:${PORT}/panel/`);
    console.log(`Shop           http://localhost:${PORT}/shop.html`);
    console.log(`Stripe         ${stripe ? "keys loaded" : "demo mode (no STRIPE_SECRET_KEY)"}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
