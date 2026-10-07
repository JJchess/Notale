import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { renderMarkdown } from "../src/lib/markdown";
import { readingIntent } from "../src/lib/reading-intent";
import { SessionClient, acceptedMessage, selectedVersion, type SessionTransport } from "../src/lib/session-state";
import type { SessionSnapshot, TurnEvent } from "../src/lib/session-protocol";

const empty = (): SessionSnapshot => ({ id: "session", title: "Test", updatedAt: "2026-10-05T00:00:00Z", archived: false, busy: false, runs: [], files: [], entries: [] });
const user = (text = "Explain neural networks") => ({ type: "user" as const, text, files: ["file-1"], at: "2026-10-05T00:00:00Z" });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("assistant Markdown supports GFM without HTML or executable URL injection, including streamed fragments", () => {
  const html = renderMarkdown('# Heading\n\n**Strong**\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![bad](data:text/html,unsafe)\n\n<a href="javascript:alert(1)">unsafe</a>');
  const doc = new DOMParser().parseFromString(`<html><body>${html}</body></html>`, "text/html");
  assert.equal(doc.querySelector("script"), null);
  assert.equal(doc.querySelector("strong")?.textContent, "Strong");
  assert.equal(doc.querySelectorAll("table").length, 1);
  for (const node of doc.querySelectorAll("[href],[src]")) assert.doesNotMatch(node.getAttribute("href") ?? node.getAttribute("src") ?? "", /^(javascript|data):/i);
  assert.doesNotMatch(renderMarkdown('<img src=x onerror="alert(1)'), /<img/);
});

test("manual version selection survives a newly completed run; newest remains default", () => {
  const old = { runId: "old" }, fresh = { runId: "new" };
  assert.equal(selectedVersion([old, fresh], "old"), old);
  assert.equal(selectedVersion([old, fresh]), fresh);
  assert.equal(selectedVersion([old, fresh], "missing"), fresh);
});

test("reading intent pauses on upward gestures and resumes only at the bottom or explicit latest", () => {
  let following = readingIntent(true, { kind: "away" });
  assert.equal(following, false);
  following = readingIntent(following, { kind: "scroll", atBottom: false, movedUp: false });
  assert.equal(following, false);
  assert.equal(readingIntent(following, { kind: "scroll", atBottom: true, movedUp: false }), true);
  assert.equal(readingIntent(true, { kind: "scroll", atBottom: true, movedUp: true }), false);
  assert.equal(readingIntent(false, { kind: "latest" }), true);
});

test("an older identical message cannot acknowledge a failed new submission", () => {
  const snapshot = { ...empty(), entries: [user()] };
  assert.equal(acceptedMessage(snapshot, 1, user().text, user().files), false);
  assert.equal(acceptedMessage({ ...snapshot, entries: [user(), user()] }, 1, user().text, user().files), true);
});

test("disconnect after acceptance reconciles and follows the existing turn exactly once", async () => {
  let snapshot = empty(), posts = 0, follows = 0, accepted = 0;
  const finish = deferred<void>();
  const transport: SessionTransport = {
    get: async () => snapshot,
    send: async (text, files, onEvent) => {
      posts++;
      snapshot = { ...snapshot, busy: true, entries: [{ ...user(text), files }] };
      onEvent({ type: "working", event: { type: "step", label: "Planning" } });
      throw new Error("network lost");
    },
    follow: async onEvent => {
      follows++;
      const reply = { type: "reply" as const, text: "Recovered", at: "2026-10-05T00:00:01Z" };
      snapshot = { ...snapshot, entries: [...snapshot.entries, reply] };
      onEvent({ type: "reply", text: reply.text });
      await finish.promise;
      snapshot = { ...snapshot, busy: false };
    },
  };
  const client = new SessionClient(transport, () => {}, undefined, 100000);
  try {
    await client.connect();
    await client.send(user().text, user().files, () => accepted++);
    await tick();
    assert.equal(posts, 1); assert.equal(follows, 1); assert.equal(accepted, 1);
    assert.equal(client.state.snapshot?.entries.filter(entry => entry.type === "reply").length, 1);
    assert.equal(client.state.live.length, 0);
    finish.resolve(); await tick();
    assert.equal(client.state.connection, "ready");
    assert.equal(client.state.sending, false);
  } finally { finish.resolve(); client.dispose(); }
});

