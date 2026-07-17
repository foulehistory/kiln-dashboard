import { useState } from "react";
import { usePolling } from "../usePolling";
import { groupByProject } from "../projects";
import { formatBytes } from "../format";
import ProjectDetailView from "./ProjectDetailView";
import type { ContainerInfo, Stats } from "../types";

async function fetchContainers() {
  const r = await window.kiln.containers();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(typeof r.body === "object" && r.body && "error" in r.body ? String((r.body as any).error) : `unexpected response (status ${r.status})`);
  }
  return r.body;
}

export default function ContainersView() {
  const { data: containers, error } = usePolling(fetchContainers, 2000);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);

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
    2000,
    [runningIds],
  );

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

  const { groups, standalone } = groupByProject(containers ?? []);

  // If the open project's last container just disappeared (e.g. removed
  // elsewhere), there's no group left to show - fall through to the list
  // instead of rendering a detail view for a project that no longer exists.
  const openGroup = openProject ? groups.find((g) => g.project === openProject) : undefined;
  if (openGroup) {
    return <ProjectDetailView project={openGroup.project} containers={openGroup.containers} onBack={() => setOpenProject(null)} />;
  }

  return (
    <div>
      <h1>Containers</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}
      {!error && (!containers || containers.length === 0) && (
        <div className="empty-state">No containers yet - start one with `kiln run` or `kiln-compose up`.</div>
      )}
      {containers && containers.length > 0 && (
        <table>
          <thead>
            <tr>
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
                          <button onClick={() => g.containers.filter((c) => c.status !== "running").forEach((c) => start(c.id))}>
                            Start
                          </button>
                        )}
                        {running.length > 0 && <button onClick={() => running.forEach((c) => stop(c.id))}>Stop</button>}
                        <button className="danger" onClick={() => g.containers.forEach((c) => remove(c.id))}>
                          Remove
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
                <tr key={c.id}>
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
                  <td>
                    {busy === c.id ? (
                      <span className="muted">
                        <span className="spinner" />
                        working…
                      </span>
                    ) : (
                      <>
                        {!running && <button onClick={() => start(c.id)}>Start</button>}
                        {running && <button onClick={() => stop(c.id)}>Stop</button>}
                        <button className="danger" onClick={() => remove(c.id)}>
                          Remove
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
    </div>
  );
}
