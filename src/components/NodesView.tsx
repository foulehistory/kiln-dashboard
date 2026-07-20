import { usePolling } from "../usePolling";
import { useSettings } from "../settings/SettingsContext";
import type { NodeInfo } from "../types";

async function fetchNodes() {
  const r = await window.kiln.nodes();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

/** Read-only: `kiln node add`/`rm` stay CLI-only for now (see
 * kiln-cli/src/commands/node.rs's own docs on the multi-host MVP's
 * scope) - this view exists so a node registered from the CLI is at
 * least visible, and its reachability confirmable, without leaving the
 * dashboard. */
export default function NodesView() {
  const { settings } = useSettings();
  const { data: nodes, error } = usePolling(fetchNodes, settings.behavior.pollingIntervalMs);

  return (
    <div>
      <h1>Nodes</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 12 }}>
        Remote hosts registered for kiln-compose's <code>node:</code> dispatch. Managed via{" "}
        <code>kiln node add/ls/rm</code> - see SECURITY.md for what the bearer token each node needs actually protects.
      </div>

      {!error && (!nodes || nodes.length === 0) && (
        <div className="empty-state">No nodes registered - `kiln node add &lt;name&gt; &lt;host:port&gt; --token &lt;token&gt;`.</div>
      )}

      {nodes && nodes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Reachable</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n: NodeInfo) => (
              <tr key={n.name}>
                <td>{n.name}</td>
                <td className="mono">{n.address}</td>
                <td>
                  <span className={`badge ${n.reachable ? "running" : "exited"}`}>{n.reachable ? "yes" : "no"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
