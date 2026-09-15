export const lesson = {
  id: "code-page", title: "代码实验",
  runtime: "python", entry: "starter.py", entryMode: "fixed",
  files: [{id: "starter", filename: "starter.py", label: "starter.py", language: "python", sourceUrl: "./lesson/starter.py", editable: true}],
  traceUrl: "./lesson/observe.py", testsUrl: "./lesson/tests.py", seed: 17,
  limits: {timeoutMs: 5000, maxFrames: 2400, maxPayloadBytes: 4000000, maxOutputChars: 80000, maxSourceChars: 200000, maxItems: 160, maxDepth: 7, maxString: 1200}
};
export default lesson;
