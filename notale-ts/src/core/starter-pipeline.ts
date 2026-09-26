import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GenerationPipeline } from "./run-service.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** Explicit offline fixture for service/UI smoke checks; never the default model workflow. */
export const starterPipeline: GenerationPipeline = async ({ run, outputDir, signal, emit }) => {
  if (signal.aborted) return;
  await emit("phase.changed", "正在构思讲义结构", { phase: "ideate" });
  await mkdir(path.join(outputDir, "assets"), { recursive: true });
  const title = escapeHtml(run.request.query);
  const pages = [
    { id: "page-01", title: "主题导入", body: `从一个核心问题开始理解：${title}` },
    { id: "page-02", title: "关键结构", body: "这里将由 TypeScript planner 与并行 Builder 生成完整内容。" },
    { id: "page-03", title: "回顾", body: "连接概念、证据与可操作的下一步。" },
  ];
  await emit("phase.changed", "正在生成讲义页面", { phase: "create" });
  for (const page of pages) {
    if (signal.aborted) return;
    await emit("page.started", `正在生成 ${page.title}`, { pageId: page.id, pageTitle: page.title });
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="assets/theme.css"><title>${page.title}</title></head><body><main><p class="eyebrow">NOTALE</p><h1>${page.title}</h1><p>${page.body}</p></main></body></html>`;
    await writeFile(path.join(outputDir, `${page.id}.html`), html, "utf8");
    await emit("page.ready", `${page.title} 已生成`, { pageId: page.id, pageTitle: page.title, previewUrl: `/v1/runs/${run.id}/preview/${page.id}.html` });
  }
  await emit("phase.changed", "正在整理最终讲义", { phase: "polish" });
  await writeFile(path.join(outputDir, "assets", "theme.css"), `:root{--bg:#f3efe7;--ink:#18211d;--accent:#a0442e}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}main{width:min(920px,calc(100% - 64px));min-height:100vh;margin:auto;display:flex;flex-direction:column;justify-content:center}.eyebrow{color:var(--accent);letter-spacing:.18em;font-size:12px}h1{font-family:Georgia,serif;font-size:clamp(44px,8vw,92px);font-weight:400;line-height:1;margin:.2em 0}p{font-size:22px;line-height:1.6;max-width:36em}`, "utf8");
  const links = pages.map((page) => `<a href="${page.id}.html" target="slide">${page.title}</a>`).join("");
  await writeFile(path.join(outputDir, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}html,body{height:100%;margin:0;background:#171b19;color:#eee;font-family:system-ui}body{display:grid;grid-template-columns:220px 1fr}nav{padding:28px 20px;display:flex;flex-direction:column;gap:12px}nav strong{margin-bottom:16px}a{color:#aaa;text-decoration:none;padding:8px;border-radius:6px}a:hover{background:#292f2c;color:#fff}iframe{width:100%;height:100%;border:0;background:white}</style></head><body><nav><strong>${title}</strong>${links}</nav><iframe name="slide" src="page-01.html" title="讲义预览"></iframe></body></html>`, "utf8");
};
