const { stamp } = require("../state");

function resolveClientId(state) {
  if (!state.vmlf.clientId) {
    state.vmlf.clientId = 100_000_000 + Math.floor(Math.random() * 899_999_999);
  }
  return state.vmlf.clientId;
}

/** High ID when TCP port matches standard VMLF port and obfuscation is on. */
function resolveIdLabel(state) {
  const port = state.settings.port || 4662;
  if (port === 4662 && state.settings.obfuscation) return "High ID";
  if (port === 4662) return "High ID";
  return "Low ID";
}

function connect(state, serverId) {
  state.connected = true;
  state.vmlf.connected = true;
  state.vmlf.id = resolveIdLabel(state);
  resolveClientId(state);
  if (serverId) state.vmlf.serverId = serverId;
  if (!state.vmlf.serverId && state.servers[0]) state.vmlf.serverId = state.servers[0].id;
  const srv = state.servers.find((s) => s.id === state.vmlf.serverId);
  state.logs.unshift(
    `[${stamp()}] VMLF handshake OK — ${state.vmlf.id} (client ${state.vmlf.clientId})` +
      (srv ? ` @ ${srv.name}` : "")
  );
}

function disconnect(state) {
  state.connected = false;
  state.vmlf.connected = false;
  state.vmlf.id = "Disconnected";
  state.logs.unshift(`[${stamp()}] Disconnected from VMLF`);
}

function connectServer(state, serverId) {
  const srv = state.servers.find((s) => s.id === serverId);
  if (!srv) return null;
  connect(state, serverId);
  state.logs.unshift(`[${stamp()}] Connected to ${srv.name} (${srv.ip}:${srv.port})`);
  return srv;
}

function pulse(state) {
  if (!state.connected || !state.vmlf.connected) return;
  const srv = state.servers.find((s) => s.id === state.vmlf.serverId);
  if (srv) {
    srv.users += Math.floor(Math.random() * 21) - 10;
    srv.users = Math.max(100, srv.users);
    srv.files += Math.floor(Math.random() * 200) - 80;
    srv.ping = Math.max(8, srv.ping + Math.floor(Math.random() * 11) - 5);
  }
}

module.exports = { connect, disconnect, connectServer, pulse, resolveIdLabel };
