const { stamp } = require("../state");

function start(state) {
  state.kad.connected = true;
  state.kad.firewalled = false;
  state.logs.unshift(`[${stamp()}] Kad bootstrap from nodes.dat`);
}

function stop(state) {
  state.kad.connected = false;
  state.logs.unshift(`[${stamp()}] Kad stopped`);
}

function pulse(state) {
  if (!state.kad.connected) return;
  state.kad.users += Math.floor(Math.random() * 200) - 90;
  state.kad.files += Math.floor(Math.random() * 400) - 150;
  state.kad.users = Math.max(1_000_000, state.kad.users);
  state.kad.files = Math.max(1_000_000, state.kad.files);
}

module.exports = { start, stop, pulse };
