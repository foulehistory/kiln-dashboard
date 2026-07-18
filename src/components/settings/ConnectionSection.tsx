import { useState } from "react";
import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow } from "./controls";

export default function ConnectionSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const c = settings.connection;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const r = await window.kiln.testConnection(c.remoteHost, c.remotePort);
    setTesting(false);
    setTestResult(r.status === 200 ? "ok" : "fail");
  }

  return (
    <div>
      <SettingRow label={t("connection.mode")}>
        <select value={c.mode} onChange={(e) => update({ connection: { mode: e.target.value as typeof c.mode } })}>
          <option value="local">{t("connection.mode.local")}</option>
          <option value="remote">{t("connection.mode.remote")}</option>
        </select>
      </SettingRow>

      {c.mode === "remote" && (
        <>
          <SettingRow label={t("connection.remoteHost")}>
            <input type="text" value={c.remoteHost} placeholder="192.168.1.42" onChange={(e) => update({ connection: { remoteHost: e.target.value } })} />
          </SettingRow>
          <SettingRow label={t("connection.remotePort")}>
            <input
              type="number"
              value={c.remotePort}
              onChange={(e) => update({ connection: { remotePort: Number(e.target.value) } })}
              style={{ width: 90 }}
            />
          </SettingRow>
          <SettingRow label={t("connection.test")}>
            <button onClick={testConnection} disabled={testing || !c.remoteHost}>
              {testing ? (
                <>
                  <span className="spinner" />
                  {t("connection.testing")}
                </>
              ) : (
                t("connection.test")
              )}
            </button>
            {testResult && (
              <span className={`settings-inline-test ${testResult === "ok" ? "ok" : "fail"}`}>
                {testResult === "ok" ? `✓ ${t("connection.testOk")}` : `✗ ${t("connection.testFail")}`}
              </span>
            )}
          </SettingRow>
        </>
      )}

      <SettingRow label={t("connection.reconnectInterval")} description={t("connection.reconnectInterval.desc")}>
        <select value={c.reconnectIntervalMs} onChange={(e) => update({ connection: { reconnectIntervalMs: Number(e.target.value) } })}>
          <option value={2000}>2s</option>
          <option value={5000}>5s</option>
          <option value={10000}>10s</option>
          <option value={30000}>30s</option>
        </select>
      </SettingRow>
    </div>
  );
}
