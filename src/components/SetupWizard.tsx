import { useEffect, useRef, useState } from "react";
import type { SetupState } from "../types";

// Order matters here: it's both the display order and how step status is
// derived (any step before the current one is "done", the current one is
// "active", anything after is "pending") - see `stepStatus` below.
const STEPS: { state: SetupState; label: string }[] = [
  { state: "needs-features", label: "Enabling WSL2" },
  { state: "needs-distro", label: "Setting up the Kiln Linux environment" },
  { state: "needs-kiln", label: "Installing kiln/kilnd" },
  { state: "needs-base-image", label: "Building the base image" },
];

function stepStatus(step: SetupState, current: SetupState | null): "done" | "active" | "pending" {
  if (current === null) return "pending";
  if (current === "ready") return "done";
  const stepIndex = STEPS.findIndex((s) => s.state === step);
  const currentIndex = STEPS.findIndex((s) => s.state === current);
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export default function SetupWizard({ onReady }: { onReady: () => void }) {
  const [state, setState] = useState<SetupState | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  // Guards against the advance loop double-running under React 18 Strict
  // Mode's dev-only double-invoked effects, and against overlapping runs
  // if the component re-renders mid-loop.
  const runningRef = useRef(false);

  async function runSetupLoop() {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    try {
      for (;;) {
        const detected = await window.kiln.setupDetect();
        setState(detected.state);
        if (detected.state === "ready") {
          onReady();
          return;
        }
        const result = await window.kiln.setupAdvance();
        if (result.restartRequired) {
          setRestartRequired(true);
          return;
        }
        if (!result.ok) {
          setError(result.error ?? "setup step failed");
          return;
        }
      }
    } finally {
      runningRef.current = false;
    }
  }

  useEffect(() => {
    runSetupLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restartWindows() {
    setRestarting(true);
    await window.kiln.setupRestartWindows();
    // Windows is about to tear this process down anyway - nothing more
    // to do here, just avoid the button looking clickable again.
  }

  if (restartRequired) {
    return (
      <div className="setup-wizard">
        <div className="setup-card">
          <h1>Windows needs to restart</h1>
          <p className="muted">
            Enabling WSL2 requires a restart before setup can continue. Kiln Dashboard will reopen automatically
            after you log back in and pick up right where it left off.
          </p>
          <button className="primary" onClick={restartWindows} disabled={restarting}>
            {restarting ? (
              <>
                <span className="spinner" />
                Restarting…
              </>
            ) : (
              "Restart now"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-wizard">
      <div className="setup-card">
        <h1>Setting up Kiln</h1>
        <p className="muted">This only happens once - installing WSL2, the Kiln runtime, and the base image.</p>
        <div className="setup-steps">
          {STEPS.map((step) => {
            const status = stepStatus(step.state, state);
            return (
              <div key={step.state} className={`setup-step setup-step-${status}`}>
                <span className={`setup-step-icon setup-step-icon-${status}`}>
                  {status === "done" ? "✓" : status === "active" ? <span className="spinner" /> : ""}
                </span>
                {step.label}
              </div>
            );
          })}
        </div>
        {error && (
          <div className="updates-error">
            {error}
            <div>
              <button onClick={runSetupLoop}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
