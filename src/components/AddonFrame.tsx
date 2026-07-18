import { useEffect, useRef } from "react";
import type { AddonManifest } from "../types";

/** Which bridge method each bit of addon-callable functionality needs -
 * an addon's manifest.permissions must list the value here before its
 * iframe is allowed to invoke the matching method. Checked entirely in
 * this renderer; the iframe itself has no preload script and therefore
 * no direct access to window.kiln at all - postMessage through this
 * permission check is its only way out. */
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

/** Renders one addon's entry page in a sandboxed <iframe>, wired up to
 * the permission-checked postMessage bridge - the single place this
 * logic lives, shared by the Addons management tab's inline preview and
 * an addon's own dedicated sidebar tab (see App.tsx). */
export default function AddonFrame({ addon }: { addon: AddonManifest }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.type !== "kiln-addon-call") return;
      const { callId, method, args } = msg;
      const reply = (payload: Record<string, unknown>) =>
        iframeRef.current?.contentWindow?.postMessage({ type: "kiln-addon-result", callId, ...payload }, "*");

      // http.fetch's required permission is data-dependent (which origin
      // the addon is asking to reach), unlike every other bridge method
      // below - handled separately rather than forcing ADDON_METHOD_PERMISSIONS
      // to represent a permission that isn't a fixed string.
      if (method === "http.fetch") {
        const [url, options] = (args || []) as [string, Record<string, unknown> | undefined];
        let origin: string;
        try {
          origin = new URL(url).origin;
        } catch {
          reply({ ok: false, error: `invalid URL: ${url}` });
          return;
        }
        const requiredPermission = `http:${origin}`;
        if (!addon.permissions.includes(requiredPermission)) {
          reply({ ok: false, error: `permission denied: "http.fetch" to ${origin} requires "${requiredPermission}", which this addon's manifest does not declare` });
          return;
        }
        window.kiln
          .addonHttpFetch(url, options as { method?: string; headers?: Record<string, string>; body?: string } | undefined)
          .then((r) => (r.error ? reply({ ok: false, error: r.error }) : reply({ ok: true, data: r })));
        return;
      }

      const requiredPermission = ADDON_METHOD_PERMISSIONS[method];
      if (!requiredPermission) {
        reply({ ok: false, error: `unknown method: ${method}` });
        return;
      }
      if (!addon.permissions.includes(requiredPermission)) {
        reply({ ok: false, error: `permission denied: "${method}" requires "${requiredPermission}", which this addon's manifest does not declare` });
        return;
      }
      callBridgeMethod(method, args || [])
        .then((data) => reply({ ok: true, data }))
        .catch((e) => reply({ ok: false, error: String(e) }));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [addon]);

  return (
    <div className="addon-frame-wrap">
      {/* allow-forms: without it, the sandbox suppresses form submission
          entirely (a <form>'s submit event never fires, even from a real
          click on its submit button) - needed for any addon using a plain
          HTML form, like mysql-users-addon's "add user". Still no
          allow-same-origin/allow-top-navigation/etc., so the addon stays
          unable to reach anything outside the postMessage bridge. */}
      <iframe ref={iframeRef} src={`kiln-addon://${addon.id}/${addon.entry}`} sandbox="allow-scripts allow-forms" className="addon-frame" title={addon.name} />
    </div>
  );
}
