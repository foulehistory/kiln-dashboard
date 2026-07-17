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

export interface Stats {
  memory_current_bytes: number;
  cpu_usage_usec: number;
  pids_current: number;
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export interface RunSpec {
  image: string;
  command?: string[];
  name?: string;
  volumes?: string[];
  network?: string;
  environment?: [string, string][];
}

export interface UpdateStatus {
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  downloadUrl?: string | null;
  error?: string;
}

export interface KilnApi {
  containers(): Promise<ApiResult<ContainerInfo[]>>;
  images(): Promise<ApiResult<ImageInfo[]>>;
  networks(): Promise<ApiResult<NetworkInfo[]>>;
  stats(id: string): Promise<ApiResult<Stats>>;
  logs(id: string): Promise<ApiResult<string>>;
  stop(id: string): Promise<ApiResult<null>>;
  remove(id: string): Promise<ApiResult<null>>;
  run(spec: RunSpec): Promise<ApiResult<ContainerInfo>>;

  execStart(containerId: string): Promise<number>;
  execWrite(sessionId: number, data: string): void;
  execClose(sessionId: number): void;
  onExecData(cb: (payload: { sessionId: number; data: string }) => void): () => void;
  onExecClosed(cb: (payload: { sessionId: number }) => void): () => void;

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
