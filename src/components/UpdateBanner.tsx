import { useEffect, useState } from "react";
import type { UpdateStatus } from "../types";
import { useSettings } from "../settings/SettingsContext";
import { notify } from "../notifications/notify";
import { CloseIcon } from "./icons";

type DashboardPhase = "idle" | "downloading" | "downloaded" | "installing";

/** A full-width banner at the very top of the window when an update is
 * available - replaces the old always-present sidebar widget (version
 * numbers, a permanent "Recheck" link) with something that only takes up
 * space when there's actually something to act on. Settings > Mise à
 * jour still has "Vérifier maintenant" and the current version for
 * anyone who wants to check by hand. */
export default function UpdateBanner() {
  const { settings } = useSettings();
  const [dashboard, setDashboard] = useState<UpdateStatus | null>(null);
  const [kilnd, setKilnd] = useState<UpdateStatus | null>(null);
  const [dashboardPhase, setDashboardPhase] = useState<DashboardPhase>("idle");
  const [dashboardProgress, setDashboardProgress] = useState(0);
  const [kilndApplying, setKilndApplying] = useState(false);
  const [kilndError, setKilndError] = useState<string | null>(null);
  const [dismissedDashboard, setDismissedDashboard] = useState(false);
  const [dismissedKilnd, setDismissedKilnd] = useState(false);

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

  useEffect(() => {
    if (!settings.updates.autoCheck) return;
    (async () => {
      const [d, k] = await Promise.all([
        window.kiln.checkDashboardUpdate(),
        window.kiln.checkKilndUpdate().catch((e) => ({ currentVersion: null, latestVersion: null, available: false, error: String(e) })),
      ]);
      setDashboard(d);
      setKilnd(k);
      if (d.available) notify(settings, "updateAvailable", "Dashboard update available", d.latestVersion ?? "");
      if (k.available) notify(settings, "updateAvailable", "kilnd update available", k.latestVersion ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updates.autoCheck]);

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

  const showDashboard = dashboard?.available && !dismissedDashboard;
  const showKilnd = kilnd?.available && !dismissedKilnd;
  if (!showDashboard && !showKilnd) return null;

  return (
    <div className="update-banners">
      {showDashboard && (
        <div className="update-banner">
          <span>
            Mise à jour du Dashboard <strong>v{dashboard!.latestVersion}</strong> disponible
          </span>
          {dashboardPhase === "idle" && (
            <button className="primary" onClick={downloadDashboard}>
              Mettre à jour
            </button>
          )}
          {dashboardPhase === "downloading" && (
            <span className="muted">
              <span className="spinner" />
              {dashboardProgress.toFixed(0)}%
            </span>
          )}
          {dashboardPhase === "downloaded" && (
            <button className="primary" onClick={installDashboard}>
              Redémarrer et installer
            </button>
          )}
          {dashboardPhase === "installing" && (
            <span className="muted">
              <span className="spinner" />
              Redémarrage…
            </span>
          )}
          <button className="update-banner-close" title="Fermer" onClick={() => setDismissedDashboard(true)}>
            <CloseIcon />
          </button>
        </div>
      )}
      {showKilnd && (
        <div className="update-banner">
          <span>
            Mise à jour de kilnd <strong>v{kilnd!.latestVersion}</strong> disponible
          </span>
          {!kilndApplying ? (
            <button className="primary" onClick={applyKilnd}>
              Mettre à jour
            </button>
          ) : (
            <span className="muted">
              <span className="spinner" />
              Mise à jour…
            </span>
          )}
          {kilndError && <span className="updates-error">{kilndError}</span>}
          <button className="update-banner-close" title="Fermer" onClick={() => setDismissedKilnd(true)}>
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
