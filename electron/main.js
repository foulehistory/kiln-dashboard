// Electron main process: the only part of this app that touches
// `kilnd`'s Unix socket directly. The renderer never gets raw network
// access - it only talks to `main.js` through the IPC surface
// `preload.js` exposes, which is the standard Electron security model
// (contextIsolation + no nodeIntegration in the renderer).
"use strict";

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile, spawn } = require("child_process");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");

// kilnd's own repo (separate from this dashboard's repo - see the two
// "Kiln" repos this project is split across). Used purely to look up the
// latest release for the "kilnd has an update" check; not the same repo
// electron-updater checks (that one comes from package.json's own
// `build.publish` config).
const KILND_REPO = "foulehistory/kiln";

// The distro the first-run setup wizard (below) provisions from scratch
// when nothing exists yet - always this exact name, never an existing
// distro the user already has, so setup only ever has to ask "does *our*
// distro exist and is it in the state we expect" instead of judging
// whether some arbitrary existing distro is usable (glibc, free of
// unrelated state, etc).
const PROVISIONED_DISTRO = "kiln";

// Which distro ordinary kilnd operations (launch, updates) target.
// Defaults to "Ubuntu" - this project's own dev workflow assumes a
// manually-configured dev distro by that name - and switches to
// `PROVISIONED_DISTRO` once first-run setup successfully provisions one
// (persisted so it sticks across restarts; see `readConfig`/`writeConfig`).
let cachedWslDistro = null;
function getWslDistro() {
  if (cachedWslDistro) return cachedWslDistro;
  cachedWslDistro = readConfig().wslDistro || "Ubuntu";
  return cachedWslDistro;
}

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const merged = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2));
  if ("wslDistro" in patch) cachedWslDistro = patch.wslDistro;
}

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

