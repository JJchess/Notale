import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import { createRunRequestSchema } from "../protocol/index.js";
import { RunStore } from "../core/run-store.js";
import { RunService, type GenerationPipeline } from "../core/run-service.js";
import { starterPipeline } from "../core/starter-pipeline.js";
import { createModelPipeline } from "../core/model-pipeline.js";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".wasm": "application/wasm", ".zip": "application/zip", ".whl": "application/zip",
};

export interface AppOptions {
  runsRoot: string;
  pipeline?: GenerationPipeline;
  useStarterPipeline?: boolean;
  logger?: boolean;
}

export function createApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? true });
  const store = new RunStore(options.runsRoot);
  const service = new RunService(store, options.pipeline ?? (options.useStarterPipeline ? starterPipeline : createModelPipeline()));

  app.post("/v1/runs", async (request, reply) => {
    const parsed = createRunRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const run = await service.start(parsed.data);
    return reply.code(202).send(run);
  });

  app.get("/v1/runs", async () => store.list());
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    try { return await store.get(request.params.runId); }
    catch { return reply.code(404).send({ error: "run_not_found" }); }
  });
  app.post<{ Params: { runId: string } }>("/v1/runs/:runId/cancel", async (request, reply) => {
    try { return await service.cancel(request.params.runId); }
    catch { return reply.code(404).send({ error: "run_not_found" }); }
  });
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId/artifacts", async (request, reply) => {
    try { return await service.manifest(request.params.runId); }
    catch { return reply.code(404).send({ error: "artifact_not_found" }); }
  });
  app.get<{ Params: { runId: string }; Querystring: { after?: string } }>("/v1/runs/:runId/events", async (request, reply) => {
    const header = request.headers["last-event-id"];
    const after = Number(request.query.after ?? (Array.isArray(header) ? header[0] : header) ?? 0) || 0;
    try { await store.get(request.params.runId); }
    catch { return reply.code(404).send({ error: "run_not_found" }); }
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let replaying = true;
    const pending: Awaited<ReturnType<typeof store.events>> = [];
    const send = (event: Awaited<ReturnType<typeof store.events>>[number]) => {
      reply.raw.write(`id: ${event.sequence}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const connection = await store.replayAndSubscribe(request.params.runId, after, (event) => replaying ? pending.push(event) : send(event));
    for (const event of connection.events) send(event);
    const replayedThrough = connection.events.at(-1)?.sequence ?? after;
    for (const event of pending.filter((row) => row.sequence > replayedThrough)) send(event);
    replaying = false;
    const snapshot = connection.snapshot;
    if (["completed", "failed", "cancelled"].includes(snapshot.status)) {
      reply.raw.end();
      return;
    }
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    request.raw.on("close", () => { clearInterval(heartbeat); connection.unsubscribe(); });
  });
  app.get<{ Params: { runId: string; "*": string } }>("/v1/runs/:runId/preview/*", async (request, reply) => {
    const output = path.join(store.runDir(request.params.runId), "output");
    const requested = path.resolve(output, request.params["*"] || "index.html");
    if (requested !== output && !requested.startsWith(`${output}${path.sep}`)) return reply.code(400).send({ error: "invalid_path" });
    try {
      const info = await stat(requested);
      if (!info.isFile()) throw new Error("not a file");
      reply.type(contentTypes[path.extname(requested)] ?? "application/octet-stream");
      return reply.send(createReadStream(requested));
    } catch { return reply.code(404).send({ error: "asset_not_found" }); }
  });

  return { app, store, service };
}
