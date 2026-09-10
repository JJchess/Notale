const positions = {
  A: [80, 230], B: [240, 82], C: [240, 370],
  D: [440, 120], E: [440, 342], F: [620, 230],
};

const nodes = Object.entries(positions).map(([id, [x, y]]) => ({
  id,
  label: id,
  distance: id === "A" ? 0 : "∞",
  parent: null,
  status: id === "A" ? "frontier" : "unseen",
  x,
  y,
}));

const edges = [
  ["A", "B", 4], ["A", "C", 2], ["B", "C", 1],
  ["B", "D", 5], ["C", "D", 8], ["C", "E", 10],
  ["D", "E", 2], ["D", "F", 6], ["E", "F", 3],
].map(([source, target, weight]) => ({
  id: [source, target].sort().join("--"),
  source,
  target,
  weight,
}));

const initialStep = {
  sequence: 0,
  source: { file: "dijkstra.py", line: 1, column: 1 },
  kind: "network",
  state: {
    nodes,
    edges,
    queue: [{ node: "A", distance: 0 }],
    relax: null,
    complete: false,
  },
  focus: [{ id: "A", role: "frontier" }],
  changes: [],
  metrics: { "已确定": 0, "待处理节点": 1 },
  annotation: "A 的暂定距离为 0；优先队列将先取出 A。",
};

export const lesson = {
  id: "dijkstra-runtime",
  title: "Dijkstra 最短路径",
  visualTitle: "Dijkstra：选点与松弛",
  visualKicker: "带权图执行轨迹",
  learningTarget: "核对队首节点、候选算式和距离写入是否对应同一行代码。",
  runtime: "python",
  entry: "dijkstra.py",
  files: [{
    id: "dijkstra",
    filename: "dijkstra.py",
    label: "dijkstra.py",
    language: "python",
    sourceUrl: "./lesson/dijkstra.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 17,
  limits: {
    timeoutMs: 5000,
    maxFrames: 2400,
    maxPayloadBytes: 4_000_000,
    maxOutputChars: 80_000,
    maxSourceChars: 200_000,
    maxItems: 160,
    maxDepth: 7,
    maxString: 1200,
  },
  initialStep,
};

export default lesson;
