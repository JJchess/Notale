export interface WorkerRuntimeOptions {
  workerUrl?: string;
  timeoutMs?: number;
  onStatus?: (status: { kind: string; message: string }) => void;
}
export declare class WorkerRuntimeAdapter {
  constructor(options?: WorkerRuntimeOptions);
  start(): Promise<unknown>;
  cancel(options?: { restart?: boolean }): void;
  getState(): { ready: boolean };
  dispose(): void;
}
