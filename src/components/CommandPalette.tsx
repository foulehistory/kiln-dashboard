import { useEffect, useMemo, useRef, useState } from "react";
import { groupByProject } from "../projects";
import { aggregateStatusKey, statusKey, STATUS_LABEL, type StatusKey } from "../containerStatus";
import { useSettings } from "../settings/SettingsContext";
import { resolveTheme } from "../theme";
import { CameraIcon, CloseIcon, CommandIcon, GearIcon, PlayIcon, RestartIcon, SearchIcon, StopIcon, SunMoonIcon } from "./icons";
import type { ContainerInfo, VolumeInfo } from "../types";
import type { StaticTab } from "../App";

interface CommandPaletteProps {
  /** Jump to a static sidebar tab (Settings, Volumes, ...). */
  onNavigate: (tab: StaticTab) => void;
  /** Jump to the Containers tab and open a specific project/standalone
   * container's detail view - see `ContainersView`'s own `initialOpenTarget`
   * prop docs for why this needs a dedicated callback rather than just
   * `onNavigate("containers")`. */
  onOpenContainer: (key: string) => void;
}

interface PaletteEntry {
  id: string;
  category: "Conteneurs" | "Actions";
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  statusBadge?: StatusKey;
  run: () => void;
}

/** Subsequence match, case-insensitive - the same lightweight "fuzzy"
 * approach quick-open pickers (VSCode's Ctrl+P, Raycast) use: every
 * character of the query must appear in the target, in order, but not
 * necessarily contiguous - so "mysqld" still finds "mysql_demo_web"
 * doesn't, but "msqldw" would (deliberately loose - it's a filter over an
 * already-small in-memory list, not a ranked search engine). */
function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

async function fetchContainers(): Promise<ContainerInfo[]> {
  const r = await window.kiln.containers();
  return r.status === 200 && Array.isArray(r.body) ? r.body : [];
}

async function fetchVolumes(): Promise<VolumeInfo[]> {
  const r = await window.kiln.volumes();
  return r.status === 200 && Array.isArray(r.body) ? r.body : [];
}

async function restartOne(id: string) {
  await window.kiln.stop(id);
  await window.kiln.startExisting(id);
}

function KilndLogModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.kiln.readKilndLog().then((r) => {
      if (!cancelled) setText(r.text);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box modal-volume" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>
            kilnd logs
          </h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="log-panel">
          <pre className="log-pre">{text === null ? "Loading…" : text}</pre>
        </div>
      </div>
    </div>
  );
}

export default function CommandPalette({ onNavigate, onOpenContainer }: CommandPaletteProps) {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [showKilndLog, setShowKilndLog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Cmd+K/Ctrl+K - platform detection reused from wherever else in
  // this Electron app already needs it (the same mechanism menu
  // accelerators use), not re-derived here.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    fetchContainers().then(setContainers);
    fetchVolumes().then(setVolumes);
    // Focus after the overlay actually mounts, not in the same tick.
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  function close() {
    setOpen(false);
  }

  const entries = useMemo<PaletteEntry[]>(() => {
    const out: PaletteEntry[] = [];
    const { groups, standalone } = groupByProject(containers);

    for (const g of groups) {
      const running = g.containers.filter((c) => c.status === "running");
      const key = aggregateStatusKey(g.containers, null);
      out.push({
        id: `open:${g.project}`,
        category: "Conteneurs",
        label: g.project,
        sublabel: `${g.containers.length} service${g.containers.length > 1 ? "s" : ""}`,
        icon: <PlayIcon />,
        statusBadge: key,
        run: () => {
          onOpenContainer(g.project);
          close();
        },
      });
      if (running.length > 0) {
        out.push({
          id: `restart:${g.project}`,
          category: "Actions",
          label: `Redémarrer : ${g.project}`,
          icon: <RestartIcon />,
          run: () => {
            running.forEach((c) => restartOne(c.id));
            close();
          },
        });
        out.push({
          id: `stop:${g.project}`,
          category: "Actions",
          label: `Arrêter : ${g.project}`,
          icon: <StopIcon />,
          run: () => {
            running.forEach((c) => window.kiln.stop(c.id));
            close();
          },
        });
      }
    }

    for (const c of standalone) {
      const key = statusKey(c.status, null);
      out.push({
        id: `open:${c.id}`,
        category: "Conteneurs",
        label: c.name,
        sublabel: c.image,
        icon: <PlayIcon />,
        statusBadge: key,
        run: () => {
          onOpenContainer(c.id);
          close();
        },
      });
      if (c.status === "running") {
        out.push({
          id: `restart:${c.id}`,
          category: "Actions",
          label: `Redémarrer : ${c.name}`,
          icon: <RestartIcon />,
          run: () => {
            restartOne(c.id);
            close();
          },
        });
        out.push({
          id: `stop:${c.id}`,
          category: "Actions",
          label: `Arrêter : ${c.name}`,
          icon: <StopIcon />,
          run: () => {
            window.kiln.stop(c.id);
            close();
          },
        });
      }
    }

    for (const v of volumes) {
      out.push({
        id: `snapshot:${v.name}`,
        category: "Actions",
        label: `Créer un snapshot : ${v.name}`,
        icon: <CameraIcon />,
        run: () => {
          window.kiln.createVolumeSnapshot(v.name);
          close();
        },
      });
    }

    out.push({
      id: "action:kilnd-logs",
      category: "Actions",
      label: "Voir les logs de kilnd",
      icon: <CommandIcon />,
      run: () => {
        setShowKilndLog(true);
        close();
      },
    });
    out.push({
      id: "action:settings",
      category: "Actions",
      label: "Ouvrir les réglages",
      icon: <GearIcon />,
      run: () => {
        onNavigate("settings");
        close();
      },
    });
    const currentTheme = resolveTheme(settings.appearance.theme);
    out.push({
      id: "action:toggle-theme",
      category: "Actions",
      label: `Basculer le thème (actuellement ${currentTheme === "dark" ? "sombre" : "clair"})`,
      icon: <SunMoonIcon />,
      run: () => {
        update({ appearance: { theme: currentTheme === "dark" ? "light" : "dark" } });
        close();
      },
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers, volumes, settings.appearance.theme]);

  const filtered = useMemo(() => entries.filter((e) => fuzzyMatch(query, e.label)), [entries, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[selectedIndex]?.run();
    }
  }

  if (showKilndLog) {
    return <KilndLogModal onClose={() => setShowKilndLog(false)} />;
  }

  if (!open) return null;

  let lastCategory: string | null = null;

  return (
    <div className="command-palette-overlay" onClick={close}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-search">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Rechercher une action ou un conteneur…"
          />
          <span className="command-palette-esc">Esc</span>
        </div>
        <div className="command-palette-results" ref={listRef}>
          {filtered.length === 0 && <div className="command-palette-empty muted">Aucun résultat</div>}
          {filtered.map((entry, i) => {
            const showLabel = entry.category !== lastCategory;
            lastCategory = entry.category;
            return (
              <div key={entry.id}>
                {showLabel && <div className="command-palette-group-label">{entry.category}</div>}
                <div
                  data-index={i}
                  className={`command-palette-item${i === selectedIndex ? " selected" : ""}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => entry.run()}
                >
                  <span className="command-palette-item-icon">{entry.icon}</span>
                  <span className="command-palette-item-label">{entry.label}</span>
                  {entry.sublabel && <span className="muted command-palette-item-sublabel">{entry.sublabel}</span>}
                  {entry.statusBadge && <span className={`badge ${entry.statusBadge}`}>{STATUS_LABEL[entry.statusBadge]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
