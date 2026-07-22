import { useCallback, useEffect, useRef, useState } from "react";

/** Poll `fn` every `intervalMs`, re-subscribing whenever `deps` changes. */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fnRef
        .current()
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(String(e));
        });
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /** On-demand fetch, for callers that need fresh data sooner than the
   * next scheduled tick - e.g. a container list consumer clearing a
   * "stopping…"/"launching…" transition indicator only once the polled
   * status has actually caught up with the action that just completed,
   * rather than on whatever the next tick happens to land on (which
   * could still show the old "running" status for up to a full
   * `intervalMs`, flashing back to a stale state before catching up). */
  const refetch = useCallback(async () => {
    const d = await fnRef.current();
    setData(d);
    setError(null);
    return d;
  }, []);

  return { data, error, refetch };
}
