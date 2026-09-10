export const lesson = {
  id: "page-13",
  title: "代码实操随机森林：基学习器数量与特征子采样对训练成本和泛化表现的影响",
  visualTitle: "集成泛化曲线与森林结构",
  visualKicker: "RANDOM FOREST TRACE",
  learningTarget: "通过运行与修改参数实验，观察基学习器数量与节点分裂特征采样率对森林训练与泛化准度的联合影响。",
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
    timeoutMs: 8000,
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
    kind: "forest_trace",
    state: {
      trees: [],
      total_trees: 0,
      latest_acc: 0,
    },
    focus: [],
    changes: [],
    metrics: { "集成规模 (T)": 0, "测试准确率": "0.0%", "本轮袋外样本": 0 },
    annotation: "初始状态：点击右上角运行按钮训练随机森林模型并生成验证曲线。",
  },
};

export default lesson;
