const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let overview = null;
let users = [];
let refreshing = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtBytes(value, perSecond = false) {
  let number = Number(value || 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (number >= 1024 && unit < units.length - 1) {
    number /= 1024;
    unit += 1;
  }
  return `${number.toFixed(number >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}${perSecond ? "/s" : ""}`;
}

async function request(path, options = {}) {
  const init = { method: options.method || "GET", headers: {} };
  if (options.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.replace(`/account/?next=${encodeURIComponent("/server-admin/")}`);
    throw new Error("Sign in required");
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function showError(error) {
  const banner = $("#error-banner");
  banner.textContent = error?.message || String(error);
  banner.hidden = false;
}

function clearError() {
  $("#error-banner").hidden = true;
}

function metric(label, value, className = "") {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong class="${className}">${escapeHtml(value)}</strong></div>`;
}

function detail(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function renderOverview() {
  const network = overview.network;
  const processInfo = overview.process;
  $("#updated-at").textContent = `Updated ${new Date(overview.generatedAt).toLocaleTimeString()}`;
  $("#storage-banner").hidden = overview.storage.persistent;

  $("#metrics").innerHTML = [
    metric("VMLF", network.connected ? "Connected" : "Offline", network.connected ? "on" : "off"),
    metric("Kad", network.kadConnected ? "Connected" : "Offline", network.kadConnected ? "on" : "off"),
    metric("Download", fmtBytes(network.downloadSpeed, true)),
    metric("Upload", fmtBytes(network.uploadSpeed, true)),
    metric("Active transfers", overview.counts.activeDownloads),
    metric("Accounts", overview.counts.accounts),
  ].join("");

  $("#network-details").innerHTML = [
    detail("VMLF state", network.connectionId),
    detail("Kad firewall", network.kadFirewalled ? "Firewalled" : "Open"),
    detail("Kad users", Number(network.users || 0).toLocaleString()),
    detail("Kad files", Number(network.files || 0).toLocaleString()),
    detail("Known servers", overview.counts.servers),
    detail("Shared files", overview.counts.shared),
  ].join("");

  $("#runtime-details").innerHTML = [
    detail("Node", processInfo.node),
    detail("Uptime", `${processInfo.uptimeSeconds}s`),
    detail("Memory", `${processInfo.memoryMb} MB`),
    detail("Runtime", processInfo.serverless ? "Vercel serverless" : "Persistent process"),
    detail("Account store", overview.storage.accounts),
    detail("Runtime store", overview.storage.runtime),
    detail("Payments", `Stripe ${overview.payments.stripe ? "on" : "off"} · Polar ${overview.payments.polar ? "on" : "off"}`),
  ].join("");
}

function renderDownloads() {
  $("#download-count").textContent = `${overview.downloads.length} total`;
  $("#download-rows").innerHTML =
    overview.downloads
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.name)}<div class="sub">${escapeHtml(item.sizeLabel || "")}</div></td>
          <td>${escapeHtml(item.percent ?? Math.round((item.progress || 0) * 100))}%</td>
          <td>${escapeHtml(item.speedLabel || fmtBytes(item.speed, true))}</td>
          <td>${escapeHtml(item.status)}</td>
          <td class="actions">
            <button class="small" data-download="${escapeHtml(item.id)}" data-command="${item.status === "paused" ? "resume" : "pause"}">${item.status === "paused" ? "Resume" : "Pause"}</button>
            <button class="small danger" data-download="${escapeHtml(item.id)}" data-command="cancel">Cancel</button>
          </td>
        </tr>`
      )
      .join("") || "<tr><td colspan='5' class='muted'>No downloads</td></tr>";
}

function renderServers() {
  $("#server-rows").innerHTML =
    overview.servers
      .map(
        (server) => `<tr>
          <td>${server.premium ? "★ " : ""}${escapeHtml(server.name)}<div class="sub">${escapeHtml(server.desc || "")}</div></td>
          <td>${escapeHtml(server.ip)}:${escapeHtml(server.port)}</td>
          <td>${Number(server.users || 0).toLocaleString()} / ${Number(server.maxUsers || 0).toLocaleString()}</td>
          <td class="actions">
            <button class="small" data-server="${escapeHtml(server.id)}" data-server-command="connect">Connect</button>
            <button class="small danger" data-server="${escapeHtml(server.id)}" data-server-command="delete">Remove</button>
          </td>
        </tr>`
      )
      .join("") || "<tr><td colspan='4' class='muted'>No servers</td></tr>";
}

function renderUsers() {
  $("#user-count").textContent = `${users.length} total`;
  $("#user-rows").innerHTML =
    users
      .map((user) => {
        const environment = user.source === "environment";
        return `<tr data-user-row="${escapeHtml(user.id)}">
          <td>${escapeHtml(user.username)}<div class="sub">${environment ? "environment" : escapeHtml(user.id)}</div></td>
          <td>${escapeHtml(user.email || "—")}</td>
          <td>
            <select data-user-role ${environment ? "disabled" : ""}>
              <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
            </select>
          </td>
          <td>
            <select data-user-status ${environment ? "disabled" : ""}>
              <option value="active" ${user.status === "active" ? "selected" : ""}>Active</option>
              <option value="disabled" ${user.status === "disabled" ? "selected" : ""}>Disabled</option>
            </select>
          </td>
          <td class="actions">
            ${environment ? "<span class='sub'>env managed</span>" : `<button class="small" data-user-save="${escapeHtml(user.id)}">Save</button> <button class="small danger" data-user-delete="${escapeHtml(user.id)}">Delete</button>`}
          </td>
        </tr>`;
      })
      .join("") || "<tr><td colspan='5' class='muted'>No accounts</td></tr>";
}

function renderSettings() {
  if (document.activeElement?.closest("#settings-form")) return;
  const form = $("#settings-form");
  for (const key of ["nickname", "maxDown", "maxUp", "port", "udpPort", "maxConnections", "skin"]) {
    form.elements[key].value = overview.settings[key] ?? "";
  }
  form.elements.obfuscation.checked = Boolean(overview.settings.obfuscation);
}

function renderLogs() {
  $("#logs").textContent = overview.logs.join("\n");
}

function render() {
  renderOverview();
  renderDownloads();
  renderServers();
  renderUsers();
  renderSettings();
  renderLogs();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  clearError();
  try {
    [overview, { users }] = await Promise.all([
      request("/api/admin/overview"),
      request("/api/admin/users"),
    ]);
    render();
  } catch (err) {
    showError(err);
  } finally {
    refreshing = false;
  }
}

async function action(path, options = {}) {
  try {
    await request(path, options);
    await refresh();
  } catch (err) {
    showError(err);
  }
}

$$(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
    $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${button.dataset.tab}`));
  });
});

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    action("/api/admin/action", {
      method: "POST",
      body: { action: actionButton.dataset.action },
    });
    return;
  }
  const downloadButton = event.target.closest("[data-download]");
  if (downloadButton) {
    action(
      `/api/admin/downloads/${encodeURIComponent(downloadButton.dataset.download)}/${encodeURIComponent(downloadButton.dataset.command)}`,
      { method: "POST" }
    );
    return;
  }
  const serverButton = event.target.closest("[data-server]");
  if (serverButton) {
    const id = encodeURIComponent(serverButton.dataset.server);
    action(
      serverButton.dataset.serverCommand === "delete"
        ? `/api/admin/servers/${id}`
        : `/api/admin/servers/${id}/connect`,
      { method: serverButton.dataset.serverCommand === "delete" ? "DELETE" : "POST" }
    );
    return;
  }
  const saveUser = event.target.closest("[data-user-save]");
  if (saveUser) {
    const row = saveUser.closest("tr");
    action(`/api/admin/users/${encodeURIComponent(saveUser.dataset.userSave)}`, {
      method: "PATCH",
      body: {
        role: row.querySelector("[data-user-role]").value,
        status: row.querySelector("[data-user-status]").value,
      },
    });
    return;
  }
  const deleteUser = event.target.closest("[data-user-delete]");
  if (deleteUser && confirm("Delete this account?")) {
    action(`/api/admin/users/${encodeURIComponent(deleteUser.dataset.userDelete)}`, {
      method: "DELETE",
    });
  }
});

$("#refresh").addEventListener("click", refresh);
$("#logout").addEventListener("click", async () => {
  await request("/api/auth/logout", { method: "POST" });
  location.replace("/account/");
});

$("#add-server").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    await request("/api/admin/servers", { method: "POST", body });
    form.reset();
    form.port.value = 4661;
    $("#server-message").textContent = "Server added";
    await refresh();
  } catch (err) {
    $("#server-message").textContent = err.message;
    $("#server-message").classList.add("error");
  }
});

$("#add-user").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    await request("/api/admin/users", { method: "POST", body });
    form.reset();
    $("#user-message").textContent = "Account created";
    await refresh();
  } catch (err) {
    $("#user-message").textContent = err.message;
    $("#user-message").classList.add("error");
  }
});

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
  const body = {
    ...raw,
    obfuscation: event.currentTarget.obfuscation.checked,
  };
  try {
    await request("/api/admin/settings", { method: "PUT", body });
    $("#settings-message").textContent = "Settings saved";
    await refresh();
  } catch (err) {
    $("#settings-message").textContent = err.message;
    $("#settings-message").classList.add("error");
  }
});

async function boot() {
  try {
    const status = await request("/api/auth/status");
    if (!status.authenticated) {
      location.replace(`/account/?next=${encodeURIComponent("/server-admin/")}`);
      return;
    }
    if (status.user.role !== "admin") {
      throw new Error("Administrator access required");
    }
    $("#identity").textContent = `${status.user.username} · admin`;
    await refresh();
    setInterval(() => {
      if (!document.hidden) refresh();
    }, 5000);
  } catch (err) {
    showError(err);
  }
}

boot();
