import { usePolling } from "../usePolling";

async function fetchImages() {
  const r = await window.kiln.images();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

export default function ImagesView() {
  const { data: images, error } = usePolling(fetchImages, 3000);

  return (
    <div>
      <h1>Images</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}
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
              </tr>
            ))}
          </tbody>
        </table>
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
