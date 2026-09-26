// Forked from earendil-works/pi packages/ai/src/api/openai-completions.ts + utils/hash.ts@fde38ed (MIT). Trimmed for the notale editor.
// Kept: OpenAI Chat Completions (api "openai-completions") streaming with tools, images, reasoning
// (reasoning / reasoning_content / reasoning_text, reasoning_details replay), URL-based compat detection,
// thinking params for openai / openrouter / deepseek / qwen formats, usage and stop-reason mapping.
// Dropped: pi user-agent, GitHub Copilot headers, session-affinity headers, prompt cache key / retention and
// Anthropic cache_control, grammar (custom) tools, transcript system-message updates and mid-conversation tool
// additions, zai / together / baseten / chat-template / string-thinking / ant-ling formats, thinking token budget
// fields, OpenRouter / Vercel routing, vLLM priority, sampling-param overrides, ProviderEnv, onResponse, telemetry.
import OpenAI from "openai";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionChunk,
	ChatCompletionContentPart,
	ChatCompletionContentPartImage,
	ChatCompletionContentPartText,
	ChatCompletionMessageParam,
	ChatCompletionMessageToolCall,
	ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";
import { getJsonSchemaToolParameters, resolveJsonSchemaStrictSampling } from "./constrained-sampling.js";
import { clampMaxTokensToContext } from "./estimate.js";
import { AssistantMessageEventStream } from "./event-stream.js";
import { parseStreamingJson } from "./json-parse.js";
import {
	calculateCost,
	clampThinkingLevel,
	formatProviderError,
	normalizeProviderError,
	retryProviderRequest,
	sanitizeSurrogates,
} from "./provider-utils.js";
import { transformMessages } from "./transform-messages.js";
import type {
	Api,
	AssistantMessage,
	Context,
	ImageContent,
	Message,
	Model,
	OpenAICompletionsCompat,
	SimpleStreamOptions,
	StopReason,
	StreamOptions,
	TextContent,
	ThinkingContent,
	ThinkingLevel,
	Tool,
	ToolCall,
	ToolResultMessage,
} from "./types.js";

export interface OpenAICompletionsOptions extends StreamOptions {
	toolChoice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
	reasoningEffort?: ThinkingLevel;
}

