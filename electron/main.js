const path = require("path");
const fs = require("fs");
const http = require("http");
const { app, BrowserWindow, Menu, shell } = require("electron");

const PORT = process.env.PORT || "4242";
process.env.PORT = PORT;

const appRoot = app.isPackaged ? app.getAppPath() : path.join(__dirname, "..");

function seedDataDir() {
  const dest = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dest, { recursive: true });
  const seed = path.join(appRoot, "data", "updates.json");
  const target = path.join(dest, "updates.json");
  if (!fs.existsSync(target) && fs.existsSync(seed)) {
    fs.copyFileSync(seed, target);
  }
  process.env.VMULE_DATA_DIR = dest;
}

function waitForServer() {
  return new Promise((resolve) => {
    const started = Date.now();
    const ping = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, () => resolve());
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
    width: 1120,
    height: 740,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: "#3d4a73",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/client/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  seedDataDir();
  process.env.BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
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
