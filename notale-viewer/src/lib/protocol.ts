/** Read-only client view of the versioned Notale HTTP protocol. */
export interface CreateRunRequest {
  query: string;
  minutes: number;
  audience: string;
  scenario: string;
  style: string;
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface PageProgress {
  pageId: string;
  pageTitle: string;
  state: 'pending' | 'generating' | 'checking' | 'reworking' | 'ready' | 'failed' | 'cancelled' | 'unknown';
  message?: string;
  previewUrl?: string;
  updatedAt?: string;
}

export interface RunSnapshot {
  protocolVersion: 1;
  id: string;
  status: RunStatus;
  request: CreateRunRequest;
  createdAt: string;
  updatedAt: string;
  lastSequence: number;
  pages?: PageProgress[];
  phase?: string;
  error?: string;
  previewUrl?: string;
}

export interface RunEvent {
  protocolVersion: 1;
  runId: string;
  sequence: number;
  timestamp: string;
  kind: "workflow.progress" | "plan.ready" | "page.progress" | "run.started" | "phase.changed" | "page.started" | "page.ready" | "artifact.ready" | "run.completed" | "run.failed" | "run.cancelled";
  message: string;
  phase?: string;
  workflow?: { module: 'planner' | 'director'; step: string; status: 'started' | 'completed' | 'reworking' | 'failed' | 'skipped'; occurredAt: string };
  pages?: PageProgress[];
  pageState?: PageProgress["state"];
  pageId?: string;
  pageTitle?: string;
  previewUrl?: string;
}
