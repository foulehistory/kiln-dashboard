import { useState } from "react";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "./icons";
import { isSecretKey } from "../secrets";

const MASK = "••••••••";

/** One `KEY=value` row in the image detail view's Environment section. A
 * key that looks sensitive (see `isSecretKey`) is masked by default, with
 * a per-row eye toggle - `revealed` is local state, not persisted, so
 * re-opening the modal always starts masked again. The underlying value
 * already arrived with the rest of `ImageDetail` in one IPC round trip
 * (same as every other field this view shows), so masking here is a
 * display-only precaution against shoulder-surfing/screen-sharing, not a
 * guarantee the value was never in renderer memory - there's no
 * per-secret fetch-on-demand endpoint for image env vars to defer that
 * with.
 *
 * `hidden` keeps a row mounted (so a live filter never resets `revealed`/
 * `copied` on a row that's still visible) but removes it from layout -
 * used by the filter input above both env sections. */
export default function EnvVarRow({ envKey, value, hidden }: { envKey: string; value: string; hidden?: boolean }) {
  const secret = isSecretKey(envKey);
  const [revealed, setRevealed] = useState(!secret);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="env-var-row" style={hidden ? { display: "none" } : undefined}>
      <span className="mono env-var-key">{envKey}</span>
      <span className="mono muted env-var-value">{revealed ? value : MASK}</span>
      <span className="env-var-actions">
        {secret && (
          <button className="icon-btn" title={revealed ? "Hide value" : "Show value"} onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
        <button className="icon-btn" title="Copy value" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </span>
    </div>
  );
}
