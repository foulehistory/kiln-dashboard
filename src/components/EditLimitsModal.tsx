import { useState } from "react";
import type { ContainerInfo } from "../types";

function bytesToInput(bytes: number): string {
  if (bytes > 0 && bytes % (1024 * 1024 * 1024) === 0) return `${bytes / (1024 * 1024 * 1024)}g`;
  if (bytes > 0 && bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)}m`;
  return `${bytes}`;
}

/** Applies live via cgroups v2's memory.max/cpu.max - no restart needed,
 * verified directly against a running container's cgroup files - and
 * persists the new values so a later `kiln start` keeps them instead of
 * reverting to whatever `kiln run` was originally given. */
export default function EditLimitsModal({
  container,
  onClose,
  onUpdated,
}: {
  container: ContainerInfo;
  onClose: () => void;
  onUpdated: (updated: ContainerInfo) => void;
}) {
  const [memory, setMemory] = useState(container.memory_limit_bytes ? bytesToInput(container.memory_limit_bytes) : "");
  const [cpus, setCpus] = useState(container.cpu_limit != null ? String(container.cpu_limit) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await window.kiln.updateLimits(container.id, memory.trim() || undefined, cpus.trim() ? Number(cpus.trim()) : undefined);
    setSaving(false);
    if (r.status !== 200 || typeof r.body === "string") {
      setError(typeof r.body === "string" && r.body ? r.body : `failed (status ${r.status})`);
      return;
    }
    onUpdated(r.body);
    onClose();
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Edit limits — {container.name}</h2>

        <div className="form-field">
          <label className="form-label">Memory</label>
          <input value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="e.g. 512m (empty = unlimited)" />
        </div>
        <div className="form-field">
          <label className="form-label">CPUs</label>
          <input value={cpus} onChange={(e) => setCpus(e.target.value)} placeholder="e.g. 1.5 (empty = unlimited)" />
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Applies immediately, no restart needed.
        </div>

        {error && <div className="updates-error" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="confirm-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <span className="spinner" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
