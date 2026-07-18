import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";

async function fetchVolumes() {
  const r = await window.kiln.volumes();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

function extractError(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  return `failed (status ${status})`;
}

export default function VolumesView() {
  const { data: volumes, error } = usePolling(fetchVolumes, 3000);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setActionError(null);
    const r = await window.kiln.createVolume(newName.trim());
    setCreating(false);
    if (r.status !== 201) {
      setActionError(extractError(r.body, r.status));
      return;
    }
    setNewName("");
  }

  async function remove(name: string) {
    setBusy(name);
    setActionError(null);
    const r = await window.kiln.removeVolume(name);
    setBusy(null);
    if (r.status !== 200) {
      setActionError(extractError(r.body, r.status));
    }
  }

  return (
    <div>
      <h1>Volumes</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}

      <form className="toolbar" onSubmit={create}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="volume name" />
        <button type="submit" className="primary" disabled={creating || !newName.trim()}>
          {creating ? (
            <>
              <span className="spinner" />
              Creating…
            </>
          ) : (
            "+ Create volume"
          )}
        </button>
      </form>
      {actionError && <div className="updates-error" style={{ marginBottom: 12 }}>{actionError}</div>}

      {!error && (!volumes || volumes.length === 0) && (
        <div className="empty-state">No volumes yet - `kiln volume create &lt;name&gt;`.</div>
      )}
      {volumes && volumes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Used by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {volumes.map((v) => (
              <tr key={v.name}>
                <td className="mono">{v.name}</td>
                <td className="muted">
                  {v.containers.length === 0 ? "-" : v.containers.join(", ")}
                </td>
                <td>
                  {busy === v.name ? (
                    <span className="muted">
                      <span className="spinner" />
                      working…
                    </span>
                  ) : (
                    <button
                      className="danger"
                      disabled={v.containers.length > 0}
                      title={v.containers.length > 0 ? "Remove attached containers first" : undefined}
                      onClick={() => setConfirm(v.name)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {confirm && (
        <ConfirmDialog message={`Remove volume "${confirm}"?`} onConfirm={() => remove(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
