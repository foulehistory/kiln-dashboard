import { useState, type ComponentType } from "react";
import { useT } from "../i18n/useT";
import type { TKey } from "../i18n/dictionaries";
import AppearanceSection from "./settings/AppearanceSection";
import BehaviorSection from "./settings/BehaviorSection";
import NotificationsSection from "./settings/NotificationsSection";
import LogsSection from "./settings/LogsSection";
import TerminalSection from "./settings/TerminalSection";
import ConnectionSection from "./settings/ConnectionSection";
import UpdatesSection from "./settings/UpdatesSection";
import DataSection from "./settings/DataSection";
import RegistrySection from "./settings/RegistrySection";

type Section = "appearance" | "behavior" | "notifications" | "logs" | "terminal" | "connection" | "updates" | "data" | "registry";

const SECTIONS: { key: Section; labelKey: TKey; Component: ComponentType }[] = [
  { key: "appearance", labelKey: "settings.section.appearance", Component: AppearanceSection },
  { key: "behavior", labelKey: "settings.section.behavior", Component: BehaviorSection },
  { key: "notifications", labelKey: "settings.section.notifications", Component: NotificationsSection },
  { key: "logs", labelKey: "settings.section.logs", Component: LogsSection },
  { key: "terminal", labelKey: "settings.section.terminal", Component: TerminalSection },
  { key: "connection", labelKey: "settings.section.connection", Component: ConnectionSection },
  { key: "updates", labelKey: "settings.section.updates", Component: UpdatesSection },
  { key: "registry", labelKey: "settings.section.registry", Component: RegistrySection },
  { key: "data", labelKey: "settings.section.data", Component: DataSection },
];

export default function SettingsView() {
  const t = useT();
  const [section, setSection] = useState<Section>("appearance");
  const active = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];
  const Active = active.Component;

  return (
    <div>
      <h1>{t("settings.title")}</h1>
      <div className="settings-layout">
        <div className="settings-nav">
          {SECTIONS.map((s) => (
            <div
              key={s.key}
              className={`settings-nav-item${s.key === section ? " active" : ""}`}
              onClick={() => setSection(s.key)}
            >
              {t(s.labelKey)}
            </div>
          ))}
        </div>
        <div className="settings-content">
          <Active />
        </div>
      </div>
    </div>
  );
}
