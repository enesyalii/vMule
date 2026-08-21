const API = "/api/apk-studio";

const state = {
  sessionId: null,
  filename: null,
  selectedPath: null,
  currentEntry: null,
  activeView: "parsed",
  dirty: false,
};

const $ = (sel) => document.querySelector(sel);

function setStatus(msg) {
  $("#status-left").textContent = msg;
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.blob();
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function iconFor(node) {
  if (node.type === "dir") return "📁";
  const n = node.name.toLowerCase();
  if (n === "androidmanifest.xml") return "📋";
  if (n.endsWith(".dex")) return "☕";
  if (n.endsWith(".png") || n.endsWith(".jpg")) return "🖼";
  if (n.endsWith(".xml")) return "📄";
  if (n.endsWith(".so")) return "⚙";
  return "📄";
}

function renderTree(nodes, filter = "") {
  const root = $("#tree-root");
  root.innerHTML = "";
  if (!nodes?.length) {
    root.innerHTML = '<p class="placeholder">No entries.</p>';
    return;
  }

  const q = filter.trim().toLowerCase();

  function matches(node) {
    if (!q) return true;
    if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(matches);
    return false;
  }

  function buildNode(node, depth = 0) {
    if (!matches(node)) return null;
    const wrap = document.createElement("div");
    wrap.className = "tree-node";

    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.path = node.path;
    row.style.paddingLeft = `${6 + depth * 2}px`;
    if (state.selectedPath === node.path) row.classList.add("selected");

    const hasChildren = node.children?.length;
    const toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = hasChildren ? "▾" : "";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = iconFor(node);

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.name;

    row.append(toggle, icon, name);
    if (node.type === "file" && node.size != null) {
      const size = document.createElement("span");
      size.className = "tree-size";
      size.textContent = formatBytes(node.size);
      row.append(size);
    }

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (hasChildren && e.target === toggle) {
        childWrap.classList.toggle("collapsed");
        toggle.textContent = childWrap.classList.contains("collapsed") ? "▸" : "▾";
        return;
      }
      selectNode(node);
    });

    wrap.append(row);

    let childWrap = null;
    if (hasChildren) {
      childWrap = document.createElement("div");
      childWrap.className = "tree-children";
      for (const child of node.children) {
        const el = buildNode(child, depth + 1);
        if (el) childWrap.append(el);
      }
      wrap.append(childWrap);
    }
    return wrap;
  }

  for (const node of nodes) {
    const el = buildNode(node);
    if (el) root.append(el);
  }
}

function updateInfoBar(info) {
  const bar = $("#info-bar");
  bar.hidden = false;
  $("#info-package").textContent = info.manifest?.package ? `Package: ${info.manifest.package}` : "";
  $("#info-version").textContent = info.manifest?.versionName
    ? `Version: ${info.manifest.versionName} (${info.manifest.versionCode || "?"})`
    : "";
  $("#info-size").textContent = `Size: ${formatBytes(info.size)}`;
  $("#info-entries").textContent = `${info.entryCount} entries`;
  $("#info-dirty").hidden = !info.dirty;
}

function setToolbarEnabled(open) {
  $("#btn-save").disabled = !open;
  $("#btn-extract").disabled = !open;
  $("#btn-save-entry").disabled = !open;
}

async function loadSession(info) {
  state.sessionId = info.id;
  state.filename = info.filename;
  state.dirty = info.dirty;
  renderTree(info.tree);
  updateInfoBar(info);
  setToolbarEnabled(true);
  setStatus(`Opened ${info.filename}`);
}

async function openApkFile(file) {
  const fd = new FormData();
  fd.append("apk", file);
  setStatus("Loading APK…");
  const info = await api("/open", { method: "POST", body: fd });
  await loadSession(info);
}

async function createApk(data) {
  setStatus("Creating APK…");
  const info = await api("/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await loadSession(info);
}

async function selectNode(node) {
  if (node.type === "dir") {
    state.selectedPath = node.path;
    document.querySelectorAll(".tree-row").forEach((r) => {
      r.classList.toggle("selected", r.dataset.path === node.path);
    });
    return;
  }

  state.selectedPath = node.path;
  document.querySelectorAll(".tree-row").forEach((r) => {
    r.classList.toggle("selected", r.dataset.path === node.path);
  });

  setStatus(`Loading ${node.path}…`);
  const entry = await api(`/session/${state.sessionId}/entry?path=${encodeURIComponent(node.path)}`);
  state.currentEntry = entry;
  $("#viewer-path").textContent = node.path;
  renderEntry(entry);
  setStatus(`${node.path} — ${formatBytes(entry.size)}`);
}

function renderHexLines(hex, offset = 0) {
  const bytes = hex.match(/.{1,2}/g) || [];
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const addr = (offset + i).toString(16).padStart(8, "0");
    const hexPart = chunk.join(" ").padEnd(16 * 3 - 1, " ");
    const ascii = chunk.map((b) => {
      const c = parseInt(b, 16);
      return c >= 32 && c < 127 ? String.fromCharCode(c) : ".";
    }).join("");
    lines.push(`${addr}  ${hexPart}  ${ascii}`);
  }
  return lines.join("\n");
}

