import { useState } from "react";
import { usePolling } from "../usePolling";
import { groupByProject } from "../projects";
import { formatBytes } from "../format";
import ProjectDetailView from "./ProjectDetailView";
import ConfirmDialog from "./ConfirmDialog";
import NewContainerModal from "./NewContainerModal";
import EditLimitsModal from "./EditLimitsModal";
import { useSettings } from "../settings/SettingsContext";
import { PlayIcon, StopIcon, TrashIcon, RestartIcon, SearchIcon, GaugeIcon } from "./icons";
import type { ContainerInfo, Stats } from "../types";

async function fetchContainers() {
  const r = await window.kiln.containers();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(typeof r.body === "object" && r.body && "error" in r.body ? String((r.body as any).error) : `unexpected response (status ${r.status})`);
  }
  return r.body;
}

export default function ContainersView() {
  const { settings } = useSettings();
  const interval = settings.behavior.pollingIntervalMs;
  const { data: containers, error } = usePolling(fetchContainers, interval);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null);
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
    setConfirm({ message, action });
  }
  function confirmRemove(message: string, action: () => void) {
    if (!settings.behavior.confirmDestructive) {
      action();
      return;
    }
    setConfirm({ message, action });
  }

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
  // Safe to run back-to-back with no delay: kilnd's stop only returns
  // once the container's cgroup is confirmed empty (SIGTERM, then
  // SIGKILL after a grace period if needed - see stop.rs), never while
  // the old process might still be exiting.
  async function restart(id: string) {
    setBusy(id);
    await window.kiln.stop(id);
    await window.kiln.startExisting(id);
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
    return <ProjectDetailView project={openGroup.project} containers={openGroup.containers} onBack={() => setOpenProject(null)} />;
  }
  // A standalone container (not part of any kiln-compose project) has no
  // group to look up by name - openProject holds its id instead in that
  // case, so it can't collide with an actual project name. Reuses
  // ProjectDetailView as a one-item "project" - same log panel, same
  // start/stop/remove, no separate component needed.
  const openStandalone = openProject ? allStandalone.find((c) => c.id === openProject) : undefined;
  if (openStandalone) {
    return <ProjectDetailView project={openStandalone.name} containers={[openStandalone]} onBack={() => setOpenProject(null)} />;
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
              const anyBusy = g.containers.some((c) => busy === c.id);
              return (
                <tr key={`group:${g.project}`} className="group-row" onClick={() => setOpenProject(g.project)}>
                  <td></td>
                  <td>
                    <span className="chevron">›</span>
                    <span className={`status-dot ${running.length > 0 ? "running" : "exited"}`} />
                    {g.project}
                  </td>
                  <td className="muted">
                    {g.containers.length} service{g.containers.length === 1 ? "" : "s"}
                  </td>
                  <td>
                    <span className={`badge ${running.length > 0 ? "running" : "exited"}`}>
                      {running.length}/{g.containers.length} running
                    </span>
                  </td>
                  <td>{totalCpu > 0 ? (totalCpu / 1000).toFixed(0) : "-"}</td>
                  <td>{totalMem > 0 ? formatBytes(totalMem) : "-"}</td>
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
                    <span className={`badge ${running ? "running" : "exited"}`}>{c.status}</span>
                  </td>
                  <td>{s ? (s.cpu_usage_usec / 1000).toFixed(0) : "-"}</td>
                  <td>{s ? formatBytes(s.memory_current_bytes) : "-"}</td>
                  <td className="mono">{c.ip ?? "-"}</td>
                  <td className="mono muted">{c.command.join(" ").slice(0, 40)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {busy === c.id ? (
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
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
      {showNewContainer && (
        <NewContainerModal onClose={() => setShowNewContainer(false)} onCreated={() => {}} />
      )}
      {editLimits && <EditLimitsModal container={editLimits} onClose={() => setEditLimits(null)} onUpdated={() => {}} />}
    </div>
  );
}
