import { useEffect, useState } from "react";
import { useSettings } from "../../settings/SettingsContext";
import { useT } from "../../i18n/useT";
import { SettingRow } from "./controls";
import { formatShortcut, isUsableShortcut, shortcutFromEvent } from "../../shortcuts";

const DEFAULT_COMMAND_PALETTE_SHORTCUT = "mod+k";

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (spec: string) => void }) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Captured at the window level (not on a focusable element) and in the
  // capture phase, so the combo being recorded can't be swallowed first
  // by whatever else on the page might otherwise handle it (including
  // this same shortcut's own currently-active binding).
  useEffect(() => {
    if (!recording) return;
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setError(null);
        return;
      }
      const spec = shortcutFromEvent(e);
      if (!spec) return; // only a modifier held so far - keep waiting for the real key
      if (!isUsableShortcut(spec)) {
        setError(t("shortcuts.needsModifier"));
        return;
      }
      onChange(spec);
      setRecording(false);
      setError(null);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={recording ? "primary" : undefined}
          onClick={() => {
            setRecording(true);
            setError(null);
          }}
        >
          {recording ? t("shortcuts.recording") : formatShortcut(value)}
        </button>
        {value !== DEFAULT_COMMAND_PALETTE_SHORTCUT && <button onClick={() => onChange(DEFAULT_COMMAND_PALETTE_SHORTCUT)}>{t("shortcuts.reset")}</button>}
      </div>
      {error && (
        <div className="updates-error" style={{ fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function ShortcutsSection() {
  const { settings, update } = useSettings();
  const t = useT();

  return (
    <div>
      <SettingRow label={t("shortcuts.commandPalette")} description={t("shortcuts.commandPalette.desc")}>
        <ShortcutRecorder value={settings.shortcuts.commandPalette} onChange={(spec) => update({ shortcuts: { commandPalette: spec } })} />
      </SettingRow>
    </div>
  );
}