type ResolvedOpenAICompletionsCompat = Required<OpenAICompletionsCompat>;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Fast deterministic hash to shorten long strings */
function shortHash(str: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

function hasHeader(headers: Record<string, string> | undefined, name: string): boolean {
	if (!headers) return false;
	const expected = name.toLowerCase();
	return Object.entries(headers).some(([key, value]) => key.toLowerCase() === expected && value.trim().length > 0);
}

function getClientApiKey(provider: string, apiKey: string | undefined, headers: Record<string, string> | undefined): string {
	if (apiKey) return apiKey;
	if (hasHeader(headers, "authorization")) return "unused";
	throw new Error(`No API key for provider: ${provider}`);
}

/** Anthropic (via LiteLLM/proxy) requires the tools param when messages include tool calls/results. */
function hasToolHistory(messages: Message[]): boolean {
	return messages.some(
		(msg) => msg.role === "toolResult" || (msg.role === "assistant" && msg.content.some((b) => b.type === "toolCall")),
	);
}

function isTextContentBlock(block: { type: string }): block is TextContent {
	return block.type === "text";
}

function isThinkingContentBlock(block: { type: string }): block is ThinkingContent {
	return block.type === "thinking";
}

function isToolCallBlock(block: { type: string }): block is ToolCall {
	return block.type === "toolCall";
}

function isImageContentBlock(block: { type: string }): block is ImageContent {
	return block.type === "image";
}

type OpenAIReasoningDetailBase = Record<string, JsonValue> & {
	id?: string | null;
	format?: string;
	index?: number;
};
type OpenAIReasoningSummaryDetail = OpenAIReasoningDetailBase & { type: "reasoning.summary"; summary: string };
type OpenAIEncryptedReasoningDetail = OpenAIReasoningDetailBase & { type: "reasoning.encrypted"; data: string };
type OpenAIReasoningTextDetail = OpenAIReasoningDetailBase & {
	type: "reasoning.text";
	text: string;
	signature?: string | null;
};
type OpenAIReasoningDetail = OpenAIReasoningSummaryDetail | OpenAIEncryptedReasoningDetail | OpenAIReasoningTextDetail;

function isOpenAIReasoningDetail(detail: unknown): detail is OpenAIReasoningDetail {
	if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return false;
	const d = detail as Record<string, unknown>;
	const commonOk =
		(d.id === undefined || d.id === null || typeof d.id === "string") &&
		(d.format === undefined || typeof d.format === "string") &&
		(d.index === undefined || typeof d.index === "number");
	if (!commonOk) return false;
	switch (d.type) {
		case "reasoning.summary":
			return typeof d.summary === "string";
		case "reasoning.encrypted":
			return typeof d.data === "string";
		case "reasoning.text":
			return (
				typeof d.text === "string" &&
				(d.signature === undefined || d.signature === null || typeof d.signature === "string")
			);
		default:
			return false;
	}
}

function parseOpenAIReasoningDetails(signature: string | undefined): OpenAIReasoningDetail[] | undefined {
	if (!signature) return undefined;
	try {
		const parsed = JSON.parse(signature) as unknown;
		return Array.isArray(parsed) && parsed.length > 0 && parsed.every(isOpenAIReasoningDetail) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function parseLegacyEncryptedReasoningDetail(signature: string | undefined): OpenAIEncryptedReasoningDetail | undefined {
	if (!signature) return undefined;
	try {
		const parsed = JSON.parse(signature) as unknown;
		return isOpenAIReasoningDetail(parsed) &&
			parsed.type === "reasoning.encrypted" &&
			typeof parsed.id === "string" &&
			parsed.id.length > 0 &&
			parsed.data.length > 0
			? parsed
			: undefined;
	} catch {
		return undefined;
	}
}

function fillMissingCommonReasoningDetailFields(target: OpenAIReasoningDetailBase, source: OpenAIReasoningDetail): void {
	target.id ??= source.id;
	target.format ||= source.format;
	target.index ??= source.index;
}

/** OpenRouter streams reasoning_details as deltas: merge consecutive text/summary deltas, keep encrypted ones discrete. */
function appendOpenAIReasoningDetail(details: OpenAIReasoningDetail[], detail: OpenAIReasoningDetail): void {
	const lastDetail = details[details.length - 1];
	if (detail.type === "reasoning.text" && lastDetail?.type === "reasoning.text") {
		lastDetail.text += detail.text;
		lastDetail.signature ||= detail.signature;
		fillMissingCommonReasoningDetailFields(lastDetail, detail);
		return;
	}
	if (detail.type === "reasoning.summary" && lastDetail?.type === "reasoning.summary") {
		lastDetail.summary += detail.summary;
		fillMissingCommonReasoningDetailFields(lastDetail, detail);
		return;
	}
	details.push({ ...detail });
}

const OPENAI_COMPLETIONS_REASONING_FIELDS = ["reasoning", "reasoning_content", "reasoning_text"] as const;
type OpenAICompletionsReasoningField = (typeof OPENAI_COMPLETIONS_REASONING_FIELDS)[number];

function isOpenAICompletionsReasoningField(field: string): field is OpenAICompletionsReasoningField {
	return OPENAI_COMPLETIONS_REASONING_FIELDS.includes(field as OpenAICompletionsReasoningField);
}

type ChatCompletionAssistantMessageParamWithReasoning = ChatCompletionAssistantMessageParam &
	Partial<Record<OpenAICompletionsReasoningField, string>> & {
		reasoning_details?: JsonValue[];
	};

/** Low-level Chat Completions stream with adapter-specific options. */
export function stream(model: Model<Api>, context: Context, options?: OpenAICompletionsOptions): AssistantMessageEventStream {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "pending",
			timestamp: Date.now(),
		};

		// `reasoning_details` are replay metadata, not user-visible stream deltas.
		// Keep them in memory during streaming and serialize once when the block is finalized.
		let streamedReasoningDetails: OpenAIReasoningDetail[] | undefined;
		const applyStreamedReasoningDetails = (block: ThinkingContent): void => {
			if (streamedReasoningDetails !== undefined) {
				block.thinkingSignature = JSON.stringify(streamedReasoningDetails);
			}
		};

		// One signal per request (see google.ts): the SDK keeps a listener on the signal it is given, so the
		// run's signal is forwarded instead of passed. The idle timer aborts only this request.
		const request = new AbortController();
		const forward = () => request.abort();
		options?.signal?.addEventListener("abort", forward, { once: true });
		const idleMs = options?.timeoutMs ?? 0;
		let idle = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const touch = () => {
			if (!idleMs) return;
			clearTimeout(timer);
			timer = setTimeout(() => {
				idle = true;
				request.abort();
			}, idleMs);
		};

		try {
			const apiKey = getClientApiKey(model.provider, options?.apiKey, options?.headers);
			if (options?.signal?.aborted) request.abort();
			const compat = getCompat(model);
			const client = createClient(model, apiKey, options?.headers);
			let params = buildParams(model, context, options, compat);
			const nextParams = await options?.onPayload?.(params, model);
			if (nextParams !== undefined) {
				params = nextParams as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
			}
			touch();
			const openaiStream = await retryProviderRequest(
				() => client.chat.completions.create(params, { signal: request.signal, maxRetries: 0 }),
				{
					...(options?.maxRetries !== undefined && { maxRetries: options.maxRetries }),
					...(options?.maxRetryDelayMs !== undefined && { maxRetryDelayMs: options.maxRetryDelayMs }),
					signal: request.signal,
				},
			);
			stream.push({ type: "start", partial: output });

			interface StreamingToolCallBlock extends ToolCall {
				partialArgs?: string;
				streamIndex?: number;
			}
			type StreamingBlock = TextContent | ThinkingContent | StreamingToolCallBlock;
			type StreamingToolCallDelta = {
				index?: number;
				id?: string;
				type?: string;
				function?: { name?: string; arguments?: string };
			};

			let textBlock: TextContent | null = null;
			let thinkingBlock: ThinkingContent | null = null;
			let hasFinishReason = false;
			const toolCallBlocksByIndex = new Map<number, StreamingToolCallBlock>();
			const toolCallBlocksById = new Map<string, StreamingToolCallBlock>();
			const blocks = output.content as StreamingBlock[];
			const getContentIndex = (block: StreamingBlock) => blocks.indexOf(block);
			const finishBlock = (block: StreamingBlock) => {
				const contentIndex = getContentIndex(block);
				if (contentIndex === -1) return;
				if (block.type === "text") {
					stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
				} else if (block.type === "thinking") {
					applyStreamedReasoningDetails(block);
					stream.push({ type: "thinking_end", contentIndex, content: block.thinking, partial: output });
				} else if (block.type === "toolCall") {
					block.arguments = parseStreamingJson(block.partialArgs);
					// Finalize in place and strip the scratch buffers so replay only carries parsed arguments.
					delete block.partialArgs;
					delete block.streamIndex;
					stream.push({ type: "toolcall_end", contentIndex, toolCall: block, partial: output });
				}
			};
			const ensureTextBlock = () => {
				if (!textBlock) {
					textBlock = { type: "text", text: "" };
					blocks.push(textBlock);
					stream.push({ type: "text_start", contentIndex: getContentIndex(textBlock), partial: output });
				}
				return textBlock;
			};
			const ensureThinkingBlock = (thinkingSignature: string) => {
				if (!thinkingBlock) {
					thinkingBlock = { type: "thinking", thinking: "", thinkingSignature };
					blocks.push(thinkingBlock);
					stream.push({ type: "thinking_start", contentIndex: getContentIndex(thinkingBlock), partial: output });
				}
				return thinkingBlock;
			};
			const ensureToolCallBlock = (toolCall: StreamingToolCallDelta) => {
				const streamIndex = typeof toolCall.index === "number" ? toolCall.index : undefined;
				const name = toolCall.function?.name ?? "";
				let block = streamIndex !== undefined ? toolCallBlocksByIndex.get(streamIndex) : undefined;
				if (!block && toolCall.id) {
					block = toolCallBlocksById.get(toolCall.id);
				}
				if (!block) {
					block = { type: "toolCall", id: toolCall.id || "", name, arguments: {}, partialArgs: "", streamIndex };
					if (streamIndex !== undefined) toolCallBlocksByIndex.set(streamIndex, block);
					if (toolCall.id) toolCallBlocksById.set(toolCall.id, block);
					blocks.push(block);
					stream.push({ type: "toolcall_start", contentIndex: getContentIndex(block), partial: output });
				}
				if (streamIndex !== undefined && block.streamIndex === undefined) {
					block.streamIndex = streamIndex;
					toolCallBlocksByIndex.set(streamIndex, block);
				}
				if (toolCall.id) toolCallBlocksById.set(toolCall.id, block);
				if (!block.name && name) block.name = name;
				return block;
			};

			for await (const chunk of openaiStream) {
				touch();
				if (!chunk || typeof chunk !== "object") continue;

				// Every chunk of one streamed completion carries the same id.
				output.responseId ||= chunk.id;
				if (chunk.usage) {
					output.usage = parseChunkUsage(chunk.usage, model);
				}

				const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
				if (!choice) continue;

				// Fallback: some providers (e.g., Moonshot) return usage in choice.usage instead of chunk.usage
				if (!chunk.usage && (choice as any).usage) {
					output.usage = parseChunkUsage((choice as any).usage, model);
				}

				if (choice.finish_reason) {
					output.rawStopReason = choice.finish_reason;
					const finishReasonResult = mapStopReason(choice.finish_reason);
					output.stopReason = finishReasonResult.stopReason;
					if (finishReasonResult.errorMessage) {
						output.errorMessage = finishReasonResult.errorMessage;
					}
					hasFinishReason = true;
				}

				if (!choice.delta) continue;
				if (choice.delta.content !== null && choice.delta.content !== undefined && choice.delta.content.length > 0) {
					const block = ensureTextBlock();
					block.text += choice.delta.content;
					stream.push({
						type: "text_delta",
						contentIndex: getContentIndex(block),
						delta: choice.delta.content,
						partial: output,
					});
				}

				// Some endpoints return reasoning in reasoning_content (llama.cpp), or reasoning (other
				// OpenAI-compatible endpoints). Use the first non-empty field to avoid duplication
				// (e.g., chutes.ai returns both reasoning_content and reasoning with the same content).
				const deltaFields = choice.delta as Record<string, unknown>;
				const reasoningField = ["reasoning_content", "reasoning", "reasoning_text"].find((field) => {
					const value = deltaFields[field];
					return typeof value === "string" && value.length > 0;
				});
				if (reasoningField) {
					const delta = deltaFields[reasoningField] as string;
					const block = ensureThinkingBlock(reasoningField);
					block.thinking += delta;
					stream.push({ type: "thinking_delta", contentIndex: getContentIndex(block), delta, partial: output });
				}

				if (choice.delta.tool_calls) {
					for (const toolCall of choice.delta.tool_calls as StreamingToolCallDelta[]) {
						const block = ensureToolCallBlock(toolCall);
						if (!block.id && toolCall.id) {
							block.id = toolCall.id;
							toolCallBlocksById.set(toolCall.id, block);
						}
						let delta = "";
						if (toolCall.function?.arguments) {
							delta = toolCall.function.arguments;
							block.partialArgs = (block.partialArgs ?? "") + toolCall.function.arguments;
							block.arguments = parseStreamingJson(block.partialArgs);
						}
						stream.push({ type: "toolcall_delta", contentIndex: getContentIndex(block), delta, partial: output });
					}
				}

				const reasoningDetails = (choice.delta as { reasoning_details?: unknown }).reasoning_details;
				if (Array.isArray(reasoningDetails)) {
					for (const detail of reasoningDetails) {
						if (!isOpenAIReasoningDetail(detail)) continue;
						ensureThinkingBlock("");
						streamedReasoningDetails ??= [];
						appendOpenAIReasoningDetail(streamedReasoningDetails, detail);
					}
				}
			}

			for (const block of blocks) {
				finishBlock(block);
			}
			if (idle) throw new Error("idle");
			if (options?.signal?.aborted || output.stopReason === "aborted") {
				throw new Error("Request was aborted");
			}
			if (!hasFinishReason && !compat.supportsFinishReason) {
				output.stopReason = output.content.some((block) => block.type === "toolCall") ? "toolUse" : "stop";
			}
			if (output.stopReason === "error") {
				throw new Error(output.errorMessage || "Provider returned an error stop reason");
			}
			if ((compat.supportsFinishReason && !hasFinishReason) || output.stopReason === "pending") {
				throw new Error("Stream ended without finish_reason");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) {
				if (block.type === "thinking") applyStreamedReasoningDetails(block);
				// Streaming scratch buffers are only used during parsing; never persist them.
				delete (block as { partialArgs?: string }).partialArgs;
				delete (block as { streamIndex?: number }).streamIndex;
			}
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			if (idle && !options?.signal?.aborted) {
				output.errorMessage = `idle timeout: 模型 ${Math.round(idleMs / 1000)} 秒没有返回数据`;
			} else {
				output.errorMessage = formatProviderError(normalizeProviderError(error));
				// Some providers via OpenRouter give additional information in this field.
				const rawMetadata = (error as any)?.error?.metadata?.raw;
				if (rawMetadata && !output.errorMessage.includes(String(rawMetadata))) {
					output.errorMessage += `\n${rawMetadata}`;
				}
			}
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		} finally {
			clearTimeout(timer);
			options?.signal?.removeEventListener("abort", forward);
		}
	})();

	return stream;
}

