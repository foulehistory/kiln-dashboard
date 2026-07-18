import { useEffect, useState } from "react";
import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow, Toggle } from "./controls";
import type { UpdateStatus } from "../../types";

export default function UpdatesSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const u = settings.updates;
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ dashboard: UpdateStatus; kilnd: UpdateStatus } | null>(null);

  useEffect(() => {
    window.kiln.getAppVersion().then(setVersion);
  }, []);

  async function checkNow() {
    setChecking(true);
    const [dashboard, kilnd] = await Promise.all([
      window.kiln.checkDashboardUpdate(),
      window.kiln.checkKilndUpdate().catch((e) => ({ currentVersion: null, latestVersion: null, available: false, error: String(e) })),
    ]);
    setResult({ dashboard, kilnd });
    setChecking(false);
  }

  return (
    <div>
      <SettingRow label={t("updates.currentVersion")}>
        <span className="mono">{version ?? "…"}</span>
      </SettingRow>

      <SettingRow label={t("updates.autoCheck")} description={t("updates.autoCheck.desc")}>
        <Toggle checked={u.autoCheck} onChange={(v) => update({ updates: { autoCheck: v } })} />
      </SettingRow>

      <SettingRow label={t("updates.channel")}>
        <select value={u.channel} onChange={(e) => update({ updates: { channel: e.target.value as typeof u.channel } })}>
          <option value="stable">{t("updates.channel.stable")}</option>
          <option value="beta">{t("updates.channel.beta")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("updates.checkNow")}>
        <button onClick={checkNow} disabled={checking}>
          {checking ? (
            <>
              <span className="spinner" />
              …
            </>
          ) : (
            t("updates.checkNow")
          )}
        </button>
      </SettingRow>
      {result && (
        <div className="setting-row-desc" style={{ marginTop: -8, marginBottom: 12 }}>
          Dashboard {result.dashboard.currentVersion} {result.dashboard.available ? `→ ${result.dashboard.latestVersion}` : "· up to date"}
          <br />
          kilnd {result.kilnd.currentVersion ?? "?"} {result.kilnd.available ? `→ ${result.kilnd.latestVersion}` : "· up to date"}
        </div>
      )}
    </div>
  );
}
