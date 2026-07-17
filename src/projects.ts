import type { ContainerInfo } from "./types";

const NETWORK_SUFFIX = "_default";

/**
 * `kiln-compose` names a project's shared network `<project>_default` and
 * each of its services `<project>_<service>` (see kiln-compose's module
 * docs). The network name is the more reliable signal to group on: service
 * names can themselves contain underscores, but the network suffix is
 * fixed and exact. Containers started directly via `kiln run` (no compose
 * project) have no such network and are left ungrouped.
 */
export function projectOf(c: ContainerInfo): string | null {
  if (c.network && c.network.endsWith(NETWORK_SUFFIX)) {
    return c.network.slice(0, -NETWORK_SUFFIX.length);
  }
  return null;
}

/** Strip the `<project>_` prefix `kiln-compose` puts on every service's container name. */
export function serviceName(c: ContainerInfo, project: string): string {
  const prefix = `${project}_`;
  return c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name;
}

export interface ProjectGroup {
  project: string;
  containers: ContainerInfo[];
}

export function groupByProject(containers: ContainerInfo[]): { groups: ProjectGroup[]; standalone: ContainerInfo[] } {
  const byProject = new Map<string, ContainerInfo[]>();
  const standalone: ContainerInfo[] = [];
  for (const c of containers) {
    const project = projectOf(c);
    if (project === null) {
      standalone.push(c);
      continue;
    }
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project)!.push(c);
  }
  const groups = [...byProject.entries()]
    .map(([project, containers]) => ({ project, containers }))
    .sort((a, b) => a.project.localeCompare(b.project));
  return { groups, standalone };
}
