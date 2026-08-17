const $ = (selector) => document.querySelector(selector);
let status = null;

async function request(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { ...(options.headers || {}) },
  };
  if (options.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function message(selector, text, error = false) {
  const element = $(selector);
  element.textContent = text;
  element.classList.toggle("error", error);
}

function safeNext() {
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "";
}

function render() {
  $("#loading").hidden = true;
  $("#signed-out").hidden = status.authenticated;
  $("#signed-in").hidden = !status.authenticated;
  $("#persistence-warning").hidden = status.persistent;

  if (!status.authenticated) {
    $("#register-form").hidden = !status.registrationEnabled;
    $("#setup-note").hidden = !status.setupRequired;
    $("#register-title").textContent = status.setupRequired
      ? "Create administrator"
      : "Create account";
    return;
  }

  const user = status.user;
  $("#account-name").textContent = user.username;
  $("#account-role").textContent = user.role;
  $("#account-id").textContent = user.id;
  $("#account-storage").textContent = status.storage;
  $("#admin-link").hidden = user.role !== "admin";
  $("#profile-form").email.value = user.email || "";
  if (user.source === "environment") {
    $("#profile-form").hidden = true;
    $("#password-form").hidden = true;
  }
}

async function load() {
  try {
    status = await request("/api/auth/status");
    render();
    const next = safeNext();
    if (status.authenticated && next) location.replace(next);
  } catch (err) {
    $("#loading").textContent = err.message;
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    await request("/api/auth/login", {
      method: "POST",
      body: formObject(event.currentTarget),
    });
    location.replace(safeNext() || "/account/");
  } catch (err) {
    message("#login-message", err.message, true);
    button.disabled = false;
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const result = await request("/api/auth/register", {
      method: "POST",
      body: formObject(event.currentTarget),
    });
    if (result.firstAdmin) {
      message("#register-message", "Administrator created. Opening server panel…");
      location.replace("/server-admin/");
    } else {
      location.replace(safeNext() || "/account/");
    }
  } catch (err) {
    message("#register-message", err.message, true);
    button.disabled = false;
  }
});

$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await request("/api/auth/profile", {
      method: "PUT",
      body: formObject(event.currentTarget),
    });
    status.user = result.user;
    message("#profile-message", "Profile saved");
    render();
  } catch (err) {
    message("#profile-message", err.message, true);
  }
});

$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/auth/password", {
      method: "PUT",
      body: formObject(event.currentTarget),
    });
    message("#password-message", "Password changed. Sign in again.");
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    message("#password-message", err.message, true);
  }
});

$("#logout").addEventListener("click", async () => {
  await request("/api/auth/logout", { method: "POST" });
  location.replace("/account/");
});

load();