// Launched lazily on startup if kilnd isn't already reachable - it's an
// *optional* daemon (see kilnd's own module docs), so there's nothing to
// undo on quit: leaving it running is what lets containers started while
// the dashboard was open keep going, and reopening the dashboard later
// just finds it still there instead of relaunching it. Prefers an
// installed binary under $KILN_STORE/bin (what the update-apply flow
// below installs), falling back to this repo's own dev build - the same
// two paths `bin/kiln-launch.sh` tries, in the same order, for the same
// reason (this is also the dev/build machine, not just an install target).
//
// The tricky part is Windows<->WSL2 process lifetime, not the shell
// script: a one-shot `wsl.exe -d ... -e ...` invocation tears down the
// whole WSL interop session (and everything it spawned) once that
// invocation's own top-level process exits - `nohup`/`setsid`/`disown`
// on the Linux side don't survive that, since the teardown isn't a
// normal SIGHUP from a dying parent, it's WSL's own session cleanup
// (confirmed by testing: identical script, only difference is whether
// the *Windows* process is kept alive). The fix is to never let the
// Windows-side `wsl.exe` process exit at all: spawn it `detached` +
// `unref()`'d so it outlives this dashboard, and have the WSL-side
// script `exec` straight into kilnd (replacing the shell) instead of
// backgrounding it - kilnd then runs as that session's own foreground
// process for as long as it stays up.
function launchKilndInWsl() {
  const script = `
STORE="\${KILN_STORE:-$HOME/.kiln}"
B="$STORE/bin/kilnd"
[ -x "$B" ] || B="/mnt/e/kiln/target/debug/kilnd"
if [ -x "$B" ]; then
  exec "$B" > "$STORE/kilnd.log" 2>&1
fi
`;
  const child = spawn("wsl.exe", ["-d", getWslDistro(), "-u", "root", "-e", "bash", "-c", script], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function ensureKilndRunning() {
  if ((await apiRequest("GET", "/version")).status === 200) return;
  launchKilndInWsl();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if ((await apiRequest("GET", "/version")).status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log("[kilnd auto-start] launched but didn't come up within 8s");
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

// Opens the window immediately rather than waiting on kilnd first - on a
// fresh machine kilnd doesn't exist yet at all, and the renderer needs a
// window to show the first-run setup wizard in before that's even true.
// `ensureKilndRunning()` now happens as setup's own final "ready" step
// (see `kiln:setup-advance` above); the renderer drives that by calling
// `kiln:setup-detect`/`kiln:setup-advance` on mount.
app.whenReady().then(() => {
  createWindow();
});
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
    const headers = { "User-Agent": "kiln-dashboard", Accept: "application/vnd.github+json" };
    // Unauthenticated GitHub API calls are capped at 60/hour *per IP*,
    // shared across everything on that network - trivially exhausted by
    // a handful of manual retries during first-run setup (this was hit
    // for real during development: a burst of retries during a live
    // debugging session ate a full hour's budget in about two minutes).
    // An optional token - even one with zero scopes, since this only
    // ever reads public repos - raises that to 5000/hour.
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    https
      .get({ host: "api.github.com", path: urlPath, headers }, (res) => {
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
      })
      .on("error", reject);
  });
}

// First-run setup can legitimately need several retries in a row (a
// missing asset, a transient network blip, a user impatiently clicking
// Retry) - without this, each one burns another call against the same
// 60/hour unauthenticated budget every *other* GitHub lookup in this
// file also shares. A short TTL is enough to absorb a burst of retries
// without ever showing genuinely stale data for more than a few minutes.
const githubCache = new Map();
function githubJsonCached(urlPath, ttlMs = 5 * 60 * 1000) {
  const cached = githubCache.get(urlPath);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  return githubJson(urlPath).then((data) => {
    githubCache.set(urlPath, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

function runInWsl(script, distro = getWslDistro()) {
  return new Promise((resolve, reject) => {
    execFile("wsl.exe", ["-d", distro, "-u", "root", "-e", "bash", "-c", script], { timeout: 120000 }, (err, stdout, stderr) => {
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

  const release = await githubJsonCached(`/repos/${KILND_REPO}/releases/latest`);
  const latestVersion = String(release.tag_name || "").replace(/^v/, "");
  const asset = (release.assets || []).find((a) => a.name === "kiln-linux-x86_64.tar.gz");

  return {
    currentVersion,
    latestVersion: latestVersion || null,
    available: Boolean(currentVersion && latestVersion && currentVersion !== latestVersion),
    downloadUrl: asset?.browser_download_url ?? null,
  };
});

// Shared by the manual "update kilnd" flow below and first-run setup's
// provisioning step: download the runtime release tarball and extract
// the binaries into $KILN_STORE/bin. The tarball's own layout (set by
// the runtime repo's release.yml) is `bin/{kiln,kiln-compose,kilnd}` +
// `base-image/{Kilnfile,bin/}` - extracting relative to $STORE directly
// lands both where each consumer expects them, in one `tar` call.
function installKilnBinariesScript(downloadUrl) {
  return `
set -e
STORE="\${KILN_STORE:-$HOME/.kiln}"
mkdir -p "$STORE"
curl -fsSL "${downloadUrl}" -o /tmp/kiln-release.tar.gz
tar -xzf /tmp/kiln-release.tar.gz -C "$STORE" bin/kiln bin/kiln-compose bin/kilnd base-image
chmod +x "$STORE/bin/kiln" "$STORE/bin/kiln-compose" "$STORE/bin/kilnd"
`;
}

async function latestKilnReleaseDownloadUrl() {
  const release = await githubJsonCached(`/repos/${KILND_REPO}/releases/latest`);
  const asset = (release.assets || []).find((a) => a.name === "kiln-linux-x86_64.tar.gz");
  if (!asset) throw new Error(`latest ${KILND_REPO} release has no kiln-linux-x86_64.tar.gz asset`);
  return asset.browser_download_url;
}

ipcMain.handle("kiln:apply-kilnd-update", async (_e, downloadUrl) => {
  // Only the download/install half runs through `runInWsl` (so failures -
  // a bad URL, no network - actually surface to the caller); restarting
  // kilnd itself goes through the same detached-`wsl.exe` launch
  // `ensureKilndRunning` uses, for the reason explained on
  // `launchKilndInWsl` above: a `nohup ... &` backgrounded from inside
  // this one-shot install script wouldn't survive it exiting.
  const installScript = `${installKilnBinariesScript(downloadUrl)}
STORE="\${KILN_STORE:-$HOME/.kiln}"
pkill -f "$STORE/bin/kilnd" 2>/dev/null || true
sleep 1
`;
  await runInWsl(installScript);
  launchKilndInWsl();
  return { ok: true };
});

// --- first-run setup -----------------------------------------------------
//
// On a genuinely fresh Windows machine, none of this exists yet: WSL2
// itself may not be enabled, there's no distro, and even once there is
// one, kiln/kilnd and base:latest still need installing into it. This
// re-derives what's actually still missing from real system state every
// time it's asked - never a remembered flag - so it's safe to close the
// app mid-setup, and safe to resume after the one step that can force an
// actual Windows restart (enabling VirtualMachinePlatform).
//
// A pinned WSL rootfs asset (see `needs-distro` below) has to exist as a
// release on the runtime repo before this can complete end-to-end - that
// part needs a human to publish once (same situation this project already
// hit with pushing the first `v0.1.0` tag), it isn't something this code
// can create for itself.
const WSL_ROOTFS_RELEASE_TAG = "wsl-rootfs-v1";
const WSL_ROOTFS_ASSET_NAME = "ubuntu-noble-wsl-amd64.wsl";

// `wsl.exe` writes UTF-16LE to stdout whenever it isn't attached to a
// real console - which is always the case once captured via
// `child_process` - a well-known quirk. `buf[1] === 0x00` (an ASCII byte
// followed by a null byte) is the signature of UTF-16LE-encoded ASCII
// text; anything else is treated as already UTF-8.
function decodeWslOutput(buf) {
  if (buf.length >= 2 && buf[1] === 0x00) return buf.toString("utf16le");
  return buf.toString("utf8");
}

/** Raw `wsl.exe` invocation that never rejects on a non-zero exit - the
 * exit code and decoded output are both meaningful signals here (e.g.
 * "no such distro" vs "wsl.exe doesn't exist at all"), not just errors. */
function execWsl(args) {
  return new Promise((resolve) => {
    execFile("wsl.exe", args, { encoding: "buffer", timeout: 30000 }, (err, stdout, stderr) => {
      resolve({
        code: err && typeof err.code === "number" ? err.code : err ? -1 : 0,
        stdout: decodeWslOutput(stdout || Buffer.alloc(0)),
        stderr: decodeWslOutput(stderr || Buffer.alloc(0)),
        spawnError: err && typeof err.code !== "number" ? err : null,
      });
    });
  });
}

/** `null` means `wsl.exe` itself couldn't be run at all (WSL not
 * installed/enabled) - distinct from "ran fine, zero distros". */
async function listWslDistros() {
  const result = await execWsl(["-l", "-q"]);
  if (result.spawnError) return null;
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\*/, "").trim())
    .filter(Boolean);
}

async function isKilnDistroProvisioned() {
  // No KILN_STORE override inside a freshly imported distro - matches
  // `kiln_cli::default_store()`'s own fallback ($HOME/.kiln) exactly, so
  // this is the same path `kiln build` itself will have written to.
  const result = await execWsl(["-d", PROVISIONED_DISTRO, "-u", "root", "-e", "test", "-f", "$HOME/.kiln/.base-image-built"]);
  return result.code === 0;
}

async function areKilnBinariesInstalled() {
  const result = await execWsl(["-d", PROVISIONED_DISTRO, "-u", "root", "-e", "test", "-x", "$HOME/.kiln/bin/kilnd"]);
  return result.code === 0;
}

/** Re-derives the next required setup step from real system state - see
 * the module comment above for why this never trusts a remembered flag. */
async function detectSetupState() {
  const distros = await listWslDistros();
  if (distros === null) return { state: "needs-features" };
  if (!distros.includes(PROVISIONED_DISTRO)) return { state: "needs-distro" };
  if (!(await areKilnBinariesInstalled())) return { state: "needs-kiln" };
  if (!(await isKilnDistroProvisioned())) return { state: "needs-base-image" };
  return { state: "ready" };
}

function setupHelperPath() {
  // `extraResources` in package.json lands packaged files under
  // `process.resourcesPath`; unpackaged (dev) runs read straight from
  // the repo's own `resources/` directory instead.
  return app.isPackaged
    ? path.join(process.resourcesPath, "setup-helper.ps1")
    : path.join(__dirname, "..", "resources", "setup-helper.ps1");
}

/** Runs the elevated helper (feature enable + reboot signaling, see
 * `resources/setup-helper.ps1`'s own docs for the full state machine it
 * owns) and translates its exit code into a result the renderer can act
 * on directly. */
function runSetupHelper() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", setupHelperPath(), "-InstallPath", process.execPath],
      { timeout: 300000 },
      (err, _stdout, stderr) => {
        const code = err && typeof err.code === "number" ? err.code : err ? -1 : 0;
        if (code === 0) resolve({ ok: true });
        else if (code === 3010) resolve({ ok: false, restartRequired: true });
        else resolve({ ok: false, error: stderr || `setup-helper.ps1 exited ${code}` });
      },
    );
  });
}

async function importProvisionedDistro() {
  const release = await githubJsonCached(`/repos/${KILND_REPO}/releases/tags/${WSL_ROOTFS_RELEASE_TAG}`);
  const asset = (release.assets || []).find((a) => a.name === WSL_ROOTFS_ASSET_NAME);
  if (!asset) throw new Error(`release ${WSL_ROOTFS_RELEASE_TAG} has no ${WSL_ROOTFS_ASSET_NAME} asset`);

  const installDir = path.join(app.getPath("userData"), "wsl-distro");
  fs.mkdirSync(installDir, { recursive: true });
  const rootfsPath = path.join(app.getPath("temp"), WSL_ROOTFS_ASSET_NAME);

  await new Promise((resolve, reject) => {
    https
      .get(asset.browser_download_url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (res2) => pipeToFile(res2, rootfsPath).then(resolve, reject));
          return;
        }
        pipeToFile(res, rootfsPath).then(resolve, reject);
      })
      .on("error", reject);
  });

  // `.wsl`-named assets from Canonical are, in current practice, the same
  // tar content `wsl --import` has always accepted - `--import` doesn't
  // care about the file extension, only what's inside it.
  const result = await execWsl(["--import", PROVISIONED_DISTRO, installDir, rootfsPath, "--version", "2"]);
  if (result.code !== 0) throw new Error(result.stderr || `wsl --import exited ${result.code}`);

  // Match this project's own root-everywhere identity model (kilnd needs
  // to run as root regardless) - and sidesteps the Store-Ubuntu-specific
  // interactive first-run username/password wizard entirely, since a
  // raw imported rootfs never had one to begin with.
  await runInWsl('printf "[user]\\ndefault=root\\n" > /etc/wsl.conf', PROVISIONED_DISTRO);
  await execWsl(["--terminate", PROVISIONED_DISTRO]);

  // From here on, every ordinary kilnd operation (launch, updates) should
  // target the distro setup just created, not the dev-workflow default.
  writeConfig({ wslDistro: PROVISIONED_DISTRO });
}

