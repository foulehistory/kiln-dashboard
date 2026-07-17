// Electron main process: the only part of this app that touches
// `kilnd`'s Unix socket directly. The renderer never gets raw network
// access - it only talks to `main.js` through the IPC surface
// `preload.js` exposes, which is the standard Electron security model
// (contextIsolation + no nodeIntegration in the renderer).
"use strict";

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const https = require("https");
const http = require("http");
const path = require("path");
const os = require("os");

// kilnd's own repo (separate from this dashboard's repo - see the two
// "Kiln" repos this project is split across). Used purely to look up the
// latest release for the "kilnd has an update" check; not the same repo
// electron-updater checks (that one comes from package.json's own
// `build.publish` config).
const KILND_REPO = "foulehistory/kiln";
const WSL_DISTRO = "Ubuntu";

// `kilnd` (necessarily Linux-only - it manages namespaces/cgroups) always
// runs inside WSL2 even when this dashboard doesn't. Two ways to reach it:
//
// - TCP to 127.0.0.1:7867 (kilnd's default): works whether this Electron
//   process is running natively on Windows or inside WSL2, because WSL2
//   forwards loopback ports to the Windows host automatically. This is
//   the default for exactly that reason - it's what lets `npm start`
//   work the same way from a Windows PowerShell prompt as from a WSL
//   shell.
// - The Unix socket (`KILN_SOCKET`, or `$KILN_STORE/kilnd.sock`): only
//   reachable when this process is *also* running inside the WSL2 VM
//   (a Windows process cannot open a socket living in a different
//   kernel's filesystem). Set `KILN_SOCKET` to opt into this if you'd
//   rather not expose even a loopback-only port.
function connectOptions() {
  if (process.env.KILN_SOCKET) {
    return { socketPath: process.env.KILN_SOCKET };
  }
  if (process.env.KILN_STORE) {
    return { socketPath: path.join(process.env.KILN_STORE, "kilnd.sock") };
  }
  return { host: "127.0.0.1", port: Number(process.env.KILN_TCP_PORT) || 7867 };
}

/** One-shot request/response call to kilnd. */
function apiRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : undefined;
    const headers = data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {};
    const req = http.request({ ...connectOptions(), path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          /* not JSON (e.g. plain-text logs) - keep as string */
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", (e) => resolve({ status: 0, body: { error: String(e) } }));
    if (data) req.write(data);
    req.end();
  });
}

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, description) => {
    console.log(`[did-fail-load] ${code} ${description}`);
  });
}

// No File/Edit/View/... menu bar - this is a single-window utility app,
// not a document editor, and the default Electron/Chromium menu (with its
// dev-tools-adjacent items) has no purpose here.
Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("kiln:containers", () => apiRequest("GET", "/containers"));
ipcMain.handle("kiln:images", () => apiRequest("GET", "/images"));
ipcMain.handle("kiln:remove-image", (_e, id) => apiRequest("DELETE", `/images/${encodeURIComponent(id)}`));
ipcMain.handle("kiln:networks", () => apiRequest("GET", "/networks"));
ipcMain.handle("kiln:create-network", (_e, { name, subnet }) => apiRequest("POST", "/networks", { name, subnet: subnet || undefined }));
ipcMain.handle("kiln:remove-network", (_e, name) => apiRequest("DELETE", `/networks/${encodeURIComponent(name)}`));
ipcMain.handle("kiln:stats", (_e, id) => apiRequest("GET", `/containers/${encodeURIComponent(id)}/stats`));
ipcMain.handle("kiln:logs", (_e, id) => apiRequest("GET", `/containers/${encodeURIComponent(id)}/logs`));
ipcMain.handle("kiln:stop", (_e, id) => apiRequest("POST", `/containers/${encodeURIComponent(id)}/stop`));
ipcMain.handle("kiln:start-existing", (_e, id) => apiRequest("POST", `/containers/${encodeURIComponent(id)}/start`));
ipcMain.handle("kiln:remove", (_e, id) => apiRequest("DELETE", `/containers/${encodeURIComponent(id)}`));
ipcMain.handle("kiln:run", (_e, spec) => apiRequest("POST", "/containers", spec));

// --- exec sessions -----------------------------------------------------
// Each exec session is a raw socket (see kilnd/src/handlers/exec.rs's
// docs for why this is a plain HTTP Upgrade rather than a real
// WebSocket); we key open sessions by a small integer id and relay
// bytes to/from the renderer over ordinary IPC events.
const execSessions = new Map();
let nextSessionId = 1;

