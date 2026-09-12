import type { CodeRuntime, LectureTheme } from "../../protocol/index.js";

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function codeWorkbenchHtml(input: { title: string; source: string; runtime: CodeRuntime; theme: LectureTheme }): string {
  const title = escapeHtml(input.title);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="assets/runtime/code-workbench.css"></head><body><main id="stage" class="workbench"><header><strong>${title}</strong><span id="runtime-status">Python 准备中</span></header><div id="editor"></div><section class="output"><div class="output-bar"><span>输出</span><button id="run" disabled>运行</button></div><pre id="output">运行结果会显示在这里。</pre></section></main><script>window.__NOTALE_CODE_LESSON__=${jsonForScript(input)}</script><script type="module" src="assets/runtime/code-workbench.js"></script></body></html>`;
}
