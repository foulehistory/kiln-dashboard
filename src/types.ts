export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  command: string[];
  status: string;
  pid: number | null;
  ip: string | null;
  network: string | null;
  created_at: number;
  memory_limit_bytes: number | null;
  cpu_limit: number | null;
  /** "none"/"starting"/"healthy"/"unhealthy" - see `kilnd`'s
   * `ContainerJson::health` docs on the runtime side. */
  health: string;
}

export interface ImageInfo {
  id: string;
  repository: string | null;
  tag: string | null;
  layers: number;
  size_bytes: number;
}

export interface BuildStep {
  instruction: string;
  cached: boolean;
}

export interface BuildResult {
  image_id: string;
  steps: BuildStep[];
  tagged: string | null;
}

export interface LayerDetail {
  hash: string;
  entry_count: number;
  size_bytes: number;
}

export interface ImageDetail {
  id: string;
  repository: string | null;
  tag: string | null;
  env: [string, string][];
  cmd: string | null;
  workdir: string;
  exposed_ports: [number, string][];
  layers: LayerDetail[];
  signature_verified: boolean;
}

export interface Finding {
  id: string;
  package: string;
  installed_version: string;
  fixed_version: string | null;
  severity: string;
  url: string | null;
}

export interface ScanReport {
  critical: number;
  high: number;
  medium: number;
  low: number;
  findings: Finding[];
}

export interface FlowEvent {
  to_container: boolean;
  protocol: "tcp" | "udp";
  src: string;
  dst: string;
  bytes: number;
}

export interface NetworkContainer {
  id: string;
  name: string;
  ip: string;
}

export interface NetworkInfo {
  name: string;
  bridge: string;
  subnet: string;
  gateway: string;
  containers: NetworkContainer[];
}

export interface NodeInfo {
  name: string;
  address: string;
  reachable: boolean;
}

export interface DiskUsage {
  blobs_bytes: number;
  layers_bytes: number;
  volumes_bytes: number;
  containers_bytes: number;
  total_bytes: number;
}

export interface GcResult {
  blobs_removed: number;
  bytes_freed: number;
  images_removed: number;
}

export interface VolumeInfo {
  name: string;
  containers: string[];
  size_bytes: number;
  host_path: string;
}

/** A plain timestamped tar.gz copy, not an atomic filesystem-level
 * snapshot - see `kiln_cli::commands::volume::snapshot_create`'s own
 * docs on the runtime side for exactly what that does and doesn't
 * guarantee. */
export interface VolumeSnapshotInfo {
  id: string;
  size_bytes: number;
}

/** `version`/`created_at`/`rotated_at`/`ttl_secs` are absent for a secret
 * created before the metadata sidecar existed and never since rotated -
 * see `kiln_image::secrets::SecretMeta`'s own docs on the runtime side. */
export interface SecretInfo {
  name: string;
  version?: number;
  created_at?: number;
  rotated_at?: number;
  ttl_secs?: number;
}

/** `GET /compose-waiting` - see `kilnd::handlers::compose_waiting` on the
 * runtime side. A not-yet-created service `kiln-compose up` is currently
 * blocked on, waiting for a `depends_on: { condition: service_healthy }`
 * dependency - purely informational, and only present while some
 * `kiln-compose up` invocation is actually mid-wait. */
export interface ComposeWaitingInfo {
  container_name: string;
  waiting_for: string;
}

export interface RotateSecretLiveUpdate {
  container_id: string;
  container_name: string;
  updated: boolean;
}

/** `POST /secrets/:name/rotate` - see `kilnd::handlers::secrets::RotateResponse`
 * on the runtime side. */
export interface RotateSecretResult {
  meta: { version: number; created_at: number; rotated_at: number | null; ttl_secs: number | null };
  generated_value: string | null;
  live_updates: RotateSecretLiveUpdate[];
}

