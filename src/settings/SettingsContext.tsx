import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppSettings, DeepPartial } from "../types";

// Mirrors electron/settings.js's DEFAULT_SETTINGS, purely so the very
// first paint (before the async `getSettings()` IPC round-trip resolves,
// typically well under a frame) has something sane to render instead of
// null-checks everywhere - the main process's copy is the actual source
// of truth and this fallback is overwritten within a tick of mount.
const FALLBACK_SETTINGS: AppSettings = {
  appearance: { theme: "auto", density: "comfortable", language: "fr", fontScale: 1 },
  behavior: {
    homeView: "containers",
    confirmDestructive: true,
    confirmOnlyForRemovals: false,
    pollingIntervalMs: 2000,
    closeBehavior: "quit",
    launchAtStartup: false,
  },
  notifications: {
    channel: "in-app",
    events: { containerStopped: true, buildFinished: true, pullFinished: true, resourceAlert: true, updateAvailable: true },
    resourceAlertThresholdPct: 90,
    sound: true,
    doNotDisturb: false,
    doNotDisturbStart: "22:00",
    doNotDisturbEnd: "08:00",
  },
  logs: { maxLines: 2000, timestampFormat: "relative", wrapLines: true },
  terminal: {
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace",
    fontSize: 13,
    colorTheme: "match-app",
    defaultShell: "auto",
  },
  connection: { mode: "local", remoteHost: "", remotePort: 7867, reconnectIntervalMs: 5000 },
  updates: { autoCheck: true, channel: "stable" },
  data: { telemetry: false },
  registry: { username: "", password: "" },
};

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  update: (patch: DeepPartial<AppSettings>) => void;
  reset: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(patch)) return (patch as T) ?? base;
  const out = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch)) {
    const b = (base as Record<string, unknown>)[key];
    const p = (patch as Record<string, unknown>)[key];
    out[key] = isPlainObject(b) ? deepMerge(b, p as never) : p;
  }
  return out as T;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.kiln.getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  // Auto-save, no separate "Save" step: the patch is applied to local
  // state immediately so toggles/selects feel instant, and persisted
  // through IPC in the background - consistent with how the rest of this
  // app already behaves (e.g. the sidebar's theme toggle).
  const update = useCallback((patch: DeepPartial<AppSettings>) => {
    setSettings((prev) => deepMerge(prev, patch));
    window.kiln.setSettings(patch).then(setSettings);
  }, []);

  const reset = useCallback(async () => {
    setSettings(await window.kiln.resetSettings());
  }, []);

  return <SettingsContext.Provider value={{ settings, loaded, update, reset }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
