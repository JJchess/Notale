import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSourceEditor,
  sourceEditorState,
  sourceEditorCommand,
} from "../src/state/source-editor";
test("source editing retains other field drafts and rejects invalid JSON before enqueue", async () => {
  const source = {
    documentId: "doc",
    pageId: "page",
    target: "text",
    style: { color: "red" },
    attributes: {},
    html: "<p>Original</p>",
    disabled: false,
  };
  let writes = 0;
  const editor = createSourceEditor({
    source: () => source,
    commands: async () => {
      writes++;
    },
  });
  editor.render();
  sourceEditorState.getSnapshot().change?.("style", '{"color":"blue"}');
  sourceEditorState.getSnapshot().change?.("richText", "<b>Draft</b>");
  await sourceEditorState.getSnapshot().save?.(true);
  editor.render();
  assert.equal(sourceEditorState.getSnapshot().style, '{"color":"blue"}');
  sourceEditorState.getSnapshot().change?.("attributes", "[");
  await sourceEditorState.getSnapshot().save?.(false);
  assert.equal(writes, 1);
  assert.ok(sourceEditorState.getSnapshot().error);
  assert.throws(() =>
    sourceEditorCommand(
      source,
      { style: "[]", attributes: "{}", richText: "" },
      false,
    ),
  );
  editor.dispose();
});

test("new selection stays editable while an old save settles", async () => {
  let source = {
    documentId: "doc",
    pageId: "page",
    target: "first",
    style: { color: "red" },
    attributes: {},
    html: "<p>Original</p>",
    disabled: false,
  };
  let reject: (error: Error) => void = () => {};
  const editor = createSourceEditor({
    source: () => source,
    commands: () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  });
  editor.render();
  sourceEditorState.getSnapshot().change?.("style", '{"color":"blue"}');
  const saving = sourceEditorState.getSnapshot().save?.(false);
  source = { ...source, target: "second", style: { color: "green" } };
  editor.render();
  assert.equal(sourceEditorState.getSnapshot().disabled, false);
  reject(Error("old selection failed"));
  await saving;
  assert.equal(sourceEditorState.getSnapshot().disabled, false);
  assert.equal(sourceEditorState.getSnapshot().error, "");
  assert.match(sourceEditorState.getSnapshot().style, /green/);
  sourceEditorState.getSnapshot().change?.("style", '{"color":"purple"}');
  assert.equal(sourceEditorState.getSnapshot().style, '{"color":"purple"}');
  editor.dispose();
});

test("source sessions do not inherit pending saves or stale failures", async () => {
  const source = {
    documentId: "doc",
    pageId: "page",
    target: "a",
    style: {},
    attributes: {},
    html: "<p>Original</p>",
    disabled: false,
  };
  let rejectOld!: (error: Error) => void,
    resolveNew!: () => void,
    writes = 0;
  const oldRequest = new Promise<void>((_, reject) => {
    rejectOld = reject;
  });
  const newRequest = new Promise<void>((resolve) => {
    resolveNew = resolve;
  });
  const editor = createSourceEditor({
    source: () => source,
    commands: () => (++writes === 1 ? oldRequest : newRequest),
  });
  try {
    editor.render();
    const old = sourceEditorState.getSnapshot();
    old.change?.("style", '{"color":"red"}');
    const first = old.save?.(false);
    source.target = "b";
    editor.render();
    assert.equal(sourceEditorState.getSnapshot().disabled, false);
    source.target = "a";
    editor.render();
    sourceEditorState.getSnapshot().change?.("style", '{"color":"blue"}');
    const second = sourceEditorState.getSnapshot().save?.(false);
    rejectOld(Error("Old failure"));
    await first;
    assert.equal(sourceEditorState.getSnapshot().error, "");
    assert.equal(sourceEditorState.getSnapshot().disabled, true);
    resolveNew();
    await second;
    assert.equal(sourceEditorState.getSnapshot().disabled, false);
    old.change?.("style", "{}");
    assert.equal(sourceEditorState.getSnapshot().style, '{"color":"blue"}');
  } finally {
    editor.dispose();
  }
});

test("untouched source fields never clear content and rich drafts detect concurrent text changes", async () => {
  const source = {
    documentId: "doc",
    pageId: "page",
    target: "text",
    style: {},
    attributes: {},
    html: "<p>Original</p>",
    disabled: false,
  };
  let writes = 0;
  const editor = createSourceEditor({
    source: () => source,
    commands: async () => {
      writes++;
    },
  });
  try {
    editor.render();
    await sourceEditorState.getSnapshot().save?.(true);
    await sourceEditorState.getSnapshot().save?.(false);
    assert.equal(writes, 0);
    sourceEditorState.getSnapshot().change?.("richText", "<b>Draft</b>");
    source.html = "<p>New remote text</p>";
    // Saving another field must not bless the stale HTML baseline.
    sourceEditorState.getSnapshot().change?.("style", '{"color":"blue"}');
    await sourceEditorState.getSnapshot().save?.(false);
    editor.render();
    await sourceEditorState.getSnapshot().save?.(true);
    assert.equal(writes, 1);
    assert.match(sourceEditorState.getSnapshot().error, /对象内容已变化/);
    assert.equal(sourceEditorState.getSnapshot().richText, "<b>Draft</b>");
  } finally {
    editor.dispose();
  }
});

test("HTML save acknowledgement cannot rebase an outstanding CSS draft", async () => {
  const source = {
    documentId: "doc",
    pageId: "page",
    target: "text",
    style: { color: "red" },
    attributes: {},
    html: "<p>Original</p>",
    disabled: false,
  };
  let writes = 0;
  const editor = createSourceEditor({
    source: () => source,
    commands: async () => {
      writes++;
      source.html = "<p>Confirmed content</p>";
      source.style = { color: "green" };
    },
  });
  try {
    editor.render();
    sourceEditorState.getSnapshot().change?.("style", '{"color":"blue"}');
    sourceEditorState.getSnapshot().change?.("richText", "Confirmed content");
    await sourceEditorState.getSnapshot().save?.(true);
    editor.render();
    await sourceEditorState.getSnapshot().save?.(false);
    assert.equal(writes, 1);
    assert.match(sourceEditorState.getSnapshot().error, /对象已变化/);
    assert.equal(sourceEditorState.getSnapshot().style, '{"color":"blue"}');
  } finally {
    editor.dispose();
  }
});
