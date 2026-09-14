export const lesson = {
  id: __LESSON_SLUG_JSON__,
  title: __LESSON_TITLE_JSON__,
  visualTitle: "排序中的局部变化",
  visualKicker: "Execution trace",
  learningTarget: "观察插入排序如何维护已排序前缀，并用测试检查结果与元素保留性。",
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
    kind: "sequence",
    state: {
      label: "numbers",
      items: [38, 17, 43, 3, 29, 51, 9, 26],
    },
    focus: [],
    changes: [],
    metrics: { "规模": 8, "有序前缀": 1 },
    annotation: "初始数组；运行后可逐行检查已排序前缀。",
  },
};

export default lesson;
