/** Canonical Responses-shaped model boundary. */
import { setTimeout as delay } from 'node:timers/promises';
import { Agent } from 'undici';
import type { AssistantTurn, ChatMessage, ModelRequestOptions, ToolDefinition } from './chat-model.js';
import { defaultModelProfile, loadConfig, resolveBuilderProfile, skillProfiles, type ResolvedProfile } from './profiles.js';

type Item = Record<string, any>;
export interface CanonicalBody { model: string; instructions: string; input: Item[] | string; tools: Item[]; store: boolean; max_output_tokens: number; reasoning: { effort: string } }
export interface ModelResponse {
  id: string; output: Item[]; replay_items: Item[]; raw: Item; status: string;
  incomplete_details: { reason: string } | null;
  usage: { input_tokens: number; output_tokens: number; input_tokens_details: { cached_tokens: number | null; cache_write_tokens?: number }; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}
export const LADDER = [5, 15, 40, 90, 180, 300, 300, 300];
export const GATEWAY_HINTS = ['no available channel', 'error doing the fallback', 'serviceunavailable', 'must be passed back to the api'];
const tokenCount = (value: unknown): number => Math.trunc(Number(value)) || 0;
const reasoningKeys = ['reasoning', 'reasoning_content', 'thinking'];
const object = (value: unknown): value is Item => !!value && typeof value === 'object' && !Array.isArray(value);
export function replayItem(value: any): any {
  if (Array.isArray(value)) return value.map(replayItem);
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key, value]) => key !== 'status' && value !== null).map(([key, value]) => [key, replayItem(value)]));
  return value;
}
export function chatHistory(items: Item[]): Item[] {
  const messages: Item[] = [];
  for (const item of items) {
    if (!object(item)) continue;
    if (item.type === 'chat_assistant') messages.push({ ...item.message, role: 'assistant' });
    else if (item.type === 'function_call') messages.push({ role: 'assistant', content: null, tool_calls: [{ id: item.call_id || item.id || '', type: 'function', function: { name: item.name ?? '', arguments: item.arguments || '{}' } }] });
    else if (item.type === 'function_call_output') messages.push({ role: 'tool', tool_call_id: item.call_id ?? '', content: String(item.output ?? '') });
    else if (item.type === 'message' || item.role) {
      let content = item.content;
      if (Array.isArray(content)) {
        if (content.some(block => object(block) && block.type === 'input_image')) {
          const parts: Item[] = [];
          for (const block of content) {
            if (!object(block)) continue;
            if (block.type === 'input_image') parts.push({ type: 'image_url', image_url: { url: block.image_url ?? '' } });
            else if (block.text) parts.push({ type: 'text', text: block.text });
          }
          messages.push({ role: item.role ?? 'user', content: parts });
          continue;
        }
        content = content.filter(object).map(block => block.text ?? '').join('');
      }
      messages.push({ role: item.role ?? 'assistant', content: content || '' });
    }
  }
  return messages;
}
export function chatBody(body: CanonicalBody): Item {
  const messages: Item[] = body.instructions ? [{ role: 'system', content: body.instructions }] : [];
  messages.push(...(typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : chatHistory(body.input || [])));
  const result: Item = { model: body.model, messages, max_tokens: body.max_output_tokens };
  const effort = String(body.reasoning?.effort || '').trim().toLowerCase();
  if (effort) result.reasoning_effort = effort;
  if (body.tools?.length) result.tools = body.tools.map(({ type: _type, ...tool }) => ({ type: 'function', function: tool }));
  return result;
}
export function toMessages(body: CanonicalBody): Item {
  const messages: Item[] = [];
  const push = (role: string, block: Item) => {
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(block);
    else messages.push({ role, content: [block] });
  };
  const input = typeof body.input === 'string' ? (body.input ? [{ role: 'user', content: body.input }] : []) : body.input || [];
  for (const item of input) {
    if (!object(item)) continue;
    if (item.type === 'anthropic_assistant') {
      for (const block of item.content || []) if (object(block)) push('assistant', { ...block });
    } else if (item.type === 'function_call') {
      let args: unknown = {};
      try { args = JSON.parse(item.arguments || '{}'); } catch { /* Malformed model arguments become {}. */ }
      push('assistant', { type: 'tool_use', id: item.call_id ?? '', name: item.name ?? '', input: args });
    } else if (item.type === 'function_call_output') push('user', { type: 'tool_result', tool_use_id: item.call_id ?? '', content: String(item.output ?? '') });
    else if (item.type !== 'reasoning' && ['user', 'assistant'].includes(item.role)) {
      if (typeof item.content === 'string') { push(item.role, { type: 'text', text: item.content }); continue; }
      for (const block of item.content || []) {
        if (!object(block)) continue;
        if (['input_text', 'output_text', 'text'].includes(block.type)) push(item.role, { type: 'text', text: block.text ?? '' });
        else if (block.type === 'input_image' && (block.image_url || '').startsWith('data:')) {
          const comma = block.image_url.indexOf(',');
          const header = comma < 0 ? block.image_url : block.image_url.slice(0, comma);
          push(item.role, { type: 'image', source: { type: 'base64', media_type: header.slice(5).split(';')[0], data: comma < 0 ? '' : block.image_url.slice(comma + 1) } });
        }
      }
    }
  }
  const last = messages.at(-1)?.content.at(-1);
  if (last) last.cache_control = { type: 'ephemeral' };
  const result: Item = { model: body.model, max_tokens: body.max_output_tokens ?? 4096, system: [{ type: 'text', text: body.instructions ?? '', cache_control: { type: 'ephemeral' } }], messages };
  const effort = String(body.reasoning?.effort || '').toLowerCase();
  if (!['medium', 'high'].includes(effort)) result.thinking = { type: 'disabled' };
  else { result.thinking = { type: 'adaptive' }; result.output_config = { effort }; }
  if (body.tools?.length) result.tools = body.tools.map(tool => ({ name: tool.name, description: tool.description ?? '', input_schema: tool.parameters && Object.keys(tool.parameters).length ? tool.parameters : { type: 'object', properties: {} } }));
  return result;
}
function itemMessage(text: string): Item { return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }; }
export function adaptChat(raw: Item, want?: number, replayReasoning = false): ModelResponse {
  const choice = raw.choices?.[0], message = choice?.message;
  const output: Item[] = [];
  if (typeof message?.content === 'string' && message.content.trim()) output.push(itemMessage(message.content));
  for (const call of message?.tool_calls || []) output.push({ type: 'function_call', name: call.function?.name || '', arguments: call.function?.arguments || '{}', call_id: call.id || '', id: call.id || '' });
  if (message && !output.length) console.warn(`chat 响应里正文为空，finish_reason=${choice?.finish_reason ?? null}`);
  const cached = raw.usage?.prompt_tokens_details?.cached_tokens;
  const usage = { input_tokens: tokenCount(raw.usage?.prompt_tokens), output_tokens: tokenCount(raw.usage?.completion_tokens), input_tokens_details: { cached_tokens: cached == null ? null : tokenCount(cached) } };
  const replay: Item[] = [];
  if (message) {
    const next: Item = { role: 'assistant', content: typeof message.content === 'string' ? message.content : null };
    if (message.tool_calls?.length) next.tool_calls = message.tool_calls.map((call: Item) => ({ id: call.id || '', type: 'function', function: { name: call.function?.name || '', arguments: call.function?.arguments || '{}' }, ...(call.extra_content ? { extra_content: call.extra_content } : {}) }));
    if (replayReasoning) for (const key of reasoningKeys) if (message[key]) next[key] = message[key];
    replay.push({ type: 'chat_assistant', message: next });
  }
  const truncated = choice?.finish_reason === 'length' || (!!want && usage.output_tokens >= want);
  return { id: raw.id || '', output, replay_items: replay, usage, raw, status: truncated ? 'incomplete' : 'completed', incomplete_details: truncated ? { reason: 'max_output_tokens' } : null };
}
export function adaptMessages(raw: Item): ModelResponse {
  const output: Item[] = [];
  for (const block of raw.content || []) {
    if (block.type === 'text' && (block.text || '').trim()) output.push(itemMessage(block.text));
    else if (block.type === 'tool_use') output.push({ type: 'function_call', name: block.name ?? '', arguments: JSON.stringify(block.input ?? {}), call_id: block.id ?? '', id: block.id ?? '' });
  }
  const usage = raw.usage || {};
  const read = tokenCount(usage.cache_read_input_tokens), write = tokenCount(usage.cache_creation_input_tokens);
  const truncated = raw.stop_reason === 'max_tokens';
  return { id: raw.id || '', output, replay_items: [{ type: 'anthropic_assistant', content: [...(raw.content || [])] }], raw,
    status: truncated ? 'incomplete' : 'completed', incomplete_details: truncated ? { reason: 'max_output_tokens' } : null,
    usage: { input_tokens: tokenCount(usage.input_tokens) + read + write, output_tokens: tokenCount(usage.output_tokens), input_tokens_details: { cached_tokens: read }, cache_read_input_tokens: read, cache_creation_input_tokens: write } };
}
export function textOf(response: Pick<ModelResponse, 'output'>): string {
  const output: string[] = [], unknown = new Set<string>();
  const skipped = new Set(['reasoning', 'function_call', 'function_call_output', 'web_search_call', 'file_search_call', 'computer_call']);
  for (const item of response.output || []) {
    if (skipped.has(item.type)) continue;
    if (item.type != null && !['message', 'output_text'].includes(item.type)) { unknown.add(String(item.type)); continue; }
    for (const block of item.content || []) if (typeof block.text === 'string') output.push(block.text);
  }
  if (unknown.size) console.warn(`响应里有没见过的 output item 类型 ${[...unknown].sort().join(', ')}，已跳过`);
  return output.join('');
}
export function cacheWriteOf(response: ModelResponse): number {
  const details = response.usage.input_tokens_details;
  if (details?.cache_write_tokens != null) return tokenCount(details.cache_write_tokens);
  return tokenCount(response.usage.cache_creation_input_tokens);
}
export function normalizedBaseUrl(value: string): string {
  const url = new URL(value.trim());
  url.pathname = url.pathname.replace(/\/+$/, '') || '/v1';
  return url.toString();
}
/** Transport metadata only: never retain prompts, images, endpoints or credentials here. */
export interface ModelRequestDiagnostics {
  stage?: string;
  adapter: string;
  requestBytes: number;
  maxRequestBytes?: number;
  imageCount: number;
}
export class ModelRequestBudgetError extends Error {
  readonly code = 'MODEL_REQUEST_TOO_LARGE';
  constructor(readonly request: ModelRequestDiagnostics) {
    super(`模型请求体超过本地预算：${request.requestBytes} bytes > ${request.maxRequestBytes} bytes${request.stage ? ` (${request.stage})` : ''}`);
    this.name = 'ModelRequestBudgetError';
  }
}
export class ModelHttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryText = message, readonly request?: ModelRequestDiagnostics) { super(message); this.name = 'ModelHttpError'; }
}
export class ModelConnectionError extends Error {}
function requestLimit(...values: (number | undefined)[]): number | undefined {
  const limits = values.filter((value): value is number => value !== undefined);
  if (limits.some(value => !Number.isSafeInteger(value) || value <= 0)) throw new TypeError('Model request byte limits must be positive safe integers');
  return limits.length ? Math.min(...limits) : undefined;
}
function imageCount(input: unknown): number {
  if (Array.isArray(input)) return input.reduce<number>((count, value) => count + imageCount(value), 0);
  if (!object(input)) return 0;
  if ((input.type === 'input_image' && typeof input.image_url === 'string')
    || (input.type === 'image_url' && (typeof input.image_url === 'string' || typeof input.image_url?.url === 'string'))
    || (input.type === 'image' && object(input.source) && ['base64', 'url'].includes(input.source.type))) return 1;
  return Object.values(input).reduce<number>((count, value) => count + imageCount(value), 0);
}
// Undici's default 300s headers/body caps would cut requests below http_timeout_sec (900s).
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
export interface TransportOptions {
  fetch?: typeof fetch; env?: NodeJS.ProcessEnv; random?: () => number;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}
