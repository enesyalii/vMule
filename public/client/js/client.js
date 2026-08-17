const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = null;
let selected = { down: null, search: null, server: null };

function fmt(n) {
  if (n < 1024) return `${Math.round(n)} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i += 1; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: { ...(opts.headers || {}) } };
  if (opts.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  return res.json();
}

function showTab(name) {
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === `view-${name}`));
  $$(".toolbar button.tb-nav").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
}

function bindTabs() {
  $$(".toolbar button.tb-nav").forEach((b) => {
    b.onclick = () => showTab(b.dataset.tab);
  });
}

function fillTable(table, rows, key, selectedId) {
  const tb = table.querySelector("tbody");
  tb.innerHTML = rows
    .map(
      (r) =>
        `<tr data-id="${r.id}" class="${r.cls || ""} ${r.id === selectedId ? "sel" : ""}">${r.cells
          .map((c) => `<td>${c}</td>`)
          .join("")}</tr>`
    )
    .join("");
  tb.querySelectorAll("tr").forEach((tr) => {
    tr.onclick = () => {
      selected[key] = tr.dataset.id;
      tb.querySelectorAll("tr").forEach((x) => x.classList.toggle("sel", x === tr));
    };
    tr.ondblclick = () => {
      if (table.id === "tbl-search") $("#q-dl").click();
      if (table.id === "tbl-servers") $("#srv-connect").click();
    };
  });
}

function render() {
  if (!state) return;
  const srv = state.servers.find((s) => s.id === state.ed2k.serverId);
  $("#win-title").textContent = `vMule v0.50a  [${state.nickname}]`;
  $("#status").innerHTML = `
    <span>▼ ${fmt(state.currentDown || 0)}/s</span>
    <span>▲ ${fmt(state.currentUp || 0)}/s</span>
    <span>ED2K: ${state.ed2k.connected ? state.ed2k.id : "Disconnected"}${srv ? " @ " + srv.name : ""}</span>
    <span>Kad: ${state.kad.connected ? (state.kad.firewalled ? "firewalled" : "connected") : "off"}</span>
    <span>Users: ${(state.kad.users || 0).toLocaleString()} &nbsp; Files: ${(state.kad.files || 0).toLocaleString()}</span>
  `;

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
        d.speedLabel,
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
        s.ping,
        `${s.users.toLocaleString()} / ${s.maxUsers.toLocaleString()}`,
        s.files.toLocaleString(),
        s.static ? "Static" : "",
      ],
    })),
    "server",
    selected.server
  );

  $("#msg-log").textContent = state.messages
    .map((m) => `[${new Date(m.time).toLocaleTimeString()}] <${m.from}> ${m.text}`)
    .join("\n");

  if (state.irc && state.irc.messages) {
    $("#irc-log").textContent = state.irc.messages
      .map((m) => `[${new Date(m.time).toLocaleTimeString()}] <${m.from}> ${m.text}`)
      .join("\n");
  }

  $("#kad-info").textContent = JSON.stringify(state.kad, null, 2);
  $("#stats-text").textContent =
    `Session DL: ${fmt(state.stats.sessionDown)}\nSession UL: ${fmt(state.stats.sessionUp)}\n` +
    `Total DL: ${fmt(state.stats.downTotal)}\nTotal UL: ${fmt(state.stats.upTotal)}\n` +
    `Ratio: ${(state.stats.upTotal / Math.max(1, state.stats.downTotal)).toFixed(3)}`;

  drawSpeed();
  fillPrefs();
}

function fillPrefs() {
  const s = state.settings;
  if (document.activeElement && document.activeElement.closest(".prefs")) return;
  $("#set-nick").value = s.nickname;
  $("#set-down").value = s.maxDown;
  $("#set-up").value = s.maxUp;
  $("#set-port").value = s.port;
  $("#set-udp").value = s.udpPort;
  $("#set-conn").value = s.maxConnections;
  $("#set-obf").checked = s.obfuscation;
  $("#set-web").checked = s.webEnabled;
  $("#set-webport").value = s.webPort;
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
  ctx.fillText("Download", 8, 14);
  ctx.fillStyle = "#7dff9a";
  ctx.fillText("Upload", 80, 14);
}

async function refresh() {
  state = await api("/api/state");
  render();
}

function cmd(path, body) {
  return api(path, { method: "POST", body }).then((s) => {
    state = s;
    render();
  });
}

bindTabs();
$("#btn-connect").onclick = () => cmd("/api/connect");
$("#btn-disconnect").onclick = () => cmd("/api/disconnect");
$("#kad-start").onclick = () => cmd("/api/kad/start");
$("#kad-stop").onclick = () => cmd("/api/kad/stop");
$("#shared-reload").onclick = () => cmd("/api/shared/reload");
$("#q-go").onclick = () =>
  cmd("/api/search", { term: $("#q").value, type: $("#q-type").value, network: $("#q-net").value });
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#q-go").click();
});
$("#q-dl").onclick = () => {
  if (selected.search) cmd("/api/search/download", { hash: selected.search });
};
$$("button[data-dl]").forEach((b) => {
  b.onclick = () => {
    if (!selected.down) return;
    cmd(`/api/downloads/${selected.down}/${b.dataset.dl}`);
  };
});
$("#ed2k-add").onclick = () => cmd("/api/ed2k", { link: $("#ed2k").value });
$("#srv-add").onclick = () =>
  cmd("/api/servers", { ip: $("#srv-ip").value, port: $("#srv-port").value, name: $("#srv-name").value });
$("#srv-connect").onclick = () => selected.server && cmd(`/api/servers/${selected.server}/connect`);
$("#srv-remove").onclick = () => selected.server && cmd(`/api/servers/${selected.server}/remove`);
$("#msg-send").onclick = () => {
  cmd("/api/messages", { text: $("#msg-text").value });
  $("#msg-text").value = "";
};
$("#irc-send").onclick = () => {
  const t = $("#irc-text").value;
  if (!t.trim()) return;
  cmd("/api/irc", { text: t });
  $("#irc-text").value = "";
};
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
      webEnabled: $("#set-web").checked,
      webPort: Number($("#set-webport").value),
    },
  }).then((s) => {
    state = s;
    render();
  });

refresh();
setInterval(refresh, 1000);
