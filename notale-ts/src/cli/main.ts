#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { createApp } from "../server/app.js";
import { createRunRequestSchema } from "../protocol/index.js";
import { RunStore } from "../core/run-store.js";
import { RunService } from "../core/run-service.js";
import { starterPipeline } from "../core/starter-pipeline.js";
import { createModelPipeline } from "../core/model-pipeline.js";

const command = process.argv[2] ?? "help";
const argv = process.argv.slice(3);

function runsRoot(value?: string): string {
  return path.resolve(value ?? process.env.NOTALE_RUNS_ROOT ?? "runs");
}

async function main(): Promise<void> {
  if (command === "serve") {
    const { values } = parseArgs({ args: argv, options: { host: { type: "string", default: "127.0.0.1" }, port: { type: "string", default: "4321" }, runs: { type: "string" }, starter: { type: "boolean", default: false } } });
    const { app } = createApp({ runsRoot: runsRoot(values.runs), useStarterPipeline: values.starter });
    const address = await app.listen({ host: values.host, port: Number(values.port) });
    process.stdout.write(`Notale API listening at ${address}\n`);
    return;
  }
  if (command === "build") {
    const { values } = parseArgs({ args: argv, options: { query: { type: "string", short: "q" }, minutes: { type: "string", default: "45" }, audience: { type: "string", default: "具备基础知识的学习者" }, scenario: { type: "string", default: "课堂讲授与课后复习" }, style: { type: "string", default: "根据内容选择克制、清晰的教学视觉" }, runs: { type: "string" }, starter: { type: "boolean", default: false } } });
    const request = createRunRequestSchema.parse({ query: values.query, minutes: Number(values.minutes), audience: values.audience, scenario: values.scenario, style: values.style });
    const store = new RunStore(runsRoot(values.runs));
    const service = new RunService(store, values.starter ? starterPipeline : createModelPipeline());
    const run = await service.start(request);
    for (;;) {
      const current = await store.get(run.id);
      if (["completed", "failed", "cancelled"].includes(current.status)) {
        process.stdout.write(`${JSON.stringify(current)}\n`);
        process.exitCode = current.status === "completed" ? 0 : 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (command === "inspect") {
    const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { runs: { type: "string" } } });
    const id = positionals[0];
    if (!id) throw new Error("Usage: notale inspect <run-id>");
    const store = new RunStore(runsRoot(values.runs));
    process.stdout.write(`${JSON.stringify({ run: await store.get(id), events: await store.events(id) }, null, 2)}\n`);
    return;
  }
  process.stdout.write("Usage: notale <serve|build|inspect> [options]\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
