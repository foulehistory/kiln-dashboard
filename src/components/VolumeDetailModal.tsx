import { useState } from "react";
import { formatBytes } from "../format";
import VolumeFileBrowser from "./VolumeFileBrowser";
import type { VolumeInfo } from "../types";

export default function VolumeDetailModal({ volume, onClose }: { volume: VolumeInfo; onClose: () => void }) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    </div>
  );
}
