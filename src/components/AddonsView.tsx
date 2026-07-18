import { useEffect, useRef, useState } from "react";
import { FolderIcon } from "./icons";
import type { AddonManifest } from "../types";

/** Which bridge method each bit of addon-callable functionality needs -
 * an addon's manifest.permissions must list the value here before its
 * iframe is allowed to invoke the matching method. Checked entirely in
 * this renderer (see handleBridgeMessage below); the iframe itself has no
 * preload script and therefore no direct access to window.kiln at all -
 * postMessage through this permission check is its only way out. */
const ADDON_METHOD_PERMISSIONS: Record<string, string> = {
  "containers.list": "containers:read",
  "images.list": "images:read",
  "images.remove": "images:write",
};

async function callBridgeMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "containers.list":
      return (await window.kiln.containers()).body;
    case "images.list":
      return (await window.kiln.images()).body;
    case "images.remove":
      return (await window.kiln.removeImage(String(args[0]))).body;
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

async function fetchAddons() {
  return window.kiln.listAddons();
}

export default function AddonsView() {
  const [addons, setAddons] = useState<AddonManifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  useEffect(() => {
    if (!selected) return;
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.type !== "kiln-addon-call") return;
      const { callId, method, args } = msg;
      const reply = (payload: Record<string, unknown>) =>
        iframeRef.current?.contentWindow?.postMessage({ type: "kiln-addon-result", callId, ...payload }, "*");

      const requiredPermission = ADDON_METHOD_PERMISSIONS[method];
      if (!requiredPermission) {
        reply({ ok: false, error: `unknown method: ${method}` });
        return;
      }
      if (!selected!.permissions.includes(requiredPermission)) {
        reply({ ok: false, error: `permission denied: "${method}" requires "${requiredPermission}", which this addon's manifest does not declare` });
        return;
      }
      callBridgeMethod(method, args || [])
        .then((data) => reply({ ok: true, data }))
        .catch((e) => reply({ ok: false, error: String(e) }));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
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

      {selected && (
        <div className="addon-frame-wrap">
          <iframe
            ref={iframeRef}
            key={selected.id}
            src={`kiln-addon://${selected.id}/${selected.entry}`}
            sandbox="allow-scripts"
            className="addon-frame"
            title={selected.name}
          />
        </div>
      )}
    </div>
  );
}
