import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactManifestSchema, protocolVersion, type ArtifactManifest, type CreateRunRequest, type RunEventKind, type RunSnapshot } from "../protocol/index.js";
import { RunStore } from "./run-store.js";

export interface GenerationContext {
  run: RunSnapshot;
  outputDir: string;
  signal: AbortSignal;
  emit(kind: RunEventKind, message: string, details?: Record<string, string>): Promise<void>;
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

export class RunService {
  readonly store: RunStore;
  readonly pipeline: GenerationPipeline;
  readonly #controllers = new Map<string, AbortController>();

  constructor(store: RunStore, pipeline: GenerationPipeline) {
    this.store = store;
    this.pipeline = pipeline;
  }

  async start(request: CreateRunRequest): Promise<RunSnapshot> {
    const run = await this.store.create(request);
    const controller = new AbortController();
    this.#controllers.set(run.id, controller);
    void this.#execute(run, controller).finally(() => this.#controllers.delete(run.id));
    return run;
  }

  async cancel(id: string): Promise<RunSnapshot> {
    this.#controllers.get(id)?.abort();
    const run = await this.store.get(id);
    if (["completed", "failed", "cancelled"].includes(run.status)) return run;
    await this.store.emit(id, "run.cancelled", "生成已取消");
    return this.store.update(id, { status: "cancelled" });
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

  async #execute(run: RunSnapshot, controller: AbortController): Promise<void> {
    await this.store.update(run.id, { status: "running", phase: "starting" });
    await this.store.emit(run.id, "run.started", "开始生成讲义", { phase: "starting" });
    try {
      await this.pipeline({
        run: await this.store.get(run.id),
        outputDir: path.join(this.store.runDir(run.id), "output"),
        signal: controller.signal,
        emit: async (kind, message, details = {}) => { await this.store.emit(run.id, kind, message, details); },
      });
      if (controller.signal.aborted) return;
      const manifest = await this.manifest(run.id);
      await writeFile(path.join(this.store.runDir(run.id), "artifact.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await this.store.emit(run.id, "artifact.ready", "讲义产物已经就绪", { previewUrl: `/v1/runs/${run.id}/preview/index.html` });
      await this.store.update(run.id, { status: "completed", phase: "complete", previewUrl: `/v1/runs/${run.id}/preview/index.html` });
      await this.store.emit(run.id, "run.completed", "讲义生成完成", { phase: "complete" });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      await this.store.update(run.id, { status: "failed", error: message });
      await this.store.emit(run.id, "run.failed", "讲义生成失败");
    }
  }
}
