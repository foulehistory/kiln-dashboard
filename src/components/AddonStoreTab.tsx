import { useEffect, useState } from "react";
import type { AddonManifest, AddonStoreEntry } from "../types";

export default function AddonStoreTab({ installed, onInstalled }: { installed: AddonManifest[]; onInstalled: () => void }) {
  const [entries, setEntries] = useState<AddonStoreEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  async function refresh() {
    const r = await window.kiln.addonStoreIndex();
    if (!r.ok) {
      setError(r.error || "failed to fetch the addon store index");
      return;
    }
    setError(null);
    setEntries(r.addons ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function install(entry: AddonStoreEntry) {
    setInstalling(entry.id);
    setInstallError(null);
    const r = await window.kiln.installAddon({ id: entry.id, downloadUrl: entry.download_url, sha256: entry.sha256 });
    setInstalling(null);
    if (!r.ok) {
      setInstallError(r.error || `failed to install ${entry.id}`);
      return;
    }
    onInstalled();
  }

  const installedIds = new Set(installed.map((a) => a.id));

  return (
    <div>
      <div className="toolbar">
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </div>
      {error && <div className="empty-state">Could not load the addon store. ({error})</div>}
      {installError && <div className="updates-error" style={{ marginBottom: 12 }}>{installError}</div>}

      {entries && entries.length === 0 && !error && <div className="empty-state">No addons published yet.</div>}

      {entries && entries.length > 0 && (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Description</th>
              <th>Version</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isInstalled = installedIds.has(entry.id);
              return (
                <tr key={entry.id}>
                  <td>{entry.icon || "🧩"}</td>
                  <td>
                    {entry.name}
                    <div className="muted mono" style={{ fontSize: 11 }}>
                      {entry.id}
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {entry.description}
                  </td>
                  <td className="muted mono">{entry.version}</td>
                  <td>
                    <button type="button" disabled={isInstalled || installing === entry.id} onClick={() => install(entry)}>
                      {installing === entry.id ? (
                        <>
                          <span className="spinner" />
                          Installing…
                        </>
                      ) : isInstalled ? (
                        "Installed"
                      ) : (
                        "Install"
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
