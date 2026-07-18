import type { ReactNode } from "react";

export function SettingRow({
  label,
  description,
  restartRequired,
  restartLabel,
  children,
}: {
  label: string;
  description?: string;
  restartRequired?: boolean;
  restartLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <div className="setting-row-label">
          {label}
          {restartRequired && <span className="setting-row-restart">{restartLabel}</span>}
        </div>
        {description && <div className="setting-row-desc">{description}</div>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}
