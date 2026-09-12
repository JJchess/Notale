import * as monaco from "monaco-editor";
import "monaco-editor/min/vs/editor/editor.main.css";
import "./workbench.css";
import { defaultTheme, monacoTheme } from "./theme.js";
import type { CodeRuntime, LectureTheme } from "../../protocol/index.js";

declare global {
  interface Window {
    MonacoEnvironment: { getWorker(): Worker };
    __NOTALE_CODE_LESSON__: { title: string; source: string; runtime: CodeRuntime; theme?: LectureTheme };
  }
}

window.MonacoEnvironment = {
  getWorker: () => new Worker(new URL("./monaco-worker.js", import.meta.url), { type: "module", name: "notale-monaco" }),
};

const lesson = window.__NOTALE_CODE_LESSON__;
const theme = lesson.theme ?? defaultTheme;
for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(`--${name}`, value);
monaco.editor.defineTheme("notale-lecture", monacoTheme(theme));
const editor = monaco.editor.create(document.querySelector<HTMLElement>("#editor")!, {
  value: lesson.source,
  language: "python",
  theme: "notale-lecture",
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 15,
  lineHeight: 23,
  padding: { top: 18 },
  scrollBeyondLastLine: false,
});

const status = document.querySelector<HTMLElement>("#runtime-status")!;
const output = document.querySelector<HTMLElement>("#output")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const timings: Record<string, number> = { shell: performance.now() };
const worker = new Worker(new URL("./python-worker.js", import.meta.url), { type: "module", name: "notale-python" });

function report(mark: string, value = performance.now()) {
  timings[mark] = value;
  window.parent.postMessage({ type: "notale:runtime-timing", mark, milliseconds: Math.round(value), timings }, "*");
}

report("monacoReady");
worker.onmessage = (message: MessageEvent<{ type: string; output?: string; error?: string; mark?: string; milliseconds?: number }>) => {
  const data = message.data;
  if (data.type === "timing" && data.mark) report(data.mark, data.milliseconds);
  if (data.type === "ready") { status.textContent = "Python 已就绪"; runButton.disabled = false; }
  if (data.type === "result") { output.textContent = data.output || "（无输出）"; runButton.disabled = false; status.textContent = "Python 已就绪"; report("firstExecutionComplete"); }
  if (data.type === "error") { output.textContent = data.error || "运行失败"; runButton.disabled = false; status.textContent = "运行失败"; }
};
worker.onerror = (event) => { status.textContent = "Python 加载失败"; output.textContent = event.message; };
worker.postMessage({ type: "init", packages: lesson.runtime.packages });
runButton.addEventListener("click", () => {
  runButton.disabled = true;
  status.textContent = "正在运行";
  worker.postMessage({ type: "run", source: editor.getValue() });
});
