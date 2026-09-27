// Notale fork of the pi coding agent (earendil-works/pi@fde38ed, MIT; see ./LICENSE).
// Single entry: agent loop, Gemini and OpenAI Chat Completions streaming, read/write/edit/bash tools, compaction.
export { Agent, type AgentInitialState, type AgentOptions } from "./agent/agent.js";
export { type AgentEventSink, runAgentLoop } from "./agent/agent-loop.js";
export type * from "./agent/types.js";
export type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	Context,
	FileContent,
	ImageContent,
	Message,
	Model,
	OpenAICompletionsCompat,
	SimpleStreamOptions,
	StopReason,
	StreamOptions,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
	ToolResultMessage,
	Usage,
	UserMessage,
} from "./ai/types.js";
export { AssistantMessageEventStream, EventStream } from "./ai/event-stream.js";
export { type GoogleOptions, streamGoogle } from "./ai/google.js";
export { type OpenAICompletionsOptions, streamOpenAICompletions } from "./ai/openai-completions.js";
export { type FilesClient, GeminiFiles, INLINE_MAX_BYTES, type MediaUploader } from "./ai/gemini-files.js";
export { MAX_MEDIA_BYTES, type MediaReadOptions, pageRange, readMedia } from "./tools/media-read.js";
export { sniff, sniffBytes, type Sniffed } from "./tools/media-sniff.js";
export { isContextOverflow } from "./ai/overflow.js";
export { isRetryableAssistantError, retryDelayMs, type RetryPolicy } from "./ai/retry.js";
export {
	type ContextUsageEstimate,
	calculateContextTokens,
	estimateContextTokens,
	estimateMessageTokens,
	estimateTextTokens,
} from "./ai/estimate.js";
export {
	type BashOperations,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createLocalBashOperations,
} from "./tools/bash.js";
export {
	createEditTool,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	editToolSystemPromptContribution,
} from "./tools/edit.js";
export {
	createReadTool,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./tools/read.js";
export {
	createWriteTool,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./tools/write.js";
export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type TruncationResult } from "./tools/truncate.js";
export {
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	type CompactOptions,
	compactIfNeeded,
	DEFAULT_KEEP_RECENT_TOKENS,
	DEFAULT_RESERVE_TOKENS,
	getCompactionSummary,
} from "./compaction.js";
