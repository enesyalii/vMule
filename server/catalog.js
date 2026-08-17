const store = require("./store");

const DEFAULT_SERVERS = [
  { id: "s1", name: "vMule Razorback", desc: "Official public VMLF server", ip: "176.12.44.18", port: 4661, users: 182440, maxUsers: 400000, files: 91200331, ping: 42, static: true, premium: false },
  { id: "s2", name: "DonkeyServer No1", desc: "Long-running VMLF", ip: "91.204.44.112", port: 4242, users: 64012, maxUsers: 120000, files: 22044190, ping: 88, static: true, premium: false },
  { id: "s3", name: "Peerates.net", desc: "EU cluster", ip: "193.111.22.9", port: 4661, users: 22190, maxUsers: 80000, files: 8402211, ping: 61, static: false, premium: false },
  { id: "s4", name: "vMule Kad Gate", desc: "Kad bootstrap helper", ip: "45.9.88.14", port: 4662, users: 9802, maxUsers: 20000, files: 1200441, ping: 27, static: true, premium: false },
];

function getCatalog() {
  return store.readJson("catalog.json", []);
}

function getDefaultServers() {
  return store.readJson("servers.json", DEFAULT_SERVERS);
}

module.exports = { getCatalog, getDefaultServers, DEFAULT_SERVERS };
