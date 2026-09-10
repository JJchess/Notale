export const lesson = {
  id: "page-19",
  title: "梯度提升代码实操：验证集曲线揭示迭代不足与迭代过度的不同表现",
  visualTitle: "梯度提升学习曲线与拟合表现",
  visualKicker: "Gradient Boosting & Overfitting",
  learningTarget: "调节迭代轮数 n_estimators 与学习率 learning_rate，对比训练集与验证集 MSE 曲线，理解梯度提升过早停止（欠拟合）与盲目累加（过拟合）的本质机制。",
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
  seed: 19,
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
    source: { file: "starter.py", line: 8, column: 1 },
    kind: "gradient_boosting",
    state: {
      round: 0,
      n_estimators: 25,
      learning_rate: 0.2,
      status: "normal",
      best_round: 16,
      min_val_mse: 0.045,
      history: [
        { round: 1, train_mse: 0.28, val_mse: 0.29 },
        { round: 4, train_mse: 0.15, val_mse: 0.17 },
        { round: 8, train_mse: 0.09, val_mse: 0.11 },
        { round: 12, train_mse: 0.05, val_mse: 0.07 },
        { round: 16, train_mse: 0.035, val_mse: 0.045 },
        { round: 25, train_mse: 0.02, val_mse: 0.052 }
      ],
      curve: {
        train_x: [-2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
        train_y: [-0.6, -0.9, -0.8, -0.5, -0.1, 0.1, 0.5, 0.8, 0.9, 0.6, 0.1],
        train_preds: [-0.58, -0.85, -0.78, -0.48, -0.08, 0.08, 0.48, 0.78, 0.88, 0.58, 0.08],
        val_x: [-2.2, -1.7, -1.2, -0.7, -0.2, 0.3, 0.8, 1.3, 1.8, 2.3],
        val_y: [-0.75, -0.88, -0.65, -0.3, 0.0, 0.35, 0.72, 0.88, 0.75, 0.32],
        val_preds: [-0.72, -0.82, -0.62, -0.28, 0.02, 0.32, 0.70, 0.85, 0.72, 0.30]
      }
    },
    focus: [],
    changes: [],
    metrics: {
      "当前轮数": 0,
      "训练 MSE": "0.2800",
      "验证 MSE": "0.2900",
      "最优轮数": "第 16 轮"
    },
    annotation: "运行 Python 代码查看弱学习器累加过程：观察学习曲线何时见底反弹！",
  },
};

export default lesson;
