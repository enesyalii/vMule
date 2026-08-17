/** vMule File Link — VMLF URI format (vmlf://|file|name|size|hash|/) */

const VMLF_RE = /^vmlf:\/\/\|file\|([^|]+)\|(\d+)\|([0-9A-Fa-f]+)\|/i;
const LEGACY_ED2K_RE = /^ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([0-9A-Fa-f]+)\|/i;

function parseLink(link) {
  const raw = String(link || "").trim();
  let match = raw.match(VMLF_RE);
  if (!match) match = raw.match(LEGACY_ED2K_RE);
  if (!match) return null;
  return {
    name: decodeURIComponent(match[1]),
    size: Number(match[2]),
    hash: match[3].toUpperCase(),
    link: formatLink(match[1], Number(match[2]), match[3].toUpperCase()),
  };
}

function formatLink(name, size, hash) {
  return `vmlf://|file|${name}|${size}|${hash}|/`;
}

function migrateFileLink(item) {
  if (!item) return item;
  if (item.vmlf) return item;
  if (item.ed2k) {
    const parsed = parseLink(item.ed2k);
    if (parsed) {
      item.vmlf = parsed.link;
      item.hash = item.hash || parsed.hash;
    } else {
      item.vmlf = item.ed2k.replace(/^ed2k:/i, "vmlf:");
    }
    delete item.ed2k;
  }
  return item;
}

function migrateState(st) {
  if (st.ed2k && !st.vmlf) {
    st.vmlf = st.ed2k;
    delete st.ed2k;
  }
  if (!st.vmlf) {
    st.vmlf = { connected: false, id: "Disconnected", clientId: 0, serverId: null };
  }
  st.downloads = (st.downloads || []).map(migrateFileLink);
  st.shared = (st.shared || []).map(migrateFileLink);
  if (st.search && st.search.results) {
    st.search.results = st.search.results.map(migrateFileLink);
  }
  return st;
}

module.exports = { parseLink, formatLink, migrateFileLink, migrateState, VMLF_RE };