export interface VolumeFileEntry {
  name: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface Stats {
  memory_current_bytes: number;
  cpu_usage_usec: number;
  pids_current: number;
  rx_bytes: number | null;
  tx_bytes: number | null;
}

/** `GET /containers/:id/security` - see `kiln_cli::commands::inspect::SecurityReport`
 * on the runtime side. */
export interface SecurityReport {
  seccomp: string;
  effective_capabilities: string[];
  live_capability_bounding_set: string[] | null;
  matches_expected: boolean;
}

/** `GET /containers/:id/resources` - see `kiln_cli::commands::inspect::ResourcesReport`
 * on the runtime side. `null` fields mean "unlimited", same as a plain
 * `kiln run` with no `--memory`/`--cpus`. */
export interface ResourcesReport {
  cpu_limit: number | null;
  memory_limit_bytes: number | null;
  memory_swap_bytes: number | null;
  memory_high_bytes: number | null;
  live: Stats | null;
  last_exit_oom_killed: boolean;
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export interface RunSpec {
  image: string;
  command?: string[];
  name?: string;
  volumes?: string[];
  network?: string;
  environment?: [string, string][];
  memory?: string;
  cpus?: number;
  ports?: string[];
  restart?: string;
}

export interface UpdateStatus {
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  downloadUrl?: string | null;
  error?: string;
}

export interface AppSettings {
  appearance: {
    theme: "light" | "dark" | "auto";
    density: "compact" | "comfortable";
    language: "fr" | "en";
    fontScale: number;
  };
  behavior: {
    homeView: "containers" | "images" | "summary";
    confirmDestructive: boolean;
    confirmOnlyForRemovals: boolean;
    pollingIntervalMs: number;
    closeBehavior: "quit" | "tray";
    launchAtStartup: boolean;
  };
  notifications: {
    channel: "in-app" | "native" | "both";
    events: {
      containerStopped: boolean;
      buildFinished: boolean;
      pullFinished: boolean;
      resourceAlert: boolean;
      updateAvailable: boolean;
    };
    resourceAlertThresholdPct: number;
    sound: boolean;
    doNotDisturb: boolean;
    doNotDisturbStart: string;
    doNotDisturbEnd: string;
  };
  logs: {
    maxLines: number;
    timestampFormat: "relative" | "absolute";
    wrapLines: boolean;
  };
  terminal: {
    fontFamily: string;
    fontSize: number;
    colorTheme: "match-app" | "dark" | "light";
    defaultShell: "auto" | "/bin/sh" | "/bin/bash";
  };
  connection: {
    mode: "local" | "remote";
    remoteHost: string;
    remotePort: number;
    reconnectIntervalMs: number;
  };
  updates: {
    autoCheck: boolean;
    channel: "stable" | "beta";
  };
  data: {
    telemetry: boolean;
  };
  registry: {
    username: string;
    password: string;
    /** Host of a self-hosted `kiln-registry` (e.g. `registry.example.com`
     * or `http://192.168.1.10:5959` on a LAN) - when set, pushing an
     * image in the dashboard only asks for `<image>:<tag>` and this
     * host + `username` are prefixed automatically. Pulling always
     * requires a full explicit reference (never auto-prefixed), so a
     * bare Docker Hub reference like `mysql:8.0` is never ambiguous. */
    sharedHost: string;
  };
}

export interface AddonHttpFetchResult {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

export interface AddonManifest {
  id: string;
  name: string;
  icon: string | null;
  apiVersion: number;
  entry: string;
  /** Bridge methods this addon may call from its sandboxed iframe, e.g.
   * "containers:read" - see AddonsView.tsx's ADDON_PERMISSION_MAP. */
  permissions: string[];
  enabled: boolean;
}

export interface AddonStoreEntry {
  id: string;
  name: string;
  icon: string | null;
  version: string;
  description: string;
  download_url: string;
  sha256: string;
}

export type SetupState = "needs-features" | "needs-distro" | "needs-kiln" | "needs-base-image" | "ready";

export interface SetupDetectResult {
  state: SetupState;
}

export interface SetupAdvanceResult {
  ok: boolean;
  restartRequired?: boolean;
  error?: string;
}

export interface KilnApi {
  containers(): Promise<ApiResult<ContainerInfo[]>>;
  images(): Promise<ApiResult<ImageInfo[]>>;
  inspectImage(id: string): Promise<ApiResult<ImageDetail | string>>;
  pushImage(reference: string): Promise<ApiResult<{ id: string; pushed_as: string } | string>>;
  getScan(id: string): Promise<ApiResult<ScanReport | string>>;
  runScan(id: string): Promise<ApiResult<ScanReport | string>>;
  pickBuildContext(): Promise<{ windowsPath: string; wslPath: string } | null>;
  buildImage(contextDir: string, kilnfilePath: string | undefined, tag: string | undefined): Promise<ApiResult<BuildResult | string>>;
  removeImage(id: string): Promise<ApiResult<{ message: string } | string>>;
  pullImage(reference: string): Promise<ApiResult<{ id: string } | string>>;
  networks(): Promise<ApiResult<NetworkInfo[]>>;
  nodes(): Promise<ApiResult<NodeInfo[]>>;
  createNetwork(name: string, subnet?: string): Promise<ApiResult<{ ok: boolean } | string>>;
  removeNetwork(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  volumes(): Promise<ApiResult<VolumeInfo[]>>;
  createVolume(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  removeVolume(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  secrets(): Promise<ApiResult<SecretInfo[]>>;
  composeWaiting(): Promise<ApiResult<ComposeWaitingInfo[]>>;
  createSecret(name: string, value: string): Promise<ApiResult<{ ok: boolean } | string>>;
  removeSecret(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  rotateSecret(name: string): Promise<ApiResult<RotateSecretResult | string>>;
  openVolumeFolder(hostPath: string): Promise<{ ok: boolean; error?: string }>;
  exportVolume(name: string): Promise<{ ok: boolean; filePath?: string; error?: string }>;
  importVolume(name: string): Promise<{ ok: boolean; error?: string }>;
  volumeSnapshots(name: string): Promise<ApiResult<VolumeSnapshotInfo[]>>;
  createVolumeSnapshot(name: string, keep?: number): Promise<ApiResult<VolumeSnapshotInfo | string>>;
  restoreVolumeSnapshot(name: string, snapshotId: string): Promise<ApiResult<{ ok: boolean } | string>>;
  diskUsage(): Promise<ApiResult<DiskUsage>>;
  gc(): Promise<ApiResult<GcResult>>;
  listVolumeFiles(name: string, path: string): Promise<ApiResult<VolumeFileEntry[] | string>>;
  readVolumeFile(name: string, path: string): Promise<ApiResult<string>>;

  listAddons(): Promise<AddonManifest[]>;
  toggleAddon(id: string, enabled: boolean): Promise<{ ok: boolean }>;
  openAddonsFolder(): Promise<{ ok: boolean; error?: string }>;
  addonHttpFetch(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<AddonHttpFetchResult>;
  addonStoreIndex(): Promise<{ ok: boolean; addons?: AddonStoreEntry[]; error?: string }>;
  installAddon(entry: { id: string; downloadUrl: string; sha256: string }): Promise<{ ok: boolean; error?: string }>;

  getSettings(): Promise<AppSettings>;
  setSettings(patch: DeepPartial<AppSettings>): Promise<AppSettings>;
  resetSettings(): Promise<AppSettings>;
  openSettingsFolder(): Promise<void>;
  testConnection(host: string, port: number): Promise<ApiResult<unknown>>;
  getAppVersion(): Promise<string>;
  notify(title: string, body: string, silent?: boolean): Promise<void>;
  exportText(defaultName: string, content: string): Promise<{ ok: boolean; filePath?: string }>;
  setZoomFactor(factor: number): void;
  stats(id: string): Promise<ApiResult<Stats>>;
  containerSecurity(id: string): Promise<ApiResult<SecurityReport>>;
  containerResources(id: string): Promise<ApiResult<ResourcesReport>>;
  logs(id: string): Promise<ApiResult<string>>;
  stop(id: string): Promise<ApiResult<null>>;
  startExisting(id: string): Promise<ApiResult<ContainerInfo>>;
  remove(id: string): Promise<ApiResult<null>>;
  run(spec: RunSpec): Promise<ApiResult<ContainerInfo>>;
  updateLimits(id: string, memory?: string, cpus?: number): Promise<ApiResult<ContainerInfo | string>>;

  execStart(containerId: string, shell?: string): Promise<number>;
  execWrite(sessionId: number, data: string): void;
  execClose(sessionId: number): void;
  onExecData(cb: (payload: { sessionId: number; data: string }) => void): () => void;
  onExecClosed(cb: (payload: { sessionId: number }) => void): () => void;

  netEventsStart(containerId: string): Promise<number>;
  netEventsClose(sessionId: number): void;
  onNetEventsData(cb: (payload: { sessionId: number; event: FlowEvent }) => void): () => void;
  onNetEventsClosed(cb: (payload: { sessionId: number }) => void): () => void;

  setupDetect(): Promise<SetupDetectResult>;
  setupAdvance(): Promise<SetupAdvanceResult>;
  setupRestartWindows(): Promise<void>;

  checkKilndUpdate(): Promise<UpdateStatus>;
  applyKilndUpdate(downloadUrl: string): Promise<{ ok: boolean }>;
  checkDashboardUpdate(): Promise<UpdateStatus>;
  downloadDashboardUpdate(): Promise<void>;
  installDashboardUpdate(): Promise<void>;
  onDashboardUpdateProgress(cb: (payload: { percent: number }) => void): () => void;
  onDashboardUpdateDownloaded(cb: () => void): () => void;
}

declare global {
  interface Window {
    kiln: KilnApi;
  }
}
