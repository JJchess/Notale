/** Explicit OpenAI Responses/Chat wire adapter. No provider or credential discovery.
 * Kept identical in the generator and editor's local agent forks. */
import { AssistantMessageEventStream } from './event-stream.js';
import type { Api, AssistantMessage, Context, Model, SimpleStreamOptions, ToolCall } from './types.js';

type Row = Record<string, any>;
function inputParts(content: Exclude<Context['messages'][number]['content'], string>, responses: boolean): Row[] {
  return content.flatMap((part): Row[] => {
    if (part.type === 'text') return [{ type: responses ? 'input_text' : 'text', text: part.text }];
    if (part.type === 'image') {
      const url = `data:${part.mimeType};base64,${part.data}`;
      return [responses ? { type: 'input_image', image_url: url } : { type: 'image_url', image_url: { url } }];
    }
    if (part.type === 'file') throw new Error('This model requires files to be converted to text or images before inference');
    return [];
  });
}
export function openAIHttpBody(model: Model<Api>, context: Context, options: SimpleStreamOptions = {}): Row {
  const responses = model.api === 'openai-responses', input: Row[] = [], toolImages: Row[] = [];
  const flushToolImages = () => { if (toolImages.length) input.push({ role: 'user', content: toolImages.splice(0) }); };
  if (!responses && context.systemPrompt) input.push({ role: 'system', content: context.systemPrompt });
  for (const message of context.messages) {
    if (message.role !== 'toolResult') flushToolImages();
    if (message.role === 'assistant') {
      if (responses && message.api === model.api && message.provider === model.provider && message.model === model.id && message.providerReplay) {
        input.push(...message.providerReplay); continue;
      }
      const text = message.content.filter(p => p.type === 'text').map(p => p.text).join('');
      const calls = message.content.filter((p): p is ToolCall => p.type === 'toolCall');
      if (responses) {
        if (text) input.push({ role: 'assistant', content: [{ type: 'output_text', text }] });
        for (const call of calls) input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) });
      } else if (text || calls.length) input.push({ role: 'assistant', content: text || null,
        ...(calls.length ? { tool_calls: calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}) });
    } else if (message.role === 'toolResult') {
      const parts = inputParts(message.content, responses);
      if (responses) input.push({ type: 'function_call_output', call_id: message.toolCallId, output: parts.length ? parts : '(empty result)' });
      else {
        input.push({ role: 'tool', tool_call_id: message.toolCallId, content: message.content.filter(p => p.type === 'text').map(p => p.text).join('\n') || '(see attached images)' });
        const images = parts.filter(p => p.type === 'image_url');
        toolImages.push(...images);
      }
    } else input.push({ role: 'user', content: typeof message.content === 'string' ? message.content : inputParts(message.content, responses) });
  }
  flushToolImages();
  const tools = context.tools?.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters, strict: false })) ?? [];
  return responses
    ? { model: model.id, instructions: context.systemPrompt ?? '', input, tools, stream: true, store: false,
        include: ['reasoning.encrypted_content'], max_output_tokens: options.maxTokens ?? model.maxTokens,
        ...(model.reasoning && options.reasoning ? { reasoning: { effort: options.reasoning } } : {}) }
    : { model: model.id, messages: input, ...(tools.length ? { tools: tools.map(({ type, ...fn }) => ({ type, function: fn })) } : {}),
        stream: true, stream_options: { include_usage: true }, max_tokens: options.maxTokens ?? model.maxTokens,
        ...(model.reasoning && options.reasoning ? { reasoning_effort: options.reasoning } : {}) };
}
function completeMessage(message: AssistantMessage, raw: Row, responses: boolean) {
  message.responseId = raw.id;
  const usage = raw.usage ?? {}, cached = Number(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0);
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0), output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  message.usage = { ...message.usage, input: Math.max(0, input - cached), output, cacheRead: cached, totalTokens: input + output,
    reasoning: Number(usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0) };
  message.content = [];
  if (responses) {
    if (!['completed', 'incomplete'].includes(raw.status)) throw new Error(raw.error?.message || 'Model response did not complete');
    message.providerReplay = raw.output ?? [];
    for (const item of raw.output ?? []) {
      if (item.type === 'message') for (const part of item.content ?? []) {
        if (part.type === 'output_text') message.content.push({ type: 'text', text: part.text });
        if (part.type === 'refusal') message.content.push({ type: 'text', text: part.refusal });
      }
      if (item.type === 'function_call') message.content.push({ type: 'toolCall', id: item.call_id, name: item.name, arguments: JSON.parse(item.arguments || '{}') });
      if (item.type === 'reasoning') for (const summary of item.summary ?? []) if (summary.text) message.content.push({ type: 'thinking', thinking: summary.text });
    }
    if (raw.status === 'incomplete' && raw.incomplete_details?.reason !== 'max_output_tokens') throw new Error('Model response is incomplete');
    message.stopReason = raw.status === 'incomplete' ? 'length' : message.content.some(p => p.type === 'toolCall') ? 'toolUse' : 'stop';
  } else {
    const choice = raw.choices?.[0];
    if (!choice?.finish_reason) throw new Error('Model stream ended without a finish reason');
    if (choice.message?.content) message.content.push({ type: 'text', text: choice.message.content });
    for (const call of choice.message?.tool_calls ?? []) message.content.push({ type: 'toolCall', id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments || '{}') });
    message.stopReason = choice.finish_reason === 'length' ? 'length' : choice.finish_reason === 'content_filter' ? 'error' : message.content.some(p => p.type === 'toolCall') ? 'toolUse' : 'stop';
    if (message.stopReason === 'error') throw new Error('Model response was filtered');
  }
}
export function streamOpenAIHttp(model: Model<Api>, context: Context, options: SimpleStreamOptions = {}): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  const message: AssistantMessage = { role: 'assistant', content: [], api: model.api, provider: model.provider, model: model.id,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'pending', timestamp: Date.now() };
  void (async () => {
    const idle = new AbortController(), signal = options.signal ? AbortSignal.any([options.signal, idle.signal]) : idle.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const touch = () => { clearTimeout(timer); if (options.timeoutMs) { timer = setTimeout(() => idle.abort(new Error('Model stream idle timeout')), options.timeoutMs); timer.unref(); } };
    try {
      if (!['openai-responses', 'openai-completions'].includes(model.api)) throw new Error(`Unsupported model API: ${model.api}`);
      if (!options.apiKey) throw new Error('Model credential is required');
      signal.throwIfAborted();
      const responses = model.api === 'openai-responses', body = openAIHttpBody(model, context, options);
      const payload = await options.onPayload?.(body, model) ?? body;
      const base = model.baseUrl.replace(/\/$/, '');
      touch();
      const response = await fetch(base + (responses ? '/responses' : '/chat/completions'), {
        method: 'POST', headers: { ...model.headers, ...options.headers, authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal, redirect: 'error',
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Model HTTP ${response.status}`); }
      stream.push({ type: 'start', partial: message });
      let final: Row | undefined;
      if (!response.headers.get('content-type')?.includes('text/event-stream')) final = await response.json() as Row;
      else {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Model response has no body');
        const decoder = new TextDecoder(); let buffer = '';
        const chat: Row = { choices: [{ message: { content: '', tool_calls: [] } }] };
        let previewIndex: number | undefined;
        const delta = (text: string) => {
          if (!text) return;
          if (previewIndex === undefined) { previewIndex = message.content.length; message.content.push({ type: 'text', text: '' }); stream.push({ type: 'text_start', contentIndex: previewIndex, partial: message }); }
          const block = message.content[previewIndex]; if (block?.type === 'text') block.text += text;
          stream.push({ type: 'text_delta', contentIndex: previewIndex, delta: text, partial: message });
        };
        const event = (data: string) => {
          if (!data || data === '[DONE]') return;
          const row = JSON.parse(data);
          if (row.error || row.type === 'error' || row.type === 'response.failed') throw new Error(row.error?.message || row.response?.error?.message || 'Model stream failed');
          if (responses) {
            if (row.type === 'response.output_text.delta') delta(row.delta);
            if (row.type === 'response.completed' || row.type === 'response.incomplete') final = row.response;
          } else {
            if (row.id) chat.id = row.id;
            if (row.usage) chat.usage = row.usage;
            const choice = row.choices?.[0]; if (!choice) return;
            if (choice.finish_reason) chat.choices[0].finish_reason = choice.finish_reason;
            const change = choice.delta ?? {};
            if (change.content) { chat.choices[0].message.content += change.content; delta(change.content); }
            for (const call of change.tool_calls ?? []) {
              const index = call.index ?? 0;
              const target = chat.choices[0].message.tool_calls[index] ??= { id: '', function: { name: '', arguments: '' } };
              if (call.id) target.id = call.id;
              if (call.function?.name) target.function.name += call.function.name;
              if (call.function?.arguments) target.function.arguments += call.function.arguments;
            }
          }
        };
        try {
          for (;;) {
            const next = await reader.read(); touch();
            buffer = (buffer + decoder.decode(next.value, { stream: !next.done })).replace(/\r\n/g, '\n');
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
              event(frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'));
            }
            if (next.done) break;
          }
        } finally { await reader.cancel(); }
        if (previewIndex !== undefined) {
          const block = message.content[previewIndex];
          if (block?.type === 'text') stream.push({ type: 'text_end', contentIndex: previewIndex, content: block.text, partial: message });
        }
        if (!responses) final = chat;
      }
      signal.throwIfAborted();
      if (!final) throw new Error('Model stream ended without a completed response');
      completeMessage(message, final, responses);
      for (const [index, block] of message.content.entries()) if (block.type === 'toolCall') stream.push({ type: 'toolcall_end', contentIndex: index, toolCall: block, partial: message });
      stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'length' | 'toolUse', message }); stream.end();
    } catch (error) {
      message.stopReason = options.signal?.aborted ? 'aborted' : 'error';
      message.errorMessage = (error instanceof Error ? error.message : String(error)).split(options.apiKey || '\0').join('[redacted]');
      stream.push({ type: 'error', reason: message.stopReason, error: message }); stream.end();
    } finally { clearTimeout(timer); }
  })();
  return stream;
}
