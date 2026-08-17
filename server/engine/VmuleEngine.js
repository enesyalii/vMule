const { EventEmitter } = require("events");
const { v4: uuid } = require("uuid");
const store = require("../store");
const { loadState, saveState } = require("../persist");
const { parseLink } = require("../vmlf");
const { PLANS } = require("../stripe");
const {
  createInitialState,
  publicState,
  catalogItem,
  stamp,
} = require("../state");
const { getCatalog } = require("../catalog");
const transfer = require("./transfer");
const vmlfConn = require("./vmlf-connection");
const kadNet = require("./kad");
const { runSearch } = require("./search");

function randomIp() {
  return `45.${80 + Math.floor(Math.random() * 40)}.${Math.floor(Math.random() * 200)}.${10 + Math.floor(Math.random() * 200)}`;
}

class VmuleEngine extends EventEmitter {
  constructor() {
    super();
    this.state = loadState(createInitialState);
    this.purchases = store.readJson("purchases.json", []);
    this.state.purchases = this.purchases;
    this.applyPurchases();
  }

  snapshot() {
    return publicState(this.state);
  }

  commit() {
    saveState(this.state);
    const snap = this.snapshot();
    this.emit("update", snap);
    return snap;
  }

  tick() {
    transfer.advance(this.state);
    vmlfConn.pulse(this.state);
    kadNet.pulse(this.state);
    if (this.state.logs.length > 400) this.state.logs.length = 400;
    this.emit("update", this.snapshot());
  }

  applyPurchases() {
    for (const p of this.purchases) {
      if (p.status !== "paid") continue;
      if (p.planId === "kadboost") {
        this.state.kad.boost = true;
        continue;
      }
      if (this.state.servers.some((s) => s.purchaseId === p.id)) continue;
      const plan = PLANS[p.planId];
      if (!plan) continue;
      this.state.servers.unshift({
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

  fulfillPurchase(record) {
    const existing = this.purchases.find((p) => p.id === record.id);
    if (existing) Object.assign(existing, record, { status: "paid" });
    else this.purchases.unshift({ ...record, status: "paid" });
    store.writeJson("purchases.json", this.purchases);
    this.state.purchases = this.purchases;
    this.applyPurchases();
    this.state.logs.unshift(`[${stamp()}] Server purchase activated: ${record.planName}`);
    return this.commit();
  }

  connect() {
    vmlfConn.connect(this.state);
    return this.commit();
  }

  disconnect() {
    vmlfConn.disconnect(this.state);
    return this.commit();
  }

  kadStart() {
    kadNet.start(this.state);
    return this.commit();
  }

  kadStop() {
    kadNet.stop(this.state);
    return this.commit();
  }

  downloadCmd(id, cmd) {
    const d = this.state.downloads.find((x) => x.id === id);
    if (!d) return null;
    if (cmd === "pause") d.status = "paused";
    else if (cmd === "resume") d.status = d.progress >= 1 ? "complete" : "downloading";
    else if (cmd === "cancel") {
      this.state.downloads = this.state.downloads.filter((x) => x.id !== id);
      this.state.logs.unshift(`[${stamp()}] Cancelled ${d.name}`);
      return this.commit();
    } else if (cmd === "prioup") d.prio = d.prio === "Low" ? "Normal" : "High";
    else if (cmd === "priodown") d.prio = d.prio === "High" ? "Normal" : "Low";
    return this.commit();
  }

  search(body) {
    runSearch(this.state, body || {});
    return this.commit();
  }

  searchDownload(hash) {
    const found = this.state.search.results.find((r) => r.hash === hash);
    if (!found) return null;
    if (this.state.downloads.some((d) => d.hash === hash)) return this.commit();
    this.state.downloads.unshift({
      ...found,
      id: uuid(),
      status: "downloading",
      progress: 0,
      complete: false,
      bytesDone: 0,
    });
    this.state.logs.unshift(`[${stamp()}] Added to download: ${found.name}`);
    return this.commit();
  }

  addVmlfLink(link) {
    const parsed = parseLink(link);
    if (!parsed) return { error: "Invalid VMLF link (vmlf://|file|name|size|hash|/)" };
    const item = catalogItem({
      name: parsed.name,
      size: parsed.size,
      type: "Any",
      ext: (parsed.name.split(".").pop() || "").toLowerCase(),
      sources: 1,
      hash: parsed.hash,
    });
    item.vmlf = parsed.link;
    item.status = "downloading";
    item.bytesDone = 0;
    this.state.downloads.unshift(item);
    this.state.logs.unshift(`[${stamp()}] VMLF link added: ${item.name}`);
    return { ok: true, state: this.commit() };
  }

  addServer({ ip, port, name }) {
    if (!ip || !port) return { error: "ip and port required" };
    this.state.servers.push({
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
    return this.commit();
  }

  connectServer(id) {
    if (!vmlfConn.connectServer(this.state, id)) return null;
    return this.commit();
  }

  removeServer(id) {
    this.state.servers = this.state.servers.filter((s) => s.id !== id);
    return this.commit();
  }

  reloadShared() {
    this.state.logs.unshift(`[${stamp()}] Reloaded shared files`);
    return this.commit();
  }

  resetLogs() {
    this.state.logs = [`[${stamp()}] Log reset`];
    return this.commit();
  }

  updateSettings(body) {
    this.state.settings = { ...this.state.settings, ...(body || {}) };
    this.state.nickname = this.state.settings.nickname || this.state.nickname;
    this.state.logs.unshift(`[${stamp()}] Preferences saved`);
    return this.commit();
  }

  addMessage(text) {
    if (!text) return { error: "empty" };
    this.state.messages.push({
      id: uuid(),
      from: this.state.nickname,
      text,
      time: new Date().toISOString(),
    });
    return this.commit();
  }

  addIrcMessage(text) {
    if (!text) return { error: "empty" };
    if (!this.state.irc) {
      this.state.irc = { channel: "#vmule", connected: true, messages: [] };
    }
    this.state.irc.connected = true;
    this.state.irc.messages.push({
      id: uuid(),
      from: this.state.nickname,
      text,
      time: new Date().toISOString(),
    });
    const replies = [
      "Share only files you have the right to distribute.",
      "Kad is up — try searching on the Kad network.",
      "High ID is better for uploads. Check your ports in Preferences.",
    ];
    this.state.irc.messages.push({
      id: uuid(),
      from: "bot",
      text: replies[Math.floor(Math.random() * replies.length)],
      time: new Date().toISOString(),
    });
    if (this.state.irc.messages.length > 200) this.state.irc.messages.length = 200;
    return this.commit();
  }

  getIrc() {
    return this.state.irc || { channel: "#vmule", connected: false, messages: [] };
  }

  getLogs() {
    return this.state.logs;
  }

  getCatalog() {
    return getCatalog();
  }

  findByHash(hash) {
    const h = String(hash || "").toUpperCase();
    return getCatalog().find((c) => {
      const item = catalogItem(c);
      return item.hash === h;
    });
  }
}

module.exports = { VmuleEngine };
