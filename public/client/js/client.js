const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = null;
let selected = { down: null, search: null, server: null };
let toastTimer = null;

const MENUS = {
  file: [
    { label: "Connect", action: () => cmd("/api/connect") },
    { label: "Disconnect", action: () => cmd("/api/disconnect") },
    { sep: true },
    { label: "Add VMLF link…", action: () => { showTab("transfer"); $("#vmlf-link").focus(); } },
    { sep: true },
    { label: "Quit", action: () => { location.href = "/"; } },
  ],
  view: [
    { label: "Servers", action: () => showTab("servers") },
    { label: "Search", action: () => showTab("search") },
    { label: "Transfer", action: () => showTab("transfer") },
    { label: "Shared Files", action: () => showTab("shared") },
    { label: "Messages", action: () => showTab("messages") },
    { label: "IRC", action: () => showTab("irc") },
    { label: "Statistics", action: () => showTab("stats") },
    { label: "Kad", action: () => showTab("kad") },
    { label: "Server Log", action: () => showTab("logs") },
    { label: "Preferences", action: () => showTab("prefs") },
  ],
  tools: [
    { label: "Start Search", action: () => { showTab("search"); $("#q").focus(); } },
    { label: "Connect Kad", action: () => cmd("/api/kad/start") },
    { label: "Disconnect Kad", action: () => cmd("/api/kad/stop") },
    { sep: true },
    { label: "Reload shared files", action: () => cmd("/api/shared/reload") },
  ],
  help: [
    { label: "vMule website", action: () => { location.href = "/"; } },
    { label: "Buy server", action: () => { location.href = "/shop.html"; } },
  ],
};

const TAB_KEYS = {
  "1": "servers", "2": "search", "3": "transfer", "4": "shared",
  "5": "messages", "6": "irc", "7": "stats", "8": "kad", "9": "logs", "0": "prefs",
};

const SKINS = ["classic", "luna", "polar"];

function applySkin(name) {
  const skin = SKINS.includes(name) ? name : "polar";
  const win = document.querySelector(".win");
  if (win) win.dataset.skin = skin;
  try {
    localStorage.setItem("vmule-skin", skin);
  } catch {
    /* ignore */
  }
}

function bootSkin() {
  try {
    const cached = localStorage.getItem("vmule-skin");
    if (cached && SKINS.includes(cached)) applySkin(cached);
  } catch {
    /* ignore */
  }
}
bootSkin();

function fmt(n) {
  if (n < 1024) return `${Math.round(n)} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i += 1; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

function toast(msg, err = false) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: { ...(opts.headers || {}) } };
  if (opts.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    location.replace(`/account/?next=${encodeURIComponent("/client/")}`);
    throw new Error("Sign in required");
  }
  if (!res.ok) {
    const err = data.error || `Request failed (${res.status})`;
    toast(err, true);
    throw new Error(err);
  }
  return data;
}

function vmlf() {
  return state.vmlf || state.ed2k || { connected: false, id: "Disconnected" };
}

function showTab(name) {
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === `view-${name}`));
  $$(".toolbar button.tb-nav").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  closeMenu();
}

function bindTabs() {
  $$(".toolbar button.tb-nav").forEach((b) => {
    b.onclick = () => showTab(b.dataset.tab);
  });
}

function closeMenu() {
  $("#menu-popup").hidden = true;
  $$(".menu-item").forEach((m) => m.classList.remove("open"));
}

function openMenu(name, anchor) {
  const items = MENUS[name];
  if (!items) return;
  const pop = $("#menu-popup");
  pop.innerHTML = items
    .map((item) => {
      if (item.sep) return "<div class='sep'></div>";
      return `<button type="button" data-idx="${items.indexOf(item)}">${item.label}</button>`;
    })
    .join("");
  pop.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      const item = items[Number(btn.dataset.idx)];
      closeMenu();
      item.action();
    };
  });
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${r.left}px`;
  pop.style.top = `${r.bottom}px`;
  pop.hidden = false;
  $$(".menu-item").forEach((m) => m.classList.toggle("open", m.dataset.menu === name));
}

function bindMenus() {
  $$(".menu-item").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      if ($("#menu-popup").hidden) openMenu(el.dataset.menu, el);
      else closeMenu();
    };
  });
  document.addEventListener("click", () => closeMenu());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      $("#ctx-menu").hidden = true;
    }
  });
}

function showCtxMenu(x, y, items) {
  const menu = $("#ctx-menu");
  menu.innerHTML = items
    .map((item, i) => {
      if (item.sep) return "<div class='sep'></div>";
      return `<button type="button" data-i="${i}">${item.label}</button>`;
    })
    .join("");
  menu.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      const item = items[Number(btn.dataset.i)];
      menu.hidden = true;
      item.action();
    };
  });
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;
}

