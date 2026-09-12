import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../adapters/models/chat-model.js";

export interface ToolContext { pagesDir: string; pageId: string }

export const fileToolDefinitions: ToolDefinition[] = [
  { type: "function", function: { name: "Read", description: "读取当前页面工作区中的文本文件，返回带行号的内容。", parameters: { type: "object", properties: { file_path: { type: "string" }, offset: { type: "integer" }, limit: { type: "integer" } }, required: ["file_path"], additionalProperties: false } } },
  { type: "function", function: { name: "Write", description: "写入完整文件，用于创建页面。", parameters: { type: "object", properties: { file_path: { type: "string" }, content: { type: "string" } }, required: ["file_path", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "Edit", description: "精确字符串替换；old_string 默认必须唯一。", parameters: { type: "object", properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, required: ["file_path", "old_string", "new_string"], additionalProperties: false } } },
  { type: "function", function: { name: "Patch", description: "原子地批量替换当前页面；任一 old 不存在时整批不写。", parameters: { type: "object", properties: { page: { type: "string" }, edits: { type: "array", items: { type: "object", properties: { old: { type: "string" }, new: { type: "string" } }, required: ["old", "new"], additionalProperties: false } } }, required: ["page", "edits"], additionalProperties: false } } },
  { type: "function", function: { name: "Check", description: "检查当前页面的交付结构、本地资源边界和分步标记。", parameters: { type: "object", properties: { page: { type: "string" } }, required: ["page"], additionalProperties: false } } },
];

function resolve(context: ToolContext, requested: unknown, writing: boolean): string {
  if (typeof requested !== "string" || !requested) throw new Error("file_path must be a non-empty string");
  const root = path.resolve(context.pagesDir);
  const target = path.resolve(root, requested);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Path is outside the pages workspace");
  if (writing) {
    const relative = path.relative(root, target).split(path.sep).join("/");
    if (relative !== `${context.pageId}.html` && !relative.startsWith(`assets/${context.pageId}/`)) {
      throw new Error(`Write scope is limited to ${context.pageId}.html and assets/${context.pageId}/`);
    }
  }
  return target;
}

export async function executeFileTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<string> {
  if (name === "Read") {
    const file = resolve(context, args.file_path, false);
    const lines = (await readFile(file, "utf8")).split("\n");
    const offset = Math.max(0, Number(args.offset ?? 1) - 1);
    const limit = Math.min(2_000, Math.max(1, Number(args.limit ?? 2_000)));
    return lines.slice(offset, offset + limit).map((line, index) => `${String(offset + index + 1).padStart(6)}\t${line}`).join("\n");
  }
  if (name === "Write") {
    const file = resolve(context, args.file_path, true);
    if (typeof args.content !== "string") throw new Error("content must be a string");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, args.content, "utf8");
    return `已写入 ${path.relative(context.pagesDir, file)}（${args.content.length} 字符）`;
  }
  if (name === "Edit") {
    const file = resolve(context, args.file_path, true);
    if (typeof args.old_string !== "string" || typeof args.new_string !== "string") throw new Error("old_string and new_string must be strings");
    const source = await readFile(file, "utf8");
    const matches = source.split(args.old_string).length - 1;
    if (!matches) return "失败：old_string 在文件中不存在。";
    if (matches > 1 && args.replace_all !== true) return `失败：old_string 出现 ${matches} 次，请增加上下文或设置 replace_all。`;
    const next = args.replace_all === true ? source.split(args.old_string).join(args.new_string) : source.replace(args.old_string, args.new_string);
    await writeFile(file, next, "utf8");
    return `已替换 ${args.replace_all === true ? matches : 1} 处`;
  }
  if (name === "Patch") {
    const file = resolve(context, args.page, true);
    if (!Array.isArray(args.edits) || !args.edits.length) return "失败：edits 不能为空。";
    const edits = args.edits as Array<{ old?: unknown; new?: unknown }>;
    if (edits.some((edit) => typeof edit.old !== "string" || typeof edit.new !== "string")) return "失败：每个 edit 都需要字符串 old 和 new。";
    const source = await readFile(file, "utf8");
    const missing = edits.map((edit, index) => ({ index, old: edit.old as string })).filter((edit) => !edit.old || !source.includes(edit.old));
    if (missing.length) return `失败：第 ${missing.map((edit) => edit.index + 1).join("、")} 处 old 不存在，整批未写入。`;
    let next = source;
    let replacements = 0;
    for (const edit of edits) {
      const old = edit.old as string;
      replacements += next.split(old).length - 1;
      next = next.split(old).join(edit.new as string);
    }
    await writeFile(file, next, "utf8");
    return `已原子应用 ${edits.length} 处编辑，共 ${replacements} 次替换。`;
  }
  if (name === "Check") {
    const file = resolve(context, args.page, false);
    if (path.basename(file) !== `${context.pageId}.html`) return `失败：只能检查 ${context.pageId}.html。`;
    const source = await readFile(file, "utf8");
    const failures: string[] = [];
    if (!/^\s*<!doctype html>/i.test(source)) failures.push("缺少 HTML doctype");
    if (!/\bid=["']stage["']/i.test(source)) failures.push("缺少 id=\"stage\" 根节点");
    if (!/assets\/base\.css/.test(source) || !/assets\/theme\.css/.test(source) || !/assets\/base\.js/.test(source)) failures.push("没有完整引用 base.css、theme.css、base.js");
    if (/(?:src|href)\s*=\s*["'](?:https?:|file:|\/)/i.test(source) || /(?:node_modules|vendor|\/data\d?\/)/i.test(source)) failures.push("包含网络、仓库或绝对路径资源");
    const steps = [...source.matchAll(/data-deck-step=["'](\d+)["']/g)].map((match) => Number(match[1]));
    if (steps.some((step) => step < 1)) failures.push("data-deck-step 必须从 1 开始");
    return failures.length ? `失败：${failures.join("；")}` : `通过：${path.basename(file)} 结构和资源边界有效${steps.length ? `，包含 ${Math.max(...steps)} 个分步状态` : ""}。`;
  }
  throw new Error(`Unknown tool: ${name}`);
}
