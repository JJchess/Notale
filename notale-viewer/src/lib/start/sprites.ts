/** Istar as a small pixel wizard: pointed hat with a star, beard, robe, staff with a glowing tip.
 * One drawn frame; the crouch and the jump are derived from it, so there is one picture to get right.
 * Each character is a palette key, `.` transparent. */
export interface Sprite { frames: Record<"stand" | "crouch" | "jump", string[]>; palette: Record<string, string> }

const STAND = [
  "......k.....",
  ".....khk....",
  ".....khhk...",
  "....khbhk.gg",
  "....khhhhkgg",
  "...khhhhhhky",
  "..kkkkkkkkky",
  ".....ssss..y",
  ".....kssk..y",
  "....wwwwww.y",
  "...wwwwwwwwy",
  "...rwwwwwwsy",
  "..rrrwwwwrry",
  "..rrrrwwrr.y",
  "..rrrrrrrr.y",
  "...rrrrrr..y",
  "...kk..kk...",
];
const blank = (width: number) => ".".repeat(width);
export const WIZARD: Sprite = {
  frames: {
    stand: STAND,
    // Knees bent: one robe row gone, the figure one row lower.
    crouch: [blank(STAND[0]!.length), ...STAND.slice(0, 15), STAND[16]!],
    // In the air: feet apart and tucked.
    jump: [...STAND.slice(0, 16), "..k......k.."],
  },
  palette: {
    k: "#29272e", // outline (the editor's ink)
    h: "#6c18f5", // hat (the accent)
    b: "#f5c518", // star on the hat
    s: "#f2c9a0", // face, hand
    w: "#f7f5f2", // beard
    r: "#4b2aa8", // robe
    y: "#8a5a2b", // staff
    g: "#5ee0f0", // staff's light
  },
};
