// Forked from earendil-works/pi packages/ai/src/types.ts@fde38ed (MIT). Trimmed for the notale editor.
// Kept: message/content/tool/model/event types. Dropped: provider catalogs, images API, transport,
// provider routing compat, deferred responses and transcript system messages (the prompt and tools travel on Context).
import type { TSchema } from "typebox";
import type { AssistantMessageEventStream } from "./event-stream.js";

export type Api = "google-generative-ai" | "openai-completions" | (string & {});

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ModelThinkingLevel = "off" | ThinkingLevel;
export type ThinkingLevelMap = Partial<Record<ModelThinkingLevel, string | null>>;

/** Token budgets for each thinking level (token-based providers only) */
export interface ThinkingBudgets {
	minimal?: number;
	low?: number;
	medium?: number;
	high?: number;
}

export interface StreamOptions {
	signal?: AbortSignal | undefined;
	apiKey?: string;
	temperature?: number;
	maxTokens?: number;
	/** Custom HTTP headers merged over model headers. */
	headers?: Record<string, string>;
	/** Maximum retry attempts for transient provider errors (408/409/429/5xx). Default: 0. */
	maxRetries?: number;
	/** Cap for server-requested retry delays. Default: 60000. 0 disables the cap. */
	maxRetryDelayMs?: number;
	/** Stream idle timeout: abort the request when no data arrives for this long. 0 or unset disables. */
	timeoutMs?: number;
	/** Inspect or replace the provider payload before sending. Return undefined to keep it. */
	onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
}

export interface SimpleStreamOptions extends StreamOptions {
	toolChoice?: "auto" | "none";
	reasoning?: ThinkingLevel;
	thinkingBudgets?: ThinkingBudgets;
}

export interface TextContent {
	type: "text";
	text: string;
	textSignature?: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
	redacted?: boolean;
}

export interface ImageContent {
	type: "image";
	data: string; // base64 encoded image data
	mimeType: string; // e.g., "image/jpeg", "image/png"
}

/**
 * A document or video the model reads natively (Notale addition, after Kimi Code's media parts).
 * Only a reference is kept: the local `path`, and once uploaded the provider's `uri` with its
 * expiry. The bytes are never stored in the transcript; a provider reads or uploads them when it
 * builds a request.
 */
export interface FileContent {
	type: "file";
	mimeType: string; // "application/pdf", "video/mp4", "video/quicktime", "video/webm"
	path: string; // absolute host path
	name?: string;
	bytes: number;
	seconds?: number; // video duration
	pages?: number; // pages in this (possibly sliced) PDF
	uri?: string; // provider file reference once uploaded
	expiresAt?: number; // ms epoch; the reference is gone after this
}

export interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, any>;
	thoughtSignature?: string; // Google-specific: opaque signature for reusing thought context
}

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	/** Reasoning tokens, a subset of `output`, when the provider reports them. */
	reasoning?: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

export type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted";

export interface UserMessage {
	role: "user";
	content: string | (TextContent | ImageContent | FileContent)[];
	timestamp: number; // Unix timestamp in milliseconds
}

export interface AssistantMessage {
	role: "assistant";
	content: (TextContent | ThinkingContent | ToolCall)[];
	api: Api;
	provider: string;
	model: string;
	responseId?: string | undefined;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	rawStopReason?: string;
	timestamp: number; // Unix timestamp in milliseconds
}

