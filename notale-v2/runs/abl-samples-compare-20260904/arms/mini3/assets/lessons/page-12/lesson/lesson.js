export const lesson = {
  id: "page-12",
  title: "随机森林代码实操：袋外评估与特征重要性诊断",
  visualTitle: "随机森林诊断看板",
  visualKicker: "FOREST & OOB EVALUATION",
  learningTarget: "通过可运行 Python 观察 Bootstrap 袋外样本（OOB）自动验证，以及打乱特征后的重要性置换下降。",
  runtime: "python",
  entry: "starter.py",
  entryMode: "fixed",
  files: [
    {
      id: "starter",
      filename: "starter.py",
      label: "starter.py",
      language: "python",
      sourceUrl: "./lesson/starter.py",
      editable: true,
    },
  ],
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
  initialStep: {
    sequence: 0,
    source: { file: "starter.py", line: 1, column: 1 },
    kind: "forest_oob",
    state: {
      trees: [
        { id: 0, feature: "历史逾期 (f2)", threshold: 0.5, samples: [0, 1, 1, 4, 4, 5, 7, 7], oob: [2, 3, 6] },
        { id: 1, feature: "负债率 (f1)", threshold: 0.5, samples: [1, 2, 2, 3, 3, 6, 6, 7], oob: [0, 4, 5] }
      ],
      datasetSize: 8,
      oobTotal: 6,
      oobCorrect: 6,
      oobAccuracy: 1.0,
      baseAccuracy: 1.0,
      importances: [
        { name: "f0 年龄段", drop: 0.0 },
        { name: "f1 负债率", drop: 0.25 },
        { name: "f2 历史逾期", drop: 0.375 }
      ],
      activeTree: 0,
      phase: "ready"
    },
    focus: [],
    changes: [],
    metrics: { "OOB准确率": "100%", "基准准确率": "100%", "最高重要性特征": "f2 逾期" },
    annotation: "初始状态：森林包含两棵树桩，袋外样本覆盖率良好，运行代码开始评估。",
  },
};

export default lesson;
