import type { AppSettings } from "../types";

// A tiny pub/sub instead of another React context: any component that
// already has `settings` (via `useSettings()`) can call `notify()`
// directly without needing to be a descendant of whichever component
// happens to render the toast stack (that's `AppShell` in App.tsx, but
// this file doesn't need to know that).
type ToastListener = (title: string, body: string) => void;
const listeners = new Set<ToastListener>();

export function subscribeToasts(fn: ToastListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isWithinDoNotDisturb(start: string, end: string): boolean {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

export function notify(
  settings: AppSettings,
  eventKey: keyof AppSettings["notifications"]["events"],
  title: string,
  body: string,
) {
  const n = settings.notifications;
  if (!n.events[eventKey]) return;
  if (n.doNotDisturb && isWithinDoNotDisturb(n.doNotDisturbStart, n.doNotDisturbEnd)) return;
  if (n.channel === "in-app" || n.channel === "both") {
    listeners.forEach((fn) => fn(title, body));
  }
  if (n.channel === "native" || n.channel === "both") {
    window.kiln.notify(title, body, !n.sound);
  }
}
