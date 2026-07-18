// Runs in the renderer's context but with access to Node/Electron APIs,
// before web content loads. `contextBridge` is what actually lets the
// (sandboxed, no-nodeIntegration) renderer call back into this - without
// it, `window.kiln` would simply not exist on the page.
"use strict";

const { contextBridge, ipcRenderer, webFrame } = require("electron");

contextBridge.exposeInMainWorld("kiln", {
  containers: () => ipcRenderer.invoke("kiln:containers"),
  images: () => ipcRenderer.invoke("kiln:images"),
  inspectImage: (id) => ipcRenderer.invoke("kiln:inspect-image", id),
  pushImage: (reference) => ipcRenderer.invoke("kiln:push-image", reference),
  pickBuildContext: () => ipcRenderer.invoke("kiln:pick-build-context"),
  buildImage: (contextDir, kilnfilePath, tag) => ipcRenderer.invoke("kiln:build-image", { contextDir, kilnfilePath, tag }),
  removeImage: (id) => ipcRenderer.invoke("kiln:remove-image", id),
  pullImage: (reference) => ipcRenderer.invoke("kiln:pull-image", reference),
  networks: () => ipcRenderer.invoke("kiln:networks"),
  createNetwork: (name, subnet) => ipcRenderer.invoke("kiln:create-network", { name, subnet }),
  removeNetwork: (name) => ipcRenderer.invoke("kiln:remove-network", name),
  volumes: () => ipcRenderer.invoke("kiln:volumes"),
  createVolume: (name) => ipcRenderer.invoke("kiln:create-volume", name),
  removeVolume: (name) => ipcRenderer.invoke("kiln:remove-volume", name),
  openVolumeFolder: (hostPath) => ipcRenderer.invoke("kiln:open-volume-folder", hostPath),
  diskUsage: () => ipcRenderer.invoke("kiln:disk-usage"),
  gc: () => ipcRenderer.invoke("kiln:gc"),
  listVolumeFiles: (name, path) => ipcRenderer.invoke("kiln:list-volume-files", { name, path }),
  readVolumeFile: (name, path) => ipcRenderer.invoke("kiln:read-volume-file", { name, path }),

  listAddons: () => ipcRenderer.invoke("kiln:list-addons"),
  toggleAddon: (id, enabled) => ipcRenderer.invoke("kiln:toggle-addon", { id, enabled }),
  openAddonsFolder: () => ipcRenderer.invoke("kiln:open-addons-folder"),
  addonHttpFetch: (url, options) => ipcRenderer.invoke("kiln:addon-http-fetch", { url, options }),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  openSettingsFolder: () => ipcRenderer.invoke("settings:open-folder"),
  testConnection: (host, port) => ipcRenderer.invoke("settings:test-connection", { host, port }),
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  notify: (title, body, silent) => ipcRenderer.invoke("notify", { title, body, silent }),
  exportText: (defaultName, content) => ipcRenderer.invoke("export-text", { defaultName, content }),
  // Settings > Apparence's "taille de police de l'interface" - this app's
  // CSS uses plain `px` throughout, not `rem`, so scaling the root
  // element's font-size (the first thing tried here) has no visible
  // effect on anything. Chromium's own page zoom scales everything
  // uniformly (text, padding, icons) without needing every stylesheet
  // rule rewritten to relative units - `webFrame` is only reachable from
  // the preload script (Node-enabled) even though the renderer itself is
  // sandboxed/no-nodeIntegration.
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  stats: (id) => ipcRenderer.invoke("kiln:stats", id),
  logs: (id) => ipcRenderer.invoke("kiln:logs", id),
  stop: (id) => ipcRenderer.invoke("kiln:stop", id),
  startExisting: (id) => ipcRenderer.invoke("kiln:start-existing", id),
  remove: (id) => ipcRenderer.invoke("kiln:remove", id),
  run: (spec) => ipcRenderer.invoke("kiln:run", spec),
  updateLimits: (id, memory, cpus) => ipcRenderer.invoke("kiln:update-limits", { id, memory, cpus }),

  execStart: (containerId, shell) => ipcRenderer.invoke("kiln:exec-start", containerId, shell),
  execWrite: (sessionId, data) => ipcRenderer.send("kiln:exec-write", { sessionId, data }),
  execClose: (sessionId) => ipcRenderer.send("kiln:exec-close", { sessionId }),
  onExecData: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("kiln:exec-data", listener);
    return () => ipcRenderer.removeListener("kiln:exec-data", listener);
  },
  onExecClosed: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("kiln:exec-closed", listener);
    return () => ipcRenderer.removeListener("kiln:exec-closed", listener);
  },

  setupDetect: () => ipcRenderer.invoke("kiln:setup-detect"),
  setupAdvance: () => ipcRenderer.invoke("kiln:setup-advance"),
  setupRestartWindows: () => ipcRenderer.invoke("kiln:setup-restart-windows"),

  checkKilndUpdate: () => ipcRenderer.invoke("kiln:check-kilnd-update"),
  applyKilndUpdate: (downloadUrl) => ipcRenderer.invoke("kiln:apply-kilnd-update", downloadUrl),
  checkDashboardUpdate: () => ipcRenderer.invoke("kiln:check-dashboard-update"),
  downloadDashboardUpdate: () => ipcRenderer.invoke("kiln:download-dashboard-update"),
  installDashboardUpdate: () => ipcRenderer.invoke("kiln:install-dashboard-update"),
  onDashboardUpdateProgress: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("kiln:dashboard-update-progress", listener);
    return () => ipcRenderer.removeListener("kiln:dashboard-update-progress", listener);
  },
  onDashboardUpdateDownloaded: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("kiln:dashboard-update-downloaded", listener);
    return () => ipcRenderer.removeListener("kiln:dashboard-update-downloaded", listener);
  },
});
