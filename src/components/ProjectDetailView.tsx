import { useEffect, useRef, useState } from "react";
import { usePolling } from "../usePolling";
import { serviceName } from "../projects";
import { formatBytes } from "../format";
import ConfirmDialog from "./ConfirmDialog";
import Sparkline from "./Sparkline";
import type { ContainerInfo, Stats } from "../types";

/** How many stats samples to keep per container for the sparklines below -
 * at the 2s poll interval this is a 1-minute rolling window, long enough
 * to see a trend without the chart needing its own storage or history API
 * (kilnd only ever returns a point-in-time snapshot; the history is purely
 * an artifact of accumulating client-side polls). */
const HISTORY_LENGTH = 30;

interface StatsSample {
  cpuPct: number;
  memBytes: number;
}

export default function ProjectDetailView({
  project,
  containers,
  onBack,
}: {
  project: string;
  containers: ContainerInfo[];
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(containers[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [history, setHistory] = useState<Record<string, StatsSample[]>>({});
  const [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null);
  // Previous raw sample + its wall-clock time, purely to turn
  // `cpu_usage_usec` (a monotonically increasing cumulative counter) into
  // a percent-of-one-core rate between two polls - not itself displayed.
  const prevRef = useRef<Record<string, { cpuUsageUsec: number; t: number }>>({});

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
          if (prev && now > prev.t) {
            const deltaCpuUsec = s.cpu_usage_usec - prev.cpuUsageUsec;
            const deltaRealUsec = (now - prev.t) * 1000;
            cpuPct = Math.max(0, (deltaCpuUsec / deltaRealUsec) * 100);
          }
          prevRef.current[id] = { cpuUsageUsec: s.cpu_usage_usec, t: now };
          const existing = next[id] ?? [];
          next[id] = [...existing, { cpuPct, memBytes: s.memory_current_bytes }].slice(-HISTORY_LENGTH);
        }
        return next;
      });

      return map;
    },
    2000,
    [runningIds],
  );

  const { data: log } = usePolling(
    async () => {
      if (!selectedId) return "";
      const r = await window.kiln.logs(selectedId);
      return typeof r.body === "string" ? r.body : "";
    },
    1500,
    [selectedId],
  );

  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  async function stop(id: string) {
    setBusy(id);
    await window.kiln.stop(id);
    setBusy(null);
  }
  async function start(id: string) {
    setBusy(id);
    await window.kiln.startExisting(id);
    setBusy(null);
  }
  async function remove(id: string) {
    setBusy(id);
    await window.kiln.remove(id);
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
              {anyRunning && <button onClick={stopAll}>Stop all</button>}
              <button
                className="danger"
                onClick={() =>
                  setConfirm({
                    message: `Remove all ${containers.length} service${containers.length === 1 ? "" : "s"} in "${project}"?`,
                    action: removeAll,
                  })
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
            return (
              <div
                key={c.id}
                className={`service-item${c.id === selectedId ? " active" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span className={`status-dot ${running ? "running" : "exited"}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="service-item-name">{serviceName(c, project)}</div>
                  <div className="muted mono service-item-sub">{c.ip ?? c.status}</div>
                </div>
                <div className="service-item-actions">
                  {busy === c.id ? (
                    <span className="muted">
                      <span className="spinner" />
                    </span>
                  ) : (
                    <>
                      {!running && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            start(c.id);
                          }}
                        >
                          Start
                        </button>
                      )}
                      {running && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            stop(c.id);
                          }}
                        >
                          Stop
                        </button>
                      )}
                      <button
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirm({ message: `Remove "${serviceName(c, project)}"?`, action: () => remove(c.id) });
                        }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
                {s && (
                  <div className="muted service-item-stats">
                    {(s.cpu_usage_usec / 1000).toFixed(0)}ms &middot; {formatBytes(s.memory_current_bytes)}
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
                <span className={`badge ${selected.status === "running" ? "running" : "exited"}`}>{selected.status}</span>
                <span className="mono">{serviceName(selected, project)}</span>
                <span className="muted mono">{selected.image}</span>
                <span className="muted mono" style={{ marginLeft: "auto" }}>
                  {selected.id.slice(0, 12)}
                </span>
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
                </div>
              )}
              <pre className="log-pre" ref={logRef}>
                {log || "(no output yet)"}
              </pre>
            </>
          ) : (
            <div className="empty-state">No service selected.</div>
          )}
        </div>
      </div>
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
