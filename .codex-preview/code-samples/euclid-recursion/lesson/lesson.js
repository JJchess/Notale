const firstFrame = {
  id: "call-0", depth: 0, a: 1071, b: 462, quotient: 2, remainder: 147,
};

export const lesson = {
  id: "euclid-recursion",
  title: "欧几里得递归",
  visualTitle: "余数如何收敛",
  visualKicker: "Euclidean algorithm",
  learningTarget: "沿调用栈检查 gcd(a,b)=gcd(b,a mod b)，并识别余数为零的基例。",
  runtime: "python",
  entry: "euclid.py",
  entryMode: "fixed",
  files: [{
    id: "euclid",
    filename: "euclid.py",
    label: "euclid.py",
    language: "python",
    sourceUrl: "./lesson/euclid.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 41,
  limits: {
    timeoutMs: 5000, maxFrames: 800, maxPayloadBytes: 2_000_000,
    maxOutputChars: 30_000, maxSourceChars: 80_000,
    maxItems: 80, maxDepth: 10, maxString: 700,
  },
  initialStep: {
    sequence: 0,
    source: { file: "euclid.py", line: 1, column: 1 },
    kind: "call-stack",
    state: { frames: [firstFrame], phase: "line", result: null, complete: false },
    focus: [{ id: "call-0", role: "current" }],
    changes: [],
    metrics: { "递归深度": 1, "当前余数": 147, "结果": "—" },
    annotation: "1071 = 2 × 462 + 147，下一层只保留除数与余数。",
  },
};

export default lesson;
