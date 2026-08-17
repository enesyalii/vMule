const net = require("net");
const { OP } = require("./packets");

/**
 * VMLF TCP server — newline-delimited JSON commands for native clients / tooling.
 * Example: echo '{"op":"ping"}' | nc localhost 4662
 */
function createVmlfTcpServer(engine, port) {
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buf = "";

    const send = (obj) => socket.write(`${JSON.stringify(obj)}\n`);

    socket.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          handleMessage(engine, msg, send);
        } catch (err) {
          send({ ok: false, error: "invalid json", detail: err.message });
        }
      }
    });
  });

  server.listen(port, () => {
    console.log(`VMLF TCP      tcp://0.0.0.0:${port} (JSON line protocol)`);
  });

  return server;
}

function handleMessage(engine, msg, send) {
  const op = msg.op;
  if (op === OP.PING) {
    return send({ ok: true, op: "pong", ts: Date.now() });
  }
  if (op === OP.STATUS) {
    return send({ ok: true, state: engine.snapshot() });
  }
  if (op === OP.CONNECT) {
    const st = engine.connect();
    return send({ ok: true, state: st });
  }
  if (op === OP.DISCONNECT) {
    const st = engine.disconnect();
    return send({ ok: true, state: st });
  }
  if (op === OP.SEARCH) {
    const st = engine.search({ term: msg.term, type: msg.type, network: msg.network });
    return send({ ok: true, state: st, count: st.search.results.length });
  }
  if (op === OP.DOWNLOAD) {
    const st = engine.searchDownload(msg.hash);
    if (!st) return send({ ok: false, error: "not found" });
    return send({ ok: true, state: st });
  }
  if (op === OP.KAD_START) {
    return send({ ok: true, state: engine.kadStart() });
  }
  if (op === OP.KAD_STOP) {
    return send({ ok: true, state: engine.kadStop() });
  }
  send({ ok: false, error: "unknown op", ops: Object.values(OP) });
}

module.exports = { createVmlfTcpServer };
