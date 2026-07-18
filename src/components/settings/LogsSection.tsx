import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { Toggle, SettingRow } from "./controls";

export default function LogsSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const l = settings.logs;

  return (
    <div>
      <SettingRow label={t("logs.maxLines")} description={t("logs.maxLines.desc")}>
        <select value={l.maxLines} onChange={(e) => update({ logs: { maxLines: Number(e.target.value) } })}>
          <option value={500}>500</option>
          <option value={2000}>2 000</option>
          <option value={5000}>5 000</option>
          <option value={20000}>20 000</option>
        </select>
      </SettingRow>

      <SettingRow label={t("logs.timestampFormat")}>
        <select value={l.timestampFormat} onChange={(e) => update({ logs: { timestampFormat: e.target.value as typeof l.timestampFormat } })}>
          <option value="relative">{t("logs.timestampFormat.relative")}</option>
          <option value="absolute">{t("logs.timestampFormat.absolute")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("logs.wrapLines")}>
        <Toggle checked={l.wrapLines} onChange={(v) => update({ logs: { wrapLines: v } })} />
      </SettingRow>

      <div className="setting-row">
        <div className="setting-row-text">
          <div className="setting-row-label">{t("logs.export")}</div>
          <div className="setting-row-desc muted">{t("logs.export.hint")}</div>
        </div>
      </div>
    </div>
  );
}
