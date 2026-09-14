/** Canonical Responses-shaped model boundary ported from core/llm.py. */
import { setTimeout as delay } from 'node:timers/promises';
import { MIMEType } from 'node:util';
import { parsePythonJson, parsePythonJsonBytes, jsonText, inheritJsonProvenance, pythonJsonTruthy, pythonInteger, rememberKeyOrder, pythonObjectKeys, isPythonIntegerField, pythonNumberText, sumIntegers, mergeJsonMappings, type PythonInt } from '../../core/json.js';
import { requestBytes, requestFtpBytes } from '../../core/http.js';
import { ModelCookies } from './cookies.js';
import { stripText } from '../../core/text.js';
import type { AssistantTurn, ChatMessage, ToolDefinition } from './chat-model.js';
import { defaultModelProfile, loadConfig, configValue, requiredConfigValue, resolveBuilderProfile, workflowProfiles, pythonBool, type ResolvedProfile } from './profiles.js';

type Item = Record<string, any>;
export interface CanonicalBody { model: string; instructions: string; input: Item[] | string; tools: Item[]; store: boolean; max_output_tokens: number | bigint; reasoning: { effort: string } }
export interface ModelResponse {
  id: string; output: Item[]; replay_items: Item[]; raw: Item; status: string;
  incomplete_details: { reason: string } | null;
  usage: { input_tokens: PythonInt; output_tokens: PythonInt; input_tokens_details: { cached_tokens: PythonInt | null; cache_write_tokens?: PythonInt }; cache_read_input_tokens?: PythonInt; cache_creation_input_tokens?: PythonInt };
}
export const LADDER = [5, 15, 40, 90, 180, 300, 300, 300];
export const GATEWAY_HINTS = ['no available channel', 'error doing the fallback', 'serviceunavailable', 'must be passed back to the api'];
const tokenCount = (value: unknown, owner?: Item, key?: string): PythonInt => {
  if (!pythonJsonTruthy(value)) return 0;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && !Number.isSafeInteger(value) && owner && key && isPythonIntegerField(owner, key)) return BigInt(pythonNumberText(value, owner, key));
  return pythonInteger(value, true);
};
const reasoningKeys = ['reasoning', 'reasoning_content', 'thinking'];
const object = (value: unknown): value is Item => !!value && typeof value === 'object' && !Array.isArray(value);
export function replayItem(value: any): any {
  if (Array.isArray(value)) return inheritJsonProvenance(value.map(replayItem), value);
  if (object(value)) return inheritJsonProvenance(Object.fromEntries(Object.entries(value).filter(([key, value]) => key !== 'status' && value !== null).map(([key, value]) => [key, replayItem(value)])), value);
  return value;
}
export function chatHistory(items: Item[]): Item[] {
  const messages: Item[] = [];
  for (const item of items) {
    if (!object(item)) continue;
    if (item.type === 'chat_assistant') messages.push(inheritJsonProvenance({ ...item.message, role: 'assistant' }, item.message));
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
  const effort = stripText(String(body.reasoning?.effort || '')).toLowerCase();
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
  const input = !pythonJsonTruthy(body.input) ? [] : typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input || [];
  for (const item of input) {
    if (!object(item)) continue;
    if (item.type === 'anthropic_assistant') {
      for (const block of item.content || []) if (object(block)) push('assistant', inheritJsonProvenance({ ...block }, block));
    } else if (item.type === 'function_call') {
      let args: unknown = {};
      try { args = parsePythonJson(item.arguments || '{}'); } catch { /* Same malformed-arguments fallback as Python. */ }
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
  if (body.tools?.length) result.tools = body.tools.map(tool => ({ name: tool.name, description: tool.description ?? '', input_schema: pythonJsonTruthy(tool.parameters) ? tool.parameters : { type: 'object', properties: {} } }));
  return result;
}
function itemMessage(text: string): Item { return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }; }
export function adaptChat(raw: Item, want?: number | bigint, replayReasoning = false): ModelResponse {
  const choice = raw.choices?.[0], message = choice?.message;
  const output: Item[] = [];
  if (typeof message?.content === 'string' && stripText(message.content)) output.push(itemMessage(message.content));
  for (const call of message?.tool_calls || []) output.push({ type: 'function_call', name: call.function?.name || '', arguments: call.function?.arguments || '{}', call_id: call.id || '', id: call.id || '' });
  if (message && !output.length) console.warn(`chat 响应里正文为空，finish_reason=${choice?.finish_reason ?? null}`);
  const cached = raw.usage?.prompt_tokens_details?.cached_tokens;
  const usage = { input_tokens: tokenCount(raw.usage?.prompt_tokens, raw.usage, 'prompt_tokens'), output_tokens: tokenCount(raw.usage?.completion_tokens, raw.usage, 'completion_tokens'), input_tokens_details: { cached_tokens: cached == null ? null : tokenCount(cached, raw.usage?.prompt_tokens_details, 'cached_tokens') } };
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
    if (block.type === 'text' && stripText(block.text || '')) output.push(itemMessage(block.text));
    else if (block.type === 'tool_use') output.push({ type: 'function_call', name: block.name ?? '', arguments: jsonText(pythonJsonTruthy(block.input) ? block.input : {}), call_id: block.id ?? '', id: block.id ?? '' });
  }
  const usage = raw.usage || {};
  const read = tokenCount(usage.cache_read_input_tokens, usage, 'cache_read_input_tokens'), write = tokenCount(usage.cache_creation_input_tokens, usage, 'cache_creation_input_tokens');
  const truncated = raw.stop_reason === 'max_tokens';
  return { id: raw.id || '', output, replay_items: [{ type: 'anthropic_assistant', content: [...(raw.content || [])] }], raw,
    status: truncated ? 'incomplete' : 'completed', incomplete_details: truncated ? { reason: 'max_output_tokens' } : null,
    usage: { input_tokens: sumIntegers(tokenCount(usage.input_tokens, usage, 'input_tokens'), read, write), output_tokens: tokenCount(usage.output_tokens, usage, 'output_tokens'), input_tokens_details: { cached_tokens: read }, cache_read_input_tokens: read, cache_creation_input_tokens: write } };
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
export function cacheWriteOf(response: ModelResponse): PythonInt {
  const details = response.usage.input_tokens_details;
  if (details?.cache_write_tokens != null) return tokenCount(details.cache_write_tokens, response.raw.usage?.input_tokens_details ?? details, 'cache_write_tokens');
  return tokenCount(response.usage.cache_creation_input_tokens ?? 0, response.raw.usage ?? response.usage, 'cache_creation_input_tokens');
}
export function normalizedBaseUrl(value: string): string {
  const url = new URL(value.trim());
  url.pathname = url.pathname.replace(/\/+$/, '') || '/v1';
  return url.toString();
}
export class ModelHttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryText = message) { super(message); this.name = 'ModelHttpError'; }
}
/** httpx error text honors the response charset; Messages uses raw UTF-8 instead. */
function statusResponseText(bytes: Buffer, contentType: string | null): string {
  let charset: string | null = null;
  const separator = contentType?.indexOf(';') ?? -1;
  if (separator >= 0) {
    // Only parameters matter here; email.message also accepts an invalid media type.
    try { charset = new MIMEType('application/octet-stream' + contentType!.slice(separator)).params.get('charset'); }
    catch { /* Invalid parameters leave the default encoding in effect. */ }
  }
  const encoding = (charset ?? 'utf-8').trim().toLowerCase().replaceAll('_', '-');
  if (encoding === 'utf-16' || encoding === 'utf16') {
    if (!bytes.length) return '';
    const little = bytes[0] === 0xff && bytes[1] === 0xfe;
    const big = bytes[0] === 0xfe && bytes[1] === 0xff;
    if (!little && !big) throw Object.assign(new Error('UTF-16 stream does not start with BOM'), { name: 'UnicodeError' });
    return new TextDecoder(little ? 'utf-16le' : 'utf-16be').decode(bytes);
  }
  const utf32 = /^(?:utf-32|utf32)(?:-?(le|be))?$/.exec(encoding);
  if (utf32) {
    const bomLE = bytes.subarray(0, 4).equals(Buffer.from('fffe0000', 'hex'));
    const bomBE = bytes.subarray(0, 4).equals(Buffer.from('0000feff', 'hex'));
    const generic = !utf32[1], little = generic ? bomLE : utf32[1] === 'le';
    if (generic && bytes.length >= 4 && !bomLE && !bomBE) throw Object.assign(new Error('UTF-32 stream does not start with BOM'), { name: 'UnicodeError' });
    // HTTP text replaces malformed code points; json.loads(bytes) instead
    // uses strict surrogatepass decoding, so its decoder cannot be reused.
    let result = '';
    for (let at = generic && (bomLE || bomBE) ? 4 : 0; at < bytes.length; at += 4) {
      const code = at + 4 > bytes.length ? 0xfffd : little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
      result += String.fromCodePoint(code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? 0xfffd : code);
    }
    return result;
  }
  if (encoding === 'utf-8-sig') return new TextDecoder('utf-8').decode(bytes);
  // WHATWG aliases latin1/ascii to Windows-1252, unlike Python codecs.
  if (['latin-1', 'latin1', 'iso-8859-1', 'iso8859-1'].includes(encoding)) return bytes.toString('latin1');
  if (['ascii', 'us-ascii'].includes(encoding)) return Array.from(bytes, byte => byte < 128 ? String.fromCharCode(byte) : '\ufffd').join('');
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(encoding, { ignoreBOM: true }); }
  catch { decoder = new TextDecoder('utf-8', { ignoreBOM: true }); }
  return decoder.decode(bytes);
}
async function modelRequest(adapter: string, request: typeof fetch, endpoint: string, headers: Record<string, string>, payload: string, timeout: number, signal?: AbortSignal, cookies?: ModelCookies) {
  const messages = adapter === 'messages';
  let redirects = 0;
  let url = endpoint;
  let init: RequestInit = { method: 'POST', headers, body: payload, redirect: 'manual' };
  const visited = new Map<string, number>();
  for (;;) {
    if (cookies) {
      const requestHeaders = { ...init.headers as Record<string, string> };
      delete requestHeaders.cookie;
      const cookie = cookies.header(url);
      if (cookie) requestHeaders.cookie = cookie;
      init = { ...init, headers: requestHeaders };
    }
    const result: { response: Response; bytes: Buffer; rawHeaders?: string[] | undefined } = messages && url.startsWith('ftp:') && request === globalThis.fetch
      ? await requestFtpBytes(url, timeout, signal)
      : await requestBytes(request, url, init, timeout, signal, response => cookies?.extract(url, response.headers));
    const status = result.response.status;
    const header = (name: string): string | null => {
      if (messages && result.rawHeaders) {
        for (let i = 0; i < result.rawHeaders.length; i += 2) {
          if (result.rawHeaders[i]!.toLowerCase() === name) return result.rawHeaders[i + 1]!;
        }
        return null;
      }
      return result.response.headers.get(name);
    };
    const location = header('location') ?? (messages ? header('uri') : null);
    if (![301, 302, 303, 307, 308].includes(status) || location === null) return result;
    if (messages && init.method === 'POST' && (status === 307 || status === 308)) return result;
    // urllib quotes original ISO-8859-1 header bytes before resolving relative URLs.
    const quoted = messages ? Array.from(location, char => /[\x21-\x7e]/.test(char) ? char : '%' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('') : location;
    let next: URL;
    try { next = new URL(quoted, url); } catch { return result; }
    if (!['http:', 'https:', 'ftp:'].includes(next.protocol)) return result;
    const target = next.href;
    if (messages) {
      if ((visited.get(target) ?? 0) >= 4 || visited.size >= 10) return result;
      visited.set(target, (visited.get(target) ?? 0) + 1);
    } else if (redirects++ >= 20) throw new Error('Exceeded maximum allowed redirects.');
    const previous = new URL(url);
    const nextHeaders = { ...init.headers as Record<string, string> };
    const upgrade = previous.protocol === 'http:' && next.protocol === 'https:' && previous.hostname === next.hostname && !previous.port && !next.port;
    if (!messages && previous.origin !== next.origin && !upgrade) delete nextHeaders.authorization;
    if (messages || [301, 302, 303].includes(status)) {
      delete nextHeaders['content-length'];
      if (messages) delete nextHeaders['content-type'];
      init = { method: 'GET', redirect: 'manual', headers: nextHeaders };
    } else init = { ...init, headers: nextHeaders };
    url = target;
  }
}
export class ModelConnectionError extends Error {}
export interface TransportOptions {
  fetch?: typeof fetch; env?: NodeJS.ProcessEnv; random?: () => number;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}
export class ModelRuntime {
  private readonly cookies = new ModelCookies();
  constructor(readonly profile: ResolvedProfile, private readonly transport: TransportOptions = {}) {
    if (!['chat', 'messages', 'responses'].includes(profile.adapter)) throw new Error(`unknown model adapter '${profile.adapter}'`);
  }
  async complete(body: CanonicalBody, signal?: AbortSignal): Promise<ModelResponse> {
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
    const merged = mergeJsonMappings(translated, profile.request_options);
    const payload = jsonText(merged, { ensureAscii: profile.adapter === 'messages', compact: profile.adapter !== 'messages', allowNan: profile.adapter === 'messages', sdkDatetime: profile.adapter !== 'messages' });
    let response: Response, responseBytes: Buffer;
    try {
      ({ response, bytes: responseBytes } = await modelRequest(profile.adapter, this.transport.fetch ?? fetch, endpoint, headers, payload, profile.http_timeout_sec, signal, profile.adapter === 'messages' ? undefined : this.cookies));
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw new ModelConnectionError(error instanceof Error ? error.message : String(error), { cause: error });
    }
    if (!response.ok) {
      const detail = profile.adapter === 'messages' ? responseBytes.subarray(0, 600).toString('utf8') : statusResponseText(responseBytes, response.headers.get('content-type'));
      let retryText = detail;
      if (profile.adapter !== 'messages') {
        // The Python SDK builds its status error from decoded JSON, while the
        // original Messages transport raises directly from truncated text.
        try { retryText = JSON.stringify(parsePythonJson(stripText(detail))); } catch { /* Plain HTTP error body. */ }
      }
      throw new ModelHttpError(response.status, `${response.status} ${detail}`, retryText);
    }
    const raw = parsePythonJsonBytes(responseBytes);
    if (profile.adapter === 'chat') return adaptChat(raw, body.max_output_tokens, profile.replay_reasoning);
    if (profile.adapter === 'messages') return adaptMessages(raw);
    return { id: raw.id || '', output: raw.output || [], replay_items: [], raw, status: raw.status,
      incomplete_details: raw.incomplete_details ?? null,
      usage: inheritJsonProvenance({ ...raw.usage, input_tokens: tokenCount(raw.usage?.input_tokens, raw.usage, 'input_tokens'), output_tokens: tokenCount(raw.usage?.output_tokens, raw.usage, 'output_tokens'), input_tokens_details: inheritJsonProvenance({ ...raw.usage?.input_tokens_details, cached_tokens: raw.usage?.input_tokens_details?.cached_tokens == null ? null : tokenCount(raw.usage.input_tokens_details.cached_tokens, raw.usage.input_tokens_details, 'cached_tokens') }, raw.usage?.input_tokens_details ?? {}) }, raw.usage ?? {}) };
  }
  async respondCanonical(instructions: string, history: Item[], tools: Item[], options: { effort?: string; signal?: AbortSignal } = {}): Promise<ModelResponse> {
    const body: CanonicalBody = { model: this.profile.model, instructions, input: history, tools, store: false, max_output_tokens: this.profile.max_output_tokens, reasoning: { effort: pythonBool(options.effort) ? options.effort! : this.profile.reasoning_effort } };
    let last: unknown;
    for (const wait of [0, ...LADDER]) {
      options.signal?.throwIfAborted();
      if (wait) {
        const milliseconds = wait * (0.7 + 0.6 * (this.transport.random ?? Math.random)()) * 1000;
        if (this.transport.wait) await this.transport.wait(milliseconds, options.signal);
        else await delay(milliseconds, undefined, options.signal ? { signal: options.signal } : {});
      }
      options.signal?.throwIfAborted();
      try { return await this.complete(body, options.signal); }
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
  async respond(messages: ChatMessage[], tools: ToolDefinition[] = [], signal?: AbortSignal): Promise<AssistantTurn> {
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
    const response = await this.respondCanonical(instructions, history, tools.map(tool => ({ type: tool.type, ...tool.function })), signal ? { signal } : {});
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
export function workflowModels(config = loadConfig(), requested?: string, uniform = false, transport: TransportOptions = {}, overrides: PlannerOverrides = {}) {
  let planner: ModelRuntime | undefined;
  let builders: Record<string, ModelRuntime> | undefined;
  const models = {
    get planner(): ModelRuntime {
      if (!planner) {
        const effort = overrides.effort || requiredConfigValue(requiredConfigValue(config, 'planner'), 'reasoning_effort');
        const wire = overrides.wire || (overrides.model && /claude|sonnet|opus|haiku/i.test(overrides.model) ? 'messages' : undefined);
        const model = mergeJsonMappings(configValue(config, 'model') ?? {}, {
          ...(overrides.model ? { name: overrides.model } : {}), ...(wire ? { wire_api: wire } : {}),
          ...(overrides.baseUrl ? { base_url: overrides.baseUrl } : {}), ...(overrides.keyEnv ? { api_key_env: overrides.keyEnv } : {}),
        });
        const profile = defaultModelProfile(mergeJsonMappings(config, { model }));
        profile.reasoning_effort = pythonBool(effort) ? effort : profile.reasoning_effort;
        planner = new ModelRuntime(profile, transport);
      }
      return planner;
    },
    get director(): ModelRuntime { return models.planner; },
    get builders(): Record<string, ModelRuntime> {
      if (!builders) {
        const profiles = workflowProfiles(config, resolveBuilderProfile(config, requested, transport.env), uniform, transport.env);
        const cache = new Map<ResolvedProfile, ModelRuntime>();
        builders = Object.fromEntries(Object.entries(profiles).map(([workflow, profile]) => {
          if (!cache.has(profile)) cache.set(profile, new ModelRuntime(profile, transport));
          return [workflow, cache.get(profile)!];
        }));
      }
      return builders;
    },
  };
  return models;
}
