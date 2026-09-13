import { test } from "node:test";
import assert from "node:assert/strict";
import { connectorSchema } from "@notale/editor/browser";
import {
  createConnectorInspector,
  connectorInspectorState,
  connectorFromDraft,
} from "../src/state/connector-inspector";
test("connector drafts survive rendering, validate endpoints and reject changed source", async () => {
  let connector = connectorSchema.parse({
      id: "line",
      start: { target: "a" },
      end: { point: { x: 10, y: 20 } },
    }),
    pageId = "page";
  const writes: any[] = [];
  const inspector = createConnectorInspector({
    source: () => ({
      documentId: "doc",
      pageId,
      width: 1600,
      height: 900,
      connector,
      options: [{ value: "a", label: "A" }],
    }),
    commands: async (commands) => {
      writes.push(...commands);
    },
  });
  inspector.render();
  connectorInspectorState.getSnapshot().change?.({ width: "3" });
  inspector.render();
  assert.equal(connectorInspectorState.getSnapshot().draft?.width, "3");
  await connectorInspectorState.getSnapshot().save?.();
  assert.equal(writes[0].connector.width, 3);
  const draft = connectorInspectorState.getSnapshot().draft!;
  assert.throws(() =>
    connectorFromDraft(connector, { ...draft, width: "" }, ["a"]),
  );
  assert.throws(() =>
    connectorFromDraft(
      connector,
      { ...draft, start: { ...draft.start, target: "missing" } },
      ["a"],
    ),
  );
  connectorInspectorState.getSnapshot().change?.({ width: "4" });
  connector = { ...connector, color: "#abcdef" };
  inspector.render();
  await connectorInspectorState.getSnapshot().save?.();
  assert.equal(writes.length, 1);
  assert.match(connectorInspectorState.getSnapshot().error, /已变化/);
  const old = connectorInspectorState.getSnapshot();
  pageId = "other";
  await old.save?.();
  assert.equal(writes.length, 1);
  inspector.dispose();
});

test("reopened connector ignores old save failures and callbacks", async () => {
  let id = "a",
    rejectSave!: (error: Error) => void;
  const pending = new Promise<void>((_, reject) => {
    rejectSave = reject;
  });
  const inspector = createConnectorInspector({
    source: () => ({
      documentId: "doc",
      pageId: "page",
      width: 1600,
      height: 900,
      connector: connectorSchema.parse({
        id,
        start: { point: { x: 0, y: 0 } },
        end: { point: { x: 10, y: 10 } },
      }),
      options: [],
    }),
    commands: () => pending,
  });
  try {
    inspector.render();
    const old = connectorInspectorState.getSnapshot();
    const saving = old.save?.();
    id = "b";
    inspector.render();
    id = "a";
    inspector.render();
    connectorInspectorState.getSnapshot().change?.({ width: "7" });
    rejectSave(Error("Old failure"));
    await saving;
    assert.equal(connectorInspectorState.getSnapshot().error, "");
    old.change?.({ width: "9" });
    assert.equal(connectorInspectorState.getSnapshot().draft?.width, "7");
  } finally {
    inspector.dispose();
  }
});
