import { useEffect, useState } from "react";
import { FolderIcon } from "./icons";
import AddonFrame from "./AddonFrame";
import type { AddonManifest } from "../types";

async function fetchAddons() {
  return window.kiln.listAddons();
}

export default function AddonsView() {
  const [addons, setAddons] = useState<AddonManifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const selected = addons?.find((a) => a.id === selectedId) ?? null;

  async function refresh() {
    try {
      setAddons(await fetchAddons());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Deselect if the selected addon disappears (folder removed) or gets
  // disabled out from under it.
  useEffect(() => {
    if (selected && !selected.enabled) setSelectedId(null);
  }, [selected]);

  async function toggle(id: string, enabled: boolean) {
    await window.kiln.toggleAddon(id, enabled);
    refresh();
  }

  async function openFolder() {
    setFolderError(null);
    const r = await window.kiln.openAddonsFolder();
    if (!r.ok) setFolderError(r.error || "failed to open addons folder");
  }

  return (
    <div>
      <h1>Addons</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}

      <div className="toolbar">
        <button type="button" onClick={openFolder}>
          <FolderIcon /> Open addons folder
        </button>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </div>
      {folderError && <div className="updates-error" style={{ marginBottom: 12 }}>{folderError}</div>}

      {addons && addons.length === 0 && (
        <div className="empty-state">
          No addons installed. Drop an addon folder (with a manifest.json) into the addons folder above, then hit Refresh.
        </div>
      )}

      {addons && addons.length > 0 && (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Permissions</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {addons.map((a) => (
              <tr
                key={a.id}
                onClick={() => a.enabled && setSelectedId(a.id)}
                className={selectedId === a.id ? "addon-row-active" : undefined}
                style={{ cursor: a.enabled ? "pointer" : "default" }}
              >
                <td>{a.icon || "🧩"}</td>
                <td>
                  {a.name}
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {a.id}
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {a.permissions.length === 0 ? "none" : a.permissions.join(", ")}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <label className="toggle">
                    <input type="checkbox" checked={a.enabled} onChange={(e) => toggle(a.id, e.target.checked)} />
                    <span className="toggle-track" />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <AddonFrame addon={selected} key={selected.id} />}
    </div>
  );
}