test("unknown POST result retains uncertainty, blocks repeat, and accepts after reconnect without another POST", async () => {
  let snapshot = empty(), unreachable = false, posts = 0, accepted = 0;
  const client = new SessionClient({
    get: async () => { if (unreachable) throw new Error("offline"); return snapshot; },
    send: async (text, files) => { posts++; snapshot = { ...snapshot, entries: [{ ...user(text), files }] }; unreachable = true; throw new Error("offline"); },
    follow: async () => {},
  }, () => {}, undefined, 100000);
  try {
    await client.connect();
    await assert.rejects(client.send(user().text, user().files, () => accepted++));
    assert.equal(client.state.uncertain, true);
    await assert.rejects(client.send(user().text, user().files));
    assert.equal(posts, 1);
    unreachable = false; await client.connect();
    assert.equal(client.state.uncertain, false); assert.equal(accepted, 1); assert.equal(posts, 1);
  } finally { client.dispose(); }
});

test("a proven rejection remains retryable with its draft and does not start an automatic resend", async () => {
  let posts = 0;
  const client = new SessionClient({ get: async () => empty(), send: async () => { posts++; throw new Error("file not found"); }, follow: async () => {} }, () => {}, undefined, 100000);
  try {
    await client.connect();
    await assert.rejects(client.send(user().text, user().files), /file not found/);
    assert.equal(client.state.uncertain, false); assert.equal(client.state.sending, false); assert.equal(client.state.live.length, 0); assert.equal(posts, 1);
    await assert.rejects(client.send(user().text, user().files)); assert.equal(posts, 2);
  } finally { client.dispose(); }
});

test("unmount aborts only the subscription and never dispatches another turn", async () => {
  let signal: AbortSignal | undefined;
  const client = new SessionClient({
    get: async () => ({ ...empty(), busy: true }), send: async () => { assert.fail("must never resend"); },
    follow: async (_event, input) => { signal = input; await new Promise<void>((resolve) => input.addEventListener("abort", () => resolve(), { once: true })); },
  }, () => {});
  const connecting = client.connect(); await tick();
  client.dispose(); await connecting;
  assert.equal(signal?.aborted, true);
});

test("draft completion clears the live draft and preserves the final viewed page", async () => {
  let snapshot = empty();
  const events: TurnEvent[] = [
    { type: "working", event: { type: "draft", page: "page-03.html", revision: 2 } },
    { type: "result", runId: "fixed-run", status: "completed" },
  ];
  const client = new SessionClient({
    get: async () => snapshot,
    send: async (text, files, emit) => { snapshot = { ...snapshot, entries: [{ ...user(text), files }] }; events.forEach(emit); },
    follow: async () => {},
  }, () => {});
  try {
    await client.connect(); await client.send(user().text, user().files);
    assert.equal(client.state.draft, undefined);
    assert.deepEqual(client.state.landing, { runId: "fixed-run", page: "page-03.html" });
  } finally { client.dispose(); }
});

test("reconciliation never accepts an identical message sent to a different model", async () => {
  const { acceptedMessage } = await import("../src/lib/session-state");
  const google = { providerId: "google", modelId: "gemini-3.8-flash" }, glm = { providerId: "paratera", modelId: "GLM-5.3-Flash" };
  const snapshot = { id: "s", busy: false, runs: [], files: [], entries: [{ type: "user" as const, text: "same", files: [], at: "now", model: google }] };
  assert.equal(acceptedMessage(snapshot, 0, "same", [], google), true);
  assert.equal(acceptedMessage(snapshot, 0, "same", [], glm), false);
  assert.equal(acceptedMessage(snapshot, 0, "same", []), false);
});
