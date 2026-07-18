import { useEffect, useRef, useState } from "react";
import ContainersView from "./components/ContainersView";
import ImagesView from "./components/ImagesView";
import NetworksView from "./components/NetworksView";
import VolumesView from "./components/VolumesView";
import TerminalView from "./components/TerminalView";
import SettingsView from "./components/SettingsView";
import UpdatesWidget from "./components/UpdatesWidget";
import SetupWizard from "./components/SetupWizard";
import NotificationBell from "./components/NotificationBell";
import { CloseIcon } from "./components/icons";
import { SettingsProvider, useSettings } from "./settings/SettingsContext";
import { useT } from "./i18n/useT";
import { usePolling } from "./usePolling";
import { notify, subscribeToasts } from "./notifications/notify";
import { resolveTheme } from "./theme";
import type { ContainerInfo } from "./types";

type Tab = "containers" | "images" | "networks" | "volumes" | "terminal" | "settings";

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

interface Toast {
  id: number;
  title: string;
  body: string;
  leaving?: boolean;
}

const TOAST_LIFETIME_MS = 6000;
const TOAST_EXIT_MS = 200;

function AppShell() {
  const { settings, loaded } = useSettings();
  const t = useT();
  const [tab, setTab] = useState<Tab>("containers");
  const [setupReady, setSetupReady] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Applies Settings > Comportement's "default view on launch" exactly
  // once, the first time settings finish loading - a ref (not a dep-less
  // effect) so it doesn't fight the user's own later tab clicks every
  // time some unrelated setting changes.
  const homeApplied = useRef(false);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(settings.appearance.theme);
    };
    apply();
    if (settings.appearance.theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.appearance.theme]);

  useEffect(() => {
    document.documentElement.dataset.density = settings.appearance.density;
  }, [settings.appearance.density]);

  useEffect(() => {
    window.kiln.setZoomFactor(settings.appearance.fontScale);
  }, [settings.appearance.fontScale]);

  useEffect(() => {
    if (loaded && !homeApplied.current) {
      homeApplied.current = true;
      if (settings.behavior.homeView !== "summary") setTab(settings.behavior.homeView);
    }
  }, [loaded, settings.behavior.homeView]);

  useEffect(() => {
    window.kiln.setupDetect().then((r) => setSetupReady(r.state === "ready"));
  }, []);

  function dismissToast(id: number) {
    // Two-step removal so the exit animation (CSS, keyed off `.leaving`)
    // has time to play before the element actually leaves the DOM -
    // removing it immediately would just cut the fade/slide short.
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), TOAST_EXIT_MS);
  }

  useEffect(() => {
    return subscribeToasts((title, body) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, title, body }]);
      setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
    });
  }, []);

  // Background watcher for "container stopped" / "resource alert"
  // notifications - deliberately independent of whichever view is
  // currently open (ContainersView/ProjectDetailView have their own
  // polling for their own UI needs), since a crash notification should
  // still fire while looking at, say, Images.
  const prevStatuses = useRef<Record<string, string>>({});
  const alerted = useRef<Set<string>>(new Set());
  usePolling(
    async () => {
      const r = await window.kiln.containers();
      if (r.status !== 200 || !Array.isArray(r.body)) return null;
      const containers = r.body as ContainerInfo[];
      for (const c of containers) {
        const prev = prevStatuses.current[c.id];
        if (prev === "running" && c.status !== "running") {
          notify(settings, "containerStopped", t("notifications.events.containerStopped"), c.name);
        }
        prevStatuses.current[c.id] = c.status;

        if (c.status === "running" && c.memory_limit_bytes) {
          const s = await window.kiln.stats(c.id);
          const pct = s.status === 200 && s.body ? (s.body.memory_current_bytes / c.memory_limit_bytes) * 100 : 0;
          if (pct >= settings.notifications.resourceAlertThresholdPct) {
            if (!alerted.current.has(c.id)) {
              alerted.current.add(c.id);
              notify(settings, "resourceAlert", t("notifications.events.resourceAlert"), `${c.name} — ${pct.toFixed(0)}%`);
            }
          } else {
            alerted.current.delete(c.id);
          }
        }
      }
      return containers;
    },
    settings.behavior.pollingIntervalMs,
    [settings.behavior.pollingIntervalMs],
  );

  if (setupReady === false) {
    return <SetupWizard onReady={() => setSetupReady(true)} />;
  }
  if (setupReady === null) {
    return null;
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="brand">
          kiln<span>d</span>ash
        </div>
        <NavItem label="Containers" active={tab === "containers"} onClick={() => setTab("containers")} />
        <NavItem label="Images" active={tab === "images"} onClick={() => setTab("images")} />
        <NavItem label="Networks" active={tab === "networks"} onClick={() => setTab("networks")} />
        <NavItem label="Volumes" active={tab === "volumes"} onClick={() => setTab("volumes")} />
        <NavItem label="Terminal" active={tab === "terminal"} onClick={() => setTab("terminal")} />
        <NavItem label={t("nav.settings")} active={tab === "settings"} onClick={() => setTab("settings")} />
        <div className="sidebar-spacer" />
        <NotificationBell />
        <UpdatesWidget />
      </div>
      <div className="main">
        {tab === "containers" && <ContainersView />}
        {tab === "images" && <ImagesView />}
        {tab === "networks" && <NetworksView />}
        {tab === "volumes" && <VolumesView />}
        {tab === "terminal" && <TerminalView />}
        {tab === "settings" && <SettingsView />}
      </div>
      <div className="toast-stack">
        {toasts.map((tt) => (
          <div className={`toast${tt.leaving ? " leaving" : ""}`} key={tt.id}>
            <button className="toast-close" title="Dismiss" onClick={() => dismissToast(tt.id)}>
              <CloseIcon />
            </button>
            <strong>{tt.title}</strong>
            <div className="muted">{tt.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div className={`nav-item${active ? " active" : ""}`} onClick={onClick}>
      {label}
    </div>
  );
}