function fillTable(table, rows, key, selectedId) {
  const tb = table.querySelector("tbody");
  if (!rows.length) {
    tb.innerHTML = `<tr class="empty"><td colspan="20" style="color:#666;padding:12px">No items</td></tr>`;
    return;
  }
  tb.innerHTML = rows
    .map(
      (r) =>
        `<tr data-id="${r.id}" class="${r.cls || ""} ${r.id === selectedId ? "sel" : ""}">${r.cells
          .map((c) => `<td>${c}</td>`)
          .join("")}</tr>`
    )
    .join("");
  tb.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.onclick = () => {
      selected[key] = tr.dataset.id;
      tb.querySelectorAll("tr").forEach((x) => x.classList.toggle("sel", x === tr));
    };
    tr.ondblclick = () => {
      if (table.id === "tbl-search") downloadSearch();
      if (table.id === "tbl-servers") $("#srv-connect").click();
    };
    if (table.id === "tbl-down") {
      tr.oncontextmenu = (e) => {
        e.preventDefault();
        selected.down = tr.dataset.id;
        tb.querySelectorAll("tr").forEach((x) => x.classList.toggle("sel", x === tr));
        showCtxMenu(e.clientX, e.clientY, [
          { label: "Resume", action: () => cmd(`/api/downloads/${selected.down}/resume`) },
          { label: "Pause", action: () => cmd(`/api/downloads/${selected.down}/pause`) },
          { label: "Cancel", action: () => cmd(`/api/downloads/${selected.down}/cancel`) },
          { sep: true },
          { label: "Priority up", action: () => cmd(`/api/downloads/${selected.down}/prioup`) },
          { label: "Priority down", action: () => cmd(`/api/downloads/${selected.down}/priodown`) },
        ]);
      };
    }
  });
}

