/** A block font for the start-page wordmark: each glyph a grid of square cells, `#` solid, `+` a
 * recessed cell (drawn fainter, the way opencode's letters have a darker inside), `.` empty. Seven
 * rows: two of ascender, five of x-height. Data only; `layout` turns text into cells and boxes. */
const GLYPHS: Record<string, string[]> = {
  n: ["....", "....", "###.", "#..#", "#..#", "#..#", "#..#"],
  o: ["....", "....", "####", "#++#", "#++#", "#++#", "####"],
  t: [".#..", ".#..", "####", ".#..", ".#..", ".#..", ".###"],
  a: ["....", "....", "####", "...#", "####", "#++#", "####"],
  l: ["#.", "#.", "#.", "#.", "#.", "#.", "##"],
  e: ["....", "....", "####", "#++#", "####", "#...", "####"],
};
export const GLYPH_ROWS = 7;
export const glyphs = GLYPHS;

export type Tone = "solid" | "recess";
export interface Cell { x: number; y: number; tone: Tone; letter: number }
export interface LetterBox { char: string; x: number; y: number; width: number; height: number }
/** A horizontal run of same-tone cells in one letter: drawn as one rectangle, so no seam shows
 * between neighbouring cells at any zoom. */
export interface Run { x: number; y: number; width: number; tone: Tone; letter: number }
export interface Layout { cells: Cell[]; runs: Run[]; letters: LetterBox[]; width: number; height: number }

/** Cells and letter boxes for `text`, in cell units (multiply by the cell size to draw). */
export function layout(text: string, gap = 1): Layout {
  const cells: Cell[] = [], letters: LetterBox[] = [];
  let x = 0;
  [...text].forEach((char, letter) => {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`no pixel glyph for "${char}"`);
    const width = glyph[0]!.length;
    glyph.forEach((row, y) => [...row].forEach((mark, column) => {
      if (mark !== ".") cells.push({ x: x + column, y, tone: mark === "+" ? "recess" : "solid", letter });
    }));
    letters.push({ char, x, y: 0, width, height: GLYPH_ROWS });
    x += width + gap;
  });
  const runs: Run[] = [];
  for (const cell of cells) {
    const last = runs.at(-1);
    if (last && last.y === cell.y && last.letter === cell.letter && last.tone === cell.tone && last.x + last.width === cell.x) last.width++;
    else runs.push({ x: cell.x, y: cell.y, width: 1, tone: cell.tone, letter: cell.letter });
  }
  return { cells, runs, letters, width: Math.max(0, x - gap), height: GLYPH_ROWS };
}
