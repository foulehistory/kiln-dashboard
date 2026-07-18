import { useEffect, useState } from "react";
import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow, Toggle } from "./controls";

export default function AppearanceSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const a = settings.appearance;

  // The slider's own visual position is local state, decoupled from the
  // committed setting - committing on every drag tick (via the zoom
  // effect it drives) makes the whole page rescale mid-drag, which
  // shifts the slider itself under the cursor and fights the drag. Only
  // `update()` on release, so dragging stays smooth and only the final
  // value ever triggers a zoom change.
  const [liveScale, setLiveScale] = useState(a.fontScale);
  useEffect(() => setLiveScale(a.fontScale), [a.fontScale]);
  function commitScale(e: React.SyntheticEvent<HTMLInputElement>) {
    update({ appearance: { fontScale: Number(e.currentTarget.value) } });
  }

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
          value={liveScale}
          onChange={(e) => setLiveScale(Number(e.target.value))}
          onMouseUp={commitScale}
          onTouchEnd={commitScale}
          onKeyUp={commitScale}
        />
        <span className="mono muted">{Math.round(liveScale * 100)}%</span>
      </SettingRow>
    </div>
  );
}