function scrollLogs() {
  const boxes = ["#msg-log", "#irc-log", "#full-log", "#console-log"];
  boxes.forEach((sel) => {
    const el = $(sel);
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function render() {
  if (!state) return;
  const vf = vmlf();
  const srv = state.servers.find((s) => s.id === vf.serverId);
  $("#win-title").textContent = `vMule v0.51a  [${state.nickname}]`;

  const ledV = $("#led-vmlf");
  ledV.className = "sb-led " + (vf.connected ? "on" : "off");
  const ledK = $("#led-kad");
  ledK.className = "sb-led " + (state.kad.connected ? (state.kad.firewalled ? "warn" : "on") : "off");

  $("#sb-vmlf").title = vf.connected ? `${vf.id}${srv ? " @ " + srv.name : ""}` : "Disconnected";
  $("#sb-kad").title = state.kad.connected ? `${state.kad.users?.toLocaleString()} users` : "Kad off";
  $("#sb-dl").textContent = `▼ ${fmt(state.currentDown || 0)}/s`;
  $("#sb-ul").textContent = `▲ ${fmt(state.currentUp || 0)}/s`;
  $("#sb-info").textContent = [
    `VMLF: ${vf.connected ? vf.id : "off"}${srv ? " · " + srv.name : ""}`,
    `Kad: ${state.kad.connected ? (state.kad.firewalled ? "firewalled" : "on") : "off"}`,
    `Users: ${(state.kad.users || 0).toLocaleString()}`,
    `Files: ${(state.kad.files || 0).toLocaleString()}`,
  ].join("  ·  ");

  fillTable(
    $("#tbl-down"),
    state.downloads.map((d) => ({
      id: d.id,
      cls: d.status === "complete" ? "done" : d.status === "downloading" ? "down" : "pause",
      cells: [
        d.name,
        d.sizeLabel,
        d.doneLabel,
        `<span class="bar"><i style="width:${d.percent}%"></i></span> ${d.percent}%`,
        d.speedLabel || "—",
        `${d.sourcesXfer} (${d.sources})`,
        d.prio,
        d.status,
      ],
    })),
    "down",
    selected.down
  );

  fillTable(
    $("#tbl-up"),
    state.uploads.map((u) => ({
      id: u.id,
      cells: [u.user, u.file, fmt(u.xfer), fmt(u.speed) + "/s", u.software],
    })),
    "up",
    null
  );

  fillTable(
    $("#tbl-search"),
    state.search.results.map((r) => ({
      id: r.hash,
      cells: [r.name, r.sizeLabel, r.sources, r.category, r.hash.slice(0, 16) + "…"],
    })),
    "search",
    selected.search
  );

  fillTable(
    $("#tbl-shared"),
    state.shared.map((s) => ({
      id: s.id,
      cells: [s.name, s.sizeLabel, s.sources || 0, s.sourcesXfer || 0, s.doneLabel || s.sizeLabel, s.prio || "Normal"],
    })),
    "shared",
    null
  );

  fillTable(
    $("#tbl-servers"),
    state.servers.map((s) => ({
      id: s.id,
      cls: s.premium ? "premium" : "",
      cells: [
        (s.premium ? "★ " : "") + s.name,
        `${s.ip}:${s.port}`,
        s.desc,
        s.ping ? s.ping + " ms" : "—",
        `${s.users.toLocaleString()} / ${s.maxUsers.toLocaleString()}`,
        s.files.toLocaleString(),
        s.static ? "Static" : "",
      ],
    })),
    "server",
    selected.server
  );

  const logText = (state.logs || []).join("\n");
  $("#console-log").textContent = (state.logs || []).slice(0, 8).join("\n");
  $("#full-log").textContent = logText;

  $("#msg-log").textContent = state.messages
    .map((m) => `[${new Date(m.time).toLocaleTimeString()}] <${m.from}> ${m.text}`)
    .join("\n");

  if (state.irc?.messages) {
    $("#irc-log").textContent = state.irc.messages
      .map((m) => `[${new Date(m.time).toLocaleTimeString()}] <${m.from}> ${m.text}`)
      .join("\n");
  }

  $("#kad-info").textContent = [
    `Connected: ${state.kad.connected}`,
    `Firewalled: ${state.kad.firewalled}`,
    `Users: ${(state.kad.users || 0).toLocaleString()}`,
    `Files: ${(state.kad.files || 0).toLocaleString()}`,
    state.kad.boost ? "Kad boost: active" : "",
  ].filter(Boolean).join("\n");

  $("#stats-text").textContent =
    `Session DL: ${fmt(state.stats.sessionDown)}\nSession UL: ${fmt(state.stats.sessionUp)}\n` +
    `Total DL: ${fmt(state.stats.downTotal)}\nTotal UL: ${fmt(state.stats.upTotal)}\n` +
    `Ratio: ${(state.stats.upTotal / Math.max(1, state.stats.downTotal)).toFixed(3)}`;

  drawSpeed();
  fillPrefs();
  applySkin(state.settings?.skin || "polar");
  scrollLogs();
}

function fillPrefs() {
  const s = state.settings;
  if (document.activeElement?.closest(".prefs")) return;
  $("#set-nick").value = s.nickname;
  $("#set-down").value = s.maxDown;
  $("#set-up").value = s.maxUp;
  $("#set-port").value = s.port;
  $("#set-udp").value = s.udpPort;
  $("#set-conn").value = s.maxConnections;
  $("#set-obf").checked = s.obfuscation;
  const skin = SKINS.includes(s.skin) ? s.skin : "polar";
  $("#set-skin").value = skin;
}

function drawSpeed() {
  const c = $("#speed-canvas");
  if (!c || !state) return;
  const ctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#001028";
  ctx.fillRect(0, 0, w, h);
  const down = state.stats.historyDown;
  const up = state.stats.historyUp;
  const max = Math.max(1, ...down, ...up);
  function plot(arr, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    arr.forEach((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - (v / max) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  plot(down, "#4ea3ff");
  plot(up, "#7dff9a");
  ctx.fillStyle = "#9ab";
  ctx.font = "11px Tahoma";
  ctx.fillText("Download", 8, 14);
  ctx.fillStyle = "#7dff9a";
  ctx.fillText("Upload", 80, 14);
}

async function refresh() {
  try {
    state = await api("/api/state");
    render();
  } catch {
    /* toast already shown */
  }
}

function connectLive() {
  api("/api/health").then((h) => {
    const pollMs = h.serverless ? 1500 : 0;
    if (pollMs) {
      refresh();
      setInterval(refresh, pollMs);
    }
    if (pollMs || typeof EventSource === "undefined") {
      if (!pollMs) {
        refresh();
        setInterval(refresh, 1000);
      }
      return;
    }
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        state = JSON.parse(e.data);
        render();
      } catch {
        /* ignore parse errors */
      }
    };
    es.onerror = () => {
      es.close();
      refresh();
      setInterval(refresh, 1500);
    };
  }).catch(() => {
    refresh();
    setInterval(refresh, 1500);
  });
}

function cmd(path, body) {
  return api(path, { method: "POST", body })
    .then((s) => {
      state = s;
      render();
      return s;
    })
    .catch(() => null);
}

function downloadSearch() {
  if (!selected.search) {
    toast("Select a search result first", true);
    return;
  }
  cmd("/api/search/download", { hash: selected.search }).then((s) => {
    if (s) {
      toast("Added to download queue");
      showTab("transfer");
    }
  });
}

function runSearch() {
  const term = $("#q").value.trim();
  if (!term) {
    toast("Enter a search term", true);
    return;
  }
  cmd("/api/search", { term, type: $("#q-type").value, network: $("#q-net").value });
}

function addVmlfLink() {
  const link = $("#vmlf-link").value.trim();
  if (!link) {
    toast("Paste a VMLF link", true);
    return;
  }
  cmd("/api/vmlf", { link }).then((s) => {
    if (s) {
      $("#vmlf-link").value = "";
      toast("Download started");
      showTab("transfer");
    }
  });
}

bindTabs();
bindMenus();

$("#btn-connect").onclick = () => cmd("/api/connect").then((s) => s && toast("Connected (High ID)"));
$("#btn-disconnect").onclick = () => cmd("/api/disconnect").then((s) => s && toast("Disconnected"));
$("#kad-start").onclick = () => cmd("/api/kad/start").then((s) => s && toast("Kad connected"));
$("#kad-stop").onclick = () => cmd("/api/kad/stop").then((s) => s && toast("Kad disconnected"));
$("#shared-reload").onclick = () => cmd("/api/shared/reload").then((s) => s && toast("Shared files reloaded"));
$("#q-go").onclick = runSearch;
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
$("#q-dl").onclick = downloadSearch;
$$("button[data-dl]").forEach((b) => {
  b.onclick = () => {
    if (!selected.down) { toast("Select a download first", true); return; }
    cmd(`/api/downloads/${selected.down}/${b.dataset.dl}`);
  };
});
$("#vmlf-add").onclick = addVmlfLink;
$("#vmlf-link").addEventListener("keydown", (e) => { if (e.key === "Enter") addVmlfLink(); });
$("#srv-add").onclick = () => {
  const ip = $("#srv-ip").value.trim();
  const port = $("#srv-port").value.trim();
  if (!ip || !port) { toast("IP and port required", true); return; }
  cmd("/api/servers", { ip, port, name: $("#srv-name").value }).then((s) => {
    if (s) {
      $("#srv-ip").value = "";
      $("#srv-name").value = "";
      toast("Server added");
    }
  });
};
$("#srv-connect").onclick = () => {
  if (!selected.server) { toast("Select a server first", true); return; }
  cmd(`/api/servers/${selected.server}/connect`).then((s) => s && toast("Connected to server"));
};
$("#srv-remove").onclick = () => {
  if (!selected.server) { toast("Select a server first", true); return; }
  cmd(`/api/servers/${selected.server}/remove`);
};
$("#msg-send").onclick = () => {
  const t = $("#msg-text").value.trim();
  if (!t) return;
  cmd("/api/messages", { text: t });
  $("#msg-text").value = "";
};
$("#msg-text").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#msg-send").click(); });
$("#irc-send").onclick = () => {
  const t = $("#irc-text").value.trim();
  if (!t) return;
  cmd("/api/irc", { text: t });
  $("#irc-text").value = "";
};
$("#irc-text").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#irc-send").click(); });
$("#set-skin").onchange = () => applySkin($("#set-skin").value);
$("#set-save").onclick = () =>
  api("/api/settings", {
    method: "PUT",
    body: {
      nickname: $("#set-nick").value,
      maxDown: Number($("#set-down").value),
      maxUp: Number($("#set-up").value),
      port: Number($("#set-port").value),
      udpPort: Number($("#set-udp").value),
      maxConnections: Number($("#set-conn").value),
      obfuscation: $("#set-obf").checked,
      skin: $("#set-skin").value,
    },
  }).then((s) => {
    state = s;
    render();
    toast("Preferences saved");
  });
$("#log-clear").onclick = () =>
  api("/api/logs?reset=1").then(() => refresh()).then(() => toast("Log cleared"));
$("#console-toggle").onclick = () => $("#console").classList.toggle("collapsed");
$("#console-head").onclick = (e) => { if (e.target.id !== "console-toggle") $("#console").classList.toggle("collapsed"); };

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "c") { e.preventDefault(); $("#btn-connect").click(); }
  if (e.ctrlKey && e.key === "d") { e.preventDefault(); $("#btn-disconnect").click(); }
  if (e.ctrlKey && e.key === "f") { e.preventDefault(); showTab("search"); $("#q").focus(); }
  if (e.ctrlKey && TAB_KEYS[e.key]) { e.preventDefault(); showTab(TAB_KEYS[e.key]); }
});

connectLive();

// First-run hint
if (!sessionStorage.getItem("vmule-hint")) {
  sessionStorage.setItem("vmule-hint", "1");
  setTimeout(() => {
    toast("Tip: Search for ubuntu or blender, double-click to download. Use VMLF links instead of ed2k.");
  }, 800);
}