function pipeToFile(response, destPath) {
  return new Promise((resolve, reject) => {
    if (response.statusCode !== 200) {
      reject(new Error(`downloading rootfs: HTTP ${response.statusCode}`));
      return;
    }
    const file = fs.createWriteStream(destPath);
    response.pipe(file);
    file.on("finish", () => file.close(resolve));
    file.on("error", reject);
  });
}

async function installKilnAndBaseImage() {
  const downloadUrl = await latestKilnReleaseDownloadUrl();
  const script = `${installKilnBinariesScript(downloadUrl)}
STORE="\${KILN_STORE:-$HOME/.kiln}"
"$STORE/bin/kiln" build -f "$STORE/base-image/Kilnfile" -t base:latest "$STORE/base-image"
touch "$STORE/.base-image-built"
`;
  await runInWsl(script, PROVISIONED_DISTRO);
}

ipcMain.handle("kiln:setup-detect", () => detectSetupState());

ipcMain.handle("kiln:setup-advance", async () => {
  const { state } = await detectSetupState();
  try {
    switch (state) {
      case "needs-features":
        return await runSetupHelper();
      case "needs-distro":
        await importProvisionedDistro();
        return { ok: true };
      case "needs-kiln":
        await installKilnAndBaseImage();
        return { ok: true };
      case "needs-base-image":
        // Binaries installed but the base-image build didn't finish
        // (e.g. interrupted) - retrying the whole install script is
        // cheap and correct, `kiln build`'s own cache makes the binary
        // re-download the only real cost.
        await installKilnAndBaseImage();
        return { ok: true };
      case "ready":
        await ensureKilndRunning();
        return { ok: true };
      default:
        return { ok: false, error: `unknown setup state: ${state}` };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("kiln:setup-restart-windows", () => {
  spawn("shutdown.exe", ["/r", "/t", "5"], { detached: true, stdio: "ignore" }).unref();
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
