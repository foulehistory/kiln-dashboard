import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import type { ImageInfo } from "../types";

async function fetchImages() {
  const r = await window.kiln.images();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

export default function ImagesView() {
  const { data: images, error } = usePolling(fetchImages, 3000);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ImageInfo | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove(img: ImageInfo) {
    setBusy(img.id);
    setRemoveError(null);
    const r = await window.kiln.removeImage(img.id);
    setBusy(null);
    if (r.status !== 200) {
      setRemoveError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
    }
  }

  return (
    <div>
      <h1>Images</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}
      {removeError && <div className="updates-error" style={{ marginBottom: 12 }}>{removeError}</div>}
      {!error && (!images || images.length === 0) && (
        <div className="empty-state">No images yet - `kiln pull &lt;name&gt;` or `kiln build` one.</div>
      )}
      {images && images.length > 0 && (
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
            {images.map((img) => (
              <tr key={img.id}>
                <td>{img.repository ?? <span className="muted">&lt;none&gt;</span>}</td>
                <td>{img.tag ?? <span className="muted">&lt;none&gt;</span>}</td>
                <td className="mono muted">{img.id.slice(0, 16)}</td>
                <td>{img.layers}</td>
                <td>{formatBytes(img.size_bytes)}</td>
                <td>
                  {busy === img.id ? (
                    <span className="muted">
                      <span className="spinner" />
                      working…
                    </span>
                  ) : (
                    <button className="danger" onClick={() => setConfirm(img)}>
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
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}
