import { test } from "node:test";
import assert from "node:assert/strict";
import { GLYPH_ROWS, glyphs, layout } from "../src/lib/start/pixel-font";
import { WIZARD } from "../src/lib/start/sprites";

test("every glyph is a full grid of the same height, marked only with # + .", () => {
  for (const [char, rows] of Object.entries(glyphs)) {
    assert.equal(rows.length, GLYPH_ROWS, char);
    assert.equal(new Set(rows.map(row => row.length)).size, 1, char);
    assert.match(rows.join(""), /^[#+.]+$/, char);
  }
});

test("the wordmark lays out left to right with one empty column between letters", () => {
  const shape = layout("notale");
  assert.deepEqual(shape.letters.map(letter => [letter.char, letter.x]), [["n", 0], ["o", 5], ["t", 10], ["a", 15], ["l", 20], ["e", 23]]);
  assert.equal(shape.width, 27);
  for (const cell of shape.cells) {
    const box = shape.letters[cell.letter]!;
    assert.ok(cell.x >= box.x && cell.x < box.x + box.width && cell.y < GLYPH_ROWS);
  }
});

test("the wizard's frames are the same size and use only his palette", () => {
  const frames = Object.values(WIZARD.frames);
  for (const frame of frames) {
    assert.equal(frame.length, frames[0]!.length);
    for (const row of frame) {
      assert.equal(row.length, frames[0]![0]!.length);
      for (const key of row) assert.ok(key === "." || key in WIZARD.palette, key);
    }
  }
});
