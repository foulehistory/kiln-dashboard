// Persistence layer for the app's own settings (appearance, behavior,
// notifications, logs, terminal, connection, updates, data/privacy) - kept
// deliberately separate from `config.json` (`main.js`'s `readConfig`/
// `writeConfig`), which holds first-run setup state (`wslDistro`) rather
// than user-facing preferences. Both are plain JSON files in `userData`,
// following the same "no cloud, no external store" approach as the rest
// of this app.
"use strict";

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

const DEFAULT_SETTINGS = {
  appearance: {
    theme: "auto", // "light" | "dark" | "auto" (follows the OS theme)
    density: "comfortable", // "compact" | "comfortable"
    language: "fr", // "fr" | "en"
    fontScale: 1, // 0.85 - 1.3, applied as a root font-size multiplier
  },
  behavior: {
    homeView: "containers", // "containers" | "images" | "summary"
    confirmDestructive: true,
    // When true (and confirmDestructive is also true), stop no longer
    // asks for confirmation - only rm/rmi still do.
    confirmOnlyForRemovals: false,
    // There's no WebSocket push in kilnd (see kilnd/src/server.rs - a
    // plain one-request-per-connection HTTP server) - this is a genuine
    // polling interval, not a fake "real-time" toggle.
    pollingIntervalMs: 2000,
    closeBehavior: "quit", // "quit" | "tray"
    launchAtStartup: false,
  },
  notifications: {
    channel: "in-app", // "in-app" | "native" | "both"
    events: {
      containerStopped: true,
      // No in-dashboard build UI exists yet (build is CLI-only) - this
      // toggle is forward-looking and has no trigger source today.
      buildFinished: true,
      pullFinished: true,
      resourceAlert: true,
      updateAvailable: true,
    },
    resourceAlertThresholdPct: 90,
    sound: true,
    doNotDisturb: false,
    doNotDisturbStart: "22:00",
    doNotDisturbEnd: "08:00",
  },
  logs: {
    maxLines: 2000,
    timestampFormat: "relative", // "relative" | "absolute"
    wrapLines: true,
  },
  terminal: {
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace",
    fontSize: 13,
    colorTheme: "match-app", // "match-app" | "dark" | "light"
    defaultShell: "auto", // "auto" | "/bin/sh" | "/bin/bash"
  },
  connection: {
    mode: "local", // "local" | "remote"
    remoteHost: "",
    remotePort: 7867,
    reconnectIntervalMs: 5000,
  },
  updates: {
    autoCheck: true,
    channel: "stable", // "stable" | "beta" - beta also considers prereleases
  },
  data: {
    // Opt-in, off by default. There is no telemetry backend in this
    // project at all - this toggle is persisted and respected in the
    // sense that nothing is ever collected or sent regardless of its
    // value; it does not activate a hidden collection pipeline.
    telemetry: false,
  },
  registry: {
    // For self-hosted/"explicit host" registries only (kiln-image's
    // registry.rs never sends these to Docker Hub itself - its token
    // flow there is always anonymous). Applied by exporting
    // KILN_REGISTRY_USER/PASS into kilnd's own environment right before
    // it's launched (see main.js's launchKilndInWsl), so a change here
    // takes effect the next time kilnd starts, not live. Stored as
    // plain JSON in this settings file, same as everything else here -
    // not OS-keychain-backed, so this is meant for a private registry
    // on your own trusted machine, not a secret worth real protection.
    username: "",
    password: "",
    // Host of a self-hosted kiln-registry, e.g. "registry.example.com"
    // or "http://192.168.1.10:5959" on a LAN with no TLS. Only used by
    // the dashboard's own "Push image" flow (see main.js) to build the
    // full "<host>/<username>/<image>:<tag>" reference from a plain
    // "<image>:<tag>" the user types - never auto-prefixed onto a pull,
    // so it can't turn a bare Docker Hub reference into something else.
    sharedHost: "",
  },
  // Addon enable/disable state, keyed by manifest id - the manifests
  // themselves are never stored here, only read live from disk each time
  // (see main.js's listAddonsFromDisk) so dropping/removing an addon
  // folder can't leave stale data behind. An id with no entry here is
  // treated as disabled (opt-in: installing an addon - i.e. copying its
  // folder in - never silently runs its code).
  addons: {},
};

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    out[key] = isPlainObject(base[key]) ? deepMerge(base[key], patch[key]) : patch[key];
  }
  return out;
}

let cached = null;

function readSettings() {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    cached = deepMerge(DEFAULT_SETTINGS, raw);
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

function persist() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(cached, null, 2));
}

function writeSettings(patch) {
  cached = deepMerge(readSettings(), patch);
  persist();
  return cached;
}

function resetSettings() {
  cached = DEFAULT_SETTINGS;
  persist();
  return cached;
}

module.exports = { DEFAULT_SETTINGS, settingsPath, readSettings, writeSettings, resetSettings };
