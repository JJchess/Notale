const nodeRows = [
  ["4", 4, 400, 82], ["2", 2, 230, 214], ["6", 6, 570, 214],
  ["1", 1, 130, 360], ["3", 3, 330, 360], ["5", 5, 470, 360], ["7", 7, 670, 360],
];

const initialStep = {
  sequence: 0,
  source: { file: "inorder.py", line: 15, column: 1 },
  kind: "tree",
  state: {
    nodes: nodeRows.map(([id, label, x, y]) => ({ id, label, x, y, status: "pending" })),
    edges: [["4", "2"], ["4", "6"], ["2", "1"], ["2", "3"], ["6", "5"], ["6", "7"]]
      .map(([source, target]) => ({ id: `${source}--${target}`, source, target })),
    visited: [],
    stack: ["4"],
    complete: false,
  },
  focus: [{ id: "4", role: "current" }],
  changes: [],
  metrics: { "已访问": 0, "递归深度": 1 },
  annotation: "从根节点 4 开始，先沿左边下降。",
};

export const lesson = {
  id: "tree-traversal",
  title: "BST 中序遍历",
  learningTarget: "沿递归调用栈观察左—根—右的访问次序，并验证 BST 中序遍历得到严格递增序列。",
  runtime: "python",
  entry: "inorder.py",
  files: [{
    id: "inorder",
    filename: "inorder.py",
    label: "inorder.py",
    language: "python",
    sourceUrl: "./lesson/inorder.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 11,
  limits: {
    timeoutMs: 5000, maxFrames: 1200, maxPayloadBytes: 3_000_000,
    maxOutputChars: 40_000, maxSourceChars: 120_000,
    maxItems: 120, maxDepth: 8, maxString: 900,
  },
  initialStep,
};

export default lesson;
