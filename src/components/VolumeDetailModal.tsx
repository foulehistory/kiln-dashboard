import { formatBytes } from "../format";
import type { VolumeInfo } from "../types";

export default function VolumeDetailModal({ volume, onClose }: { volume: VolumeInfo; onClose: () => void }) {
  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{volume.name}</h2>

        <div className="form-field">
          <label className="form-label">Size</label>
          <div>{formatBytes(volume.size_bytes)}</div>
        </div>

        <div className="form-field">
          <label className="form-label">Used by</label>
          <div>{volume.containers.length === 0 ? <span className="muted">not attached to any container</span> : volume.containers.join(", ")}</div>
        </div>

        <div className="form-field">
          <label className="form-label">Host path (inside WSL2)</label>
          <div className="mono muted" style={{ wordBreak: "break-all" }}>
            {volume.host_path}
          </div>
        </div>

        <div className="confirm-actions">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={() => window.kiln.openVolumeFolder(volume.host_path)}>
            Open in Explorer
          </button>
        </div>
      </div>
    </div>
  );
}
