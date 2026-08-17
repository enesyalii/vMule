const crypto = require("crypto");
const config = require("../config");

const COOKIE_NAME = "vmule_session";
const fallbackSecret = crypto.randomBytes(32).toString("hex");
const signingSecret = config.AUTH_SECRET || fallbackSecret;
const signingKey = crypto
  .createHash("sha256")
  .update(`vmule-session:${signingSecret}`)
  .digest();

if (!config.AUTH_SECRET) {
  console.warn(
    "AUTH_SECRET is not set; sessions will be invalidated when this process restarts"
  );
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", signingKey).update(value).digest("base64url");
}

function createSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      iat: now,
      exp: now + config.AUTH_SESSION_HOURS * 60 * 60,
      nonce: crypto.randomBytes(8).toString("hex"),
    })
  );
  return `${payload}.${sign(payload)}`;
}

function verifySession(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.sub || !claims.exp || claims.exp <= Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const cookies = {};
  for (const pair of String(header || "").split(";")) {
    const index = pair.indexOf("=");
    if (index < 1) continue;
    const key = pair.slice(0, index).trim();
    try {
      cookies[key] = decodeURIComponent(pair.slice(index + 1).trim());
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies;
}

function cookieOptions(maxAge) {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    config.AUTH_COOKIE_SECURE ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function setSessionCookie(res, user) {
  const maxAge = config.AUTH_SESSION_HOURS * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    cookieOptions(maxAge).replace(
      `${COOKIE_NAME}=`,
      `${COOKIE_NAME}=${encodeURIComponent(createSession(user))}`
    )
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", cookieOptions(0));
}

function createAuthMiddleware(accounts) {
  return async function authContext(req, _res, next) {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      const claims = verifySession(token);
      req.user = claims ? await accounts.getById(claims.sub) : null;
      if (req.user?.status !== "active") req.user = null;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required" });
  }
  next();
}

module.exports = {
  createAuthMiddleware,
  requireUser,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  createSession,
  verifySession,
};
