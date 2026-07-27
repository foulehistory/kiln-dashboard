/** A shortcut is stored as a normalized, lowercase `"+"`-joined combo
 * string, e.g. `"mod+k"` or `"ctrl+shift+p"` - `mod` resolves to Cmd on
 * macOS and Ctrl everywhere else (the same convention VSCode/Raycast use
 * for their own cross-platform default bindings), so the shipped default
 * doesn't need a separate value per platform. Recording a combo by hand
 * (see `recordShortcut`) always captures the *literal* modifier actually
 * held, never `mod` - only the built-in default uses it.
 */

interface ParsedShortcut {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const isMac = () => navigator.platform.toLowerCase().includes("mac");

/** `KeyboardEvent.key` for the spacebar is a literal `" "`, which
 * doesn't survive being embedded in a `"+"`-joined combo string the same
 * way a letter does - normalized to the word `"space"` everywhere a key
 * name is produced *or* compared, so recording and matching agree. */
function normalizeKey(rawKey: string): string {
  const k = rawKey.toLowerCase();
  return k === " " ? "space" : k;
}

function parseShortcut(spec: string): ParsedShortcut {
  const parts = spec
    .toLowerCase()
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed: ParsedShortcut = { ctrl: false, meta: false, shift: false, alt: false, key: "" };
  for (const p of parts) {
    if (p === "mod") {
      if (isMac()) parsed.meta = true;
      else parsed.ctrl = true;
    } else if (p === "ctrl" || p === "control") parsed.ctrl = true;
    else if (p === "cmd" || p === "meta" || p === "command") parsed.meta = true;
    else if (p === "shift") parsed.shift = true;
    else if (p === "alt" || p === "option") parsed.alt = true;
    else parsed.key = p;
  }
  return parsed;
}

/** Whether a live `keydown` event matches `spec` exactly - every
 * modifier must match (not just the ones named in `spec`), so `"ctrl+k"`
 * doesn't also fire for `Ctrl+Shift+K`. */
export function matchesShortcut(e: KeyboardEvent, spec: string): boolean {
  const p = parseShortcut(spec);
  return e.ctrlKey === p.ctrl && e.metaKey === p.meta && e.shiftKey === p.shift && e.altKey === p.alt && normalizeKey(e.key) === p.key;
}

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os"]);

/** Builds a combo string from a live `keydown` event - `null` while only
 * a modifier is held (nothing to record yet), waiting for the actual key
 * that completes the chord. Always records the literal modifier keys
 * held, never `"mod"` (that's only ever the *default* value's shorthand -
 * see this module's own docs). */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const key = normalizeKey(e.key);
  if (MODIFIER_KEYS.has(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("meta");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** Human-readable form for display, e.g. `"mod+k"` -> `"Ctrl+K"` (or
 * `"Cmd+K"` on macOS) - resolves `mod` the same way `matchesShortcut`
 * does, so what's shown always matches what actually triggers it on the
 * current platform. */
export function formatShortcut(spec: string): string {
  const p = parseShortcut(spec);
  const parts: string[] = [];
  if (p.ctrl) parts.push("Ctrl");
  if (p.meta) parts.push(isMac() ? "Cmd" : "Win");
  if (p.alt) parts.push(isMac() ? "Option" : "Alt");
  if (p.shift) parts.push("Shift");
  if (p.key) parts.push(p.key === "space" ? "Space" : p.key.length === 1 ? p.key.toUpperCase() : p.key.charAt(0).toUpperCase() + p.key.slice(1));
  return parts.join("+") || "—";
}

/** A combo needs at least one modifier plus a real key - otherwise every
 * plain letter typed anywhere in the app (a search box, a form field)
 * would fire it. Used to reject a recorded combo like a bare `"k"`
 * before it ever gets saved. */
export function isUsableShortcut(spec: string): boolean {
  const p = parseShortcut(spec);
  return p.key !== "" && (p.ctrl || p.meta || p.alt);
}
