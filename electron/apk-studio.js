const path = require("path");
const fs = require("fs");
const http = require("http");
const { app, BrowserWindow, Menu, shell } = require("electron");

const PORT = process.env.PORT || "4243";
process.env.PORT = PORT;

const appRoot = app.isPackaged ? app.getAppPath() : path.join(__dirname, "..");

function waitForServer() {
  return new Promise((resolve) => {
    const started = Date.now();
    const ping = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/apk-studio/health`, () => resolve());
      req.on("error", () => {
        if (Date.now() - started > 20000) resolve();
        else setTimeout(ping, 250);
      });
    };
    ping();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#1a1d23",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    title: "APK Studio",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/apk-studio/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  process.chdir(appRoot);
  const { startServer } = require("../server");
  startServer();
  Menu.setApplicationMenu(null);
  await waitForServer();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
