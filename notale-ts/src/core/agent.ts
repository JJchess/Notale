import { appendFile } from "node:fs/promises";
import type { ChatMessage, ChatModel, ToolDefinition } from "../adapters/models/chat-model.js";
import { redact } from "./redact.js";

export interface AgentOptions {
  model: ChatModel;
  system: string;
  prompt: string;
  tools: ToolDefinition[];
  execute(name: string, args: Record<string, unknown>): Promise<string>;
  traceFile: string;
  signal?: AbortSignal;
  maxTurns?: number;
}

export async function runAgent(options: AgentOptions): Promise<{ text: string; turns: number }> {
  const history: ChatMessage[] = [{ role: "system", content: options.system }, { role: "user", content: options.prompt }];
  const maximum = options.maxTurns ?? 14;
  for (let turn = 1; turn <= maximum; turn += 1) {
    if (options.signal?.aborted) throw new Error("Generation cancelled");
    const response = await options.model.respond(history, options.tools, options.signal);
    await appendFile(options.traceFile, `${redact(JSON.stringify({ timestamp: new Date().toISOString(), type: "assistant", requestId: response.id, message: response.message, usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, cachedTokens: response.cachedTokens } }))}\n`, "utf8");
    history.push(response.message);
    const calls = response.message.tool_calls ?? [];
    if (!calls.length) return { text: response.message.content?.trim() ?? "", turns: turn };
    for (const call of calls) {
      let output: string;
      try {
        const parsed: unknown = JSON.parse(call.function.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("arguments must be a JSON object");
        output = await options.execute(call.function.name, parsed as Record<string, unknown>);
      } catch (error) {
        output = `${call.function.name} 失败：${error instanceof Error ? error.message : String(error)}`;
      }
      output = redact(output);
      await appendFile(options.traceFile, `${JSON.stringify({ timestamp: new Date().toISOString(), type: "tool", requestId: response.id, callId: call.id, name: call.function.name, output })}\n`, "utf8");
      history.push({ role: "tool", tool_call_id: call.id, content: output });
    }
  }
  throw new Error(`Agent exceeded ${maximum} turns`);
}
