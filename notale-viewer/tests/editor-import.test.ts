import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { editorOrigins, editorRequest, openEditorDocument } from "../src/lib/editor-import";

test("editor request validates object bodies and origins use the standard backend", () => {
  const session = randomUUID();
  for (const body of [null, [], "body", {}, { session: "-".repeat(36) }]) assert.equal(editorRequest("run-one1", body), undefined);
  assert.equal(editorRequest("../escape", { session }), undefined);
  assert.deepEqual(editorRequest("run-one1", { session }), { runId: "run-one1", session });
  assert.equal(editorOrigins({}).api, "http://127.0.0.1:4321");
  assert.equal(editorOrigins({ EDITOR_URL: "http://editor/" }).publicEditor, "http://editor");
});

test("simultaneous opens import each run once and keep every mapping", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "notale-editor-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const linksFile = path.join(root, "links.json"), ids: string[] = [];
  let downloads = 0, checks = 0;
  const request: typeof fetch = async (url, init) => {
    if (String(url).includes("/download")) {
      downloads++;
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture");
      return new Response("archive");
    }
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    if (String(url).endsWith("/api/import")) {
      const id = randomUUID(); ids.push(id);
      return Response.json({ document: { id } }, { status: 201 });
    }
    checks++;
    return Response.json({ document: { title: "manually renamed" } });
  };
  const options = { linksFile, editor: "http://editor", api: "http://generator", token: "fixture", fetch: request };
  const [first, repeated, other] = await Promise.all([
    openEditorDocument("run-one1", options), openEditorDocument("run-one1", { ...options }), openEditorDocument("run-two2", options),
  ]);
  assert.equal(first, repeated); assert.notEqual(first, other);
  assert.equal(downloads, 2); assert.equal(ids.length, 2); assert.equal(checks, 1);
  assert.deepEqual(JSON.parse(await readFile(linksFile, "utf8")), { "run-one1": first, "run-two2": other });
});

test("only a missing document is reimported; transient or denied lookups preserve it", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "notale-editor-existing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const linksFile = path.join(root, "links.json"), original = randomUUID(), replacement = randomUUID();
  let status = 500, imports = 0;
  await writeFile(linksFile, JSON.stringify({ "run-one1": original }));
  const request: typeof fetch = async url => {
    if (String(url).includes("/documents/")) return new Response(null, { status });
    if (String(url).includes("/download")) return new Response("archive");
    imports++;
    return Response.json({ document: { id: replacement } }, { status: 201 });
  };
  const options = { linksFile, editor: "http://editor", api: "http://generator", fetch: request };
  for (status of [401, 403, 500]) await assert.rejects(openEditorDocument("run-one1", options), /暂时无法读取/);
  assert.equal(imports, 0);
  assert.equal(JSON.parse(await readFile(linksFile, "utf8"))["run-one1"], original);
  status = 404;
  assert.equal(await openEditorDocument("run-one1", options), replacement); assert.equal(imports, 1);
});

test("corrupt registries fail closed and a failed import can be retried", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "notale-editor-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const linksFile = path.join(root, "links.json");
  let calls = 0, succeeds = false;
  const request: typeof fetch = async url => {
    calls++;
    if (String(url).includes("/download")) return new Response("archive");
    return succeeds ? Response.json({ document: { id: randomUUID() } }, { status: 201 }) : new Response(null, { status: 503 });
  };
  const options = { linksFile, editor: "http://editor", api: "http://generator", fetch: request };
  for (const raw of ["{broken", "[]", '{"run-one1":"invalid-id"}']) {
    await writeFile(linksFile, raw);
    await assert.rejects(openEditorDocument("run-one1", options), /关联记录/);
    assert.equal(await readFile(linksFile, "utf8"), raw);
  }
  assert.equal(calls, 0);
  await writeFile(linksFile, "{}");
  await assert.rejects(openEditorDocument("run-one1", options), /没能导入/);
  assert.equal(await readFile(linksFile, "utf8"), "{}");
  succeeds = true;
  const id = await openEditorDocument("run-one1", options);
  assert.equal(JSON.parse(await readFile(linksFile, "utf8"))["run-one1"], id);
});
