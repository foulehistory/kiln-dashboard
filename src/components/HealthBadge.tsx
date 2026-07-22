/** Renders `ContainerInfo.health` ("starting"/"healthy"/"unhealthy") as a
 * small badge, or nothing at all for `"none"` - a container with no
 * `healthcheck:` configured (see `kiln_cli::container::HealthStatus` on
 * the runtime side) has nothing meaningful to show here. */
export default function HealthBadge({ health }: { health: string }) {
  if (health === "none") return null;
  return <span className={`badge ${health}`}>{health}</span>;
}
