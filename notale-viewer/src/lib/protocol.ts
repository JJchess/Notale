/** Read-only client view of the versioned Notale HTTP protocol. */
export interface CreateRunRequest {
  query: string;
  minutes: number;
  audience: string;
  scenario: string;
  style: string;
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface RunSnapshot {
  protocolVersion: 1;
  id: string;
  status: RunStatus;
  request: CreateRunRequest;
  createdAt: string;
  updatedAt: string;
  lastSequence: number;
  phase?: string;
  error?: string;
  previewUrl?: string;
}

export interface RunEvent {
  protocolVersion: 1;
  runId: string;
  sequence: number;
  timestamp: string;
  kind: "run.started" | "phase.changed" | "page.started" | "page.ready" | "artifact.ready" | "run.completed" | "run.failed" | "run.cancelled";
  message: string;
  phase?: string;
  pageId?: string;
  pageTitle?: string;
  previewUrl?: string;
}
