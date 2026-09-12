import assert from "node:assert/strict";
import { mkdtemp, cp, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRunRequestSchema } from "../src/protocol/index.js";
import { RunService } from "../src/core/run-service.js";
import { RunStore } from "../src/core/run-store.js";
import { starterPipeline } from "../src/core/starter-pipeline.js";
import { installCodeRuntime } from "../src/core/runtime-assets.js";
import { executeFileTool } from "../src/tools/files.js";

test("a run persists ordered events and produces movable files without symlinks", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "notale-ts-"));
  const store = new RunStore(path.join(temporary, "runs"));
  const service = new RunService(store, starterPipeline);
  const run = await service.start(createRunRequestSchema.parse({ query: "梯度下降" }));
  let snapshot = await store.get(run.id);
  while (snapshot.status === "queued" || snapshot.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, 10));
    snapshot = await store.get(run.id);
  }
  assert.equal(snapshot.status, "completed");
  const events = await store.events(run.id);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  assert.equal(events.at(-1)?.kind, "run.completed");
  const manifest = await service.manifest(run.id);
  assert.ok(manifest.files.includes("index.html"));
  const moved = path.join(temporary, "moved-output");
  await cp(path.join(store.runDir(run.id), "output"), moved, { recursive: true, dereference: false });
  assert.ok(manifest.files.every((file) => !path.isAbsolute(file) && !file.includes("..")));
});

test("invalid requests fail at the protocol boundary", () => {
  assert.equal(createRunRequestSchema.safeParse({ query: "" }).success, false);
  assert.equal(createRunRequestSchema.safeParse({ query: "x", minutes: 999 }).success, false);
});

test("page tools enforce ownership and runtime packages stay opt-in", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "notale-tools-"));
  const context = { pagesDir: temporary, pageId: "page-01" };
  await executeFileTool("Write", { file_path: "page-01.html", content: "ok" }, context);
  await assert.rejects(() => executeFileTool("Write", { file_path: "page-02.html", content: "no" }, context), /Write scope/);
  assert.match(await executeFileTool("Patch", { page: "page-01.html", edits: [{ old: "missing", new: "x" }] }, context), /整批未写入/);
  await executeFileTool("Write", { file_path: "page-01.html", content: '<!doctype html><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css"><main id="stage"><p data-deck-step="1">ok</p></main><script src="assets/base.js"></script>' }, context);
  assert.match(await executeFileTool("Check", { page: "page-01.html" }, context), /通过/);
  const plain = path.join(temporary, "plain");
  await installCodeRuntime(plain, []);
  const numpy = "numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl";
  await assert.rejects(() => lstat(path.join(plain, "assets/runtime/pyodide", numpy)));
  const scientific = path.join(temporary, "scientific");
  await installCodeRuntime(scientific, ["numpy"]);
  assert.equal((await lstat(path.join(scientific, "assets/runtime/pyodide", numpy))).isFile(), true);
});
