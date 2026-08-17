const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT || 4242);
const BASE_URL =
  process.env.BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${PORT}`);

module.exports = {
  PORT,
  BASE_URL,
  PANEL_PASSWORD: process.env.PANEL_PASSWORD || "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  INSTALLER_URL:
    process.env.INSTALLER_URL ||
    "https://github.com/enesyalii/vMule/releases/latest/download/vMule-Setup-0.50.0.exe",
  VMLF_TCP_PORT: Number(process.env.VMLF_TCP_PORT || 4662),
  VMLF_TCP_ENABLED: process.env.VMLF_TCP_ENABLED !== "0",
  publicDir: path.join(__dirname, "..", "public"),
};