/**
 * Stream a Chat Completions response with provider-neutral options (`reasoning`).
 * This is the StreamFn to hand to the Agent. Failures are encoded in the stream.
 */
export function streamOpenAICompletions(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const { reasoning, thinkingBudgets: _budgets, ...rest } = options ?? {};
	const clampedReasoning = reasoning ? clampThinkingLevel(model, reasoning) : undefined;
	return stream(model, context, {
		...rest,
		maxTokens: clampMaxTokensToContext(model, context, options?.maxTokens ?? model.maxTokens),
		...(clampedReasoning && clampedReasoning !== "off" && { reasoningEffort: clampedReasoning }),
	});
}

function createClient(model: Model<Api>, apiKey: string, optionsHeaders?: Record<string, string>): OpenAI {
	return new OpenAI({
		apiKey,
		baseURL: model.baseUrl,
		dangerouslyAllowBrowser: true,
		// Options headers merge last so they can override model headers.
		defaultHeaders: { ...model.headers, ...optionsHeaders },
	});
}

function buildParams(
	model: Model<Api>,
	context: Context,
	options: OpenAICompletionsOptions | undefined,
	compat: ResolvedOpenAICompletionsCompat,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
	const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: model.id,
		messages: convertMessages(model, context, compat),
		stream: true,
	};

	if (compat.supportsUsageInStreaming !== false) {
		(params as any).stream_options = { include_usage: true };
	}
	if (compat.supportsStore) {
		params.store = false;
	}
	if (options?.maxTokens) {
		if (compat.maxTokensField === "max_tokens") {
			(params as any).max_tokens = options.maxTokens;
		} else {
			params.max_completion_tokens = options.maxTokens;
		}
	}
	if (options?.temperature !== undefined) {
		params.temperature = options.temperature;
	}

	const tools = context.tools ?? [];
	if (tools.length > 0) {
		params.tools = convertTools(tools, compat);
	} else if (hasToolHistory(context.messages)) {
		params.tools = [];
	}
	if (options?.toolChoice) {
		params.tool_choice = options.toolChoice;
	}

	const effort = options?.reasoningEffort;
	const mapped = effort ? (model.thinkingLevelMap?.[effort] ?? effort) : undefined;
	if (compat.thinkingFormat === "qwen" && model.reasoning) {
		(params as any).enable_thinking = !!effort;
		if (typeof mapped === "string" && compat.supportsReasoningEffort) {
			(params as any).reasoning_effort = mapped;
		}
	} else if (compat.thinkingFormat === "deepseek" && model.reasoning) {
		if (effort) {
			(params as any).thinking = { type: "enabled" };
		} else if (model.thinkingLevelMap?.off !== null) {
			(params as any).thinking = { type: "disabled" };
		}
		if (mapped && compat.supportsReasoningEffort) {
			(params as any).reasoning_effort = mapped;
		}
	} else if (compat.thinkingFormat === "openrouter" && model.reasoning) {
		// OpenRouter normalizes reasoning across providers via a nested reasoning object.
		if (effort) {
			(params as any).reasoning = { effort: mapped };
		} else if (model.thinkingLevelMap?.off !== null) {
			(params as any).reasoning = { effort: model.thinkingLevelMap?.off ?? "none" };
		}
	} else if (model.reasoning && compat.supportsReasoningEffort) {
		// OpenAI-style reasoning_effort
		if (effort) {
			(params as any).reasoning_effort = mapped;
		} else if (typeof model.thinkingLevelMap?.off === "string") {
			(params as any).reasoning_effort = model.thinkingLevelMap.off;
		}
	}

	return params;
}

