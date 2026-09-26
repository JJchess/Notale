import type { PythonInt } from '../../core/json.js';
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | ChatInputBlock[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: unknown;
  replay_items?: Record<string, unknown>[];
}

export type ChatInputBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface AssistantTurn {
  id: string;
  message: ChatMessage;
  inputTokens: PythonInt;
  outputTokens: PythonInt;
  cachedTokens?: PythonInt;
  canonical?: import("./runtime.js").ModelResponse;
}

/** Response port implemented by the baseline multi-wire runtime. */
export interface ChatModel {
  respond(messages: ChatMessage[], tools?: ToolDefinition[], signal?: AbortSignal): Promise<AssistantTurn>;
}
