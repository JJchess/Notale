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

test('neighbouring cells of one tone are drawn as one run, never across letters or rows', () => {
  const shape = layout("notale");
  const o = shape.letters.findIndex(letter => letter.char === "o");
  const top = shape.runs.filter(run => run.letter === o && run.y === 2);
  assert.deepEqual(top.map(run => [run.x, run.width, run.tone]), [[5, 4, "solid"]]);
  const middle = shape.runs.filter(run => run.letter === o && run.y === 3);
  assert.deepEqual(middle.map(run => [run.x, run.width, run.tone]), [[5, 1, "solid"], [6, 2, "recess"], [8, 1, "solid"]]);
  assert.equal(shape.runs.reduce((sum, run) => sum + run.width, 0), shape.cells.length);
});
