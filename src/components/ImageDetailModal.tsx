import { useEffect, useState } from "react";
import { formatBytes } from "../format";
import type { ImageDetail } from "../types";

/** No build *history* here on purpose, not an oversight: kiln-image's
 * layer format deliberately never records which Kilnfile instruction
 * produced which layer (see kiln-image/src/layer.rs's "reproducibility
 * by omission" docs - no instruction text, no timestamps, nothing that
 * isn't actual file content/metadata). This shows the real layer stack
 * and image config instead of inventing history that was never
 * captured. */
export default function ImageDetailModal({ imageId, label, onClose }: { imageId: string; label: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.kiln.inspectImage(imageId).then((r) => {
      if (cancelled) return;
      if (r.status !== 200 || typeof r.body === "string") {
        setError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
        return;
      }
      setDetail(r.body);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box modal-volume" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{label}</h2>

        {error && <div className="updates-error">{error}</div>}
        {!error && !detail && <div className="muted">Loading…</div>}

        {detail && (
          <>
            <div className="form-row">
              <div className="form-field">
                <label className="form-label">Command</label>
                <div className="mono">{detail.cmd ?? <span className="muted">(none)</span>}</div>
              </div>
              <div className="form-field">
                <label className="form-label">Workdir</label>
                <div className="mono">{detail.workdir || "/"}</div>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Exposed ports</label>
              <div>
                {detail.exposed_ports.length === 0 ? (
                  <span className="muted">none</span>
                ) : (
                  detail.exposed_ports.map(([port, proto]) => (
                    <span key={`${port}/${proto}`} className="mono muted" style={{ marginRight: 10 }}>
                      {port}/{proto}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Environment</label>
              <div>
                {detail.env.length === 0 ? (
                  <span className="muted">none</span>
                ) : (
                  detail.env.map(([k, v]) => (
                    <div key={k} className="mono muted">
                      {k}={v}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Layers ({detail.layers.length}, base → top)</label>
              <div className="image-layers">
                {detail.layers.map((l, i) => (
                  <div key={l.hash} className="image-layer-row">
                    <span className="muted mono">{i}</span>
                    <span className="mono">{l.hash.slice(0, 16)}</span>
                    <span className="muted">
                      {l.entry_count} file{l.entry_count === 1 ? "" : "s"}
                    </span>
                    <span className="muted mono">{formatBytes(l.size_bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="confirm-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
