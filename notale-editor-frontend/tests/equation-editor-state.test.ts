import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equationCommands,
  selectedEquation,
} from "../src/state/equation-editor";
test("equation updates preserve stylesheet and reject stale or locked sources", () => {
  const item = {
    id: "equation",
    locked: false,
    html: '<div><link href="math.css"><span>old</span></div>',
    attributes: { "data-notale-tex": "x" },
  };
  const source = { documentId: "doc", slideId: "page", item };
  assert.equal(
    (equationCommands(source, source, "y", true, "<span>new</span>")[0] as any)
      .html,
    '<link href="math.css"><span>new</span>',
  );
  assert.throws(
    () =>
      equationCommands(
        source,
        { ...source, item: { ...item, html: "remote" } },
        "y",
        true,
        "",
      ),
    /公式已变化/,
  );
  assert.throws(
    () =>
      equationCommands(
        source,
        { ...source, item: { ...item, locked: true } },
        "y",
        true,
        "",
      ),
    /锁定/,
  );
  assert.equal(
    selectedEquation(
      [{ id: "loop", parent: "loop", locked: false, html: "", attributes: {} }],
      ["loop"],
    ),
    undefined,
  );
});

test("editing formula content preserves typography and unchanged formulas do not write", () => {
  const item = {
    id: "equation",
    locked: false,
    html: '<div style="font-size:72px;display:flex">x</div>',
    attributes: { "data-notale-tex": "x", "data-notale-tex-display": "1" },
  };
  const source = { documentId: "doc", slideId: "page", item };
  assert.deepEqual(
    equationCommands(source, source, "x", true, "<span>x</span>"),
    [],
  );
  const content = equationCommands(
    source,
    source,
    "y",
    true,
    "<span>y</span>",
  )[1] as any;
  assert.equal(content.patch.style, undefined);
  const mode = equationCommands(
    source,
    source,
    "y",
    false,
    "<span>y</span>",
  )[1] as any;
  assert.deepEqual(mode.patch.style, { display: "inline-block" });
});