export class ModelRuntime {
  constructor(readonly profile: ResolvedProfile, private readonly transport: TransportOptions = {}) {
    if (!['chat', 'messages', 'responses'].includes(profile.adapter)) throw new Error(`unknown model adapter '${profile.adapter}'`);
  }
  async complete(body: CanonicalBody, signal?: AbortSignal, options: ModelRequestOptions = {}): Promise<ModelResponse> {
    const profile = this.profile;
    const key = (this.transport.env ?? process.env)[profile.api_key_env];
    if (!key) throw new Error(`环境变量 ${profile.api_key_env} 没有值,检查 .env.local`);
    const suffix = profile.adapter === 'chat' ? '/chat/completions' : profile.adapter === 'messages' ? '/messages' : '/responses';
    const base = normalizedBaseUrl(profile.base_url);
    const hash = base.indexOf('#');
    const endpoint = profile.adapter === 'messages' || hash < 0
      ? base.replace(/\/$/, '') + suffix
      : base.slice(0, hash).replace(/\/$/, '') + suffix + (base.slice(hash + 1) ? base.slice(hash) : '');
    const translated = profile.adapter === 'chat' ? chatBody(body) : profile.adapter === 'messages' ? toMessages(body) : { ...body };
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
    if (profile.adapter === 'messages') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
    const wireBody = { ...translated, ...profile.request_options };
    const payload = JSON.stringify(wireBody);
    const maxRequestBytes = requestLimit(options.maxRequestBytes, profile.max_request_bytes);
    const request: ModelRequestDiagnostics = {
      ...(options.stage ? { stage: options.stage } : {}), adapter: profile.adapter,
      requestBytes: Buffer.byteLength(payload, 'utf8'),
      ...(maxRequestBytes !== undefined ? { maxRequestBytes } : {}),
      imageCount: imageCount(profile.adapter === 'responses' ? wireBody.input : wireBody.messages),
    };
    if (request.maxRequestBytes !== undefined && request.requestBytes > request.maxRequestBytes) throw new ModelRequestBudgetError(request);
    if (request.stage || request.maxRequestBytes !== undefined) console.info('Model request', request);
    let response: Response, text: string;
    try {
      // The whole request, body included, shares one deadline with the caller's signal.
      const timeout = AbortSignal.timeout(profile.http_timeout_sec * 1000);
      response = await (this.transport.fetch ?? fetch)(endpoint, { method: 'POST', headers, body: payload, redirect: 'follow',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout, dispatcher } as RequestInit);
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw new ModelConnectionError(error instanceof Error ? error.message : String(error), { cause: error });
    }
    if (!response.ok) {
      // Some gateways echo request bodies on 413. Keep their text out of errors/logs.
      if (response.status === 413) throw new ModelHttpError(413, `413 模型网关拒绝了过大的请求体 ${JSON.stringify(request)}`, '413', request);
      const detail = profile.adapter === 'messages' ? text.slice(0, 600) : text;
      let retryText = detail;
      // Messages errors are matched against the truncated raw text.
      if (profile.adapter !== 'messages') try { retryText = JSON.stringify(JSON.parse(detail.trim())); } catch { /* Plain HTTP error body. */ }
      throw new ModelHttpError(response.status, `${response.status} ${detail}`, retryText, request);
    }
    const raw = JSON.parse(text);
    if (profile.adapter === 'chat') return adaptChat(raw, body.max_output_tokens, profile.replay_reasoning);
    if (profile.adapter === 'messages') return adaptMessages(raw);
    return { id: raw.id || '', output: raw.output || [], replay_items: [], raw, status: raw.status,
      incomplete_details: raw.incomplete_details ?? null,
      usage: { ...raw.usage, input_tokens: tokenCount(raw.usage?.input_tokens), output_tokens: tokenCount(raw.usage?.output_tokens), input_tokens_details: { ...raw.usage?.input_tokens_details, cached_tokens: raw.usage?.input_tokens_details?.cached_tokens == null ? null : tokenCount(raw.usage.input_tokens_details.cached_tokens) } } };
  }
  async respondCanonical(instructions: string, history: Item[], tools: Item[], options: ModelRequestOptions & { effort?: string; signal?: AbortSignal } = {}): Promise<ModelResponse> {
    const body: CanonicalBody = { model: this.profile.model, instructions, input: history, tools, store: false, max_output_tokens: this.profile.max_output_tokens, reasoning: { effort: options.effort || this.profile.reasoning_effort } };
    let last: unknown;
    for (const wait of [0, ...LADDER]) {
      options.signal?.throwIfAborted();
      if (wait) {
        const milliseconds = wait * (0.7 + 0.6 * (this.transport.random ?? Math.random)()) * 1000;
        if (this.transport.wait) await this.transport.wait(milliseconds, options.signal);
        else await delay(milliseconds, undefined, options.signal ? { signal: options.signal } : {});
      }
      options.signal?.throwIfAborted();
      try { return await this.complete(body, options.signal, options); }
      catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        const retry = error instanceof ModelHttpError ? error.status === 429 || error.status >= 500 || (error.status === 400 && GATEWAY_HINTS.some(hint => error.retryText.toLowerCase().includes(hint))) : error instanceof ModelConnectionError;
        if (!retry) throw error;
        last = error;
      }
    }
    throw last;
  }
  static replay(response: ModelResponse): Item[] { return (response.replay_items.length ? response.replay_items : response.output).map(replayItem); }
  /** Bridge for existing TS orchestration; opaque replay is never sent as chat metadata. */
  async respond(messages: ChatMessage[], tools: ToolDefinition[] = [], signal?: AbortSignal, options: ModelRequestOptions = {}): Promise<AssistantTurn> {
    const instructions = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
    const history: Item[] = [];
    for (const message of messages) {
      if (message.role === 'system') continue;
      if (message.replay_items) { history.push(...message.replay_items); continue; }
      if (message.role === 'tool') { history.push({ type: 'function_call_output', call_id: message.tool_call_id ?? '', output: message.content }); continue; }
      if (message.role === 'assistant' && message.tool_calls?.length) {
        if (message.content) history.push({ role: 'assistant', content: message.content });
        for (const call of message.tool_calls) history.push({ type: 'function_call', name: call.function.name, arguments: call.function.arguments, call_id: call.id });
      } else history.push({ role: message.role, content: Array.isArray(message.content) ? message.content.map(block => block.type === 'text' ? { type: 'input_text', text: block.text } : { type: 'input_image', image_url: block.image_url.url }) : message.content });
    }
    const response = await this.respondCanonical(instructions, history, tools.map(tool => ({ type: tool.type, ...tool.function })), { ...options, ...(signal ? { signal } : {}) });
    const text = textOf(response);
    return { id: response.id, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      ...(response.usage.input_tokens_details.cached_tokens !== null ? { cachedTokens: response.usage.input_tokens_details.cached_tokens } : {}),
      message: { role: 'assistant', content: text, tool_calls: response.output.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } })), replay_items: ModelRuntime.replay(response) },
      canonical: response,
    };
  }
}

