import { CODE_LIMITS } from '../../../code-runtime-observer-v1/runtime/limits.js';

export const lesson = {
  id: "code-page", title: "代码实验",
  runtime: "python", entry: "starter.py", entryMode: "fixed",
  files: [{id: "starter", filename: "starter.py", label: "starter.py", language: "python", sourceUrl: "./lesson/starter.py", editable: true}],
  traceUrl: "./lesson/observe.py", testsUrl: "./lesson/tests.py", seed: 17,
  limits: CODE_LIMITS
};
export default lesson;
