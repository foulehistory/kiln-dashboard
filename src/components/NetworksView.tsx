import { useEffect, useRef, useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import { useSettings } from "../settings/SettingsContext";
import type { FlowEvent, NetworkContainer } from "../types";

const MAX_FLOW_ROWS = 100;

interface FlowRow {
  containerName: string;
  event: FlowEvent;
}

/** Live per-packet flows for one network's containers - each attached
 * container gets its own `network-events` session (see
 * `kilnd/src/handlers/network_events.rs`'s own docs on why this is a
 * per-container stream, not a per-network one: the eBPF observer attaches
 * to a specific container's veth). Sessions are opened when `containers`
 * first becomes non-empty and closed on unmount/toggle-off - never
 * left running past that, since this is opt-in kernel-space
 * instrumentation, not a background feature. */
function useLiveFlows(containers: NetworkContainer[], enabled: boolean) {
  const [rows, setRows] = useState<FlowRow[]>([]);
  const containerNameBySession = useRef(new Map<number, string>());

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }

    let cancelled = false;
    const sessionIds: number[] = [];

    for (const c of containers) {
      window.kiln.netEventsStart(c.id).then((sessionId) => {
        if (cancelled) {
          window.kiln.netEventsClose(sessionId);
          return;
        }
        containerNameBySession.current.set(sessionId, c.name);
        sessionIds.push(sessionId);
      });
    }

    const offData = window.kiln.onNetEventsData(({ sessionId, event }) => {
      const containerName = containerNameBySession.current.get(sessionId);
      if (!containerName) return;
      setRows((prev) => [{ containerName, event }, ...prev].slice(0, MAX_FLOW_ROWS));
    });
    const offClosed = window.kiln.onNetEventsClosed(({ sessionId }) => {
      containerNameBySession.current.delete(sessionId);
    });

    return () => {
      cancelled = true;
      offData();
      offClosed();
      for (const id of sessionIds) window.kiln.netEventsClose(id);
      containerNameBySession.current.clear();
    };
  }, [enabled, containers.map((c) => c.id).join(",")]);

  return rows;
}

function LiveFlowsPanel({ containers, enabled }: { containers: NetworkContainer[]; enabled: boolean }) {
  const rows = useLiveFlows(containers, enabled);
  if (!enabled) return null;
  return (
    <div className="mono" style={{ marginTop: 12, maxHeight: 220, overflowY: "auto", fontSize: 12 }}>
      {rows.length === 0 && <div className="muted">Waiting for traffic…</div>}
      {rows.map((r, i) => (
        <div key={i} className="muted">
          <span style={{ color: "var(--fg)" }}>{r.containerName}</span> {r.event.to_container ? "←" : "→"} {r.event.protocol}{" "}
          {r.event.src} → {r.event.dst} ({r.event.bytes}B)
        </div>
      ))}
    </div>
  );
}

async function fetchNetworks() {
  const r = await window.kiln.networks();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

function extractError(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  return `failed (status ${status})`;
}

export default function NetworksView() {
  const { settings } = useSettings();
  const { data: networks, error } = usePolling(fetchNetworks, settings.behavior.pollingIntervalMs);
  const [newName, setNewName] = useState("");
  const [newSubnet, setNewSubnet] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveNetwork, setLiveNetwork] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setActionError(null);
    const r = await window.kiln.createNetwork(newName.trim(), newSubnet.trim() || undefined);
    setCreating(false);
    if (r.status !== 201) {
      setActionError(extractError(r.body, r.status));
      return;
    }
    setNewName("");
    setNewSubnet("");
  }

  async function remove(name: string) {
    setBusy(name);
    setActionError(null);
    const r = await window.kiln.removeNetwork(name);
    setBusy(null);
    if (r.status !== 200) {
      setActionError(extractError(r.body, r.status));
    }
  }

  return (
    <div>
      <h1>Networks</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}

      <form className="toolbar" onSubmit={create}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="network name" />
        <input value={newSubnet} onChange={(e) => setNewSubnet(e.target.value)} placeholder="subnet (optional, e.g. 172.30.0.0/24)" />
        <button type="submit" className="primary" disabled={creating || !newName.trim()}>
          {creating ? (
            <>
              <span className="spinner" />
              Creating…
            </>
          ) : (
            "+ Create network"
          )}
        </button>
      </form>
      {actionError && <div className="updates-error" style={{ marginBottom: 12 }}>{actionError}</div>}

      {!error && (!networks || networks.length === 0) && (
        <div className="empty-state">No networks yet - `kiln network create &lt;name&gt;`.</div>
      )}
      {networks?.map((net) => (
        <div className="card" key={net.name}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center" }}>
            <div>
              <strong>{net.name}</strong>
              <span className="muted mono"> {net.bridge}</span>
              <div className="muted">
                {net.subnet} · gateway {net.gateway}
              </div>
            </div>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                disabled={net.containers.length === 0}
                title={net.containers.length === 0 ? "No containers attached" : "Stream live per-packet flows (needs root/CAP_NET_ADMIN)"}
                onClick={() => setLiveNetwork(liveNetwork === net.name ? null : net.name)}
              >
                {liveNetwork === net.name ? "Stop live flows" : "Live flows"}
              </button>
              {busy === net.name ? (
                <span className="muted">
                  <span className="spinner" />
                  working…
                </span>
              ) : (
                <button
                  className="danger"
                  disabled={net.containers.length > 0}
                  title={net.containers.length > 0 ? "Remove attached containers first" : undefined}
                  onClick={() => (settings.behavior.confirmDestructive ? setConfirm(net.name) : remove(net.name))}
                >
                  Remove
                </button>
              )}
            </span>
          </div>
          <LiveFlowsPanel containers={net.containers} enabled={liveNetwork === net.name} />
          <div className="network-topology">
            <div className="network-node" style={{ borderColor: "var(--accent)" }}>
              🌉 {net.bridge}
              <div className="muted">{net.gateway}</div>
            </div>
            {net.containers.length === 0 && <span className="muted network-edge">no containers attached</span>}
            {net.containers.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span className="network-edge">──</span>
                <div className="network-node">
                  {c.name}
                  <div className="muted mono">{c.ip}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {confirm && (
        <ConfirmDialog message={`Remove network "${confirm}"?`} onConfirm={() => remove(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