export function convertMessages(
	model: Model<Api>,
	context: Context,
	compat: ResolvedOpenAICompletionsCompat,
): ChatCompletionMessageParam[] {
	const params: ChatCompletionMessageParam[] = [];

	const normalizeToolCallId = (id: string): string => {
		// Pipe-separated IDs from the OpenAI Responses API: {call_id}|{id}, where {id} can be 400+ chars
		// with +, /, =. Keep item-level uniqueness (Chat Completions needs distinct ids), max 40 chars.
		if (id.includes("|")) {
			const separatorIndex = id.indexOf("|");
			const callId = id.slice(0, separatorIndex).replace(/[^a-zA-Z0-9_-]/g, "_");
			const itemId = id.slice(separatorIndex + 1).replace(/[^a-zA-Z0-9_-]/g, "_");
			const combinedId = itemId.length > 0 ? `${callId}_${itemId}` : callId;
			if (combinedId.length <= 40) return combinedId;
			const hash = shortHash(id).slice(0, 8);
			const prefix = callId.slice(0, Math.max(1, 40 - hash.length - 1));
			return `${prefix}_${hash}`;
		}
		if (model.provider === "openai") return id.length > 40 ? id.slice(0, 40) : id;
		return id;
	};

	const transformedMessages = transformMessages(context.messages, model, (id) => normalizeToolCallId(id));
	const instructionRole = model.reasoning && compat.supportsDeveloperRole ? "developer" : "system";
	if (context.systemPrompt) {
		params.push({ role: instructionRole, content: sanitizeSurrogates(context.systemPrompt) });
	}

	let lastRole: string | null = null;

	for (let i = 0; i < transformedMessages.length; i++) {
		const msg = transformedMessages[i]!;
		// Some providers don't allow user messages directly after tool results.
		if (compat.requiresAssistantAfterToolResult && lastRole === "toolResult" && msg.role === "user") {
			params.push({ role: "assistant", content: "I have processed the tool results." });
		}

		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				params.push({ role: "user", content: sanitizeSurrogates(msg.content) });
			} else {
				const content: ChatCompletionContentPart[] = msg.content
					.filter((item) => item.type !== "text" || item.text.length > 0)
					.map((item): ChatCompletionContentPart => {
						if (item.type === "text") {
							return { type: "text", text: sanitizeSurrogates(item.text) } satisfies ChatCompletionContentPartText;
						}
						return {
							type: "image_url",
							image_url: { url: `data:${item.mimeType};base64,${item.data}` },
						} satisfies ChatCompletionContentPartImage;
					});
				if (content.length === 0) continue;
				params.push({ role: "user", content });
			}
		} else if (msg.role === "assistant") {
			// Some providers don't accept null content, use empty string instead
			const assistantMsg: ChatCompletionAssistantMessageParamWithReasoning = {
				role: "assistant",
				content: compat.requiresAssistantAfterToolResult ? "" : null,
			};

			const assistantTextParts = msg.content
				.filter(isTextContentBlock)
				.filter((block) => block.text.trim().length > 0)
				.map((block) => ({ type: "text", text: sanitizeSurrogates(block.text) }) satisfies ChatCompletionContentPartText);
			const assistantText = assistantTextParts.map((part) => part.text).join("");

			const thinkingBlocks = msg.content.filter(isThinkingContentBlock);
			const toolCalls = msg.content.filter(isToolCallBlock);
			const signedReasoningDetails = thinkingBlocks
				.map((block) => parseOpenAIReasoningDetails(block.thinkingSignature))
				.find((details) => details !== undefined);
			const legacyReasoningDetails = toolCalls
				.map((toolCall) => parseLegacyEncryptedReasoningDetail(toolCall.thoughtSignature))
				.filter((detail): detail is OpenAIEncryptedReasoningDetail => detail !== undefined);
			const preservedReasoningDetails =
				signedReasoningDetails ?? (legacyReasoningDetails.length > 0 ? legacyReasoningDetails : undefined);

			const nonEmptyThinkingBlocks = thinkingBlocks.filter((block) => block.thinking.trim().length > 0);
			if (nonEmptyThinkingBlocks.length > 0 && compat.requiresThinkingAsText) {
				// Convert thinking blocks to plain text (no tags to avoid model mimicking them)
				const thinkingText = nonEmptyThinkingBlocks.map((block) => sanitizeSurrogates(block.thinking)).join("\n\n");
				assistantMsg.content = [{ type: "text", text: thinkingText }, ...assistantTextParts];
			} else {
				// Always send assistant content as a plain string: an array of text parts makes some models
				// (e.g. DeepSeek V3.2 via NVIDIA NIM) mirror the block structure literally in their output.
				if (assistantText.length > 0) assistantMsg.content = assistantText;
				// reasoning_details is the structured alternative to a raw reasoning field.
				const signature = nonEmptyThinkingBlocks[0]?.thinkingSignature;
				if (!preservedReasoningDetails && signature && isOpenAICompletionsReasoningField(signature)) {
					assistantMsg[signature] = nonEmptyThinkingBlocks.map((block) => block.thinking).join("\n");
				}
			}

			if (toolCalls.length > 0) {
				assistantMsg.tool_calls = toolCalls.map(
					(tc): ChatCompletionMessageToolCall => ({
						id: tc.id,
						type: "function",
						function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
					}),
				);
			}
			if (preservedReasoningDetails) {
				assistantMsg.reasoning_details = preservedReasoningDetails;
			}
			if (
				compat.requiresReasoningContentOnAssistantMessages &&
				model.reasoning &&
				assistantMsg.reasoning_content === undefined
			) {
				assistantMsg.reasoning_content = "";
			}
			// Skip assistant messages with no content and no tool calls (e.g. aborted responses);
			// providers reject "neither content nor tool_calls".
			const content = assistantMsg.content;
			const hasContent = content !== null && content !== undefined && content.length > 0;
			if (!hasContent && !assistantMsg.tool_calls) continue;
			params.push(assistantMsg);
		} else if (msg.role === "toolResult") {
			const imageBlocks: Array<{ type: "image_url"; image_url: { url: string } }> = [];
			let j = i;

			for (; j < transformedMessages.length && transformedMessages[j]!.role === "toolResult"; j++) {
				const toolMsg = transformedMessages[j] as ToolResultMessage;
				const textResult = toolMsg.content
					.filter(isTextContentBlock)
					.map((block) => block.text)
					.join("\n");
				const hasImages = toolMsg.content.some((c) => c.type === "image");
				// Always send tool result with text (or placeholder if only images)
				const toolResultText = textResult.length > 0 ? textResult : hasImages ? "(see attached image)" : "(no tool output)";
				const toolResultMsg: ChatCompletionToolMessageParam = {
					role: "tool",
					content: sanitizeSurrogates(toolResultText),
					tool_call_id: toolMsg.toolCallId,
				};
				if (compat.requiresToolResultName && toolMsg.toolName) {
					(toolResultMsg as any).name = toolMsg.toolName;
				}
				params.push(toolResultMsg);

				if (hasImages && model.input.includes("image")) {
					for (const block of toolMsg.content) {
						if (isImageContentBlock(block)) {
							imageBlocks.push({
								type: "image_url",
								image_url: { url: `data:${block.mimeType};base64,${block.data}` },
							});
						}
					}
				}
			}

			i = j - 1;

			// Chat Completions tool messages are text-only: images follow in a user turn.
			if (imageBlocks.length > 0) {
				if (compat.requiresAssistantAfterToolResult) {
					params.push({ role: "assistant", content: "I have processed the tool results." });
				}
				params.push({
					role: "user",
					content: [{ type: "text", text: "Attached image(s) from tool result:" }, ...imageBlocks],
				});
				lastRole = "user";
			} else {
				lastRole = "toolResult";
			}
			continue;
		}

		lastRole = msg.role;
	}

	return params;
}

