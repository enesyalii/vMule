const { createApp, startServer } = require("./app");

const boot = require.main === module ? startServer() : createApp();

module.exports = { app: boot.app, startServer };