export interface PlannerOverrides { model?: string; effort?: string; baseUrl?: string; keyEnv?: string; wire?: string }

/** Per-run, lazy stage selection; an independent stage never loads the other profile. */
export function skillModels(config = loadConfig(), requested?: string, transport: TransportOptions = {}, overrides: PlannerOverrides = {}) {
  let planner: ModelRuntime | undefined;
  let builders: Record<string, ModelRuntime> | undefined;
  const models = {
    get planner(): ModelRuntime {
      if (!planner) {
        const effort = overrides.effort || config.planner.reasoning_effort;
        const wire = overrides.wire || (overrides.model && /claude|sonnet|opus|haiku/i.test(overrides.model) ? 'messages' : undefined);
        const model = { ...config.model,
          ...(overrides.model ? { name: overrides.model } : {}), ...(wire ? { wire_api: wire } : {}),
          ...(overrides.baseUrl ? { base_url: overrides.baseUrl } : {}), ...(overrides.keyEnv ? { api_key_env: overrides.keyEnv } : {}),
        };
        const profile = defaultModelProfile({ ...config, model });
        profile.reasoning_effort = effort || profile.reasoning_effort;
        planner = new ModelRuntime(profile, transport);
      }
      return planner;
    },
    get director(): ModelRuntime { return models.planner; },
    get builders(): Record<string, ModelRuntime> {
      if (!builders) {
        const profiles = skillProfiles(config, resolveBuilderProfile(config, requested, transport.env), transport.env);
        const cache = new Map<ResolvedProfile, ModelRuntime>();
        builders = Object.fromEntries(Object.entries(profiles).map(([skill, profile]) => {
          if (!cache.has(profile)) cache.set(profile, new ModelRuntime(profile, transport));
          return [skill, cache.get(profile)!];
        }));
      }
      return builders;
    },
  };
  return models;
}
