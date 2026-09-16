import { readdir, stat, writeFile } from "node:fs/promises";
import { publicMessage } from './public-text.js';
import path from "node:path";
import { artifactManifestSchema, protocolVersion, type ArtifactManifest, type CreateRunRequest, type RunEvent, type RunEventKind, type RunSnapshot } from "../protocol/index.js";
import { RunStore } from "./run-store.js";

export interface GenerationContext {
  run: RunSnapshot;
  outputDir: string;
  signal: AbortSignal;
  emit(kind: RunEventKind, message: string, details?: Partial<Omit<RunEvent, "protocolVersion" | "runId" | "sequence" | "timestamp" | "kind" | "message">>): Promise<void>;
}

export type GenerationPipeline = (context: GenerationContext) => Promise<void>;

async function filesBelow(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const rows: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Generated output contains a symlink: ${absolute}`);
    if (entry.isDirectory()) rows.push(...await filesBelow(root, absolute));
    else if (entry.isFile()) rows.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return rows.sort();
}

interface RunningTask { controller: AbortController; done: Promise<void>; settling: boolean }

export class RunService {
  readonly store: RunStore;
  readonly pipeline: GenerationPipeline;
  readonly #tasks = new Map<string, RunningTask>();

  constructor(store: RunStore, pipeline: GenerationPipeline, private readonly onCompleted?: (id: string) => Promise<unknown>) {
    this.store = store;
    this.pipeline = pipeline;
  }

  async start(request: CreateRunRequest): Promise<RunSnapshot> {
    const run = await this.store.create(request);
    const controller = new AbortController();
    const task: RunningTask = { controller, done: Promise.resolve(), settling: false };
    this.#tasks.set(run.id, task);
    task.done = this.#execute(run, task).finally(() => this.#tasks.delete(run.id));
    // The request returns before generation; callers of cancel still observe errors.
    void task.done.catch(() => undefined);
    return run;
  }

  async cancel(id: string): Promise<RunSnapshot> {
    const task = this.#tasks.get(id);
    if (task) {
      // Once terminal persistence starts, completion has won the race.
      if (!task.settling) task.controller.abort();
      await task.done;
    }
    const run = await this.store.get(id);
    if (!task && !["completed", "failed", "cancelled"].includes(run.status)) {
      throw new Error("Run is not owned by this service; cancellation cannot be confirmed");
    }
    return run;
  }

  async manifest(id: string): Promise<ArtifactManifest> {
    const output = path.join(this.store.runDir(id), "output");
    const files = await filesBelow(output);
    if (!files.includes("index.html")) throw new Error("Run has no final index.html");
    return artifactManifestSchema.parse({
      protocolVersion,
      runId: id,
      entry: "index.html",
      files,
      createdAt: (await stat(path.join(output, "index.html"))).mtime.toISOString(),
    });
  }

  async #execute(run: RunSnapshot, task: RunningTask): Promise<void> {
    const { controller } = task;
    try {
      controller.signal.throwIfAborted();
      await this.store.update(run.id, { status: "running", phase: "starting" });
      controller.signal.throwIfAborted();
      await this.store.emit(run.id, "run.started", "开始生成讲义", { phase: "starting" });
      controller.signal.throwIfAborted();
      await this.pipeline({
        run: await this.store.get(run.id),
        outputDir: path.join(this.store.runDir(run.id), "output"),
        signal: controller.signal,
        emit: async (kind, message, details = {}) => { controller.signal.throwIfAborted(); await this.store.emit(run.id, kind, message, details); },
      });
      controller.signal.throwIfAborted();
      const manifest = await this.manifest(run.id);
      await writeFile(path.join(this.store.runDir(run.id), "artifact.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      controller.signal.throwIfAborted();
      task.settling = true;
      await this.store.emit(run.id, "artifact.ready", "讲义产物已经就绪", { previewUrl: `/v1/runs/${run.id}/preview/index.html` });
      await this.store.update(run.id, { status: "completed", phase: "complete", previewUrl: `/v1/runs/${run.id}/preview/index.html` });
      await this.store.emit(run.id, "run.completed", "讲义生成完成", { phase: "complete" });
      // Post-publication work cannot fail or delay the generation lifecycle.
      void Promise.resolve().then(() => this.onCompleted?.(run.id)).catch(() => undefined);
    } catch (error) {
      task.settling = true;
      if (controller.signal.aborted) {
        await this.store.update(run.id, { status: "cancelled" });
        await this.store.emit(run.id, "run.cancelled", "生成已取消");
        return;
      }
      await this.store.update(run.id, { status: "failed", error: publicMessage(error) });
      await this.store.emit(run.id, "run.failed", "讲义生成失败");
    }
  }
}
