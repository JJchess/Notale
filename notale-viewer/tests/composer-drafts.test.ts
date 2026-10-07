import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentPreviewUrl, clearComposerDraft, parseComposerDraft, readComposerDraft, writeComposerDraft } from "../src/lib/composer-drafts";
import { ackPendingTurn, claimPendingTurn, peekPendingTurn, pendingKey, putPendingTurn, releasePendingTurn } from "../src/lib/pending-turn";

function storage(throwing = false) {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem(key: string) { if (throwing) throw new Error("Storage denied"); return entries.get(key) ?? null; },
    setItem(key: string, value: string) { if (throwing) throw new Error("Quota exceeded"); entries.set(key, value); },
    removeItem(key: string) { if (throwing) throw new Error("Storage denied"); entries.delete(key); },
  } });
  return entries;
}

test("drafts retain text and uploaded references with the owning session when storage is denied", () => {
  storage(true);
  const key = "draft-blocked";
  const draft = { text: "继续解释这个图", sessionId: "s-one", files: [{ id: "f-one", name: "图.png", size: 2048, type: "image/png" }] };
  writeComposerDraft(key, draft);
  assert.deepEqual(readComposerDraft(key), draft);
  writeComposerDraft("draft-other", { text: "另一份草稿", files: [] });
  assert.equal(readComposerDraft(key)?.text, "继续解释这个图");
  clearComposerDraft(key);
  assert.equal(readComposerDraft(key), undefined);
  assert.equal(readComposerDraft("draft-other")?.text, "另一份草稿");
});

test("restoration drops malformed references and cannot attach an ID to an unknown session", () => {
  assert.deepEqual(parseComposerDraft({ text: "Hello", files: [{ id: "file", name: "paper.pdf" }] }), { text: "Hello", files: [] });
  assert.deepEqual(parseComposerDraft({ text: "Hello", sessionId: "owner", files: [{ id: "file", name: "paper.pdf" }, { id: "file", name: "duplicate.pdf" }, { id: 2, name: "bad" }, null] }), { text: "Hello", sessionId: "owner", files: [{ id: "file", name: "paper.pdf" }] });
  assert.equal(parseComposerDraft({ text: 2 }), undefined);
  assert.equal(attachmentPreviewUrl("a/b", "c?d"), "/notale-session/v1/sessions/a%2Fb/files/c%3Fd");
});

test("home handoff is read without consuming, claimed once, and acknowledged by exact identity", () => {
  const stored = storage();
  const id = "handoff-strict";
  const turn = putPendingTurn(id, { text: "神经网络导引", files: [{ id: "asset", name: "paper.pdf" }] });
  assert.equal(peekPendingTurn(id)?.id, turn.id);
  assert.equal(peekPendingTurn(id)?.id, turn.id);
  assert.equal(claimPendingTurn(id)?.id, turn.id);
  assert.equal(claimPendingTurn(id), undefined);
  assert.equal(JSON.parse(stored.get(pendingKey(id))!).claimed, true);
  ackPendingTurn(id, "wrong-id");
  assert.equal(peekPendingTurn(id)?.id, turn.id);
  ackPendingTurn(id, turn.id);
  assert.equal(peekPendingTurn(id), undefined);
  assert.equal(stored.has(pendingKey(id)), false);
});

test("persisted claims never automatically resend after a page reload", () => {
  const stored = storage();
  stored.set(pendingKey("reload-claimed"), JSON.stringify({ id: "first-send", text: "Send once", files: [], claimed: true }));
  assert.equal(peekPendingTurn("reload-claimed")?.text, "Send once");
  assert.equal(claimPendingTurn("reload-claimed"), undefined);
  releasePendingTurn("reload-claimed", "wrong-id");
  assert.equal(claimPendingTurn("reload-claimed"), undefined);
  releasePendingTurn("reload-claimed", "first-send");
  assert.equal(claimPendingTurn("reload-claimed")?.id, "first-send");
});

test("storage-denied handoff survives client navigation and prevents a stale ack clearing a newer turn", () => {
  storage(true);
  const old = putPendingTurn("handoff-memory", { text: "First", files: [] });
  const next = putPendingTurn("handoff-memory", { text: "Next", files: [{ id: "f", name: "next.pdf" }] });
  ackPendingTurn("handoff-memory", old.id);
  assert.deepEqual(peekPendingTurn("handoff-memory"), next);
  assert.equal(claimPendingTurn("handoff-memory")?.text, "Next");
  assert.equal(claimPendingTurn("handoff-memory"), undefined);
  ackPendingTurn("handoff-memory", next.id);
  assert.equal(peekPendingTurn("handoff-memory"), undefined);
});

test("draft and homepage handoff capture the model, including a safe retry", () => {
  storage();
  const model = { providerId: "paratera", modelId: "GLM-5.3-Flash" };
  writeComposerDraft("model-draft", { text: "new", files: [], model });
  assert.deepEqual(readComposerDraft("model-draft")?.model, model);
  const turn = putPendingTurn("model-session", { text: "new", files: [], model });
  model.modelId = "changed-for-next-turn";
  assert.equal(claimPendingTurn("model-session")?.model?.modelId, "GLM-5.3-Flash");
  releasePendingTurn("model-session", turn.id);
  assert.equal(claimPendingTurn("model-session")?.model?.modelId, "GLM-5.3-Flash");
});