export interface ToolResultMessage<TDetails = unknown> {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (TextContent | ImageContent | FileContent)[]; // Supports text, images and files
	details?: TDetails;
	isError: boolean;
	timestamp: number; // Unix timestamp in milliseconds
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/**
 * Optional provider-side constrained sampling config for a tool. `json_schema` maps to
 * the provider's strict / validated function-calling mode when supported.
 */
export type ConstrainedSamplingConfig = {
	type: "json_schema";
	strict: "prefer" | "require";
};

export interface Tool<TParameters extends TSchema = TSchema> {
	name: string;
	description: string;
	parameters: TParameters;
	constrainedSampling?: false | ConstrainedSamplingConfig;
}

/** Request context: system prompt, transcript and tool declarations. */
export interface Context {
	systemPrompt?: string;
	messages: Message[];
	tools?: Tool[];
}

/**
 * Event protocol for AssistantMessageEventStream.
 *
 * Successful streams emit `start` before partial updates and terminate with
 * `done`. A stream may terminate directly with `error` when request setup fails
 * before generation starts; after `start`, failures also terminate with `error`.
 */
export type AssistantMessageEvent =
	| { type: "start"; partial: AssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
	| { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
	| { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

/**
 * Stream function contract: must return an AssistantMessageEventStream and encode
 * request/model/runtime failures in the stream (final message with stopReason
 * "error" or "aborted" plus errorMessage) instead of throwing.
 */
export type StreamFunction<TOptions extends StreamOptions = SimpleStreamOptions> = (
	model: Model<Api>,
	context: Context,
	options?: TOptions,
) => AssistantMessageEventStream;

export interface ModelCostRates {
	input: number; // $/million tokens
	output: number; // $/million tokens
	cacheRead: number; // $/million tokens
	cacheWrite: number; // $/million tokens
}

export interface ModelCostTier extends ModelCostRates {
	/** Use this tier for requests whose total input usage exceeds this token count. */
	inputTokensAbove: number;
}

export interface ModelCost extends ModelCostRates {
	tiers?: ModelCostTier[];
}

export interface Model<TApi extends Api = Api> {
	id: string;
	name: string;
	api: TApi;
	provider: string;
	baseUrl: string;
	reasoning: boolean;
	/** Maps thinking levels to provider-specific values. null marks a level unsupported. */
	thinkingLevelMap?: ThinkingLevelMap;
	/** Input kinds the model reads natively; "pdf" and "video" are Notale additions. */
	input: ("text" | "image" | "pdf" | "video")[];
	cost: ModelCost;
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	/** OpenAI Chat Completions compatibility overrides (api "openai-completions" only). */
	compat?: OpenAICompletionsCompat;
}

/**
 * Compatibility settings for OpenAI-compatible Chat Completions APIs.
 * Unset fields are auto-detected from provider name and baseUrl.
 */
export interface OpenAICompletionsCompat {
	/** Whether the provider supports the `store` field. */
	supportsStore?: boolean;
	/** Whether the provider supports the `developer` role (vs `system`). */
	supportsDeveloperRole?: boolean;
	/** Whether the provider supports `reasoning_effort`. */
	supportsReasoningEffort?: boolean;
	/** Whether the provider supports `stream_options: { include_usage: true }`. Default: true. */
	supportsUsageInStreaming?: boolean;
	/** Whether streamed responses include `finish_reason`. When false, stop/toolUse is inferred at stream end. Default: true. */
	supportsFinishReason?: boolean;
	/** Which field to use for max tokens. */
	maxTokensField?: "max_completion_tokens" | "max_tokens";
	/** Whether tool results require the `name` field. */
	requiresToolResultName?: boolean;
	/** Whether a user message after tool results requires an assistant message in between. */
	requiresAssistantAfterToolResult?: boolean;
	/** Whether replayed thinking blocks must be sent as plain text. */
	requiresThinkingAsText?: boolean;
	/** Whether replayed assistant messages must carry an (empty) reasoning_content field when reasoning is on. */
	requiresReasoningContentOnAssistantMessages?: boolean;
	/**
	 * Reasoning parameter format. "openai": reasoning_effort; "openrouter": reasoning: { effort };
	 * "deepseek": thinking: { type } plus reasoning_effort when supported; "qwen": enable_thinking plus
	 * reasoning_effort when supported. Default: "openai".
	 */
	thinkingFormat?: "openai" | "openrouter" | "deepseek" | "qwen";
	/** Whether the provider supports the `strict` field in tool definitions. Default: false. */
	supportsStrictMode?: boolean;
}
