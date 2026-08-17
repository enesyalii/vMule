const { v4: uuid } = require("uuid");
const { formatLink } = require("./vmlf");

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

const LEGAL_CATALOG = [
  { name: "debian-12.10.0-amd64-netinst.iso", size: 628097024, type: "Archive", ext: "iso", sources: 1840 },
  { name: "ubuntu-24.04.2-desktop-amd64.iso", size: 5813305344, type: "Archive", ext: "iso", sources: 3211 },
  { name: "fedora-workstation-41-x86_64.iso", size: 2306867200, type: "Archive", ext: "iso", sources: 902 },
  { name: "linux-6.12.8.tar.xz", size: 148576256, type: "Archive", ext: "xz", sources: 540 },
  { name: "ProjectGutenberg-SherlockHolmes.epub", size: 612352, type: "Document", ext: "epub", sources: 88 },
  { name: "ProjectGutenberg-PrideAndPrejudice.epub", size: 445440, type: "Document", ext: "epub", sources: 76 },
  { name: "OpenStreetMap-planet-excerpt.pbf", size: 89128960, type: "Document", ext: "pbf", sources: 41 },
  { name: "Blender-4.3.2-windows-x64.msi", size: 326107136, type: "Program", ext: "msi", sources: 612 },
  { name: "GIMP-2.10.38-setup.exe", size: 298844160, type: "Program", ext: "exe", sources: 701 },
  { name: "VLC-3.0.21-win64.exe", size: 44564480, type: "Program", ext: "exe", sources: 1550 },
  { name: "LibreOffice_24.8_Win_x86-64.msi", size: 355467264, type: "Program", ext: "msi", sources: 430 },
  { name: "CC-0_Piano_Etude_No3.flac", size: 42844160, type: "Audio", ext: "flac", sources: 22 },
  { name: "NASA-Apollo11-Onboard-Audio.flac", size: 891289600, type: "Audio", ext: "flac", sources: 19 },
  { name: "Sintel-2010-1080p-CC-BY.mkv", size: 1291845632, type: "Video", ext: "mkv", sources: 260 },
  { name: "TearsOfSteel-2012-1080p-CC-BY.mkv", size: 734003200, type: "Video", ext: "mkv", sources: 188 },
  { name: "BigBuckBunny-2008-1080p-CC-BY.mp4", size: 276824064, type: "Video", ext: "mp4", sources: 940 },
  { name: "Wikipedia-en-dump-excerpt.xml.bz2", size: 157286400, type: "Document", ext: "bz2", sources: 55 },
  { name: "Python-3.13.1.tgz", size: 29360128, type: "Archive", ext: "tgz", sources: 210 },
  { name: "nodejs-22.13.0-x64.msi", size: 30408704, type: "Program", ext: "msi", sources: 133 },
  { name: "Wireshark-4.4.3-x64.exe", size: 90177536, type: "Program", ext: "exe", sources: 97 },
];

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
  const downloads = [
    catalogItem({
      ...LEGAL_CATALOG[1],
      progress: 0.42,
      status: "downloading",
      speed: 312000,
    }),
    catalogItem({
      ...LEGAL_CATALOG[13],
      progress: 0.91,
      status: "downloading",
      speed: 88000,
    }),
    catalogItem({
      ...LEGAL_CATALOG[7],
      progress: 1,
      status: "complete",
      speed: 0,
      complete: true,
    }),
  ];

  const shared = [
    catalogItem({ ...LEGAL_CATALOG[15], complete: true, progress: 1, status: "sharing" }),
    catalogItem({ ...LEGAL_CATALOG[9], complete: true, progress: 1, status: "sharing" }),
    catalogItem({ ...LEGAL_CATALOG[4], complete: true, progress: 1, status: "sharing" }),
    ...downloads.filter((d) => d.complete),
  ];

  const servers = [
    { id: "s1", name: "vMule Razorback", desc: "Official public server", ip: "176.12.44.18", port: 4661, users: 182440, maxUsers: 400000, files: 91200331, ping: 42, static: true, premium: false },
    { id: "s2", name: "DonkeyServer No1", desc: "Long-running VMLF", ip: "91.204.44.112", port: 4242, users: 64012, maxUsers: 120000, files: 22044190, ping: 88, static: true, premium: false },
    { id: "s3", name: "Peerates.net", desc: "EU cluster", ip: "193.111.22.9", port: 4661, users: 22190, maxUsers: 80000, files: 8402211, ping: 61, static: false, premium: false },
    { id: "s4", name: "vMule Kad Gate", desc: "Kad bootstrap helper", ip: "45.9.88.14", port: 4662, users: 9802, maxUsers: 20000, files: 1200441, ping: 27, static: true, premium: false },
  ];

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
      { id: uuid(), user: "lothar[DE]", file: "BigBuckBunny-2008-1080p-CC-BY.mp4", speed: 22000, xfer: 4_200_000, software: "vMule 0.50a" },
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
      `[${stamp()}] vMule 0.50a started`,
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

