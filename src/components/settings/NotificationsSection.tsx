import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow, Toggle } from "./controls";

export default function NotificationsSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const n = settings.notifications;

  function setEvent(key: keyof typeof n.events, v: boolean) {
    update({ notifications: { events: { [key]: v } } });
  }

  return (
    <div>
      <SettingRow label={t("notifications.channel")} description={t("notifications.channel.desc")}>
        <select value={n.channel} onChange={(e) => update({ notifications: { channel: e.target.value as typeof n.channel } })}>
          <option value="in-app">{t("notifications.channel.inapp")}</option>
          <option value="native">{t("notifications.channel.native")}</option>
          <option value="both">{t("notifications.channel.both")}</option>
        </select>
      </SettingRow>

      <div className="setting-row">
        <div className="setting-row-text">
          <div className="setting-row-label">{t("notifications.events")}</div>
        </div>
      </div>
      <SettingRow label={t("notifications.events.containerStopped")}>
        <Toggle checked={n.events.containerStopped} onChange={(v) => setEvent("containerStopped", v)} />
      </SettingRow>
      <SettingRow label={t("notifications.events.pullFinished")}>
        <Toggle checked={n.events.pullFinished} onChange={(v) => setEvent("pullFinished", v)} />
      </SettingRow>
      <SettingRow label={t("notifications.events.buildFinished")}>
        <Toggle checked={n.events.buildFinished} onChange={(v) => setEvent("buildFinished", v)} />
      </SettingRow>
      <SettingRow label={t("notifications.events.resourceAlert")}>
        <Toggle checked={n.events.resourceAlert} onChange={(v) => setEvent("resourceAlert", v)} />
      </SettingRow>
      <SettingRow label={t("notifications.events.updateAvailable")}>
        <Toggle checked={n.events.updateAvailable} onChange={(v) => setEvent("updateAvailable", v)} />
      </SettingRow>

      <SettingRow label={t("notifications.resourceThreshold")} description={t("notifications.resourceThreshold.desc")}>
        <input
          type="number"
          min={50}
          max={100}
          value={n.resourceAlertThresholdPct}
          disabled={!n.events.resourceAlert}
          onChange={(e) => update({ notifications: { resourceAlertThresholdPct: Number(e.target.value) } })}
          style={{ width: 70 }}
        />
        <span className="muted">%</span>
      </SettingRow>

      <SettingRow label={t("notifications.sound")}>
        <Toggle checked={n.sound} onChange={(v) => update({ notifications: { sound: v } })} />
      </SettingRow>

      <SettingRow label={t("notifications.dnd")} description={t("notifications.dnd.desc")}>
        <Toggle checked={n.doNotDisturb} onChange={(v) => update({ notifications: { doNotDisturb: v } })} />
      </SettingRow>
      {n.doNotDisturb && (
        <SettingRow label="">
          <span className="muted">{t("notifications.dnd.from")}</span>
          <input type="time" value={n.doNotDisturbStart} onChange={(e) => update({ notifications: { doNotDisturbStart: e.target.value } })} />
          <span className="muted">{t("notifications.dnd.to")}</span>
          <input type="time" value={n.doNotDisturbEnd} onChange={(e) => update({ notifications: { doNotDisturbEnd: e.target.value } })} />
        </SettingRow>
      )}
    </div>
  );
}
