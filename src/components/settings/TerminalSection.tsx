import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow } from "./controls";

const FONT_OPTIONS = [
  { label: "SF Mono / Consolas", value: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace" },
  { label: "Cascadia Mono", value: "Cascadia Mono, Consolas, monospace" },
  { label: "Courier New", value: "Courier New, monospace" },
  { label: "JetBrains Mono", value: "JetBrains Mono, Consolas, monospace" },
];

export default function TerminalSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const term = settings.terminal;

  return (
    <div>
      <SettingRow label={t("terminal.font")}>
        <select value={term.fontFamily} onChange={(e) => update({ terminal: { fontFamily: e.target.value } })}>
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow label={t("terminal.fontSize")}>
        <select value={term.fontSize} onChange={(e) => update({ terminal: { fontSize: Number(e.target.value) } })}>
          {[11, 12, 13, 14, 15, 16, 18].map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow label={t("terminal.colorTheme")}>
        <select value={term.colorTheme} onChange={(e) => update({ terminal: { colorTheme: e.target.value as typeof term.colorTheme } })}>
          <option value="match-app">{t("terminal.colorTheme.match")}</option>
          <option value="dark">{t("terminal.colorTheme.dark")}</option>
          <option value="light">{t("terminal.colorTheme.light")}</option>
        </select>
      </SettingRow>

      <SettingRow label={t("terminal.defaultShell")}>
        <select value={term.defaultShell} onChange={(e) => update({ terminal: { defaultShell: e.target.value as typeof term.defaultShell } })}>
          <option value="auto">{t("terminal.defaultShell.auto")}</option>
          <option value="/bin/sh">/bin/sh</option>
          <option value="/bin/bash">/bin/bash</option>
        </select>
      </SettingRow>

      <div className="setting-row">
        <div className="setting-row-text">
          <div className="setting-row-label">{t("terminal.shortcuts")}</div>
          <div className="setting-row-desc">{t("terminal.shortcuts.desc")}</div>
        </div>
      </div>
    </div>
  );
}
