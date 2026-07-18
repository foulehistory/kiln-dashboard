# Demo Addon

A sample addon for the dashboard's Addons tab. Not installed automatically -
copy this folder into the dashboard's addons directory to try it.

## Install

1. In the dashboard, open the **Addons** tab and click **Open addons
   folder** (creates the folder on first use).
2. Copy this entire `demo-addon` folder into it, so you end up with
   `<addons folder>/demo-addon/manifest.json`.
3. Back in the dashboard, click **Refresh**. "Demo Addon" appears in the
   list, disabled by default.
4. Flip its toggle on, then click its row to load it.

## Notes

- The folder name must match `manifest.id` exactly (`demo-addon` here) -
  that's how the dashboard keys its enabled/disabled state and how the
  addon is addressed at `kiln-addon://demo-addon/...`.
- The addon page runs in a sandboxed iframe with no Node/Electron access
  of its own. It can only reach the dashboard through `postMessage`
  calls the parent checks against `manifest.permissions` - this sample
  only requests `containers:read`/`images:read`, so its "remove an
  image" button is expected to come back with a permission-denied error.
