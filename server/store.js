const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VMULE_DATA_DIR || path.join(__dirname, "..", "data");

function readJson(file, fallback) {
  const full = path.join(DATA_DIR, file);
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const full = path.join(DATA_DIR, file);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${full}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, full);
  } catch {
    // read-only hosts (e.g. Vercel) keep state in memory only
  }
}

module.exports = { DATA_DIR, readJson, writeJson };
