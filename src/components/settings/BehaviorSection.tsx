import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow, Toggle } from "./controls";

export default function BehaviorSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const b = settings.behavior;

  return (
    <div>
      <SettingRow label={t("behavior.homeView")} description={t("behavior.homeView.desc")}>
        <select value={b.homeView} onChange={(e) => update({ behavior: { homeView: e.target.value as typeof b.homeView } })}>
          <option value="containers">{t("behavior.homeView.containers")}</option>
          <option value="images">{t("behavior.homeView.images")}</option>
          <option value="summary">{t("behavior.homeView.summary")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("behavior.confirmDestructive")} description={t("behavior.confirmDestructive.desc")}>
        <Toggle checked={b.confirmDestructive} onChange={(v) => update({ behavior: { confirmDestructive: v } })} />
      </SettingRow>

      <SettingRow label={t("behavior.confirmOnlyForRemovals")} description={t("behavior.confirmOnlyForRemovals.desc")}>
        <Toggle
          checked={b.confirmOnlyForRemovals}
          disabled={!b.confirmDestructive}
          onChange={(v) => update({ behavior: { confirmOnlyForRemovals: v } })}
        />
      </SettingRow>

      <SettingRow label={t("behavior.pollingInterval")} description={t("behavior.pollingInterval.desc")}>
        <select
          value={b.pollingIntervalMs}
          onChange={(e) => update({ behavior: { pollingIntervalMs: Number(e.target.value) } })}
        >
          <option value={1000}>{t("behavior.pollingInterval.fast")}</option>
          <option value={2000}>{t("behavior.pollingInterval.normal")}</option>
          <option value={5000}>{t("behavior.pollingInterval.economic")}</option>
          <option value={10000}>{t("behavior.pollingInterval.verySlow")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("behavior.closeBehavior")} description={t("behavior.closeBehavior.desc")}>
        <select value={b.closeBehavior} onChange={(e) => update({ behavior: { closeBehavior: e.target.value as typeof b.closeBehavior } })}>
          <option value="quit">{t("behavior.closeBehavior.quit")}</option>
          <option value="tray">{t("behavior.closeBehavior.tray")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("behavior.launchAtStartup")} description={t("behavior.launchAtStartup.desc")}>
        <Toggle checked={b.launchAtStartup} onChange={(v) => update({ behavior: { launchAtStartup: v } })} />
      </SettingRow>
    </div>
  );
}
