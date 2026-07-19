export function formatBytes(n: number): string {
  // Rounded even in this branch, unlike it looks like it needs to be:
  // every other caller only ever passes an integer byte count, but the
  // network rate charts (rxRateBps/txRateBps = bytes / elapsed seconds)
  // pass a genuine float that can land under 1024 with a long tail of
  // decimals - un-rounded, that showed up as literally "2.4549495119…
  // B" in the UI instead of a clean "2 B".
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export function formatUptime(createdAtSecs: number): string {
  const elapsed = Date.now() / 1000 - createdAtSecs;
  if (elapsed < 60) return `${Math.floor(elapsed)}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`;
  return `${Math.floor(elapsed / 86400)}d`;
}
