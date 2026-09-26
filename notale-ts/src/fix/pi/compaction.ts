// Forked from earendil-works/pi packages/coding-agent/src/core/compaction/{compaction,utils}.ts + core/messages.ts@fde38ed (MIT). Trimmed for the notale editor.
// Operates on an in-memory AgentMessage[] instead of session entries. Kept verbatim: thresholds
// (contextWindow - reserveTokens, keep ~keepRecentTokens), cut-point rules, split-turn handling,
// summary prompts, serialization and the summary wrapper text. Dropped: session manager / jsonl,
// branch summarization, retry policy, custom instructions, extension hooks.
import type { AgentMessage, StreamFn } from "./agent/types.js";
import { estimateContextTokens, estimateMessageTokens } from "./ai/estimate.js";
import { contentText } from "./ai/provider-utils.js";
import type { Api, AssistantMessage, Context, Message, Model, UserMessage } from "./ai/types.js";

export const DEFAULT_RESERVE_TOKENS = 16384;
export const DEFAULT_KEEP_RECENT_TOKENS = 20000;

export const COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;

export const COMPACTION_SUMMARY_SUFFIX = `
</summary>`;

// ============================================================================
// File Operation Tracking
// ============================================================================

interface FileOperations {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}

function extractFileOpsFromMessage(message: AgentMessage, fileOps: FileOperations): void {
	if (message.role !== "assistant") return;

	for (const block of message.content) {
		if (block.type !== "toolCall") continue;
		const path = typeof block.arguments?.path === "string" ? block.arguments.path : undefined;
		if (!path) continue;

		switch (block.name) {
			case "read":
				fileOps.read.add(path);
				break;
			case "write":
				fileOps.written.add(path);
				break;
			case "edit":
				fileOps.edited.add(path);
				break;
		}
	}
}

function computeFileLists(fileOps: FileOperations): { readFiles: string[]; modifiedFiles: string[] } {
	const modified = new Set([...fileOps.edited, ...fileOps.written]);
	const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
	const modifiedFiles = [...modified].sort();
	return { readFiles: readOnly, modifiedFiles };
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
	const sections: string[] = [];
	if (readFiles.length > 0) {
		sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
	}
	if (modifiedFiles.length > 0) {
		sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
	}
	if (sections.length === 0) return "";
	return `\n\n${sections.join("\n\n")}`;
}

// ============================================================================
// Message Serialization
// ============================================================================

/** Maximum characters for a tool result in serialized summaries. */
const TOOL_RESULT_MAX_CHARS = 2000;

function truncateForSummary(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const truncatedChars = text.length - maxChars;
	return `${text.slice(0, maxChars)}\n\n[... ${truncatedChars} more characters truncated]`;
}

/**
 * Serialize LLM messages to text for summarization.
 * This prevents the model from treating it as a conversation to continue.
 */
export function serializeConversation(messages: Message[]): string {
	const parts: string[] = [];

	for (const msg of messages) {
		if (msg.role === "user") {
			const content = contentText(msg.content, "");
			if (content) parts.push(`[User]: ${content}`);
		} else if (msg.role === "assistant") {
			const thinkingParts: string[] = [];
			const toolCalls: string[] = [];

			for (const block of msg.content) {
				if (block.type === "thinking") {
					thinkingParts.push(block.thinking);
				} else if (block.type === "toolCall") {
					const args = block.arguments as Record<string, unknown>;
					const argsStr = Object.entries(args)
						.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
						.join(", ");
					toolCalls.push(`${block.name}(${argsStr})`);
				}
			}

			if (thinkingParts.length > 0) {
				parts.push(`[Assistant thinking]: ${thinkingParts.join("\n")}`);
			}
			if (msg.content.some((block) => block.type === "text")) {
				parts.push(`[Assistant]: ${contentText(msg.content)}`);
			}
			if (toolCalls.length > 0) {
				parts.push(`[Assistant tool calls]: ${toolCalls.join("; ")}`);
			}
		} else if (msg.role === "toolResult") {
			const content = contentText(msg.content, "");
			if (content) {
				parts.push(`[Tool result]: ${truncateForSummary(content, TOOL_RESULT_MAX_CHARS)}`);
			}
		}
	}

	return parts.join("\n\n");
}

// ============================================================================
// Prompts (verbatim)
// ============================================================================

export const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARIZATION_INSTRUCTIONS = `Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARIZATION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

${UPDATE_SUMMARIZATION_INSTRUCTIONS}`;

