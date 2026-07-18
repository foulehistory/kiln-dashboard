import { useEffect, useRef, useState } from "react";
import { subscribeHistory, markAllNotificationsRead, clearNotificationHistory, type NotificationRecord } from "../notifications/notify";
import { BellIcon } from "./icons";

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** A bell for notifications you might have missed - every `notify()` call
 * is logged here regardless of channel/do-not-disturb (see notify.ts),
 * independent of the ephemeral toast stack which is easy to miss if the
 * window wasn't focused at the time. */
export default function NotificationBell() {
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeHistory(setHistory), []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unread = history.filter((r) => !r.read).length;

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen) markAllNotificationsRead();
      return !wasOpen;
    });
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button className="icon-btn bell-btn" title="Notifications" onClick={toggle}>
        <BellIcon />
        {unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-panel-header">
            <strong>Notifications</strong>
            {history.length > 0 && (
              <button className="bell-clear" onClick={clearNotificationHistory}>
                Clear
              </button>
            )}
          </div>
          {history.length === 0 && <div className="muted bell-empty">No notifications yet.</div>}
          {history.map((r) => (
            <div key={r.id} className={`bell-item${r.read ? "" : " unread"}`}>
              <div className="bell-item-title">{r.title}</div>
              {r.body && <div className="muted bell-item-body">{r.body}</div>}
              <div className="muted bell-item-time">{timeAgo(r.time)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
