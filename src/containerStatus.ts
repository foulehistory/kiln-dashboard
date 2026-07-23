import type { ContainerInfo } from "./types";

/** The five states a container (or a whole compose-group card) can show:
 * `launching`/`stopping` are the client's own optimistic tracking of a
 * start/stop request in flight - there's no such status on the runtime
 * side, just `Status::Running`/`Status::Exited(code)` - and `crashed` is
 * `exited` with a non-zero code, split out so a real failure reads
 * differently from a normal, deliberate stop. Distinct from
 * `HealthBadge`'s "unhealthy" (a *running* container whose
 * `healthcheck:` is failing) - this is about whether the process itself
 * is even up. */
export type StatusKey = "launching" | "running" | "stopping" | "exited" | "crashed";

export function statusKey(status: string, transition: "stopping" | "launching" | null): StatusKey {
  if (transition) return transition;
  if (status === "running") return "running";
  const m = /^exited\((-?\d+)\)$/.exec(status);
  const code = m ? Number(m[1]) : 0;
  return code === 0 ? "exited" : "crashed";
}

export const STATUS_LABEL: Record<StatusKey, string> = {
  launching: "Launching",
  running: "Running",
  stopping: "Stopping",
  exited: "Stopped",
  crashed: "Crashed",
};

/** Worst-first across a compose group's own containers, same principle
 * as health aggregation elsewhere in this app - a group with even one
 * crashed or still-starting member reads as that, not just "mostly
 * fine". */
export function aggregateStatusKey(containers: ContainerInfo[], groupTransition: "stopping" | "launching" | null): StatusKey {
  if (groupTransition) return groupTransition;
  const keys = containers.map((c) => statusKey(c.status, null));
  if (keys.includes("crashed")) return "crashed";
  if (keys.includes("running")) return "running";
  return "exited";
}