function tick(state) {
  const downLimit = state.settings.maxDown === 0 ? 9_000_000 : state.settings.maxDown * 1024;
  const upLimit = state.settings.maxUp === 0 ? 2_000_000 : state.settings.maxUp * 1024;
  let down = 0;
  let up = 0;

  if (state.connected && state.vmlf.connected) {
    for (const d of state.downloads) {
      if (d.status === "downloading" && d.progress < 1) {
        const burst = 20_000 + Math.random() * 180_000;
        d.speed = Math.floor(burst);
        d.progress = Math.min(1, d.progress + burst / d.size);
        d.sourcesXfer = Math.max(1, d.sourcesXfer + Math.floor(Math.random() * 3) - 1);
        down += d.speed;
        if (d.progress >= 1) {
          d.progress = 1;
          d.status = "complete";
          d.complete = true;
          d.speed = 0;
          state.logs.unshift(`[${stamp()}] Completed: ${d.name}`);
          if (!state.shared.find((s) => s.hash === d.hash)) {
            state.shared.push({ ...d, status: "sharing" });
          }
        }
      } else {
        d.speed = 0;
      }
    }
    for (const u of state.uploads) {
      u.speed = 8_000 + Math.floor(Math.random() * 40_000);
      u.xfer += u.speed;
      up += u.speed;
    }
    const srv = state.servers.find((s) => s.id === state.vmlf.serverId);
    if (srv) {
      srv.users += Math.floor(Math.random() * 21) - 10;
      srv.users = Math.max(100, srv.users);
      srv.files += Math.floor(Math.random() * 200) - 80;
    }
    if (state.kad.connected) {
      state.kad.users += Math.floor(Math.random() * 200) - 90;
      state.kad.files += Math.floor(Math.random() * 400) - 150;
    }
  } else {
    for (const d of state.downloads) d.speed = 0;
    for (const u of state.uploads) u.speed = 0;
  }

  down = Math.min(down, downLimit);
  up = Math.min(up, upLimit);
  state.stats.sessionDown += down;
  state.stats.sessionUp += up;
  state.stats.downTotal += down;
  state.stats.upTotal += up;
  state.stats.historyDown.push(down);
  state.stats.historyUp.push(up);
  if (state.stats.historyDown.length > 90) state.stats.historyDown.shift();
  if (state.stats.historyUp.length > 90) state.stats.historyUp.shift();
  state.currentDown = down;
  state.currentUp = up;
  return state;
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

function runSearch(state, { term, type, network }) {
  const q = (term || "").toLowerCase().trim();
  state.search.term = term;
  state.search.running = false;
  state.search.network = network || "kad";
  const pool = LEGAL_CATALOG.filter((item) => {
    if (type && type !== "Any" && item.type !== type) return false;
    if (!q) return true;
    return item.name.toLowerCase().includes(q);
  });
  state.search.results = pool.map((item) =>
    catalogItem({
      ...item,
      sources: item.sources + Math.floor(Math.random() * 40),
    })
  );
  state.logs.unshift(
    `[${stamp()}] Search (${network || "kad"}): "${term}" → ${state.search.results.length} results`
  );
}

module.exports = {
  LEGAL_CATALOG,
  catalogItem,
  createInitialState,
  tick,
  publicState,
  runSearch,
  fmtSize,
  hashLike,
  stamp,
};
