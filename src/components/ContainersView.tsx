import { useState } from "react";
import { usePolling } from "../usePolling";
import { groupByProject } from "../projects";
import { formatBytes } from "../format";
import ProjectDetailView from "./ProjectDetailView";
import ConfirmDialog from "./ConfirmDialog";
import NewContainerModal from "./NewContainerModal";
import EditLimitsModal from "./EditLimitsModal";
import HealthBadge from "./HealthBadge";
import { useSettings } from "../settings/SettingsContext";
import { expectStop } from "../notifications/notify";
import { PlayIcon, StopIcon, TrashIcon, RestartIcon, SearchIcon, GaugeIcon } from "./icons";
import type { ComposeWaitingInfo, ContainerInfo, Stats } from "../types";

/** Worst-first: a project with even one unhealthy service reads as
 * unhealthy overall, same as Docker Compose's own `ps` rolls up health.
 * `"none"` (no service in the group has a `healthcheck:` configured) is
 * the only case `HealthBadge` renders as nothing. */
function aggregateHealth(containers: ContainerInfo[]): string {
  const healths = containers.map((c) => c.health).filter((h) => h !== "none");
  if (healths.includes("unhealthy")) return "unhealthy";
  if (healths.includes("starting")) return "starting";
  return healths.length > 0 ? "healthy" : "none";
}

async function fetchContainers() {
  const r = await window.kiln.containers();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(typeof r.body === "object" && r.body && "error" in r.body ? String((r.body as any).error) : `unexpected response (status ${r.status})`);
  }
  return r.body;
}

/** Best-effort - absent/unreachable just means "nothing waiting right
 * now" rather than an error worth surfacing, since this is purely
 * informational (see `ComposeWaitingInfo`'s own docs). */
async function fetchComposeWaiting(): Promise<ComposeWaitingInfo[]> {
  const r = await window.kiln.composeWaiting();
  return r.status === 200 && Array.isArray(r.body) ? r.body : [];
}

/** Entries whose `container_name` (`<project>_<service>`) starts with
 * this project's own prefix - reliable because a marker only ever exists
 * for a dependent waiting on an *already-started* dependency, so at
 * least one real container (and hence this project group) is guaranteed
 * to already exist by the time one shows up. */
function waitingForProject(waiting: ComposeWaitingInfo[], project: string): ComposeWaitingInfo[] {
  const prefix = `${project}_`;
  return waiting.filter((w) => w.container_name.startsWith(prefix));
}

