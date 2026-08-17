const { v4: uuid } = require("uuid");
const { formatLink } = require("./vmlf");
const { getCatalog, getDefaultServers } = require("./catalog");

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

function hashLike() {
  return Array.from({ length: 32 }, () =>
    "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
  ).join("");
}

const LEGAL_CATALOG = getCatalog();

function catalogItem(partial) {
  const hash = partial.hash || hashLike();
  return {
    id: uuid(),
    hash,
    vmlf: formatLink(partial.name, partial.size, hash),
    complete: false,
    progress: 0,
    speed: 0,
    sources: partial.sources,
    sourcesXfer: Math.max(1, Math.floor(partial.sources * 0.08)),
    status: "paused",
    prio: "Normal",
    category: partial.type,
    lastSeen: "today",
    ...partial,
  };
}

function createInitialState() {
  const cat = getCatalog();
  const pick = (i) => cat[i % cat.length] || cat[0];
  const downloads = [
    catalogItem({
      ...pick(1),
      progress: 0.42,
      status: "downloading",
      speed: 312000,
    }),
    catalogItem({
      ...pick(13),
      progress: 0.91,
      status: "downloading",
      speed: 88000,
    }),
    catalogItem({
      ...pick(7),
      progress: 1,
      status: "complete",
      speed: 0,
      complete: true,
    }),
  ];

  const shared = [
    catalogItem({ ...pick(15), complete: true, progress: 1, status: "sharing" }),
    catalogItem({ ...pick(9), complete: true, progress: 1, status: "sharing" }),
    catalogItem({ ...pick(4), complete: true, progress: 1, status: "sharing" }),
    ...downloads.filter((d) => d.complete),
  ];

  const servers = getDefaultServers();

  return {
    connected: true,
    vmlf: {
      connected: true,
      id: "High ID",
      clientId: 184220991,
      serverId: "s1",
    },
    kad: {
      connected: true,
      firewalled: false,
      users: 3_812_440,
      files: 410_229_001,
    },
    nickname: "vMuleUser",
    downloads,
    uploads: [
      { id: uuid(), user: "lothar[DE]", file: "BigBuckBunny-2008-1080p-CC-BY.mp4", speed: 22000, xfer: 4_200_000, software: "vMule 0.51a" },
      { id: uuid(), user: "kademlia_fan", file: "VLC-3.0.21-win64.exe", speed: 14000, xfer: 1_100_000, software: "aMule 2.3.3" },
    ],
    queue: [
      { id: uuid(), user: "srcExch-12", file: "ubuntu-24.04.2-desktop-amd64.iso", score: 140, wait: "12 min" },
      { id: uuid(), user: "credit+88", file: "Sintel-2010-1080p-CC-BY.mkv", score: 92, wait: "31 min" },
    ],
    shared,
    servers,
    search: { term: "", running: false, results: [] },
    messages: [
      { id: uuid(), from: "System", text: "Welcome to vMule. Share only files you have the right to distribute.", time: new Date().toISOString() },
    ],
    irc: {
      channel: "#vmule",
      connected: true,
      messages: [
        { id: uuid(), from: "bot", text: "Welcome to #vmule — share legally, stay High ID.", time: new Date().toISOString() },
      ],
    },
    logs: [
      `[${stamp()}] vMule 0.51a started`,
      `[${stamp()}] Loading server.met ... 4 servers`,
      `[${stamp()}] Connected to vMule Razorback (High ID)`,
      `[${stamp()}] Kad: connected, not firewalled`,
    ],
    settings: {
      maxDown: 0,
      maxUp: 20,
      port: 4662,
      udpPort: 4672,
      maxConnections: 500,
      nickname: "vMuleUser",
      webEnabled: true,
      webPort: 4711,
      obfuscation: true,
      skin: "polar",
    },
    stats: {
      downTotal: 42_991_000_000,
      upTotal: 18_220_000_000,
      sessionDown: 128_000_000,
      sessionUp: 41_000_000,
      historyDown: Array.from({ length: 60 }, () => 0),
      historyUp: Array.from({ length: 60 }, () => 0),
    },
    purchases: [],
  };
}

function stamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function publicState(state) {
  return {
    ...state,
    downloads: state.downloads.map(decorateFile),
    shared: state.shared.map(decorateFile),
    search: {
      ...state.search,
      results: state.search.results.map(decorateFile),
    },
    irc: state.irc || { channel: "#vmule", connected: false, messages: [] },
    currentDown: state.currentDown || 0,
    currentUp: state.currentUp || 0,
  };
}

function decorateFile(f) {
  return {
    ...f,
    sizeLabel: fmtSize(f.size),
    doneLabel: fmtSize(Math.floor(f.size * (f.progress || 0))),
    speedLabel: f.speed ? `${fmtSize(f.speed)}/s` : "",
    percent: Math.round((f.progress || 0) * 1000) / 10,
  };
}

module.exports = {
  LEGAL_CATALOG,
  catalogItem,
  createInitialState,
  publicState,
  fmtSize,
  hashLike,
  stamp,
};
