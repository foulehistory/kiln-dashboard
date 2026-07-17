import { useEffect, useState } from "react";
import type { UpdateStatus } from "../types";

type DashboardPhase = "idle" | "downloading" | "downloaded" | "installing";

export default function UpdatesWidget() {
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dashboard, setDashboard] = useState<UpdateStatus | null>(null);
  const [kilnd, setKilnd] = useState<UpdateStatus | null>(null);
  const [dashboardPhase, setDashboardPhase] = useState<DashboardPhase>("idle");
  const [dashboardProgress, setDashboardProgress] = useState(0);
  const [kilndApplying, setKilndApplying] = useState(false);
  const [kilndError, setKilndError] = useState<string | null>(null);

  useEffect(() => {
    const offProgress = window.kiln.onDashboardUpdateProgress(({ percent }) => {
      setDashboardPhase("downloading");
      setDashboardProgress(percent);
    });
    const offDownloaded = window.kiln.onDashboardUpdateDownloaded(() => setDashboardPhase("downloaded"));
    return () => {
      offProgress();
      offDownloaded();
    };
  }, []);

  // Silent check on launch, so an available update shows up on its own
  // instead of staying hidden behind a button nobody thinks to click.
  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check() {
    setChecking(true);
    const [d, k] = await Promise.all([window.kiln.checkDashboardUpdate(), window.kiln.checkKilndUpdate().catch((e) => ({ currentVersion: null, latestVersion: null, available: false, error: String(e) }))]);
    setDashboard(d);
    setKilnd(k);
    setChecked(true);
    setChecking(false);
  }

  async function downloadDashboard() {
    setDashboardPhase("downloading");
    setDashboardProgress(0);
    await window.kiln.downloadDashboardUpdate();
  }

  async function installDashboard() {
    setDashboardPhase("installing");
    await window.kiln.installDashboardUpdate();
  }

  async function applyKilnd() {
    if (!kilnd?.downloadUrl) return;
    setKilndApplying(true);
    setKilndError(null);
    try {
      await window.kiln.applyKilndUpdate(kilnd.downloadUrl);
      setKilnd({ ...kilnd, available: false, currentVersion: kilnd.latestVersion });
    } catch (e) {
      setKilndError(String(e));
    }
    setKilndApplying(false);
  }

  const anyAvailable = (dashboard?.available ?? false) || (kilnd?.available ?? false);

  return (
    <div className="updates-widget">
      {!checked && (
        <button className="updates-check-btn" disabled={checking} onClick={check}>
          {checking ? (
            <>
              <span className="spinner" />
              Checking…
            </>
          ) : (
            "Check for updates"
          )}
        </button>
      )}

      {checked && (
        <div className="updates-results">
          <div className="updates-row">
            <span className="muted">
              {dashboard?.available && <span className="update-dot" />}
              Dashboard
            </span>
            <span className="mono">{dashboard?.currentVersion ?? "?"}</span>
          </div>
          {dashboard?.available && dashboardPhase === "idle" && (
            <button className="updates-action" onClick={downloadDashboard}>
              Update to {dashboard.latestVersion}
            </button>
          )}
          {dashboardPhase === "downloading" && (
            <div className="muted updates-progress">
              <span className="spinner" />
              {dashboardProgress.toFixed(0)}%
            </div>
          )}
          {dashboardPhase === "downloaded" && (
            <button className="updates-action" onClick={installDashboard}>
              Restart &amp; install
            </button>
          )}
          {dashboardPhase === "installing" && (
            <div className="muted updates-progress">
              <span className="spinner" />
              Restarting…
            </div>
          )}

          <div className="updates-row" style={{ marginTop: 8 }}>
            <span className="muted">
              {kilnd?.available && <span className="update-dot" />}
              kilnd
            </span>
            <span className="mono">{kilnd?.currentVersion ?? "?"}</span>
          </div>
          {kilnd?.error && <div className="updates-error">{kilnd.error}</div>}
          {kilnd?.available && !kilndApplying && (
            <button className="updates-action" onClick={applyKilnd}>
              Update to {kilnd.latestVersion}
            </button>
          )}
          {kilndApplying && (
            <div className="muted updates-progress">
              <span className="spinner" />
              Updating…
            </div>
          )}
          {kilndError && <div className="updates-error">{kilndError}</div>}

          {!anyAvailable && !dashboard?.error && <div className="muted updates-uptodate">Up to date</div>}
          <button className="updates-recheck" onClick={check} disabled={checking}>
            Recheck
          </button>
        </div>
      )}
    </div>
  );
}
