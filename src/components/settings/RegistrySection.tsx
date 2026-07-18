import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow } from "./controls";

export default function RegistrySection() {
  const { settings, update } = useSettings();
  const t = useT();
  const r = settings.registry;

  return (
    <div>
      <p className="settings-section-intro">{t("registry.intro")}</p>

      <SettingRow label={t("registry.username")}>
        <input
          type="text"
          value={r.username}
          onChange={(e) => update({ registry: { username: e.target.value } })}
          autoComplete="off"
        />
      </SettingRow>
      <SettingRow label={t("registry.password")}>
        <input
          type="password"
          value={r.password}
          onChange={(e) => update({ registry: { password: e.target.value } })}
          autoComplete="off"
        />
      </SettingRow>

      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        {t("registry.warning")}
      </div>
    </div>
  );
}