function renderEntry(entry) {
  const parsed = $("#view-parsed pre");
  const text = $("#text-editor");
  const hex = $("#hex-view");
  const meta = $("#meta-view");
  const img = $("#image-preview");

  parsed.textContent = entry.parsed || entry.text || "(binary content — use Hex view)";
  text.value = entry.text || entry.parsed || "";
  hex.textContent = renderHexLines(entry.hexPreview || "");

  meta.innerHTML = "";
  img.hidden = true;
  const rows = [
    ["Path", entry.path],
    ["Size", formatBytes(entry.size)],
    ["Mode", entry.mode],
  ];
  if (entry.dex?.valid) {
    rows.push(["DEX version", entry.dex.version]);
    rows.push(["Classes", String(entry.dex.classDefs)]);
    rows.push(["Methods", String(entry.dex.methodIds)]);
  }
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    meta.append(dt, dd);
  }

  if (entry.mode === "image" && entry.base64) {
    img.hidden = false;
    img.src = `data:${entry.mime};base64,${entry.base64}`;
  }

  if (entry.mode === "axml" || entry.mode === "text") {
    setActiveView(entry.mode === "axml" ? "parsed" : "text");
  } else if (entry.mode === "image") {
    setActiveView("info");
  } else {
    setActiveView("hex");
  }
}

function setActiveView(view) {
  state.activeView = view;
  document.querySelectorAll(".view-tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  document.querySelectorAll(".view-pane").forEach((p) => {
    p.classList.toggle("active", p.id === `view-${view}`);
  });

  if (view === "hex" && state.currentEntry && state.sessionId) {
    loadFullHex();
  }
}

async function loadFullHex() {
  const entry = state.currentEntry;
  if (!entry) return;
  const data = await api(
    `/session/${state.sessionId}/hex?path=${encodeURIComponent(entry.path)}&offset=0&length=65536`
  );
  $("#hex-view").textContent = renderHexLines(data.hex, data.offset);
}

async function exportApk() {
  if (!state.sessionId) return;
  setStatus("Exporting APK…");
  const blob = await api(`/session/${state.sessionId}/export`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.filename?.replace(/\.apk$/i, "") + "-edited.apk";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("APK exported");
}

async function extractEntry() {
  if (!state.sessionId || !state.selectedPath) return;
  const blob = await api(
    `/session/${state.sessionId}/download-entry?path=${encodeURIComponent(state.selectedPath)}`
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.selectedPath.split("/").pop();
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Extracted ${state.selectedPath}`);
}

async function saveEntry() {
  if (!state.sessionId || !state.currentEntry) return;
  const content = $("#text-editor").value;
  setStatus("Saving entry…");
  await api(`/session/${state.sessionId}/entry`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: state.currentEntry.path, content }),
  });
  const info = await api(`/session/${state.sessionId}`);
  state.dirty = info.dirty;
  $("#info-dirty").hidden = !info.dirty;
  setStatus(`Saved ${state.currentEntry.path}`);
  await selectNode({ type: "file", path: state.currentEntry.path, name: state.currentEntry.path.split("/").pop() });
}

function bindEvents() {
  $("#btn-open").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) openApkFile(file).catch((err) => setStatus(`Error: ${err.message}`));
    e.target.value = "";
  });

  $("#btn-new").addEventListener("click", () => $("#new-dialog").showModal());
  $("#new-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    createApk(Object.fromEntries(fd.entries()))
      .then(() => $("#new-dialog").close())
      .catch((err) => setStatus(`Error: ${err.message}`));
  });
  $("#new-form").querySelector('[value="cancel"]').addEventListener("click", () => {
    $("#new-dialog").close();
  });

  $("#btn-save").addEventListener("click", () => exportApk().catch((err) => setStatus(`Error: ${err.message}`)));
  $("#btn-extract").addEventListener("click", () => extractEntry().catch((err) => setStatus(`Error: ${err.message}`)));
  $("#btn-save-entry").addEventListener("click", () => saveEntry().catch((err) => setStatus(`Error: ${err.message}`)));

  document.querySelectorAll(".view-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });

  $("#tree-filter").addEventListener("input", (e) => {
    if (!state.sessionId) return;
    api(`/session/${state.sessionId}`).then((info) => renderTree(info.tree, e.target.value));
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "o") { e.preventDefault(); $("#file-input").click(); }
    if (e.ctrlKey && e.key === "s") { e.preventDefault(); exportApk().catch(() => {}); }
  });
}

bindEvents();
