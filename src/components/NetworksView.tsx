import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";

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
  const { data: networks, error } = usePolling(fetchNetworks, 3000);
  const [newName, setNewName] = useState("");
  const [newSubnet, setNewSubnet] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
            <span style={{ marginLeft: "auto" }}>
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
                  onClick={() => setConfirm(net.name)}
                >
                  Remove
                </button>
              )}
            </span>
          </div>
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