export default function ContainersView() {
  const { settings } = useSettings();
  const interval = settings.behavior.pollingIntervalMs;
  const { data: containers, error, refetch: refetchContainers } = usePolling(fetchContainers, interval);
  const { data: composeWaiting } = usePolling(fetchComposeWaiting, interval);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  // Tracks which container has a stop/start/restart/remove in flight,
  // and which of those it is - used to show a "stopping…"/"starting…"
  // status-dot instead of jumping straight between running/exited with
  // no feedback in between.
  // "launching" (not "starting") to avoid colliding with HealthBadge's
  // own "starting" health status (healthcheck not yet reported) - these
  // are two unrelated meanings of "starting" that would otherwise fight
  // over the same badge/dot CSS class.
  const [busy, setBusy] = useState<{ id: string; action: "stopping" | "launching" } | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; action: () => void; confirmLabel: string } | null>(null);
  const [showNewContainer, setShowNewContainer] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editLimits, setEditLimits] = useState<ContainerInfo | null>(null);

  const runningIds = (containers ?? [])
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
      return map;
    },
    interval,
    [runningIds, interval],
  );

  // Settings > Comportement's "confirm destructive actions" toggle, plus
  // its "stop confirming stops" sub-option (only meaningful when the
  // parent toggle is on - a stop is never confirmed with it off either
  // way).
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

  async function stop(id: string) {
    setBusy({ id, action: "stopping" });
    expectStop(id);
    await window.kiln.stop(id);
    // Wait for the polled list to actually reflect "exited" before
    // dropping the transition indicator - clearing it right away would
    // leave a stale "running" snapshot on screen for up to a full poll
    // interval, flashing green before the next tick corrects it to grey.
    await refetchContainers();
    setBusy(null);
  }
  async function start(id: string) {
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
  // Safe to run back-to-back with no delay: kilnd's stop only returns
  // once the container's cgroup is confirmed empty (SIGTERM, then
  // SIGKILL after a grace period if needed - see stop.rs), never while
  // the old process might still be exiting.
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

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { groups: allGroups, standalone: allStandalone } = groupByProject(containers ?? []);
  const q = search.trim().toLowerCase();
  const groups = q ? allGroups.filter((g) => g.project.toLowerCase().includes(q) || g.containers.some((c) => c.image.toLowerCase().includes(q))) : allGroups;
  const standalone = q ? allStandalone.filter((c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)) : allStandalone;
  const selectedStandalone = standalone.filter((c) => selected.has(c.id));

  // Deliberately looked up from the *unfiltered* lists - a detail view,
  // once open, shouldn't disappear just because the search box (not
  // rendered on this branch at all) happens to hold text that no longer
  // matches it.
  //
  // If the open project's last container just disappeared (e.g. removed
  // elsewhere), there's no group left to show - fall through to the list
  // instead of rendering a detail view for a project that no longer exists.
  const openGroup = openProject ? allGroups.find((g) => g.project === openProject) : undefined;
  if (openGroup) {
    return (
      <ProjectDetailView
        project={openGroup.project}
        containers={openGroup.containers}
        onBack={() => setOpenProject(null)}
        refetchContainers={refetchContainers}
      />
    );
  }
  // A standalone container (not part of any kiln-compose project) has no
  // group to look up by name - openProject holds its id instead in that
  // case, so it can't collide with an actual project name. Reuses
  // ProjectDetailView as a one-item "project" - same log panel, same
  // start/stop/remove, no separate component needed.
  const openStandalone = openProject ? allStandalone.find((c) => c.id === openProject) : undefined;
  if (openStandalone) {
    return (
      <ProjectDetailView
        project={openStandalone.name}
        containers={[openStandalone]}
        onBack={() => setOpenProject(null)}
        refetchContainers={refetchContainers}
      />
    );
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Containers</h1>
        <button className="primary" onClick={() => setShowNewContainer(true)}>
          + New container
        </button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <SearchIcon />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or image…" />
        </div>
        {selectedStandalone.length > 0 && (
          <div className="bulk-bar">
            <span className="muted">{selectedStandalone.length} selected</span>
            <button onClick={() => selectedStandalone.filter((c) => c.status !== "running").forEach((c) => start(c.id))}>Start</button>
            <button onClick={() => confirmStop(`Stop ${selectedStandalone.length} selected container(s)?`, () => selectedStandalone.filter((c) => c.status === "running").forEach((c) => stop(c.id)))}>
              Stop
            </button>
            <button
              className="danger"
              onClick={() =>
                confirmRemove(`Remove ${selectedStandalone.length} selected container(s)?`, () => {
                  selectedStandalone.forEach((c) => remove(c.id));
                  setSelected(new Set());
                })
              }
            >
              Remove
            </button>
          </div>
        )}
      </div>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}
      {!error && containers && containers.length > 0 && groups.length === 0 && standalone.length === 0 && (
        <div className="empty-state">No containers match "{search}".</div>
      )}
      {!error && (!containers || containers.length === 0) && (
        <div className="empty-state">No containers yet - start one with `kiln run` or `kiln-compose up`.</div>
      )}
      {containers && containers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Name</th>
              <th>Image</th>
              <th>Status</th>
              <th>CPU (ms)</th>
              <th>Memory</th>
              <th>Network</th>
              <th>IP</th>
              <th>Command</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const running = g.containers.filter((c) => c.status === "running");
              const totalCpu = g.containers.reduce((sum, c) => sum + (statsMap[c.id]?.cpu_usage_usec ?? 0), 0);
              const totalMem = g.containers.reduce((sum, c) => sum + (statsMap[c.id]?.memory_current_bytes ?? 0), 0);
              const totalRx = g.containers.reduce((sum, c) => sum + (statsMap[c.id]?.rx_bytes ?? 0), 0);
              const totalTx = g.containers.reduce((sum, c) => sum + (statsMap[c.id]?.tx_bytes ?? 0), 0);
              const anyBusy = g.containers.some((c) => busy?.id === c.id);
              // Worst-first, like `aggregateHealth` above: any container
              // mid-stop reads as "stopping" for the whole group even if
              // others are already settled, since that's the transition
              // actually still in flight.
              const groupTransition = g.containers.some((c) => busy?.id === c.id && busy.action === "stopping")
                ? "stopping"
                : g.containers.some((c) => busy?.id === c.id && busy.action === "launching")
                  ? "launching"
                  : null;
              const waitingHere = waitingForProject(composeWaiting ?? [], g.project);
              return (
                <tr key={`group:${g.project}`} className="group-row" onClick={() => setOpenProject(g.project)}>
                  <td></td>
                  <td>
                    <span className="chevron">›</span>
                    <span className={`status-dot ${groupTransition ?? (running.length > 0 ? "running" : "exited")}`} />
                    {g.project}
                  </td>
                  <td className="muted">
                    {g.containers.length} service{g.containers.length === 1 ? "" : "s"}
                    {waitingHere.length > 0 && ` (+${waitingHere.length} waiting)`}
                  </td>
                  <td>
                    <span className={`badge ${running.length > 0 ? "running" : "exited"}`}>
                      {running.length}/{g.containers.length} running
                    </span>{" "}
                    <HealthBadge health={aggregateHealth(g.containers)} />
                    {waitingHere.map((w) => (
                      <span
                        key={w.container_name}
                        className="badge waiting"
                        title={`${w.container_name.slice(g.project.length + 1)} is waiting for ${w.waiting_for} to become healthy before starting`}
                        style={{ marginLeft: 6 }}
                      >
                        ⏳ waiting for {w.waiting_for}
                      </span>
                    ))}
                  </td>
                  <td>{totalCpu > 0 ? (totalCpu / 1000).toFixed(0) : "-"}</td>
                  <td>{totalMem > 0 ? formatBytes(totalMem) : "-"}</td>
                  <td className="mono muted">{totalRx > 0 || totalTx > 0 ? `↓${formatBytes(totalRx)} ↑${formatBytes(totalTx)}` : "-"}</td>
                  <td className="mono muted">-</td>
                  <td className="mono muted">-</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {anyBusy ? (
                      <span className="muted">
                        <span className="spinner" />
                        working…
                      </span>
                    ) : (
                      <>
                        {running.length < g.containers.length && (
                          <button
                            className="icon-btn"
                            title="Start"
                            onClick={() => g.containers.filter((c) => c.status !== "running").forEach((c) => start(c.id))}
                          >
                            <PlayIcon />
                          </button>
                        )}
                        {running.length > 0 && (
                          <button
                            className="icon-btn"
                            title="Stop"
                            onClick={() =>
                              confirmStop(`Stop all in "${g.project}"?`, () => running.forEach((c) => stop(c.id)))
                            }
                          >
                            <StopIcon />
                          </button>
                        )}
                        {running.length > 0 && (
                          <button className="icon-btn" title="Restart" onClick={() => running.forEach((c) => restart(c.id))}>
                            <RestartIcon />
                          </button>
                        )}
                        <button
                          className="icon-btn danger"
                          title="Remove"
                          onClick={() =>
                            confirmRemove(
                              `Remove all ${g.containers.length} service${g.containers.length === 1 ? "" : "s"} in "${g.project}"?`,
                              () => g.containers.forEach((c) => remove(c.id)),
                            )
                          }
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {standalone.map((c) => {
              const s = statsMap[c.id];
              const running = c.status === "running";
              const transition = busy?.id === c.id ? busy.action : null;
              return (
                <tr key={c.id} onClick={() => setOpenProject(c.id)} style={{ cursor: "pointer" }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                  </td>
                  <td>
                    {c.name}
                    <div className="muted mono">{c.id.slice(0, 12)}</div>
                  </td>
                  <td>{c.image}</td>
                  <td>
                    <span className={`badge ${transition ?? (running ? "running" : "exited")}`}>{transition ? `${transition}…` : c.status}</span>{" "}
                    <HealthBadge health={c.health} />
                  </td>
                  <td>{s ? (s.cpu_usage_usec / 1000).toFixed(0) : "-"}</td>
                  <td>{s ? formatBytes(s.memory_current_bytes) : "-"}</td>
                  <td className="mono muted">{s && (s.rx_bytes || s.tx_bytes) ? `↓${formatBytes(s.rx_bytes ?? 0)} ↑${formatBytes(s.tx_bytes ?? 0)}` : "-"}</td>
                  <td className="mono">{c.ip ?? "-"}</td>
                  <td className="mono muted">{c.command.join(" ").slice(0, 40)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {busy?.id === c.id ? (
                      <span className="muted">
                        <span className="spinner" />
                        working…
                      </span>
                    ) : (
                      <>
                        {!running && (
                          <button className="icon-btn" title="Start" onClick={() => start(c.id)}>
                            <PlayIcon />
                          </button>
                        )}
                        {running && (
                          <button className="icon-btn" title="Stop" onClick={() => confirmStop(`Stop "${c.name}"?`, () => stop(c.id))}>
                            <StopIcon />
                          </button>
                        )}
                        {running && (
                          <button className="icon-btn" title="Restart" onClick={() => restart(c.id)}>
                            <RestartIcon />
                          </button>
                        )}
                        <button className="icon-btn" title="Edit limits" onClick={() => setEditLimits(c)}>
                          <GaugeIcon />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Remove"
                          onClick={() => confirmRemove(`Remove "${c.name}"?`, () => remove(c.id))}
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {confirm && (
        <ConfirmDialog message={confirm.message} confirmLabel={confirm.confirmLabel} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />
      )}
      {showNewContainer && (
        <NewContainerModal onClose={() => setShowNewContainer(false)} onCreated={() => {}} />
      )}
      {editLimits && <EditLimitsModal container={editLimits} onClose={() => setEditLimits(null)} onUpdated={() => {}} />}
    </div>
  );
}
