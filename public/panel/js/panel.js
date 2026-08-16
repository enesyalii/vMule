const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = null;
let token = sessionStorage.getItem("vmule-panel") || "";
const sel = { down: null, search: null, server: null };
window.sel = sel;

async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.body && typeof opts.body === "object") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  return res.json();
}

function fmt(n) {
  if (n < 1024) return `${Math.round(n)} B`;
  const u = ["KB", "MB", "GB"];
  let i = -1;
  do { n /= 1024; i += 1; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(1)} ${u[i]}`;
}

function showApp(on) {
  $("#login").hidden = on;
  $("#app").hidden = !on;
}

$("#login-btn").onclick = async () => {
  const r = await api("/api/panel/login", { method: "POST", body: { password: $("#pw").value } });
  if (r.ok) {
    token = "panel-ok";
    sessionStorage.setItem("vmule-panel", token);
    showApp(true);
    refresh();
  } else {
    $("#login-err").textContent = r.error || "Login failed";
  }
};
$("#pw").addEventListener("keydown", (e) => e.key === "Enter" && $("#login-btn").click());
$("#logout").onclick = () => {
  sessionStorage.removeItem("vmule-panel");
  token = "";
  showApp(false);
};

$$("#nav button").forEach((b) => {
  b.onclick = () => {
    $$("#nav button").forEach((x) => x.classList.toggle("on", x === b));
    $$(".tab").forEach((t) => t.classList.toggle("on", t.id === `tab-${b.dataset.tab}`));
  };
});

function rows(table, html) {
  table.querySelector("tbody").innerHTML = html;
}

function render() {
  if (!state) return;
  const srv = state.servers.find((s) => s.id === state.ed2k.serverId);
  $("#head-status").innerHTML = `
    <span>ED2K ${state.ed2k.connected ? state.ed2k.id : "off"} ${srv ? "· " + srv.name : ""}</span>
    <span>Kad ${state.kad.connected ? "on" : "off"}</span>
    <span>${state.nickname}</span>`;
  $("#foot").innerHTML = `<span>▼ ${fmt(state.currentDown || 0)}/s</span><span>▲ ${fmt(state.currentUp || 0)}/s</span><span>Webinterface · port ${state.settings.webPort}</span>`;

  rows(
    $("#p-down"),
    state.downloads
      .map(
        (d) => `<tr>
        <td><input type="radio" name="dl" ${sel.down === d.id ? "checked" : ""} onchange="sel.down='${d.id}'"></td>
        <td>${d.name}</td>
        <td><span class="bar"><i style="width:${d.percent}%"></i></span> ${d.percent}%</td>
        <td>${d.speedLabel || "—"}</td>
        <td>${d.sourcesXfer}/${d.sources}</td>
        <td>${d.status}</td></tr>`
      )
      .join("")
  );
  rows(
    $("#p-up"),
    state.uploads.map((u) => `<tr><td>${u.user}</td><td>${u.file}</td><td>${fmt(u.speed)}/s</td></tr>`).join("")
  );
  rows(
    $("#p-shared"),
    state.shared.map((s) => `<tr><td>${s.name}</td><td>${s.sizeLabel}</td><td>${s.prio || "Normal"}</td></tr>`).join("")
  );
  rows(
    $("#p-search"),
    state.search.results
      .map(
        (r) => `<tr>
        <td><input type="radio" name="sr" ${sel.search === r.hash ? "checked" : ""} onchange="sel.search='${r.hash}'"></td>
        <td>${r.name}</td><td>${r.sizeLabel}</td><td>${r.sources}</td></tr>`
      )
      .join("")
  );
  rows(
    $("#p-servers"),
    state.servers
      .map(
        (s) => `<tr>
        <td><input type="radio" name="sv" ${sel.server === s.id ? "checked" : ""} onchange="sel.server='${s.id}'"></td>
        <td>${s.premium ? "★ " : ""}${s.name}</td>
        <td>${s.ip}:${s.port}</td>
        <td>${s.users.toLocaleString()}</td>
        <td>${s.files.toLocaleString()}</td></tr>`
      )
      .join("")
  );
  $("#kad-pre").textContent = JSON.stringify(state.kad, null, 2);
  $("#logs-pre").textContent = state.logs.join("\n");
  $("#stats-pre").textContent = `Down session ${fmt(state.stats.sessionDown)}\nUp session ${fmt(state.stats.sessionUp)}`;
  if (!document.activeElement || !document.activeElement.closest("#tab-prefs")) {
    $("#pnick").value = state.settings.nickname;
    $("#pup").value = state.settings.maxUp;
    $("#pdown").value = state.settings.maxDown;
    $("#pport").value = state.settings.port;
  }
  draw();
}

function draw() {
  const c = $("#cvs");
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#12141b";
  ctx.fillRect(0, 0, c.width, c.height);
  const down = state.stats.historyDown;
  const max = Math.max(1, ...down, ...state.stats.historyUp);
  const plot = (arr, color) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    arr.forEach((v, i) => {
      const x = (i / (arr.length - 1)) * c.width;
      const y = c.height - (v / max) * (c.height - 10) - 4;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  plot(down, "#e09a3d");
  plot(state.stats.historyUp, "#4caf7a");
}

async function refresh() {
  if (!token) return;
  state = await api("/api/state");
  render();
}

function cmd(path, body) {
  return api(path, { method: "POST", body }).then((s) => {
    if (s && s.downloads) {
      state = s;
      render();
    }
  });
}

$$("button[data-dl]").forEach((b) => {
  b.onclick = () => sel.down && cmd(`/api/downloads/${sel.down}/${b.dataset.dl}`);
});
$("#ed2k-add").onclick = () => cmd("/api/ed2k", { link: $("#ed2k").value });
$("#reload-shared").onclick = () => cmd("/api/shared/reload");
$("#q-go").onclick = () => cmd("/api/search", { term: $("#q").value, network: $("#q-net").value });
$("#q-dl").onclick = () => sel.search && cmd("/api/search/download", { hash: sel.search });
$("#sadd").onclick = () => cmd("/api/servers", { ip: $("#sip").value, port: $("#sport").value, name: $("#sname").value });
$("#sconn").onclick = () => sel.server && cmd(`/api/servers/${sel.server}/connect`);
$("#sdel").onclick = () => sel.server && cmd(`/api/servers/${sel.server}/remove`);
$("#kad-on").onclick = () => cmd("/api/kad/start");
$("#kad-off").onclick = () => cmd("/api/kad/stop");
$("#log-reset").onclick = () => api("/api/logs?reset=1").then(refresh);
$("#psave").onclick = () =>
  api("/api/settings", {
    method: "PUT",
    body: {
      nickname: $("#pnick").value,
      maxUp: Number($("#pup").value),
      maxDown: Number($("#pdown").value),
      port: Number($("#pport").value),
    },
  }).then((s) => {
    state = s;
    render();
  });

if (token) {
  showApp(true);
  refresh();
}
setInterval(refresh, 1000);
