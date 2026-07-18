export type Theme = "dark" | "light";

export const THEME_KEY = "kiln-dashboard:theme";

export function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Resolves Settings > Appearance > Theme's "auto" against the OS's
 * current preference - shared by App.tsx (root theme) and TerminalView
 * (its "match app theme" terminal color option). */
export function resolveTheme(theme: Theme | "auto"): Theme {
  if (theme === "auto") {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}