const TURN_PREFIX_SUMMARIZATION_PROMPT = `The messages above are earlier context from an ongoing conversation. Later messages are stored separately and do not need to be reconstructed.

Create a concise checkpoint of the user's request and the progress shown above. This checkpoint will be placed before the later messages so the conversation can continue with the necessary context.

## Original Request
[What did the user ask for?]

## Progress So Far
- [Key decisions and work completed in these messages]

## Context Needed to Continue
- [Information from these messages needed to understand the later work]

Only summarize information explicitly present above. Do not infer or recreate later messages.`;

// ============================================================================
// Cut point detection
// ============================================================================

// Tool results are never cut points: they must follow their tool call.
function isCutPointMessage(message: AgentMessage): boolean {
	return message.role === "user" || message.role === "assistant";
}

function isTurnStartMessage(message: AgentMessage): boolean {
	return message.role === "user";
}

interface CutPointResult {
	firstKeptIndex: number;
	/** Index of the user message that starts the turn being split, or -1 if not splitting */
	turnStartIndex: number;
	isSplitTurn: boolean;
}

/**
 * Walk backwards from newest, accumulating estimated message sizes, and cut at the closest
 * valid cut point once `keepRecentTokens` is reached.
 */
function findCutPoint(
	messages: AgentMessage[],
	startIndex: number,
	endIndex: number,
	keepRecentTokens: number,
): CutPointResult {
	const cutPoints: number[] = [];
	for (let i = startIndex; i < endIndex; i++) {
		if (isCutPointMessage(messages[i]!)) cutPoints.push(i);
	}
	if (cutPoints.length === 0) {
		return { firstKeptIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
	}

	let accumulatedTokens = 0;
	let cutIndex = cutPoints[0]!;
	for (let i = endIndex - 1; i >= startIndex; i--) {
		const messageTokens = estimateMessageTokens(messages[i]!);
		if (messageTokens === 0) continue;
		accumulatedTokens += messageTokens;
		if (accumulatedTokens >= keepRecentTokens) {
			// Prefer the closest valid cut point at or after this message. If trailing
			// tool results exceed the budget by themselves, keep their preceding
			// assistant tool call instead of falling back to the first message.
			cutIndex = cutPoints.find((candidate) => candidate >= i) ?? cutPoints[cutPoints.length - 1]!;
			break;
		}
	}

	const startsTurn = isTurnStartMessage(messages[cutIndex]!);
	let turnStartIndex = -1;
	if (!startsTurn) {
		for (let i = cutIndex; i >= startIndex; i--) {
			if (isTurnStartMessage(messages[i]!)) {
				turnStartIndex = i;
				break;
			}
		}
	}
	return { firstKeptIndex: cutIndex, turnStartIndex, isSplitTurn: !startsTurn && turnStartIndex !== -1 };
}

// ============================================================================
// Summarization
// ============================================================================

interface SummarizeOptions {
	model: Model<Api>;
	streamFn: StreamFn;
	signal?: AbortSignal | undefined;
	apiKey?: string | undefined;
}

function getSummarizationFailure(response: AssistantMessage, label: string): string | undefined {
	if (response.stopReason === "error" || response.stopReason === "aborted") {
		return `${label} failed: ${response.errorMessage || "Unknown error"}`;
	}
	if (response.stopReason === "length") {
		return `${label} failed: generation hit the token cap and the summary is incomplete`;
	}
	return undefined;
}

async function complete(promptText: string, maxTokens: number, label: string, options: SummarizeOptions): Promise<string> {
	const context: Context = {
		systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
		messages: [{ role: "user", content: [{ type: "text", text: promptText }], timestamp: Date.now() }],
	};
	const stream = await options.streamFn(options.model, context, {
		maxTokens,
		...(options.signal && { signal: options.signal }),
		...(options.apiKey && { apiKey: options.apiKey }),
	});
	const response = await stream.result();
	const failure = getSummarizationFailure(response, label);
	if (failure) throw new Error(failure);
	if (response.content.some((block) => block.type === "toolCall")) {
		throw new Error(`${label} attempted to call a tool`);
	}
	return contentText(response.content);
}

function capTokens(model: Model<Api>, budget: number): number {
	return Math.min(Math.floor(budget), model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY);
}

async function generateSummary(
	messages: AgentMessage[],
	reserveTokens: number,
	previousSummary: string | undefined,
	options: SummarizeOptions,
): Promise<string> {
	const basePrompt = previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;
	let promptText = `<conversation>\n${serializeConversation(messages)}\n</conversation>\n\n`;
	if (previousSummary) {
		promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
	}
	promptText += basePrompt;
	return complete(promptText, capTokens(options.model, 0.8 * reserveTokens), "Summarization", options);
}

async function generateTurnPrefixSummary(
	messages: AgentMessage[],
	reserveTokens: number,
	options: SummarizeOptions,
): Promise<string> {
	const promptText = `# Conversation\n${serializeConversation(messages)}\n\n# Instructions\n${TURN_PREFIX_SUMMARIZATION_PROMPT}`;
	return complete(promptText, capTokens(options.model, 0.5 * reserveTokens), "Turn prefix summarization", options);
}

// ============================================================================
// Public entry
// ============================================================================

/** The summary text if `message` is a compaction summary produced by {@link compactIfNeeded}. */
export function getCompactionSummary(message: AgentMessage | undefined): string | undefined {
	if (message?.role !== "user") return undefined;
	const text = contentText(message.content);
	if (!text.startsWith(COMPACTION_SUMMARY_PREFIX) || !text.endsWith(COMPACTION_SUMMARY_SUFFIX)) return undefined;
	return text.slice(COMPACTION_SUMMARY_PREFIX.length, text.length - COMPACTION_SUMMARY_SUFFIX.length);
}

export interface CompactOptions {
	model: Model<Api>;
	streamFn: StreamFn;
	/** Default: model.contextWindow. */
	contextWindow?: number;
	signal?: AbortSignal;
	apiKey?: string;
	/** Default: 16384. */
	reserveTokens?: number;
	/** Default: 20000. */
	keepRecentTokens?: number;
}

/**
 * Compact when the estimated context exceeds `contextWindow - reserveTokens`: older messages
 * are replaced by one model-written summary (a user message) and ~`keepRecentTokens` of recent
 * messages are kept. A previous summary at the head is updated rather than re-summarized.
 * Returns the input array unchanged when no compaction is needed; throws if summarization fails.
 * Usable directly as (or inside) Agent `transformContext`.
 */
export async function compactIfNeeded(messages: AgentMessage[], options: CompactOptions): Promise<AgentMessage[]> {
	const contextWindow = options.contextWindow ?? options.model.contextWindow;
	const reserveTokens = options.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
	const keepRecentTokens = options.keepRecentTokens ?? DEFAULT_KEEP_RECENT_TOKENS;
	if (contextWindow <= 0) return messages;
	if (estimateContextTokens(messages).tokens <= contextWindow - reserveTokens) return messages;

	const previousSummary = getCompactionSummary(messages[0]);
	const boundaryStart = previousSummary !== undefined ? 1 : 0;
	const cut = findCutPoint(messages, boundaryStart, messages.length, keepRecentTokens);
	const historyEnd = cut.isSplitTurn ? cut.turnStartIndex : cut.firstKeptIndex;
	const toSummarize = messages.slice(boundaryStart, historyEnd);
	const turnPrefix = cut.isSplitTurn ? messages.slice(cut.turnStartIndex, cut.firstKeptIndex) : [];
	if (toSummarize.length === 0 && turnPrefix.length === 0) return messages;

	const summarize: SummarizeOptions = {
		model: options.model,
		streamFn: options.streamFn,
		signal: options.signal,
		apiKey: options.apiKey,
	};
	let summary: string;
	if (cut.isSplitTurn && turnPrefix.length > 0) {
		const historyText =
			toSummarize.length > 0
				? await generateSummary(toSummarize, reserveTokens, previousSummary, summarize)
				: (previousSummary ?? "No prior history.");
		const prefixText = await generateTurnPrefixSummary(turnPrefix, reserveTokens, summarize);
		summary = `${historyText}\n\n---\n\n**Turn Context (split turn):**\n\n${prefixText}`;
	} else {
		summary = await generateSummary(toSummarize, reserveTokens, previousSummary, summarize);
	}

	// ponytail: file lists come from the summarized messages only; pi also carries the previous
	// compaction's lists forward (they survive here inside the previous summary text instead).
	const fileOps: FileOperations = { read: new Set(), written: new Set(), edited: new Set() };
	for (const message of [...toSummarize, ...turnPrefix]) extractFileOpsFromMessage(message, fileOps);
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	const summaryMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: COMPACTION_SUMMARY_PREFIX + summary + COMPACTION_SUMMARY_SUFFIX }],
		timestamp: Date.now(),
	};
	return [summaryMessage, ...messages.slice(cut.firstKeptIndex)];
}
