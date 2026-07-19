import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import VolumeDetailModal from "./VolumeDetailModal";
import { formatBytes } from "../format";
import { useSettings } from "../settings/SettingsContext";
import { SearchIcon } from "./icons";
import type { VolumeInfo } from "../types";

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
  const { settings } = useSettings();
  const { data: volumes, error } = usePolling(fetchVolumes, settings.behavior.pollingIntervalMs);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detail, setDetail] = useState<VolumeInfo | null>(null);
  const [search, setSearch] = useState("");

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

  // Reuses the "volume name" field as the target name for the restored
  // volume - kilnd's import always creates a brand new volume (refuses to
  // overwrite an existing one), same as `create` above.
  async function importVolume() {
    if (!newName.trim()) return;
    setImporting(true);
    setActionError(null);
    const r = await window.kiln.importVolume(newName.trim());
    setImporting(false);
    if (!r.ok) {
      if (r.error) setActionError(r.error);
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
        <button type="submit" className="primary" disabled={creating || importing || !newName.trim()}>
          {creating ? (
            <>
              <span className="spinner" />
              Creating…
            </>
          ) : (
            "+ Create volume"
          )}
        </button>
        <button type="button" onClick={importVolume} disabled={creating || importing || !newName.trim()} title="Restore a volume previously exported with Export…">
          {importing ? (
            <>
              <span className="spinner" />
              Importing…
            </>
          ) : (
            "Import from backup…"
          )}
        </button>
      </form>
      {actionError && <div className="updates-error" style={{ marginBottom: 12 }}>{actionError}</div>}

      {volumes && volumes.length > 0 && (
        <div className="toolbar">
          <div className="search-box">
            <SearchIcon />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name…" />
          </div>
        </div>
      )}
      {!error && (!volumes || volumes.length === 0) && (
        <div className="empty-state">No volumes yet - `kiln volume create &lt;name&gt;`.</div>
      )}
      {volumes && volumes.length > 0 && filteredVolumes(volumes, search).length === 0 && (
        <div className="empty-state">No volumes match "{search}".</div>
      )}
      {volumes && filteredVolumes(volumes, search).length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Used by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredVolumes(volumes, search).map((v) => (
              <tr key={v.name} onClick={() => setDetail(v)} style={{ cursor: "pointer" }}>
                <td className="mono">{v.name}</td>
                <td className="muted">{formatBytes(v.size_bytes)}</td>
                <td className="muted">
                  {v.containers.length === 0 ? "-" : v.containers.join(", ")}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
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
                      onClick={() => (settings.behavior.confirmDestructive ? setConfirm(v.name) : remove(v.name))}
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
      {detail && <VolumeDetailModal volume={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function filteredVolumes(volumes: VolumeInfo[], search: string): VolumeInfo[] {
  const q = search.trim().toLowerCase();
  if (!q) return volumes;
  return volumes.filter((v) => v.name.toLowerCase().includes(q));
}
