import { useEffect, useRef, useState } from "react";
import { usePolling } from "../usePolling";
import { serviceName } from "../projects";
import { formatBytes } from "../format";
import ConfirmDialog from "./ConfirmDialog";
import Sparkline from "./Sparkline";
import EditLimitsModal from "./EditLimitsModal";
import HealthBadge from "./HealthBadge";
import { PlayIcon, StopIcon, TrashIcon, RestartIcon, GaugeIcon } from "./icons";
import { useSettings } from "../settings/SettingsContext";
import { expectStop } from "../notifications/notify";
import { statusKey } from "../containerStatus";
import type { ContainerInfo, ResourcesReport, SecurityReport, Stats } from "../types";

/** How many stats samples to keep per container for the sparklines below -
 * at the 2s poll interval this is a 1-minute rolling window, long enough
 * to see a trend without the chart needing its own storage or history API
 * (kilnd only ever returns a point-in-time snapshot; the history is purely
 * an artifact of accumulating client-side polls). */
const HISTORY_LENGTH = 30;

interface StatsSample {
  cpuPct: number;
  memBytes: number;
  rxRateBps: number;
  txRateBps: number;
}

/** Settings > Logs' "lines kept in memory" - kilnd just returns the raw
 * log file as-is, so this is purely a display-side cap on how much of it
 * gets rendered, for the same reason the setting exists in the first
 * place (perf on a long-running, chatty container). */
function truncateToLastLines(text: string | null, maxLines: number): string {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(-maxLines).join("\n");
}

/** Compact seccomp/capability indicator for the selected service's log
 * panel header - fetched once per container id (not polled): the
 * profile a container got is fixed for its whole lifetime, set once at
 * `execve` and never changed afterward (see `kilnd_core::security`'s own
 * docs), so there's nothing to refresh mid-session. */
function SecurityIndicator({ containerId }: { containerId: string }) {
  const [report, setReport] = useState<SecurityReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    window.kiln.containerSecurity(containerId).then((r) => {
      if (!cancelled && r.status === 200) setReport(r.body as SecurityReport);
    });
    return () => {
      cancelled = true;
    };
  }, [containerId]);

  if (!report) return null;
  const label = report.seccomp === "unconfined" ? "seccomp: unconfined" : `seccomp: enforced · ${report.effective_capabilities.length} caps`;
  const title = `Effective capabilities:\n${report.effective_capabilities.join(", ") || "(none)"}${
    report.live_capability_bounding_set && !report.matches_expected ? "\n\n⚠ live bounding set doesn't match what was requested" : ""
  }`;
  return (
    <span className="muted mono" style={{ fontSize: 11 }} title={title}>
      🛡️ {label}
    </span>
  );
}

/** Memory limit vs. live usage, as a filled bar - `null` limit (no
 * `--memory`/`resources.memory` set) means unlimited, nothing bounded to
 * show a fraction of, so renders nothing. The limit itself is fixed for
 * a run's whole lifetime (only `kiln inspect --resources`/this same
 * endpoint would show a change, and only after a restart), so it's
 * fetched once per container id here - live usage comes from the
 * already-polling `statsMap` the parent passes in, not a second poll of
 * its own. */
