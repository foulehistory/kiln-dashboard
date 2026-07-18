import { useEffect, useState } from "react";
import { formatBytes } from "../format";
import { FolderIcon, FileIcon } from "./icons";
import type { VolumeFileEntry } from "../types";

/** A read-only preview, not a file manager - browsing and previewing
 * small text files, backed by kilnd's path-traversal-safe /volumes/:name
 * /files endpoints (see kilnd/src/handlers/volumes.rs's
 * resolve_within_volume). Editing/uploading is out of scope: this is for
 * "what's actually in here", not a way to modify a running container's
 * data out from under it. */
export default function VolumeFileBrowser({ volumeName }: { volumeName: string }) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<VolumeFileEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setListError(null);
    setPreview(null);
    setPreviewError(null);
    window.kiln.listVolumeFiles(volumeName, path).then((r) => {
      if (cancelled) return;
      if (r.status !== 200 || !Array.isArray(r.body)) {
        setListError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
        return;
      }
      setEntries(r.body);
    });
    return () => {
      cancelled = true;
    };
  }, [volumeName, path]);

  async function openFile(entry: VolumeFileEntry) {
    setPreview(null);
    setPreviewError(null);
    const filePath = path ? `${path}/${entry.name}` : entry.name;
    const r = await window.kiln.readVolumeFile(volumeName, filePath);
    if (r.status !== 200) {
      setPreviewError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
      return;
    }
    setPreview({ name: entry.name, content: typeof r.body === "string" ? r.body : "" });
  }

  const segments = path ? path.split("/") : [];

  return (
    <div className="volume-browser">
      <div className="volume-browser-breadcrumb">
        <span className="volume-browser-crumb" onClick={() => setPath("")}>
          {volumeName}
        </span>
        {segments.map((seg, i) => (
          <span key={i}>
            {" / "}
            <span className="volume-browser-crumb" onClick={() => setPath(segments.slice(0, i + 1).join("/"))}>
              {seg}
            </span>
          </span>
        ))}
      </div>

      <div className="volume-browser-body">
        <div className="volume-browser-list">
          {listError && <div className="updates-error">{listError}</div>}
          {!listError && entries === null && <div className="muted">Loading…</div>}
          {!listError && entries && entries.length === 0 && <div className="muted">Empty.</div>}
          {entries?.map((entry) => (
            <div
              key={entry.name}
              className="volume-browser-entry"
              onClick={() => (entry.is_dir ? setPath(path ? `${path}/${entry.name}` : entry.name) : openFile(entry))}
            >
              {entry.is_dir ? <FolderIcon /> : <FileIcon />}
              <span className="volume-browser-entry-name">{entry.name}</span>
              {!entry.is_dir && <span className="muted mono">{formatBytes(entry.size_bytes)}</span>}
            </div>
          ))}
        </div>
        <div className="volume-browser-preview">
          {previewError && <div className="updates-error">{previewError}</div>}
          {!previewError && !preview && <div className="muted">Select a file to preview.</div>}
          {preview && (
            <>
              <div className="muted mono volume-browser-preview-name">{preview.name}</div>
              <pre className="log-pre">{preview.content || "(empty file)"}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