function convertTools(tools: Tool[], compat: ResolvedOpenAICompletionsCompat): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools.map((tool) => {
		const strict = resolveJsonSchemaStrictSampling(tool, compat.supportsStrictMode);
		return {
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: getJsonSchemaToolParameters(tool, strict) as Record<string, unknown>,
				// Only include strict if the provider supports it. Some reject unknown fields.
				...(compat.supportsStrictMode && { strict: strict ?? false }),
			},
		};
	});
}

function parseChunkUsage(
	rawUsage: {
		prompt_tokens?: number;
		completion_tokens?: number;
		cached_tokens?: number;
		prompt_cache_hit_tokens?: number;
		prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
		completion_tokens_details?: { reasoning_tokens?: number };
	},
	model: Model<Api>,
): AssistantMessage["usage"] {
	const promptTokens = rawUsage.prompt_tokens || 0;
	// cached_tokens is cache-read tokens. OpenAI/OpenRouter use prompt_tokens_details.cached_tokens,
	// DeepSeek prompt_cache_hit_tokens, Kimi top-level cached_tokens. cache_write_tokens is a separate
	// count (OpenRouter-compatible providers); do not subtract it from cached_tokens.
	const cacheReadTokens =
		rawUsage.prompt_tokens_details?.cached_tokens ?? rawUsage.prompt_cache_hit_tokens ?? rawUsage.cached_tokens ?? 0;
	const cacheWriteTokens = rawUsage.prompt_tokens_details?.cache_write_tokens || 0;
	const input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
	// completion_tokens already includes reasoning_tokens.
	const outputTokens = rawUsage.completion_tokens || 0;
	const usage: AssistantMessage["usage"] = {
		input,
		output: outputTokens,
		cacheRead: cacheReadTokens,
		cacheWrite: cacheWriteTokens,
		reasoning: rawUsage.completion_tokens_details?.reasoning_tokens || 0,
		totalTokens: input + outputTokens + cacheReadTokens + cacheWriteTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	calculateCost(model, usage);
	return usage;
}

function mapStopReason(reason: ChatCompletionChunk.Choice["finish_reason"] | string): {
	stopReason: StopReason;
	errorMessage?: string;
} {
	switch (reason) {
		case null:
		case "stop":
		case "end":
			return { stopReason: "stop" };
		case "length":
			return { stopReason: "length" };
		case "function_call":
		case "tool_calls":
			return { stopReason: "toolUse" };
		default:
			return { stopReason: "error", errorMessage: `Provider finish_reason: ${reason}` };
	}
}

/** Auto-detect compatibility settings from provider name and baseUrl; explicit model.compat overrides them. */
function detectCompat(model: Model<Api>): ResolvedOpenAICompletionsCompat {
	const provider = model.provider;
	const baseUrl = model.baseUrl;

	const isZai =
		provider === "zai" ||
		provider === "zai-coding-cn" ||
		baseUrl.includes("api.z.ai") ||
		baseUrl.includes("open.bigmodel.cn");
	const isTogether =
		provider === "together" || baseUrl.includes("api.together.ai") || baseUrl.includes("api.together.xyz");
	const isMoonshot = provider === "moonshotai" || provider === "moonshotai-cn" || baseUrl.includes("api.moonshot.");
	const isOpenRouter = provider === "openrouter" || baseUrl.includes("openrouter.ai");
	const isCloudflareWorkersAI = provider === "cloudflare-workers-ai" || baseUrl.includes("api.cloudflare.com");
	const isCloudflareAiGateway = provider === "cloudflare-ai-gateway" || baseUrl.includes("gateway.ai.cloudflare.com");
	const isNvidia = provider === "nvidia" || baseUrl.includes("integrate.api.nvidia.com");
	const isAntLing = provider === "ant-ling" || baseUrl.includes("api.ant-ling.com");
	const isCerebras = provider === "cerebras" || baseUrl.includes("cerebras.ai");
	const isDeepSeek = provider === "deepseek" || baseUrl.toLowerCase().includes("deepseek.com");
	const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");

	const isNonStandard =
		isNvidia ||
		isCerebras ||
		isGrok ||
		isTogether ||
		baseUrl.includes("chutes.ai") ||
		isDeepSeek ||
		isZai ||
		isMoonshot ||
		provider === "opencode" ||
		baseUrl.includes("opencode.ai") ||
		isCloudflareWorkersAI ||
		isCloudflareAiGateway ||
		isAntLing;

	const useMaxTokens =
		baseUrl.includes("chutes.ai") ||
		isDeepSeek ||
		isMoonshot ||
		isCloudflareAiGateway ||
		isTogether ||
		isNvidia ||
		isAntLing ||
		isZai;

	const isOpenRouterDeveloperRoleModel =
		isOpenRouter && (model.id.startsWith("anthropic/") || model.id.startsWith("openai/"));

	return {
		supportsStore: !isNonStandard,
		supportsDeveloperRole: isOpenRouterDeveloperRoleModel || (!isNonStandard && !isOpenRouter),
		supportsReasoningEffort:
			!isGrok && !isZai && !isMoonshot && !isTogether && !isCloudflareAiGateway && !isNvidia && !isAntLing,
		supportsUsageInStreaming: true,
		supportsFinishReason: true,
		maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: isDeepSeek,
		thinkingFormat: isDeepSeek ? "deepseek" : isOpenRouter ? "openrouter" : "openai",
		// OpenAI compatibility alone does not imply strict JSON-schema tool support.
		supportsStrictMode: false,
	};
}

function getCompat(model: Model<Api>): ResolvedOpenAICompletionsCompat {
	const resolved = detectCompat(model);
	for (const [key, value] of Object.entries(model.compat ?? {})) {
		if (value !== undefined) (resolved as Record<string, unknown>)[key] = value;
	}
	return resolved;
}
