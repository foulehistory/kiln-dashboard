// Runs in the renderer's context but with access to Node/Electron APIs,
// before web content loads. `contextBridge` is what actually lets the
// (sandboxed, no-nodeIntegration) renderer call back into this - without
// it, `window.kiln` would simply not exist on the page.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kiln", {
  containers: () => ipcRenderer.invoke("kiln:containers"),
  images: () => ipcRenderer.invoke("kiln:images"),
  networks: () => ipcRenderer.invoke("kiln:networks"),
  stats: (id) => ipcRenderer.invoke("kiln:stats", id),
  logs: (id) => ipcRenderer.invoke("kiln:logs", id),
  stop: (id) => ipcRenderer.invoke("kiln:stop", id),
  remove: (id) => ipcRenderer.invoke("kiln:remove", id),
  run: (spec) => ipcRenderer.invoke("kiln:run", spec),

  execStart: (containerId) => ipcRenderer.invoke("kiln:exec-start", containerId),
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
