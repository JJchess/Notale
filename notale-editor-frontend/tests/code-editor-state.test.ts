import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindCodeEditor,
  codeActions,
  codeState,
  codeCommands,
  codeDraft,
} from "../src/state/code-editor";

test("code commands reject stale content, language, document and locks; escape plain source", () => {
  const item = {
    id: "code",
    locked: false,
    text: "old",
    html: "<pre>old</pre>",
    attributes: { "data-notale-code": "old", "data-notale-code-lang": "plain" },
  };
  const source = { id: 1, documentId: "doc", slideId: "page", item };
  const commands = codeCommands(source, source, "<script>", "plain");
  assert.equal((commands[0] as { html: string }).html, "&lt;script&gt;");
  for (const current of [
    { ...source, documentId: "other" },
    { ...source, item: { ...item, locked: true } },
    { ...source, item: { ...item, html: "remote" } },
    {
      ...source,
      item: {
        ...item,
        attributes: { ...item.attributes, "data-notale-code-lang": "python" },
      },
    },
  ])
    assert.throws(() => codeCommands(source, current, "new", "plain"));
});

test("failed code saves retain editing; disposed owners cannot clear a replacement session", async () => {
  const item = {
    id: "code",
    locked: false,
    text: "old",
    html: "old",
    attributes: { "data-notale-code": "old" },
  };
  const context = {
    documentId: () => "doc",
    slideId: () => "page",
    objects: () => [item],
    selection: () => ["code"],
    commands: async () => {
      throw Error("offline");
    },
  };
  const first = bindCodeEditor(context);
  first.render();
  codeActions.open();
  const editing = codeState.getSnapshot().editing!;
  await assert.rejects(codeActions.save(editing, "new", "plain"), /offline/);
  assert.equal(codeState.getSnapshot().editing, editing);
  const second = bindCodeEditor(context);
  second.render();
  codeActions.open();
  const replacement = codeState.getSnapshot().editing;
  first.dispose();
  assert.equal(codeState.getSnapshot().editing, replacement);
  second.dispose();
  assert.equal(codeState.getSnapshot().editing, undefined);
});

test("explicit empty code stays empty and unchanged code does not regenerate markup", () => {
  const item = {
    id: "code",
    locked: false,
    text: "Old display",
    html: "<pre>Old display</pre>",
    attributes: { "data-notale-code": "" },
  };
  const source = { id: 1, documentId: "doc", slideId: "page", item };
  assert.deepEqual(codeDraft(item), { code: "", language: "python" });
  assert.deepEqual(codeCommands(source, source, "", "python"), []);
  assert.equal(codeCommands(source, source, "print(2)", "python").length, 2);
});