ipcMain.handle("kiln:exec-start", (event, containerId) => {
  return new Promise((resolve, reject) => {
    const req = http.request({
      ...connectOptions(),
      path: `/containers/${encodeURIComponent(containerId)}/exec`,
      method: "GET",
      headers: { Upgrade: "kiln-exec", Connection: "Upgrade" },
    });
    req.on("upgrade", (res, socket) => {
      const sessionId = nextSessionId++;
      execSessions.set(sessionId, socket);
      socket.on("data", (chunk) => {
        if (!event.sender.isDestroyed()) event.sender.send("kiln:exec-data", { sessionId, data: chunk.toString("utf8") });
      });
      socket.on("close", () => {
        execSessions.delete(sessionId);
        if (!event.sender.isDestroyed()) event.sender.send("kiln:exec-closed", { sessionId });
      });
      resolve(sessionId);
    });
    req.on("response", (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => reject(new Error(`exec failed (${res.statusCode}): ${body}`)));
    });
    req.on("error", reject);
    req.end();
  });
});

ipcMain.on("kiln:exec-write", (_e, { sessionId, data }) => {
  execSessions.get(sessionId)?.write(data);
});

ipcMain.on("kiln:exec-close", (_e, { sessionId }) => {
  const socket = execSessions.get(sessionId);
  if (socket) {
    socket.end();
    execSessions.delete(sessionId);
  }
});

// --- updates -------------------------------------------------------------
//
// Two independent things get checked and updated separately, because
// they're two independent repos with two independent release cycles (see
// this project's module docs for why it's split that way):
//
//  - The dashboard itself, via `electron-updater` against this app's own
//    GitHub releases (`package.json`'s `build.publish` config) - the
//    well-trodden path for a packaged Electron app updating itself.
//  - `kilnd`, which isn't an Electron concern at all: it's a separate
//    Linux binary running inside WSL2. There's no equivalent library for
//    "download a new build of some other program and hot-swap it", so
//    that part is hand-rolled: compare kilnd's own `/version` against the
//    latest release tag of its repo, and if applying, shell out to
//    `wsl.exe` to download + install + restart it - all the actual file
//    operations happen on the Linux side, where kilnd's install
//    directory and running process both actually live.

function githubJson(urlPath) {
  return new Promise((resolve, reject) => {
    https
      .get(
        { host: "api.github.com", path: urlPath, headers: { "User-Agent": "kiln-dashboard", Accept: "application/vnd.github+json" } },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              reject(new Error(`GitHub API ${urlPath}: HTTP ${res.statusCode}`));
              return;
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (e) {
              reject(e);
            }
          });
        },
      )
      .on("error", reject);
  });
}

function runInWsl(script) {
  return new Promise((resolve, reject) => {
    execFile("wsl.exe", ["-d", WSL_DISTRO, "-u", "root", "-e", "bash", "-c", script], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

ipcMain.handle("kiln:check-kilnd-update", async () => {
  const current = await apiRequest("GET", "/version");
  const currentVersion = current.status === 200 && current.body?.version ? current.body.version : null;

  const release = await githubJson(`/repos/${KILND_REPO}/releases/latest`);
  const latestVersion = String(release.tag_name || "").replace(/^v/, "");
  const asset = (release.assets || []).find((a) => a.name === "kiln-linux-x86_64.tar.gz");

  return {
    currentVersion,
    latestVersion: latestVersion || null,
    available: Boolean(currentVersion && latestVersion && currentVersion !== latestVersion),
    downloadUrl: asset?.browser_download_url ?? null,
  };
});

ipcMain.handle("kiln:apply-kilnd-update", async (_e, downloadUrl) => {
  const script = `
set -e
STORE="\${KILN_STORE:-$HOME/.kiln}"
mkdir -p "$STORE/bin"
curl -fsSL "${downloadUrl}" -o /tmp/kiln-release.tar.gz
tar -xzf /tmp/kiln-release.tar.gz -C "$STORE/bin" kiln kiln-compose kilnd
chmod +x "$STORE/bin/kiln" "$STORE/bin/kiln-compose" "$STORE/bin/kilnd"
pkill -f "$STORE/bin/kilnd" 2>/dev/null || true
sleep 1
nohup "$STORE/bin/kilnd" > "$STORE/kilnd.log" 2>&1 &
disown
sleep 1
echo restarted
`;
  await runInWsl(script);
  return { ok: true };
});

// electron-updater talks to the dashboard's *own* GitHub repo (configured
// in package.json). autoDownload is off so the UI drives download/install
// explicitly rather than surprising the user mid-session.
autoUpdater.autoDownload = false;

ipcMain.handle("kiln:check-dashboard-update", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version ?? null;
    return {
      currentVersion: app.getVersion(),
      latestVersion,
      available: Boolean(latestVersion && latestVersion !== app.getVersion()),
    };
  } catch (e) {
    // Expected in dev mode (unpackaged apps have no update feed configured)
    // - report "no update info" rather than surfacing this as an error.
    return { currentVersion: app.getVersion(), latestVersion: null, available: false, error: String(e) };
  }
});

ipcMain.handle("kiln:download-dashboard-update", () => autoUpdater.downloadUpdate());
ipcMain.handle("kiln:install-dashboard-update", () => autoUpdater.quitAndInstall());

autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("kiln:dashboard-update-progress", { percent: progress.percent });
});
autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("kiln:dashboard-update-downloaded", {});
});
