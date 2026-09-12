import { access, appendFile, copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { modelFromEnvironment, type ChatModel } from "../adapters/models/chat-model.js";
import { executeFileTool } from "../tools/files.js";
import { executeGenerationTool, generationToolDefinitions } from "../tools/generation.js";
import { runAgent } from "./agent.js";
import type { GenerationPipeline } from "./run-service.js";
import { installCodeRuntime } from "./runtime-assets.js";
import { codeWorkbenchHtml } from "../browser/code-workbench/template.js";
import { defaultTheme } from "../browser/code-workbench/theme.js";
import { lectureThemeSchema } from "../protocol/index.js";
import { acquireVisualChecker } from "../tools/visual-check.js";

const planSchema = z.object({
  title: z.string().min(1),
  theme: lectureThemeSchema.default(defaultTheme),
  pages: z.array(z.object({
    title: z.string().min(1),
    objective: z.string().min(1),
    kind: z.enum(["normal", "steps", "code"]).default("normal"),
    packages: z.array(z.literal("numpy")).default([]),
    media: z.enum(["none", "search", "generate"]).default("none"),
    mediaPrompt: z.string().default(""),
  })).min(3).max(30),
});

function jsonFromText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(source);
}

function textOf(content: ChatModel extends never ? never : unknown): string {
  return typeof content === "string" ? content : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:python)?\s*/i, "").replace(/\s*```$/, "");
}

async function mapConcurrent<T>(items: T[], concurrency: number, operation: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await operation(items[index]!, index);
    }
  }));
}

function shell(title: string, pages: Array<{ id: string; title: string }>): string {
  const links = pages.map((page) => `<a href="${page.id}.html" target="slide">${escapeHtml(page.title)}</a>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="assets/shell.css"></head><body><nav><strong>${escapeHtml(title)}</strong>${links}</nav><iframe name="slide" src="${pages[0]?.id}.html" title="讲义预览"></iframe></body></html>`;
}

const pageSystem = `你是 Notale 的讲义页面作者。一次只完成指定页面。必须调用 Write 写入目标 HTML，再调用 Check；检查失败时用 Patch 或 Edit 修复并重新 Check，通过后自然结束。页面为 16:9 单屏，引用 assets/base.css、assets/theme.css 和 assets/base.js，不引用网络、vendor、绝对路径或其他页面。内容清晰、具体、可授课，避免通用卡片堆砌。页面根节点使用 id="stage"。steps 页面把逐步显示的元素标为 data-deck-step="1"、"2" 等，初始内容不添加该属性。`;

export function createModelPipeline(model: ChatModel = modelFromEnvironment()): GenerationPipeline {
  return async ({ run, outputDir, signal, emit }) => {
    const releaseVisualChecker = acquireVisualChecker();
    try {
    const traceFile = path.join(path.dirname(outputDir), "trace.jsonl");
    await mkdir(path.join(outputDir, "assets"), { recursive: true });
    await writeFile(traceFile, "", "utf8");
    await emit("phase.changed", "正在构思讲义结构", { phase: "ideate" });
    const planning = await model.respond([
      { role: "system", content: "你是讲义策划。只返回合法 JSON，不要 markdown。结构为 {title,theme:{background,surface,foreground,muted,accent,border,success,warning,error},pages:[{title,objective,kind,packages,media,mediaPrompt}]}。theme 的值必须是六位十六进制颜色，保证前景与背景清晰可读并呼应主题。kind 是 normal、steps 或 code。只有代码页需要 packages；真正使用 NumPy 时填写 [\"numpy\"]，否则为空数组。media 是 none、search 或 generate：真实人物、地点、器物和史料用 search，抽象概念插画用 generate；整份讲义最多安排一页 search 和一页 generate，代码页必须 none。mediaPrompt 具体描述图片主体、类型和教学用途。页数与课时匹配，形成连贯教学叙事。" },
      { role: "user", content: `主题：${run.request.query}\n课时：${run.request.minutes} 分钟\n受众：${run.request.audience}\n场景：${run.request.scenario}\n视觉方向：${run.request.style}` },
    ], [], signal);
    const plan = planSchema.parse(jsonFromText(textOf(planning.message.content)));
    await appendFile(traceFile, `${JSON.stringify({ timestamp: new Date().toISOString(), type: "planning", requestId: planning.id, usage: { inputTokens: planning.inputTokens, outputTokens: planning.outputTokens, cachedTokens: planning.cachedTokens } })}\n`, "utf8");
    await writeFile(path.join(path.dirname(outputDir), "briefs.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    await writeFile(path.join(outputDir, "assets", "base.css"), `*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--background);color:var(--foreground);font-family:Inter,system-ui,sans-serif}#stage{width:100%;height:100%;padding:7% 8%;display:flex;flex-direction:column;justify-content:center}h1,h2,p{margin-top:0}h1{font:400 clamp(42px,6vw,82px)/1 Georgia,serif}h2{font:400 clamp(32px,4vw,58px)/1.08 Georgia,serif}p,li{font-size:clamp(18px,2vw,28px);line-height:1.55}button{font:inherit}`, "utf8");
    const semantic = Object.entries(plan.theme).map(([name, value]) => `--${name}:${value}`).join(";");
    await writeFile(path.join(outputDir, "assets", "theme.css"), `:root{${semantic};--bg:var(--background);--bg2:var(--surface);--ink:var(--foreground);--text:var(--foreground);--text-secondary:var(--muted);--primary:var(--accent);--line:var(--border);--surface-1:var(--surface);--surface-2:color-mix(in srgb,var(--surface) 72%,var(--background))}`, "utf8");
    await copyFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/browser/runtime/chassis.js"), path.join(outputDir, "assets", "base.js"));
    await writeFile(path.join(outputDir, "assets", "shell.css"), `*{box-sizing:border-box}html,body{height:100%;margin:0;background:#171b19;color:#eee;font-family:system-ui}body{display:grid;grid-template-columns:220px 1fr}nav{padding:28px 20px;display:flex;flex-direction:column;gap:12px}nav strong{margin-bottom:16px}a{color:#aaa;text-decoration:none;padding:8px;border-radius:6px}a:hover{background:#292f2c;color:#fff}iframe{width:100%;height:100%;border:0;background:white}`, "utf8");
    await emit("phase.changed", "正在生成讲义页面", { phase: "create" });
    let searchAssigned = false;
    let generationAssigned = false;
    const pages = plan.pages.map((page, index) => {
      let media = page.kind === "code" ? "none" as const : page.media;
      if (media === "search") { if (searchAssigned) media = "none"; else searchAssigned = true; }
      if (media === "generate") { if (generationAssigned) media = "none"; else generationAssigned = true; }
      return { ...page, media, id: `page-${String(index + 1).padStart(2, "0")}` };
    });
    const runtimePackages = [...new Set(pages.filter((page) => page.kind === "code").flatMap((page) => page.packages))];
    if (pages.some((page) => page.kind === "code")) await installCodeRuntime(outputDir, runtimePackages);
    const pageConcurrency = Math.max(1, Math.min(30, Number(process.env.NOTALE_PAGE_CONCURRENCY ?? 8) || 8));
    await mapConcurrent(pages, pageConcurrency, async (page, index) => {
      if (signal.aborted) return;
      await emit("page.started", `正在生成 ${page.title}`, { pageId: page.id, pageTitle: page.title });
      if (page.kind === "code") {
        const authored = await model.respond([
          { role: "system", content: "编写一段适合课堂现场修改和运行的 Python 示例。只返回 Python 源码，不要 Markdown 围栏。代码应有清晰输出，并只使用明确允许的包。" },
          { role: "user", content: `讲义：${plan.title}\n页面：${page.title}\n目标：${page.objective}\n允许的包：${page.packages.join(", ") || "仅标准库"}` },
        ], [], signal);
        await writeFile(path.join(outputDir, `${page.id}.html`), codeWorkbenchHtml({ title: page.title, source: stripCodeFence(textOf(authored.message.content)), runtime: { language: "python", packages: page.packages }, theme: plan.theme }), "utf8");
      } else {
        await runAgent({
          model,
          system: pageSystem,
          prompt: `整份讲义：${plan.title}\n第 ${index + 1}/${pages.length} 页\n页面标题：${page.title}\n教学目标：${page.objective}\n页面类型：${page.kind}\n媒体策略：${page.media}${page.media !== "none" ? `；先调用 ${page.media === "search" ? "ImageSearch" : "ImageGen"} 获取并查看图片，需求：${page.mediaPrompt}` : "；不需要媒体工具"}\n请写入 ${page.id}.html。`,
          tools: generationToolDefinitions,
          execute: (name, args) => executeGenerationTool(name, args, { pagesDir: outputDir, pageId: page.id }),
          traceFile,
          signal,
        });
        const report = await executeFileTool("Check", { page: `${page.id}.html` }, { pagesDir: outputDir, pageId: page.id });
        if (report.startsWith("失败：")) throw new Error(`${page.id} validation failed: ${report}`);
      }
      await access(path.join(outputDir, `${page.id}.html`));
      await emit("page.ready", `${page.title} 已生成`, { pageId: page.id, pageTitle: page.title, previewUrl: `/v1/runs/${run.id}/preview/${page.id}.html` });
    });
    await emit("phase.changed", "正在整理最终讲义", { phase: "polish" });
    await writeFile(path.join(outputDir, "index.html"), shell(plan.title, pages), "utf8");
    } finally {
      await releaseVisualChecker();
    }
  };
}
