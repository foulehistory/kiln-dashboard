import { useState } from "react";
import { usePolling } from "../usePolling";
import { formatBytes } from "../format";
import type { GcResult } from "../types";

async function fetchUsage() {
  const r = await window.kiln.diskUsage();
  if (r.status !== 200) throw new Error(`unexpected response (status ${r.status})`);
  return r.body;
}

/** `kiln rmi` never frees the underlying blobs a layer's files live in
 * (they may be shared with other images - see kiln-image::store's dedup
 * docs), so they just accumulate until `kiln gc` sweeps whatever's no
 * longer reachable from a tagged image. This surfaces both the current
 * breakdown and a button to run that sweep, without needing a terminal. */
export default function DiskUsageCard() {
  const { data: usage, error } = usePolling(fetchUsage, 10000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GcResult | null>(null);

  async function runGc() {
    setRunning(true);
    setResult(null);
    const r = await window.kiln.gc();
    setRunning(false);
    if (r.status === 200) setResult(r.body);
  }

  if (error || !usage) return null;

  return (
    <div className="card disk-usage-card">
      <div className="disk-usage-row">
        <div>
          <strong>Disk usage</strong>
          <div className="muted">{formatBytes(usage.total_bytes)} total</div>
        </div>
        <button onClick={runGc} disabled={running}>
          {running ? (
            <>
              <span className="spinner" />
              Cleaning…
            </>
          ) : (
            "Clean up (gc)"
          )}
        </button>
      </div>
      <div className="muted disk-usage-breakdown">
        Blobs {formatBytes(usage.blobs_bytes)} · Layers {formatBytes(usage.layers_bytes)} · Volumes {formatBytes(usage.volumes_bytes)} · Containers{" "}
        {formatBytes(usage.containers_bytes)}
      </div>
      {result && (
        <div className="muted disk-usage-result">
          Freed {formatBytes(result.bytes_freed)} ({result.blobs_removed} blob{result.blobs_removed === 1 ? "" : "s"}, {result.images_removed} untagged
          image{result.images_removed === 1 ? "" : "s"} removed).
        </div>
      )}
    </div>
  );
}