function MemoryLimitBar({ containerId, liveMemBytes }: { containerId: string; liveMemBytes: number | undefined }) {
  const [report, setReport] = useState<ResourcesReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    window.kiln.containerResources(containerId).then((r) => {
      if (!cancelled && r.status === 200) setReport(r.body as ResourcesReport);
    });
    return () => {
      cancelled = true;
    };
  }, [containerId]);

  if (!report || report.memory_limit_bytes == null || liveMemBytes == null) return null;
  const limit = report.memory_limit_bytes;
  const pct = Math.min(100, (liveMemBytes / limit) * 100);
  // Same soft/hard framing as `memory.high`/`memory.max` themselves: past
  // the soft throttle threshold reads as a warning, not yet a problem;
  // there's no separate "past the hard cap" color since a container that
  // actually got OOM-killed no longer has live usage to show a bar for.
  const pastSoftThreshold = report.memory_high_bytes != null && liveMemBytes >= report.memory_high_bytes;
  return (
    <div className="resource-bar" title={`${formatBytes(liveMemBytes)} / ${formatBytes(limit)} memory limit`}>
      <div className="muted stats-chart-label">
        Memory limit · {formatBytes(liveMemBytes)} / {formatBytes(limit)}
      </div>
      <div className="resource-bar-track">
        <div className={`resource-bar-fill${pastSoftThreshold ? " warn" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProjectDetailView({
  project,
  containers,
  onBack,
  refetchContainers,
}: {
  project: string;
  containers: ContainerInfo[];
  onBack: () => void;
  /** The parent's own container-list poll - awaited before clearing a
   * "stopping…"/"launching…" transition indicator, so it doesn't briefly
   * flash back to a stale running/exited status before the next
   * scheduled tick catches up. See `usePolling`'s own docs on `refetch`. */
  refetchContainers: () => Promise<unknown>;
}) {
  const { settings } = useSettings();
  const interval = settings.behavior.pollingIntervalMs;
  const [selectedId, setSelectedId] = useState<string | null>(containers[0]?.id ?? null);
  // Tracks which container has a stop/start/restart/remove in flight, and
  // which of those it is - the status-dot uses `action` to show a
  // "stopping…"/"launching…" transition instead of jumping straight from
  // running to exited (or back) with no feedback in between.
  const [busy, setBusy] = useState<{ id: string; action: "stopping" | "launching" } | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [history, setHistory] = useState<Record<string, StatsSample[]>>({});
  const [confirm, setConfirm] = useState<{ message: string; action: () => void; confirmLabel: string } | null>(null);
  const [editLimits, setEditLimits] = useState<ContainerInfo | null>(null);
  // Previous raw sample + its wall-clock time, purely to turn
  // `cpu_usage_usec`/`rx_bytes`/`tx_bytes` (monotonically increasing
  // cumulative counters) into per-second rates between two polls - not
  // itself displayed.
  const prevRef = useRef<Record<string, { cpuUsageUsec: number; rxBytes: number; txBytes: number; t: number }>>({});

  useEffect(() => {
    if (!selectedId && containers.length > 0) setSelectedId(containers[0].id);
    if (selectedId && !containers.some((c) => c.id === selectedId)) {
      setSelectedId(containers[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers]);

  const runningIds = containers
    .filter((c) => c.status === "running")
    .map((c) => c.id)
    .join(",");

  usePolling(
    async () => {
      const ids = runningIds ? runningIds.split(",") : [];
      const entries = await Promise.all(
        ids.map(async (id) => {
          const r = await window.kiln.stats(id);
          return [id, r.body] as const;
        }),
      );
      const map: Record<string, Stats> = {};
      for (const [id, s] of entries) if (s) map[id] = s;
      setStatsMap(map);

      const now = Date.now();
      setHistory((prevHistory) => {
        const next = { ...prevHistory };
        for (const [id, s] of entries) {
          if (!s) continue;
          const prev = prevRef.current[id];
          let cpuPct = 0;
          let rxRateBps = 0;
          let txRateBps = 0;
          if (prev && now > prev.t) {
            const deltaSec = (now - prev.t) / 1000;
            const deltaCpuUsec = s.cpu_usage_usec - prev.cpuUsageUsec;
            cpuPct = Math.max(0, (deltaCpuUsec / (deltaSec * 1_000_000)) * 100);
            if (s.rx_bytes != null) rxRateBps = Math.max(0, (s.rx_bytes - prev.rxBytes) / deltaSec);
            if (s.tx_bytes != null) txRateBps = Math.max(0, (s.tx_bytes - prev.txBytes) / deltaSec);
          }
          prevRef.current[id] = { cpuUsageUsec: s.cpu_usage_usec, rxBytes: s.rx_bytes ?? 0, txBytes: s.tx_bytes ?? 0, t: now };
          const existing = next[id] ?? [];
          next[id] = [...existing, { cpuPct, memBytes: s.memory_current_bytes, rxRateBps, txRateBps }].slice(-HISTORY_LENGTH);
        }
        return next;
      });

      return map;
    },
    interval,
    [runningIds, interval],
  );

  const { data: log } = usePolling(
    async () => {
      if (!selectedId) return "";
      const r = await window.kiln.logs(selectedId);
      return typeof r.body === "string" ? r.body : "";
    },
    interval,
    [selectedId, interval],
  );

  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  async function stop(id: string) {
    setBusy({ id, action: "stopping" });
    expectStop(id);
    await window.kiln.stop(id);
    // See `refetchContainers`'s own docs: without this, the transition
    // indicator would clear onto whatever stale status the *parent's*
    // last poll happened to have, flashing green before that parent
    // re-renders with the real "exited" status.
    await refetchContainers();
    setBusy(null);
  }
  async function start(id: string) {
    setBusy({ id, action: "launching" });
    await window.kiln.startExisting(id);
    await refetchContainers();
    setBusy(null);
  }
  // Safe back-to-back: kilnd's stop only returns once the cgroup is
  // confirmed empty (see kiln-cli's stop_container), never mid-exit.
  async function restart(id: string) {
    setBusy({ id, action: "stopping" });
    expectStop(id);
    await window.kiln.stop(id);
    await refetchContainers();
    setBusy({ id, action: "launching" });
    await window.kiln.startExisting(id);
    await refetchContainers();
    setBusy(null);
  }
  async function remove(id: string) {
    setBusy({ id, action: "stopping" });
    expectStop(id);
    await window.kiln.remove(id);
    await refetchContainers();
    setBusy(null);
  }
  async function stopAll() {
    for (const c of containers.filter((c) => c.status === "running")) await stop(c.id);
  }
  async function startAll() {
    for (const c of containers.filter((c) => c.status !== "running")) await start(c.id);
  }
  async function removeAll() {
    for (const c of containers) await remove(c.id);
    onBack();
  }

  function confirmStop(message: string, action: () => void) {
    if (!settings.behavior.confirmDestructive || settings.behavior.confirmOnlyForRemovals) {
      action();
      return;
    }
    setConfirm({ message, action, confirmLabel: "Stop" });
  }
  function confirmRemove(message: string, action: () => void) {
    if (!settings.behavior.confirmDestructive) {
      action();
      return;
    }
    setConfirm({ message, action, confirmLabel: "Remove" });
  }

  const selected = containers.find((c) => c.id === selectedId) ?? null;
  const anyRunning = containers.some((c) => c.status === "running");
  const anyStopped = containers.some((c) => c.status !== "running");

  return (
    <div>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <div>
          <h1 style={{ margin: 0 }}>{project}</h1>
          <div className="muted">
            {containers.length} service{containers.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          {busy !== null ? (
            <span className="muted">
              <span className="spinner" />
              working…
            </span>
          ) : (
            <>
              {anyStopped && <button onClick={startAll}>Start all</button>}
              {anyRunning && <button onClick={() => confirmStop(`Stop all in "${project}"?`, stopAll)}>Stop all</button>}
              <button
                className="danger"
                onClick={() =>
                  confirmRemove(
                    `Remove all ${containers.length} service${containers.length === 1 ? "" : "s"} in "${project}"?`,
                    removeAll,
                  )
                }
              >
                Remove all
              </button>
            </>
          )}
        </div>
      </div>

      <div className="detail-layout">
        <div className="service-list">
          {containers.map((c) => {
            const running = c.status === "running";
            const s = statsMap[c.id];
            const transition = busy?.id === c.id ? busy.action : null;
            const key = statusKey(c.status, transition);
            return (
              <div
                key={c.id}
                className={`service-item${c.id === selectedId ? " active" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span className={`status-dot ${key}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="service-item-name">
                    {serviceName(c, project)} <HealthBadge health={c.health} />
                  </div>
                  <div className="muted mono service-item-sub">{c.ip ?? c.status}</div>
                </div>
                <div className="service-item-actions">
                  {busy?.id === c.id ? (
                    <span className="muted">
                      <span className="spinner" />
                    </span>
                  ) : (
                    <>
                      {!running && (
                        <button
                          className="icon-btn"
                          title="Start"
                          onClick={(e) => {
                            e.stopPropagation();
                            start(c.id);
                          }}
                        >
                          <PlayIcon />
                        </button>
                      )}
                      {running && (
                        <button
                          className="icon-btn"
                          title="Stop"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmStop(`Stop "${serviceName(c, project)}"?`, () => stop(c.id));
                          }}
                        >
                          <StopIcon />
                        </button>
                      )}
                      {running && (
                        <button
                          className="icon-btn"
                          title="Restart"
                          onClick={(e) => {
                            e.stopPropagation();
                            restart(c.id);
                          }}
                        >
                          <RestartIcon />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        title="Edit limits"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditLimits(c);
                        }}
                      >
                        <GaugeIcon />
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmRemove(`Remove "${serviceName(c, project)}"?`, () => remove(c.id));
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
                {s && (
                  <div className="muted service-item-stats">
                    {(s.cpu_usage_usec / 1000).toFixed(0)}ms &middot; {formatBytes(s.memory_current_bytes)}
                    {(s.rx_bytes != null || s.tx_bytes != null) && (
                      <>
                        {" "}
                        &middot; ↓{formatBytes(s.rx_bytes ?? 0)} ↑{formatBytes(s.tx_bytes ?? 0)}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="log-panel">
          {selected ? (
            <>
              <div className="log-panel-header">
                <span className={`badge ${statusKey(selected.status, null)}`}>{selected.status}</span>
                <HealthBadge health={selected.health} />
                <SecurityIndicator containerId={selected.id} />
                <span className="mono">{serviceName(selected, project)}</span>
                <span className="muted mono">{selected.image}</span>
                <span className="muted mono" style={{ marginLeft: "auto" }}>
                  {selected.id.slice(0, 12)}
                </span>
                <button
                  onClick={() => window.kiln.exportText(`${serviceName(selected, project)}.log`, log || "")}
                  disabled={!log}
                >
                  Export
                </button>
              </div>
              {selected.status === "running" && (history[selected.id]?.length ?? 0) >= 2 && (
                <div className="stats-panel">
                  <div className="stats-chart">
                    <div className="muted stats-chart-label">
                      CPU · {history[selected.id][history[selected.id].length - 1].cpuPct.toFixed(1)}%
                    </div>
                    <Sparkline data={history[selected.id].map((s) => s.cpuPct)} color="var(--accent)" />
                  </div>
                  <div className="stats-chart">
                    <div className="muted stats-chart-label">
                      Memory · {formatBytes(history[selected.id][history[selected.id].length - 1].memBytes)}
                    </div>
                    <Sparkline data={history[selected.id].map((s) => s.memBytes)} color="#e8a33d" />
                  </div>
                  <div className="stats-chart">
                    <div className="muted stats-chart-label">
                      <span style={{ color: "#4dabf7" }}>↓ {formatBytes(history[selected.id][history[selected.id].length - 1].rxRateBps)}/s</span>{" "}
                      <span style={{ color: "#a56de2" }}>↑ {formatBytes(history[selected.id][history[selected.id].length - 1].txRateBps)}/s</span>
                    </div>
                    <Sparkline
                      data={history[selected.id].map((s) => s.rxRateBps)}
                      color="#4dabf7"
                      data2={history[selected.id].map((s) => s.txRateBps)}
                      color2="#a56de2"
                    />
                  </div>
                </div>
              )}
              {selected.status === "running" && (
                <MemoryLimitBar containerId={selected.id} liveMemBytes={statsMap[selected.id]?.memory_current_bytes} />
              )}
              <pre className="log-pre" ref={logRef} style={{ whiteSpace: settings.logs.wrapLines ? "pre-wrap" : "pre" }}>
                {truncateToLastLines(log, settings.logs.maxLines) || "(no output yet)"}
              </pre>
            </>
          ) : (
            <div className="empty-state">No service selected.</div>
          )}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog message={confirm.message} confirmLabel={confirm.confirmLabel} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />
      )}
      {editLimits && <EditLimitsModal container={editLimits} onClose={() => setEditLimits(null)} onUpdated={() => {}} />}
    </div>
  );
}
