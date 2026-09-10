const initialGrid = [
  "#########",
  "#S..#...#",
  "#.#.#.#.#",
  "#.#...#.#",
  "#.#####.#",
  "#......G#",
  "#########",
];

export const lesson = {
  id: "grid-bfs",
  title: "网格 BFS 最短路",
  learningTarget: "观察队列如何保持距离层次，并用路径长度验证第一次抵达即为最短。",
  runtime: "python",
  entry: "bfs.py",
  entryMode: "fixed",
  files: [{
    id: "bfs",
    filename: "bfs.py",
    label: "bfs.py",
    language: "python",
    sourceUrl: "./lesson/bfs.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 23,
  limits: {
    timeoutMs: 5000, maxFrames: 1600, maxPayloadBytes: 4_000_000,
    maxOutputChars: 40_000, maxSourceChars: 120_000,
    maxItems: 180, maxDepth: 8, maxString: 900,
  },
  initialStep: {
    sequence: 0,
    source: { file: "bfs.py", line: 17, column: 1 },
    kind: "grid",
    state: {
      grid: initialGrid,
      start: [1, 1], goal: [5, 7],
      visited: [[1, 1]], queue: [[1, 1]], current: null, candidate: null,
      distances: { "1-1": 0 }, path: [], complete: false,
    },
    focus: [{ id: "1-1", role: "frontier" }],
    changes: [],
    metrics: { "已发现": 1, "队列长度": 1, "当前距离": 0 },
    annotation: "从 S 开始，让波前按距离逐层扩散。",
  },
};

export default lesson;
