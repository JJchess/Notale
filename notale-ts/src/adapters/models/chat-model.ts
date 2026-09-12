import { randomUUID } from "node:crypto";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: unknown;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface AssistantTurn {
  id: string;
  message: ChatMessage;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface ModelProfile {
  model: string;
  baseUrl: string;
  apiKey: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export class ChatModel {
  constructor(readonly profile: ModelProfile) {}

  async respond(messages: ChatMessage[], tools: ToolDefinition[] = [], signal?: AbortSignal): Promise<AssistantTurn> {
    const timeout = AbortSignal.timeout(this.profile.timeoutMs ?? 900_000);
    const response = await fetch(`${this.profile.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { authorization: `Bearer ${this.profile.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.profile.model,
        messages,
        ...(tools.length ? { tools, tool_choice: "auto" } : {}),
        ...(this.profile.reasoningEffort ? { reasoning_effort: this.profile.reasoningEffort } : {}),
        max_tokens: this.profile.maxOutputTokens ?? 32_000,
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Model request failed (${response.status}): ${text.slice(0, 600)}`);
    const raw = JSON.parse(text) as {
      id?: string;
      choices?: Array<{ message?: ChatMessage }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const message = raw.choices?.[0]?.message;
    if (!message) throw new Error("Model response has no assistant message");
    return {
      id: raw.id ?? `response-${randomUUID()}`,
      message: { ...message, role: "assistant", content: typeof message.content === "string" ? message.content : null },
      inputTokens: raw.usage?.prompt_tokens ?? 0,
      outputTokens: raw.usage?.completion_tokens ?? 0,
      ...(raw.usage?.prompt_tokens_details?.cached_tokens !== undefined ? { cachedTokens: raw.usage.prompt_tokens_details.cached_tokens } : {}),
    };
  }
}

export function modelFromEnvironment(env: NodeJS.ProcessEnv = process.env): ChatModel {
  const keyName = env.NOTALE_API_KEY_ENV ?? "GEMINI_API_KEY";
  const apiKey = env[keyName];
  if (!apiKey) throw new Error(`Missing model credential: ${keyName}`);
  return new ChatModel({
    model: env.NOTALE_MODEL ?? "gemini-3.8-flash",
    baseUrl: env.NOTALE_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
    reasoningEffort: env.NOTALE_REASONING_EFFORT ?? "low",
    maxOutputTokens: Number(env.NOTALE_MAX_OUTPUT_TOKENS ?? 32_000),
  });
}
