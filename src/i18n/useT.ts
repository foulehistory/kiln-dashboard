import { useSettings } from "../settings/SettingsContext";
import { dictionaries, type TKey } from "./dictionaries";

/** Translates Settings-page strings per Settings > Appearance > Language.
 * See dictionaries.ts's header comment for why this is scoped to the
 * Settings page only, for now. */
export function useT() {
  const { settings } = useSettings();
  const dict = dictionaries[settings.appearance.language];
  return (key: TKey) => dict[key] ?? key;
}
