import type { CreateRunRequest, RunEvent, RunSnapshot } from "./protocol";

const base = "/notale-api/v1";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  return response.json() as Promise<T>;
}

export async function createRun(request: CreateRunRequest): Promise<RunSnapshot> {
  return json(await fetch(`${base}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  }));
}

export async function getRun(runId: string): Promise<RunSnapshot> {
  return json(await fetch(`${base}/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }));
}

export async function cancelRun(runId: string): Promise<RunSnapshot> {
  return json(await fetch(`${base}/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }));
}

export function eventUrl(runId: string, after: number): string {
  return `${base}/runs/${encodeURIComponent(runId)}/events?after=${after}`;
}

export function previewUrl(runId: string, file = "index.html"): string {
  return `${base}/runs/${encodeURIComponent(runId)}/preview/${file}`;
}

export type { RunEvent, RunSnapshot };
