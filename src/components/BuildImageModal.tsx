import { useState } from "react";
import type { BuildResult } from "../types";

/** Picks a Windows folder natively (Electron's own dialog), translates
 * it to the /mnt/<drive>/... path kilnd sees from inside WSL2 (see
 * main.js's windowsPathToWsl), then hands that straight to kilnd's
 * POST /images/build - same read-Kilnfile-then-build::build() call
 * `kiln build` itself makes. */
export default function BuildImageModal({ onClose, onBuilt }: { onClose: () => void; onBuilt: () => void }) {
  const [windowsPath, setWindowsPath] = useState("");
  const [wslPath, setWslPath] = useState("");
  const [kilnfilePath, setKilnfilePath] = useState("");
  const [tag, setTag] = useState("");
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFolder() {
    const picked = await window.kiln.pickBuildContext();
    if (!picked) return;
    setWindowsPath(picked.windowsPath);
    setWslPath(picked.wslPath);
  }

  async function build() {
    if (!wslPath) return;
    setBuilding(true);
    setResult(null);
    setError(null);
    const r = await window.kiln.buildImage(wslPath, kilnfilePath.trim() || undefined, tag.trim() || undefined);
    setBuilding(false);
    if (r.status !== 201 || typeof r.body === "string") {
      setError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
      return;
    }
    setResult(r.body);
    onBuilt();
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Build from Kilnfile</h2>

        <div className="form-field">
          <label className="form-label">Build context folder</label>
          <div className="list-row">
            <input value={windowsPath} readOnly placeholder="No folder chosen" />
            <button type="button" onClick={pickFolder}>
              Choose…
            </button>
          </div>
          {wslPath && (
            <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
              {wslPath}
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label">Kilnfile path (optional)</label>
            <input value={kilnfilePath} onChange={(e) => setKilnfilePath(e.target.value)} placeholder="Kilnfile" />
          </div>
          <div className="form-field">
            <label className="form-label">Tag (optional)</label>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. myapp:latest" />
          </div>
        </div>

        {error && <div className="updates-error" style={{ marginBottom: 10 }}>{error}</div>}

        {result && (
          <div className="image-layers" style={{ marginBottom: 10 }}>
            {result.steps.map((s, i) => (
              <div key={i} className="image-layer-row" style={{ gridTemplateColumns: "70px 1fr" }}>
                <span className="muted">{s.cached ? "CACHED" : "RUN"}</span>
                <span className="mono">{s.instruction}</span>
              </div>
            ))}
            <div className="image-layer-row" style={{ gridTemplateColumns: "1fr" }}>
              <span className="muted">
                Built {result.image_id.slice(0, 16)}
                {result.tagged ? ` · tagged ${result.tagged}` : ""}
              </span>
            </div>
          </div>
        )}

        <div className="confirm-actions">
          <button onClick={onClose}>{result ? "Close" : "Cancel"}</button>
          {!result && (
            <button className="primary" onClick={build} disabled={building || !wslPath}>
              {building ? (
                <>
                  <span className="spinner" />
                  Building…
                </>
              ) : (
                "Build"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
