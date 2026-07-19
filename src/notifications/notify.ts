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

// Container ids whose next running -> non-running transition shouldn't
// fire the "stopped unexpectedly" notification - App.tsx's background
// watcher polls container status independently of whichever view issued
// the stop, so without this it can't tell a deliberate Stop/Restart/
// Remove click apart from a real crash. Every UI action that already
// knows a stop is coming calls `expectStop(id)` right before telling
// kilnd to stop it; the watcher calls `consumeExpectedStop(id)` instead
// of notifying, which also *removes* the id - so a later genuine crash
// of that same container still notifies normally.
const expectedStops = new Set<string>();

export function expectStop(id: string) {
  expectedStops.add(id);
}

export function consumeExpectedStop(id: string): boolean {
  return expectedStops.delete(id);
}

export interface NotificationRecord {
  id: number;
  title: string;
  body: string;
  time: number;
  read: boolean;
}

// A short in-memory (not persisted - session-only, cleared on restart,
// same lifetime as the toasts themselves) log of everything `notify()`
// let through, independent of which delivery channel(s) it actually went
// to - this is what the sidebar's bell icon reads, so a notification
// missed as a toast (window not focused, already dismissed, do-not-
// disturb was on) is still there to check later.
const HISTORY_LIMIT = 50;
let history: NotificationRecord[] = [];
const historyListeners = new Set<(history: NotificationRecord[]) => void>();

function publishHistory() {
  historyListeners.forEach((fn) => fn(history));
}

export function subscribeHistory(fn: (history: NotificationRecord[]) => void): () => void {
  fn(history);
  historyListeners.add(fn);
  return () => historyListeners.delete(fn);
}

export function markAllNotificationsRead() {
  history = history.map((r) => ({ ...r, read: true }));
  publishHistory();
}

export function clearNotificationHistory() {
  history = [];
  publishHistory();
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

  history = [{ id: Date.now() + Math.random(), title, body, time: Date.now(), read: false }, ...history].slice(0, HISTORY_LIMIT);
  publishHistory();

  // Do-not-disturb only suppresses the immediate interruption (toast/OS
  // notification) - it's still logged above, since the whole point of
  // the bell is to surface exactly what you were shielded from.
  if (n.doNotDisturb && isWithinDoNotDisturb(n.doNotDisturbStart, n.doNotDisturbEnd)) return;
  if (n.channel === "in-app" || n.channel === "both") {
    listeners.forEach((fn) => fn(title, body));
  }
  if (n.channel === "native" || n.channel === "both") {
    window.kiln.notify(title, body, !n.sound);
  }
}
