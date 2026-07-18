import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow, Toggle } from "./controls";

export default function AppearanceSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const a = settings.appearance;

  return (
    <div>
      <SettingRow label={t("appearance.theme")} description={t("appearance.theme.desc")}>
        <select value={a.theme} onChange={(e) => update({ appearance: { theme: e.target.value as typeof a.theme } })}>
          <option value="light">{t("appearance.theme.light")}</option>
          <option value="dark">{t("appearance.theme.dark")}</option>
          <option value="auto">{t("appearance.theme.auto")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("appearance.density")} description={t("appearance.density.desc")}>
        <select value={a.density} onChange={(e) => update({ appearance: { density: e.target.value as typeof a.density } })}>
          <option value="comfortable">{t("appearance.density.comfortable")}</option>
          <option value="compact">{t("appearance.density.compact")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("appearance.language")} description={t("appearance.language.desc")}>
        <select value={a.language} onChange={(e) => update({ appearance: { language: e.target.value as typeof a.language } })}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </SettingRow>

      <SettingRow label={t("appearance.fontScale")} description={t("appearance.fontScale.desc")}>
        <input
          type="range"
          min={0.85}
          max={1.3}
          step={0.05}
          value={a.fontScale}
          onChange={(e) => update({ appearance: { fontScale: Number(e.target.value) } })}
        />
        <span className="mono muted">{Math.round(a.fontScale * 100)}%</span>
      </SettingRow>
    </div>
  );
}
