/** VMLF wire protocol opcodes (TCP JSON line protocol). */
const OP = {
  PING: "ping",
  STATUS: "status",
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  SEARCH: "search",
  DOWNLOAD: "download",
  KAD_START: "kad_start",
  KAD_STOP: "kad_stop",
};

const MAGIC = "VMLF";

module.exports = { OP, MAGIC };
