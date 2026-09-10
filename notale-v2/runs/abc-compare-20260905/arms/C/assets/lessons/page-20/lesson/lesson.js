const train_x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
const train_y = [1.2, 1.9, 3.2, 3.8, 5.1, 5.8, 4.5, 3.1];
const test_x  = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
const test_y  = [1.5, 2.6, 3.6, 4.6, 5.6, 5.3, 3.7];

const f0 = Number((train_y.reduce((a, b) => a + b, 0) / train_y.length).toFixed(3));
const initTrainMse = Number((train_y.reduce((acc, y) => acc + Math.pow(y - f0, 2), 0) / train_y.length).toFixed(4));
const initTestMse = Number((test_y.reduce((acc, y) => acc + Math.pow(y - f0, 2), 0) / test_y.length).toFixed(4));

export const lesson = {
  id: "page-20",
  title: "代码实操 Boosting：学习率与迭代轮数之间的补偿关系及过拟合风险",
  visualTitle: "梯度提升拟合过程与步长补偿",
  visualKicker: "Boosting Trace & Fit",
  learningTarget: "观察弱回归桩如何逐步拟合残差，理解学习率与迭代轮数之间的补偿关系及过拟合风险。",
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
  seed: 20,
  limits: {
    timeoutMs: 6000,
    maxFrames: 1800,
    maxPayloadBytes: 4_000_000,
    maxOutputChars: 80_000,
    maxSourceChars: 200_000,
    maxItems: 200,
    maxDepth: 8,
    maxString: 1200,
  },
  initialStep: {
    sequence: 0,
    source: { file: "starter.py", line: 11, column: 1 },
    kind: "boosting",
    state: {
      round: 0,
      maxRounds: 6,
      learningRate: 0.3,
      split: null,
      cLeft: null,
      cRight: null,
      trainX: train_x,
      trainY: train_y,
      trainPred: Array(train_x.length).fill(f0),
      residuals: train_y.map(y => Number((y - f0).toFixed(3))),
      testX: test_x,
      testY: test_y,
      testPred: Array(test_x.length).fill(f0),
      trainMse: initTrainMse,
      testMse: initTestMse,
      operation: "初始常数预测 F_0(x)",
      complete: false,
    },
    focus: [],
    changes: [],
    metrics: {
      "轮数": "0/6",
      "学习率 η": "0.3",
      "训练 MSE": initTrainMse.toFixed(3),
      "测试 MSE": initTestMse.toFixed(3),
    },
    annotation: "初始基线 F_0(x)=3.575；点击运行观察弱学习器逐轮拟合残差并累加。",
  },
};

export default lesson;
