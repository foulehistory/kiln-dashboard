import { usePolling } from "../usePolling";

async function fetchNetworks() {
  const r = await window.kiln.networks();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

export default function NetworksView() {
  const { data: networks, error } = usePolling(fetchNetworks, 3000);

  return (
    <div>
      <h1>Networks</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}
      {!error && (!networks || networks.length === 0) && (
        <div className="empty-state">No networks yet - `kiln network create &lt;name&gt;`.</div>
      )}
      {networks?.map((net) => (
        <div className="card" key={net.name}>
          <div style={{ marginBottom: 12 }}>
            <strong>{net.name}</strong>
            <span className="muted mono"> {net.bridge}</span>
            <div className="muted">
              {net.subnet} · gateway {net.gateway}
            </div>
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
    </div>
  );
}
