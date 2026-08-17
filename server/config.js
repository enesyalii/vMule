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

const polarProductIds = {
  starter: process.env.POLAR_PRODUCT_STARTER || "",
  pro: process.env.POLAR_PRODUCT_PRO || "",
};

module.exports = {
  PORT,
  BASE_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN || "",
  POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET || "",
  POLAR_SANDBOX: process.env.POLAR_SANDBOX === "1" || process.env.POLAR_SANDBOX === "true",
  POLAR_PRODUCT_IDS: polarProductIds,
  INSTALLER_URL:
    process.env.INSTALLER_URL ||
    "https://github.com/enesyalii/vMule/releases/latest/download/vMule-Setup-0.51.0.exe",
  VMLF_TCP_PORT: Number(process.env.VMLF_TCP_PORT || 4662),
  VMLF_TCP_ENABLED: process.env.VMLF_TCP_ENABLED !== "0" && !process.env.VERCEL,
  publicDir: path.join(__dirname, "..", "public"),
  isServerless: Boolean(process.env.VERCEL),
};
