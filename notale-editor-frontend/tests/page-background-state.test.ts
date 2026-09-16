import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindPageBackground,
  backgroundState,
  backgroundCommands,
} from "../src/state/page-background";
test("background commands preserve unrelated themes and reject stale page input", () => {
  const page = { id: "one", theme: { "--bg": "#ffffff", "--accent": "red" } };
  const doc = {
    id: "doc",
    slides: [page, { id: "two", theme: { "--accent": "blue" } }],
  };
  const controller = bindPageBackground({
    document: () => doc as any,
    slide: () => page as any,
    commands: async () => {},
  });
  controller.render();
  const source = backgroundState.getSnapshot()!;
  const result = backgroundCommands(
    doc as any,
    page as any,
    source,
    { base: "#123456", end: "#ffffff", angle: 160, gradient: true },
    true,
  ) as any[];
  assert.equal(result.length, 2);
  assert.equal(result[1].patch.theme["--accent"], "blue");
  assert.match(result[0].patch.theme["--bg"], /linear-gradient/);
  assert.deepEqual(
    (backgroundCommands(doc as any, page as any, source, undefined)[0] as any)
      .patch.theme,
    { "--accent": "red" },
  );
  page.theme["--bg"] = "#000000";
  assert.throws(
    () => backgroundCommands(doc as any, page as any, source, source.value),
    /背景已变化/,
  );
  controller.dispose();
});

test("background inspector reads inherited gradient and restores it after removing an override", () => {
  const page = { id: "one", theme: {} as Record<string, string> };
  const doc = {
    id: "doc",
    theme: { "--bg": "linear-gradient(45deg, #123456, #abcdef)" },
    slides: [page],
  };
  const binding = bindPageBackground({
    document: () => doc as any,
    slide: () => page as any,
    commands: async () => {},
  });
  try {
    binding.render();
    assert.deepEqual(backgroundState.getSnapshot()!.value, {
      base: "#123456",
      end: "#abcdef",
      angle: 45,
      gradient: true,
    });
    assert.equal(backgroundState.getSnapshot()!.overridden, false);
    page.theme = { "--bg": "#ffffff" };
    binding.render();
    assert.equal(backgroundState.getSnapshot()!.value.gradient, false);
    assert.equal(backgroundState.getSnapshot()!.value.base, "#ffffff");
    page.theme = {};
    binding.render();
    assert.equal(backgroundState.getSnapshot()!.value.gradient, true);
    assert.equal(backgroundState.getSnapshot()!.value.base, "#123456");
  } finally {
    binding.dispose();
  }
});
