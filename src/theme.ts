export type Theme = "dark" | "light";

export const THEME_KEY = "kiln-dashboard:theme";

export function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
