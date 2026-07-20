import { useEffect, useState } from "react";
import { formatBytes } from "../format";
import { useSettings } from "../settings/SettingsContext";
import type { ImageDetail, ImageInfo, ScanReport } from "../types";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/** No build *history* here on purpose, not an oversight: kiln-image's
 * layer format deliberately never records which Kilnfile instruction
 * produced which layer (see kiln-image/src/layer.rs's "reproducibility
 * by omission" docs - no instruction text, no timestamps, nothing that
 * isn't actual file content/metadata). This shows the real layer stack
 * and image config instead of inventing history that was never
 * captured. */
export default function ImageDetailModal({ image, onClose }: { image: ImageInfo; onClose: () => void }) {
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const [pushing, setPushing] = useState<"hub" | "shared" | null>(null);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanChecked, setScanChecked] = useState(false);

  const label = image.repository ? `${image.repository}:${image.tag}` : image.id.slice(0, 16);
  const bareName = image.repository?.replace(/^library\//, "") ?? null;
  const pushReference = bareName ? `${bareName}:${image.tag}` : null;
  // Only offered once a shared registry host is configured (Settings >
  // Registry) - kiln-registry's ownership rule requires the repository's
  // first path segment to equal the authenticated username, so this is
  // the one reference shape that's actually pushable there.
  const { sharedHost, username } = settings.registry;
  const sharedReference =
    bareName && sharedHost && username ? `${sharedHost}/${username}/${bareName}:${image.tag}` : null;

  useEffect(() => {
    let cancelled = false;
    window.kiln.inspectImage(image.id).then((r) => {
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
  }, [image.id]);

  useEffect(() => {
    let cancelled = false;
    setScan(null);
    setScanError(null);
    setScanChecked(false);
    window.kiln.getScan(image.id).then((r) => {
      if (cancelled) return;
      setScanChecked(true);
      if (r.status === 200 && typeof r.body !== "string") {
        setScan(r.body);
      }
      // A 404 just means "never scanned yet" - not an error, so it's not
      // surfaced via scanError, only the absence of `scan` triggers the
      // "Scan" call-to-action below.
    });
    return () => {
      cancelled = true;
    };
  }, [image.id]);

  async function runScan() {
    setScanning(true);
    setScanError(null);
    const r = await window.kiln.runScan(image.id);
    setScanning(false);
    if (r.status !== 200 && r.status !== 201) {
      setScanError(typeof r.body === "string" && r.body ? r.body : `scan failed (status ${r.status})`);
      return;
    }
    if (typeof r.body !== "string") setScan(r.body);
  }

  async function push(reference: string, which: "hub" | "shared") {
    setPushing(which);
    setPushResult(null);
    setPushError(null);
    const r = await window.kiln.pushImage(reference);
    setPushing(null);
    if (r.status !== 200 || typeof r.body === "string") {
      setPushError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
      return;
    }
    setPushResult(`Pushed as ${r.body.pushed_as}.`);
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box modal-volume" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {label}{" "}
          {detail && (
            <span className={`badge ${detail.signature_verified ? "running" : "exited"}`} style={{ verticalAlign: "middle" }}>
              {detail.signature_verified ? "✓ Signature vérifiée" : "Non signée"}
            </span>
          )}
        </h2>

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

            <div className="form-field">
              <label className="form-label">Vulnerabilities</label>
              {scan ? (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <span className={`badge ${scan.critical > 0 ? "exited" : "running"}`}>CRITICAL: {scan.critical}</span>
                    <span className="badge exited">HIGH: {scan.high}</span>
                    <span className="badge">MEDIUM: {scan.medium}</span>
                    <span className="badge">LOW: {scan.low}</span>
                    <button onClick={runScan} disabled={scanning} style={{ marginLeft: "auto" }}>
                      {scanning ? (
                        <>
                          <span className="spinner" />
                          Scanning…
                        </>
                      ) : (
                        "Re-scan"
                      )}
                    </button>
                  </div>
                  {scan.findings.length === 0 ? (
                    <div className="muted">No known vulnerabilities found.</div>
                  ) : (
                    <div className="image-layers">
                      {[...scan.findings]
                        .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
                        .map((f) => (
                          <div key={`${f.id}-${f.package}`} className="image-layer-row">
                            <span className="muted mono">{f.severity}</span>
                            <span className="mono">{f.package}</span>
                            <span className="muted mono">{f.installed_version}</span>
                            {f.url ? (
                              <a href={f.url} target="_blank" rel="noreferrer" className="mono">
                                {f.id}
                              </a>
                            ) : (
                              <span className="mono muted">{f.id}</span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="muted">{scanChecked ? "Not scanned yet." : "Loading…"}</span>
                  {scanChecked && (
                    <button onClick={runScan} disabled={scanning}>
                      {scanning ? (
                        <>
                          <span className="spinner" />
                          Scanning…
                        </>
                      ) : (
                        "Scan"
                      )}
                    </button>
                  )}
                </div>
              )}
              {scanError && <div className="updates-error" style={{ marginTop: 6 }}>{scanError}</div>}
            </div>
          </>
        )}

        {pushError && <div className="updates-error" style={{ marginTop: 10 }}>{pushError}</div>}
        {pushResult && (
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            {pushResult}
          </div>
        )}
        <div className="confirm-actions">
          <button onClick={onClose}>Close</button>
          {sharedReference && (
            <button
              onClick={() => push(sharedReference, "shared")}
              disabled={pushing !== null}
              title={`Push as ${sharedReference}`}
            >
              {pushing === "shared" ? (
                <>
                  <span className="spinner" />
                  Pushing…
                </>
              ) : (
                "Push to shared registry"
              )}
            </button>
          )}
          <button
            className="primary"
            onClick={() => pushReference && push(pushReference, "hub")}
            disabled={pushing !== null || !pushReference}
            title={pushReference ? undefined : "Untagged images can't be pushed - tag it first"}
          >
            {pushing === "hub" ? (
              <>
                <span className="spinner" />
                Pushing…
              </>
            ) : (
              "Push"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
