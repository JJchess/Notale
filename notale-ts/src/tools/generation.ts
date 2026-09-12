import type { ToolDefinition } from "../adapters/models/chat-model.js";
import type { AgentToolOutput } from "../core/agent.js";
import { executeFileTool, fileToolDefinitions, type ToolContext } from "./files.js";
import { executeMediaTool, mediaToolDefinitions } from "./media.js";
import { visualCheck } from "./visual-check.js";

export const generationToolDefinitions: ToolDefinition[] = [...fileToolDefinitions, ...mediaToolDefinitions];

export async function executeGenerationTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<string | AgentToolOutput> {
  if (name === "ImageSearch" || name === "ImageGen") return executeMediaTool(name, args, context.pagesDir, context.pageId);
  const result = await executeFileTool(name, args, context);
  if (name !== "Check" || result.startsWith("失败：")) return result;
  const page = typeof args.page === "string" ? args.page : `${context.pageId}.html`;
  const visual = await visualCheck(context.pagesDir, page);
  return { text: `${result}\n${visual.text}`, ...(visual.images ? { images: visual.images } : {}) };
}
