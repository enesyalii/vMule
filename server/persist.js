const store = require("./store");
const { migrateState } = require("./vmlf");

const STATE_FILE = "state.json";

function snapshot(state) {
  return {
    connected: state.connected,
    vmlf: { ...state.vmlf },
    kad: { ...state.kad },
    nickname: state.nickname,
    downloads: state.downloads,
    uploads: state.uploads,
    queue: state.queue,
    shared: state.shared,
    servers: state.servers,
    search: state.search,
    messages: state.messages,
    irc: state.irc,
    logs: state.logs.slice(0, 200),
    settings: state.settings,
    stats: state.stats,
    currentDown: state.currentDown || 0,
    currentUp: state.currentUp || 0,
  };
}

function mergeState(fresh, saved) {
  if (!saved || typeof saved !== "object") return fresh;
  return migrateState({
    ...fresh,
    ...saved,
    vmlf: { ...fresh.vmlf, ...(saved.vmlf || saved.ed2k || {}) },
    kad: { ...fresh.kad, ...(saved.kad || {}) },
    settings: { ...fresh.settings, ...(saved.settings || {}) },
    stats: { ...fresh.stats, ...(saved.stats || {}) },
    irc: saved.irc || fresh.irc,
    purchases: fresh.purchases,
  });
}

function loadState(createInitialState) {
  const saved = store.readJson(STATE_FILE, null);
  return mergeState(createInitialState(), saved);
}

function saveState(state) {
  store.writeJson(STATE_FILE, snapshot(state));
}

module.exports = { loadState, saveState, snapshot, mergeState };
