export const lesson = {
  id: "page-12",
  title: "随机森林实操：构建、袋外评估与特征重要性",
  visualTitle: "随机森林协同与诊断",
  visualKicker: "Forest Trace",
  learningTarget: "构建 5 棵树的随机森林，利用 Bootstrap 外的样本计算 OOB 准确率，并通过置换测试诊断特征重要性。",
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
  seed: 42,
  limits: {
    timeoutMs: 6000,
    maxFrames: 1200,
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
    kind: "forest",
    state: {
      step_type: "initial",
      tree_count: 5,
      n_samples: 12,
      features: ["x0_信号", "x1_主导", "x2_噪声"],
      trees: [
        { id: 0, status: "pending", in_bag: [], oob: [] },
        { id: 1, status: "pending", in_bag: [], oob: [] },
        { id: 2, status: "pending", in_bag: [], oob: [] },
        { id: 3, status: "pending", in_bag: [], oob: [] },
        { id: 4, status: "pending", in_bag: [], oob: [] }
      ],
      oob_predictions: {},
      oob_accuracy: null,
      importances: { "x0_信号": 0.0, "x1_主导": 0.0, "x2_噪声": 0.0 }
    },
    focus: [],
    changes: [],
    metrics: { "树数量": 5, "样本数": 12, "OOB预测率": "0%" },
    annotation: "初始状态：准备训练 5 棵树，并记录袋外（OOB）测试结果与置换特征重要性。",
  },
};

export default lesson;
