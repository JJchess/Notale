import { DomainError } from '../domain/model.js';
/** The editor reaches a model service itself rather than through the generation harness.
 * Address, model and credential are host configuration; the editor only knows the shape. */
export interface AiRequest {
  system: string;
  user: string;
}
export interface AiProvider {
  /** False when no credential is configured; the route then refuses with `reason`. */
  readonly available: boolean;
  readonly reason: string;
  readonly model: string;
  complete(request: AiRequest, signal?: AbortSignal): Promise<string>;
}
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_KEY_ENV = 'GEMINI_API_KEY';
export function createAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  // A canned reply makes the whole candidate pipeline testable without a network call.
  const stub = env.EDITOR_AI_STUB;
  const model = env.EDITOR_AI_MODEL || DEFAULT_MODEL;
  if (stub) {
    // Either one canned reply, or a {keyword: reply} map so one server can answer several
    // deterministic scenarios; the keyword is matched against the prompt.
    let replies: Record<string, string> | undefined;
    try {
      const parsed: unknown = JSON.parse(stub);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.values(parsed).every(value => typeof value === 'string'))
        replies = parsed as Record<string, string>;
    } catch {}
    return {
      available: true, reason: '', model: 'stub',
      async complete(request) {
        if (!replies) return stub;
        const hit = Object.entries(replies).find(([keyword]) => request.user.includes(keyword));
        if (!hit) throw new DomainError('AI_BAD_OUTPUT', `stub 没有匹配的回复：${Object.keys(replies).join(', ')}`, 422);
        return hit[1];
      },
    };
  }
  const keyEnv = env.EDITOR_AI_API_KEY_ENV || DEFAULT_KEY_ENV;
  const key = env[keyEnv];
  const base = (env.EDITOR_AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const timeout = Number(env.EDITOR_AI_TIMEOUT_MS || 60_000);
  if (!key)
    return {
      available: false,
      reason: `未配置模型服务：设置环境变量 ${keyEnv} 后可用`,
      model,
      async complete() {
        throw new DomainError('AI_UNCONFIGURED', `未配置模型服务：设置环境变量 ${keyEnv} 后可用`, 503);
      },
    };
  return {
    available: true,
    reason: '',
    model,
    async complete(request, signal) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);
      signal?.addEventListener('abort', () => abort.abort(), { once: true });
      try {
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          signal: abort.signal,
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
          }),
        });
        if (!response.ok)
          throw new DomainError(
            'AI_UPSTREAM',
            `模型服务返回 ${response.status}：${(await response.text()).slice(0, 400)}`,
            502,
          );
        const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const text = body.choices?.[0]?.message?.content;
        if (!text) throw new DomainError('AI_EMPTY', '模型没有返回内容', 502);
        return text;
      } catch (cause) {
        if (cause instanceof DomainError) throw cause;
        if (abort.signal.aborted) throw new DomainError('AI_TIMEOUT', '模型服务超时', 504);
        throw new DomainError('AI_UPSTREAM', `无法连接模型服务：${String(cause)}`, 502);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
