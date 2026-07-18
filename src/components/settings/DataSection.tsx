import { useState } from "react";
import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow, Toggle } from "./controls";
import ConfirmDialog from "../ConfirmDialog";

export default function DataSection() {
  const { settings, update, reset } = useSettings();
  const t = useT();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div>
      <SettingRow label={t("data.telemetry")} description={t("data.telemetry.desc")}>
        <Toggle checked={settings.data.telemetry} onChange={(v) => update({ data: { telemetry: v } })} />
      </SettingRow>

      <SettingRow label={t("data.configLocation")}>
        <button onClick={() => window.kiln.openSettingsFolder()}>{t("data.openFolder")}</button>
      </SettingRow>

      <SettingRow label={t("data.reset")}>
        <button className="danger" onClick={() => setConfirmReset(true)}>
          {t("data.reset")}
        </button>
      </SettingRow>

      {confirmReset && (
        <ConfirmDialog
          message={t("data.reset.confirm")}
          onConfirm={() => {
            reset();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
