const source = "KITTEN";
const target = "SITTING";
const initialTable = Array.from({ length: source.length + 1 }, (_, row) =>
  Array.from({ length: target.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : null)
);

export const lesson = {
  id: "edit-distance",
  title: "编辑距离动态规划",
  visualTitle: "前缀问题依赖",
  visualKicker: "Dynamic programming",
  learningTarget: "逐格检查插入、删除和替换三个来源，理解最优子结构如何填满编辑距离表。",
  runtime: "python",
  entry: "edit_distance.py",
  entryMode: "fixed",
  files: [{
    id: "edit-distance",
    filename: "edit_distance.py",
    label: "edit_distance.py",
    language: "python",
    sourceUrl: "./lesson/edit_distance.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 31,
  limits: {
    timeoutMs: 5000, maxFrames: 1800, maxPayloadBytes: 5_000_000,
    maxOutputChars: 40_000, maxSourceChars: 120_000,
    maxItems: 180, maxDepth: 9, maxString: 900,
  },
  initialStep: {
    sequence: 0,
    source: { file: "edit_distance.py", line: 7, column: 1 },
    kind: "table",
    state: {
      source, target, table: initialTable, active: [0, 0], dependencies: [],
      operation: "边界初始化", complete: false,
    },
    focus: [{ id: "0-0", role: "current" }],
    changes: [],
    metrics: { "已求单元": source.length + target.length + 1, "总单元": 56, "当前值": 0 },
    annotation: "空前缀只能通过连续插入或删除得到。",
  },
};

export default lesson;
