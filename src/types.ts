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
}

export interface ImageInfo {
  id: string;
  repository: string | null;
  tag: string | null;
  layers: number;
  size_bytes: number;
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

export interface VolumeFileEntry {
  name: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface Stats {
  memory_current_bytes: number;
  cpu_usage_usec: number;
  pids_current: number;
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
  removeImage(id: string): Promise<ApiResult<{ message: string } | string>>;
  pullImage(reference: string): Promise<ApiResult<{ id: string } | string>>;
  networks(): Promise<ApiResult<NetworkInfo[]>>;
  createNetwork(name: string, subnet?: string): Promise<ApiResult<{ ok: boolean } | string>>;
  removeNetwork(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  volumes(): Promise<ApiResult<VolumeInfo[]>>;
  createVolume(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  removeVolume(name: string): Promise<ApiResult<{ ok: boolean } | string>>;
  openVolumeFolder(hostPath: string): Promise<{ ok: boolean; error?: string }>;
  diskUsage(): Promise<ApiResult<DiskUsage>>;
  gc(): Promise<ApiResult<GcResult>>;
  listVolumeFiles(name: string, path: string): Promise<ApiResult<VolumeFileEntry[] | string>>;
  readVolumeFile(name: string, path: string): Promise<ApiResult<string>>;

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
