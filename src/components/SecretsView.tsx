import { useState } from "react";
import { usePolling } from "../usePolling";
import ConfirmDialog from "./ConfirmDialog";
import { useSettings } from "../settings/SettingsContext";
import { SearchIcon } from "./icons";
import type { RotateSecretResult, SecretInfo } from "../types";

/** e.g. "3d ago" / "just now" - same rough-granularity convention as the
 * runtime's own `kiln secret ls` (`kiln-cli`'s `format_unix`), not a full
 * calendar date - a secret's rotation history is read at a glance, not
 * audited to the second. */
function timeAgo(unixSecs: number): string {
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSecs);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

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
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rotateResult, setRotateResult] = useState<{ name: string; result: RotateSecretResult } | null>(null);

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

  async function rotate(name: string) {
    setBusy(name);
    setActionError(null);
    const r = await window.kiln.rotateSecret(name);
    setBusy(null);
    if (r.status !== 200 || typeof r.body === "string") {
      setActionError(extractError(r.body, r.status));
      return;
    }
    setRotateResult({ name, result: r.body });
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
              <th>Last rotated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredSecrets(secrets, search).map((s) => (
              <tr key={s.name}>
                <td className="mono">{s.name}</td>
                <td className="muted">{s.rotated_at != null ? timeAgo(s.rotated_at) : "never"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {busy === s.name ? (
                    <span className="muted">
                      <span className="spinner" />
                      working…
                    </span>
                  ) : (
                    <>
                      <button onClick={() => setConfirmRotate(s.name)}>Rotate</button>{" "}
                      <button
                        className="danger"
                        onClick={() => (settings.behavior.confirmDestructive ? setConfirm(s.name) : remove(s.name))}
                      >
                        Remove
                      </button>
                    </>
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
      {confirmRotate && (
        <ConfirmDialog
          message={`Rotate secret "${confirmRotate}"? A new random value replaces the current one - any running container with it mounted picks it up live where possible; others need a restart to see it.`}
          confirmLabel="Rotate"
          onConfirm={() => {
            const name = confirmRotate;
            setConfirmRotate(null);
            rotate(name);
          }}
          onCancel={() => setConfirmRotate(null)}
        />
      )}
      {rotateResult && (
        <div className="confirm-overlay" onClick={() => setRotateResult(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">"{rotateResult.name}" rotated</h2>
            {rotateResult.result.generated_value && (
              <>
                <p className="muted" style={{ fontSize: 12.5 }}>
                  New value - shown once, this project has no way to display it again:
                </p>
                <div className="mono" style={{ userSelect: "all", padding: 8, background: "var(--panel-raised)", borderRadius: 6, wordBreak: "break-all" }}>
                  {rotateResult.result.generated_value}
                </div>
              </>
            )}
            {rotateResult.result.live_updates.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
                  Running containers with this secret mounted:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {rotateResult.result.live_updates.map((u) => (
                    <li key={u.container_id}>
                      {u.container_name} -{" "}
                      {u.updated ? (
                        <span style={{ color: "var(--good)" }}>updated live, no restart needed</span>
                      ) : (
                        <span style={{ color: "var(--warn)" }}>pending restart to apply the new value</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12.5 }}>
                No running containers currently have this secret mounted.
              </p>
            )}
            <div className="confirm-actions">
              <button className="primary" onClick={() => setRotateResult(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function filteredSecrets(secrets: SecretInfo[], search: string): SecretInfo[] {
  const q = search.trim().toLowerCase();
  if (!q) return secrets;
  return secrets.filter((s) => s.name.toLowerCase().includes(q));
}
