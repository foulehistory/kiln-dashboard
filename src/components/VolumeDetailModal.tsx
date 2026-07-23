import { useEffect, useState } from "react";
import { formatBytes } from "../format";
import VolumeFileBrowser from "./VolumeFileBrowser";
import ConfirmDialog from "./ConfirmDialog";
import type { VolumeInfo, VolumeSnapshotInfo } from "../types";

export default function VolumeDetailModal({ volume, onClose }: { volume: VolumeInfo; onClose: () => void }) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<VolumeSnapshotInfo[] | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  async function refetchSnapshots() {
    const r = await window.kiln.volumeSnapshots(volume.name);
    if (r.status === 200 && Array.isArray(r.body)) setSnapshots(r.body);
  }

  useEffect(() => {
    refetchSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume.name]);

  async function createSnapshot() {
    setSnapshotBusy(true);
    setSnapshotError(null);
    const r = await window.kiln.createVolumeSnapshot(volume.name);
    setSnapshotBusy(false);
    if (r.status !== 201 || typeof r.body === "string") {
      setSnapshotError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
      return;
    }
    await refetchSnapshots();
  }

  async function restoreSnapshot(id: string) {
    setSnapshotBusy(true);
    setSnapshotError(null);
    const r = await window.kiln.restoreVolumeSnapshot(volume.name, id);
    setSnapshotBusy(false);
    if (r.status !== 200 || typeof r.body === "string") {
      setSnapshotError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
    }
  }

  async function openInExplorer() {
    setOpening(true);
    setOpenError(null);
    const r = await window.kiln.openVolumeFolder(volume.host_path);
    setOpening(false);
    if (!r.ok) setOpenError(r.error ?? "failed to open");
  }

  async function exportVolume() {
    setExporting(true);
    setExportError(null);
    const r = await window.kiln.exportVolume(volume.name);
    setExporting(false);
    if (!r.ok && r.error) setExportError(r.error);
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box modal-volume" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{volume.name}</h2>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label">Size</label>
            <div>{formatBytes(volume.size_bytes)}</div>
          </div>

          <div className="form-field">
            <label className="form-label">Used by</label>
            <div>{volume.containers.length === 0 ? <span className="muted">not attached to any container</span> : volume.containers.join(", ")}</div>
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">Host path (inside WSL2)</label>
          <div className="mono muted" style={{ wordBreak: "break-all" }}>
            {volume.host_path}
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">Files</label>
          <VolumeFileBrowser volumeName={volume.name} />
        </div>

        <div className="form-field">
          <label className="form-label">
            Snapshots
            <span className="muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11.5 }}>
              — a plain timestamped copy, not an atomic filesystem-level snapshot
            </span>
          </label>
          {snapshotError && <div className="updates-error" style={{ marginBottom: 8 }}>{snapshotError}</div>}
          {snapshots && snapshots.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No snapshots yet.</div>}
          {snapshots && snapshots.length > 0 && (
            <table style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th>Taken</th>
                  <th>Size</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(Number(s.id.split("-")[0]) * 1000).toLocaleString()}</td>
                    <td className="muted">{formatBytes(s.size_bytes)}</td>
                    <td>
                      <button disabled={snapshotBusy} onClick={() => setConfirmRestore(s.id)}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button onClick={createSnapshot} disabled={snapshotBusy}>
            {snapshotBusy ? (
              <>
                <span className="spinner" />
                Working…
              </>
            ) : (
              "+ Snapshot now"
            )}
          </button>
        </div>

        {openError && <div className="updates-error" style={{ marginBottom: 10 }}>{openError}</div>}
        {exportError && <div className="updates-error" style={{ marginBottom: 10 }}>{exportError}</div>}
        <div className="confirm-actions">
          <button onClick={onClose}>Close</button>
          <button onClick={exportVolume} disabled={exporting}>
            {exporting ? (
              <>
                <span className="spinner" />
                Exporting…
              </>
            ) : (
              "Export…"
            )}
          </button>
          <button className="primary" onClick={openInExplorer} disabled={opening}>
            {opening ? (
              <>
                <span className="spinner" />
                Opening…
              </>
            ) : (
              "Open in Explorer"
            )}
          </button>
        </div>
      </div>
      {confirmRestore && (
        <ConfirmDialog
          message={`Restore "${volume.name}" to the snapshot from ${new Date(Number(confirmRestore.split("-")[0]) * 1000).toLocaleString()}? Anything written to this volume since then will be lost.`}
          confirmLabel="Restore"
          onConfirm={() => {
            const id = confirmRestore;
            setConfirmRestore(null);
            restoreSnapshot(id);
          }}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </div>
  );
}
