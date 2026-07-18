import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import DiskUsageCard from "./DiskUsageCard";
import ImageDetailModal from "./ImageDetailModal";
import BuildImageModal from "./BuildImageModal";
import { useSettings } from "../settings/SettingsContext";
import { notify } from "../notifications/notify";
import { formatBytes } from "../format";
import { SearchIcon } from "./icons";
import type { ImageInfo } from "../types";

async function fetchImages() {
  const r = await window.kiln.images();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

export default function ImagesView() {
  const { settings } = useSettings();
  const { data: images, error } = usePolling(fetchImages, settings.behavior.pollingIntervalMs);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ImageInfo | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pullRef, setPullRef] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ImageInfo | null>(null);
  const [showBuild, setShowBuild] = useState(false);

  async function remove(img: ImageInfo) {
    setBusy(img.id);
    setRemoveError(null);
    const r = await window.kiln.removeImage(img.id);
    setBusy(null);
    if (r.status !== 200) {
      setRemoveError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
    }
  }

  async function pull(e: React.FormEvent) {
    e.preventDefault();
    if (!pullRef.trim()) return;
    setPulling(true);
    setPullError(null);
    const ref = pullRef.trim();
    const r = await window.kiln.pullImage(ref);
    setPulling(false);
    if (r.status !== 201) {
      const msg = typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`;
      setPullError(msg);
      notify(settings, "pullFinished", "Pull failed", `${ref}: ${msg}`);
      return;
    }
    notify(settings, "pullFinished", "Pull finished", ref);
    setPullRef("");
  }

  return (
    <div>
      <h1>Images</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}

      <DiskUsageCard />

      <form className="toolbar" onSubmit={pull}>
        <input
          value={pullRef}
          onChange={(e) => setPullRef(e.target.value)}
          placeholder="image reference, e.g. busybox:1.36"
          disabled={pulling}
        />
        <button type="submit" className="primary" disabled={pulling || !pullRef.trim()}>
          {pulling ? (
            <>
              <span className="spinner" />
              Pulling…
            </>
          ) : (
            "+ Pull image"
          )}
        </button>
        <button type="button" onClick={() => setShowBuild(true)}>
          + Build from Kilnfile
        </button>
      </form>
      {pullError && <div className="updates-error" style={{ marginBottom: 12 }}>{pullError}</div>}
      {removeError && <div className="updates-error" style={{ marginBottom: 12 }}>{removeError}</div>}
      {images && images.length > 0 && (
        <div className="toolbar">
          <div className="search-box">
            <SearchIcon />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by repository or tag…" />
          </div>
        </div>
      )}
      {!error && (!images || images.length === 0) && (
        <div className="empty-state">No images yet - `kiln pull &lt;name&gt;` or `kiln build` one.</div>
      )}
      {images && images.length > 0 && filteredImages(images, search).length === 0 && (
        <div className="empty-state">No images match "{search}".</div>
      )}
      {images && filteredImages(images, search).length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Tag</th>
              <th>Image ID</th>
              <th>Layers</th>
              <th>Size (deduped)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredImages(images, search).map((img) => (
              <tr key={img.id} onClick={() => setDetail(img)} style={{ cursor: "pointer" }}>
                <td>{img.repository ?? <span className="muted">&lt;none&gt;</span>}</td>
                <td>{img.tag ?? <span className="muted">&lt;none&gt;</span>}</td>
                <td className="mono muted">{img.id.slice(0, 16)}</td>
                <td>{img.layers}</td>
                <td>{formatBytes(img.size_bytes)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {busy === img.id ? (
                    <span className="muted">
                      <span className="spinner" />
                      working…
                    </span>
                  ) : (
                    <button
                      className="danger"
                      onClick={() => (settings.behavior.confirmDestructive ? setConfirm(img) : remove(img))}
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
        <ConfirmDialog
          message={`Remove image "${confirm.repository ? `${confirm.repository}:${confirm.tag}` : confirm.id.slice(0, 16)}"?`}
          onConfirm={() => remove(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {detail && <ImageDetailModal image={detail} onClose={() => setDetail(null)} />}
      {showBuild && <BuildImageModal onClose={() => setShowBuild(false)} onBuilt={() => {}} />}
    </div>
  );
}

function filteredImages(images: ImageInfo[], search: string): ImageInfo[] {
  const q = search.trim().toLowerCase();
  if (!q) return images;
  return images.filter((img) => (img.repository ?? "").toLowerCase().includes(q) || (img.tag ?? "").toLowerCase().includes(q) || img.id.includes(q));
}
