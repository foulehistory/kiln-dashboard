import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import { useSettings } from "../settings/SettingsContext";
import { SearchIcon } from "./icons";
import type { SecretInfo } from "../types";

async function fetchSecrets() {
  const r = await window.kiln.secrets();
  if (r.status !== 200 || !Array.isArray(r.body)) {
    throw new Error(`unexpected response (status ${r.status})`);
  }
  return r.body;
}

function extractError(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  return `failed (status ${status})`;
}

export default function SecretsView() {
  const { settings } = useSettings();
  const { data: secrets, error } = usePolling(fetchSecrets, settings.behavior.pollingIntervalMs);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newValue) return;
    setCreating(true);
    setActionError(null);
    const r = await window.kiln.createSecret(newName.trim(), newValue);
    setCreating(false);
    if (r.status !== 201) {
      setActionError(extractError(r.body, r.status));
      return;
    }
    setNewName("");
    setNewValue("");
  }

  async function remove(name: string) {
    setBusy(name);
    setActionError(null);
    const r = await window.kiln.removeSecret(name);
    setBusy(null);
    if (r.status !== 200) {
      setActionError(extractError(r.body, r.status));
    }
  }

  return (
    <div>
      <h1>Secrets</h1>
      {error && <div className="empty-state">Could not reach kilnd - is it running? ({error})</div>}

      <form className="toolbar" onSubmit={create}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="secret name" autoComplete="off" />
        <input
          type="password"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          autoComplete="new-password"
        />
        <button type="submit" className="primary" disabled={creating || !newName.trim() || !newValue}>
          {creating ? (
            <>
              <span className="spinner" />
              Creating…
            </>
          ) : (
            "+ Create secret"
          )}
        </button>
      </form>
      <div className="muted" style={{ fontSize: 11.5, marginTop: -4, marginBottom: 12 }}>
        The value is encrypted at rest and never shown again after creation - mount it into a container with `kiln run --secret
        &lt;name&gt;` (a file at /run/secrets/&lt;name&gt;, not an environment variable).
      </div>
      {actionError && <div className="updates-error" style={{ marginBottom: 12 }}>{actionError}</div>}

      {secrets && secrets.length > 0 && (
        <div className="toolbar">
          <div className="search-box">
            <SearchIcon />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name…" />
          </div>
        </div>
      )}
      {!error && (!secrets || secrets.length === 0) && (
        <div className="empty-state">No secrets yet - create one above, or `kiln secret create &lt;name&gt;`.</div>
      )}
      {secrets && secrets.length > 0 && filteredSecrets(secrets, search).length === 0 && (
        <div className="empty-state">No secrets match "{search}".</div>
      )}
      {secrets && filteredSecrets(secrets, search).length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredSecrets(secrets, search).map((s) => (
              <tr key={s.name}>
                <td className="mono">{s.name}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {busy === s.name ? (
                    <span className="muted">
                      <span className="spinner" />
                      working…
                    </span>
                  ) : (
                    <button
                      className="danger"
                      onClick={() => (settings.behavior.confirmDestructive ? setConfirm(s.name) : remove(s.name))}
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
        <ConfirmDialog message={`Remove secret "${confirm}"?`} onConfirm={() => remove(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

function filteredSecrets(secrets: SecretInfo[], search: string): SecretInfo[] {
  const q = search.trim().toLowerCase();
  if (!q) return secrets;
  return secrets.filter((s) => s.name.toLowerCase().includes(q));
}
