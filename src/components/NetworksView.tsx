import { useEffect, useRef, useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import { useSettings } from "../settings/SettingsContext";
import type { FlowEvent, NetworkContainer, NetworkInfo } from "../types";

const MAX_FLOW_ROWS = 100;
/** How long an edge stays visible (fading out) in the graph view after
 * its flow was observed - short enough that the graph reads as "live",
 * long enough that a normal request/response pair's flows overlap
 * rather than flickering in and out one at a time. */
const EDGE_FADE_MS = 4000;

interface FlowRow {
  containerName: string;
  event: FlowEvent;
  /** Client-side receive time (`FlowEvent` itself carries no timestamp) -
   * only used to fade edges out in the graph view; the list view doesn't
   * need it. */
  receivedAt: number;
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
      setRows((prev) => [{ containerName, event, receivedAt: Date.now() }, ...prev].slice(0, MAX_FLOW_ROWS));
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

function LiveFlowsList({ rows }: { rows: FlowRow[] }) {
  return (
    <div className="mono" style={{ marginTop: 12, maxHeight: 220, overflowY: "auto", fontSize: 12 }}>
      {rows.length === 0 && <div className="muted">Waiting for traffic…</div>}
      {rows.map((r, i) => (
        <div key={i} className="muted">
          <span style={{ color: "var(--text)" }}>{r.containerName}</span> {r.event.to_container ? "←" : "→"} {r.event.protocol}{" "}
          {r.event.src} → {r.event.dst} ({r.event.bytes}B)
        </div>
      ))}
    </div>
  );
}

/** Strips a trailing `:<port>` off an address string - `FlowEvent.src`/
 * `dst` are host:port pairs, but graph nodes are matched by bare IP.
 * Deliberately last-colon-based (not IPv6-aware): every address this
 * project's own eBPF observer emits is IPv4 (see `kiln-net-bpf`'s own
 * scope), so this is enough for what's actually on the wire here. */
function stripPort(addr: string): string {
  const i = addr.lastIndexOf(":");
  return i === -1 ? addr : addr.slice(0, i);
}

const GRAPH_SIZE = 320;
const GRAPH_CENTER = GRAPH_SIZE / 2;
const CONTAINER_RADIUS = 110;
const EXTERNAL_NODE = "external";
const BRIDGE_NODE = "bridge";

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: "bridge" | "container" | "external";
}

interface GraphEdge {
  key: string;
  from: string;
  to: string;
  age: number;
  bytes: number;
  protocol: string;
}

/** Nodes are laid out on a fixed circle around the bridge (no
 * force-directed layout - a handful of containers per network doesn't
 * need one, and a fixed layout means nodes don't jitter around as flows
 * come and go). The external node - traffic to/from an address that
 * isn't the bridge or any attached container - only appears once at
 * least one such flow has actually been observed, so a network with no
 * outbound traffic doesn't show a permanently dangling node. */
function layoutNodes(containers: NetworkContainer[], hasExternalTraffic: boolean): GraphNode[] {
  const nodes: GraphNode[] = [{ id: BRIDGE_NODE, label: "bridge", x: GRAPH_CENTER, y: GRAPH_CENTER, kind: "bridge" }];
  const count = containers.length;
  containers.forEach((c, i) => {
    const angle = (i / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2;
    nodes.push({
      id: c.id,
      label: c.name,
      x: GRAPH_CENTER + CONTAINER_RADIUS * Math.cos(angle),
      y: GRAPH_CENTER + CONTAINER_RADIUS * Math.sin(angle),
      kind: "container",
    });
  });
  if (hasExternalTraffic) {
    nodes.push({ id: EXTERNAL_NODE, label: "internet", x: GRAPH_CENTER, y: 16, kind: "external" });
  }
  return nodes;
}

/** Resolves a flow's *other* endpoint (the address that isn't the
 * observing container itself) to a graph node id - the network's own
 * gateway IP, another attached container's IP, or the catch-all external
 * node for anything else (a public address, a different Docker-style
 * bridge, etc). */
function resolveEndpoint(addr: string, gateway: string, containers: NetworkContainer[]): string {
  const ip = stripPort(addr);
  if (ip === stripPort(gateway)) return BRIDGE_NODE;
  const match = containers.find((c) => c.ip === ip);
  return match ? match.id : EXTERNAL_NODE;
}

function FlowGraph({ net, rows, now }: { net: NetworkInfo; rows: FlowRow[]; now: number }) {
  const recent = rows.filter((r) => now - r.receivedAt < EDGE_FADE_MS);

  const edgesByPair = new Map<string, GraphEdge>();
  for (const r of recent) {
    const container = net.containers.find((c) => c.name === r.containerName);
    if (!container) continue;
    const otherAddr = r.event.to_container ? r.event.src : r.event.dst;
    const other = resolveEndpoint(otherAddr, net.gateway, net.containers);
    const key = [container.id, other].sort().join("|");
    const age = now - r.receivedAt;
    const existing = edgesByPair.get(key);
    if (!existing || age < existing.age) {
      edgesByPair.set(key, { key, from: container.id, to: other, age, bytes: r.event.bytes, protocol: r.event.protocol });
    }
  }
  const edges = [...edgesByPair.values()];
  const hasExternalTraffic = edges.some((e) => e.from === EXTERNAL_NODE || e.to === EXTERNAL_NODE);
  const nodes = layoutNodes(net.containers, hasExternalTraffic);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
      width={GRAPH_SIZE}
      height={GRAPH_SIZE}
      className="flow-graph"
      role="img"
      aria-label={`Live traffic graph for ${net.name}`}
    >
      {edges.map((e) => {
        const from = nodeById.get(e.from);
        const to = nodeById.get(e.to);
        if (!from || !to) return null;
        const opacity = Math.max(0, 1 - e.age / EDGE_FADE_MS);
        return (
          <line
            key={e.key}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="flow-graph-edge"
            style={{ opacity }}
            strokeWidth={e.protocol === "tcp" ? 2 : 1.5}
          >
            <title>
              {from.label} ↔ {to.label} ({e.protocol}, {e.bytes}B)
            </title>
          </line>
        );
      })}
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
          <circle r={n.kind === "bridge" ? 20 : 16} className={`flow-graph-node flow-graph-node-${n.kind}`} />
          <title>{n.label}</title>
          <text y={n.kind === "bridge" ? 34 : 30} textAnchor="middle" className="flow-graph-label">
            {n.label.length > 12 ? `${n.label.slice(0, 11)}…` : n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

type FlowView = "list" | "graph";

/** Owns the one `useLiveFlows` subscription for this network and lets
 * the caller pick which rendering of it to show - list (the original,
 * kept as-is and as the default) or graph. Both views read the exact
 * same `rows`, so toggling between them never opens a second live
 * session for the same containers. */
function LiveFlowsPanel({ net, enabled }: { net: NetworkInfo; enabled: boolean }) {
  const rows = useLiveFlows(net.containers, enabled);
  const [view, setView] = useState<FlowView>("list");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || view !== "graph") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [enabled, view]);

  if (!enabled) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <button className={view === "list" ? "primary" : undefined} onClick={() => setView("list")}>
          List
        </button>
        <button className={view === "graph" ? "primary" : undefined} onClick={() => setView("graph")}>
          Graph
        </button>
      </div>
      {view === "list" ? <LiveFlowsList rows={rows} /> : <FlowGraph net={net} rows={rows} now={now} />}
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
          <LiveFlowsPanel net={net} enabled={liveNetwork === net.name} />
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
