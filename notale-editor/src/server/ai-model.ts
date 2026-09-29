import { readFileSync } from 'node:fs';
import { streamGoogle, streamOpenAICompletions, type Api, type Model, type OpenAICompletionsCompat, type StreamFn, type SimpleStreamOptions } from './agent/pi/index.js';
import { DomainError } from '../domain/model.js';
import { streamOpenAIHttp } from './agent/pi/ai/openai-http.js';
/** The editor reaches model services through the forked pi providers (agent/pi/ai/google.ts and
 * openai-completions.ts). Which services exist, where they live and which key they read is host
 * configuration, in the shape of pi's models.json. */
export interface AiRuntime {
  /** False when no credential is configured; the route then refuses with `reason`. */
  readonly available: boolean;
  readonly reason: string;
  readonly model: Model<Api>;
  readonly streamFn: StreamFn;
  /** Whether page screenshots may be attached. Off for text-only models. */
  readonly vision: boolean;
  readonly getApiKey?: () => string | undefined;
}
const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_KEY_ENV = 'GEMINI_API_KEY';
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
/** Published limits for 3.8 Flash; EDITOR_AI_CONTEXT_WINDOW overrides the window for another model. */
function googleModel(id: string, baseUrl: string, env: NodeJS.ProcessEnv, contextWindow?: number): Model<Api> {
  return {
    id, name: id, api: 'google-generative-ai', provider: 'google', baseUrl,
    // Gemini reads PDFs and video natively (Files API for video); see agent/pi/ai/gemini-files.ts.
    reasoning: true, input: ['text', 'image', 'pdf', 'video'], cost,
    contextWindow: contextWindow ?? Number(env.EDITOR_AI_CONTEXT_WINDOW || 1_048_576), maxTokens: 65_536,
  } as Model<Api>;
}
/** pi's httpIdleTimeoutMs / Codex's stream_idle_timeout_ms: 5 minutes without data, then retry. */
const idleTimeout = (env: NodeJS.ProcessEnv) => Number(env.EDITOR_AI_HTTP_IDLE_TIMEOUT_MS ?? 300_000);
export function createConfiguredAiRuntime(options: { model: Model<Api>; apiKey: string; timeoutMs?: number; vision?: boolean; reasoning?: SimpleStreamOptions['reasoning'] }): AiRuntime {
  const { model, apiKey: key } = options;
  if (!key.trim()) throw new DomainError('AI_UNCONFIGURED', 'Model credential is required', 503);
  const stream = model.api === 'openai-completions' ? streamOpenAICompletions : model.api === 'openai-responses' ? streamOpenAIHttp : model.api === 'google-generative-ai' ? streamGoogle : undefined;
  if (!stream) throw new DomainError('AI_MODEL_UNAVAILABLE', `Unsupported model API: ${model.api}`, 503);
  return {
    available: true, reason: '', model,
    vision: options.vision !== false && model.input.includes('image'),
    getApiKey: () => key,
    streamFn: (target, context, streamOptions) => stream(target, context, { ...streamOptions, ...(options.reasoning ? { reasoning: options.reasoning } : {}), apiKey: key, temperature: 0, timeoutMs: options.timeoutMs ?? 300_000 }),
  };
}
function runtimeFor(model: Model<Api>, key: string, env: NodeJS.ProcessEnv): AiRuntime {
  return createConfiguredAiRuntime({ model, apiKey: key, timeoutMs: idleTimeout(env), vision: env.EDITOR_AI_VISION !== 'off' });
}
export function createAiRuntime(env: NodeJS.ProcessEnv = process.env): AiRuntime {
  const id = env.EDITOR_AI_MODEL || DEFAULT_MODEL;
  const keyEnv = env.EDITOR_AI_API_KEY_ENV || DEFAULT_KEY_ENV;
  const key = env[keyEnv];
  const base = (env.EDITOR_AI_BASE_URL || GOOGLE_BASE).replace(/\/$/, '').replace(/\/openai$/, '');
  const model = googleModel(id, base, env);
  if (!key) {
    const reason = `未配置模型服务：设置环境变量 ${keyEnv} 后可用`;
    return { available: false, reason, model, vision: false, streamFn: () => { throw new DomainError('AI_UNCONFIGURED', reason, 503); } };
  }
  return runtimeFor(model, key, env);
}

/** One service in pi's models.json shape. `apiKey` is `$ENV_NAME`; `models`, when given, replaces
 * asking the service what the key can use. */
export interface ProviderConfig {
  name: string;
  api: 'google-generative-ai' | 'openai-completions' | 'openai-responses';
  baseUrl: string;
  apiKey: string;
  compat?: OpenAICompletionsCompat;
  models?: { id: string; name?: string; input?: ('text' | 'image')[]; contextWindow?: number; maxTokens?: number; reasoning?: boolean }[];
  /** Extra query for the model listing (SiliconFlow lists every modality unless asked for chat). */
  listQuery?: string;
  /** A path that checks the key, for services whose model listing is public (OpenRouter). */
  keyCheck?: string;
}
/** The services our two adapters speak to: pi's providers on these APIs (base URL and key name as in
 * pi's providers/*.ts), plus the two gateways this deployment has keys for. */
export function builtInProviders(env: NodeJS.ProcessEnv = process.env): Record<string, ProviderConfig> {
  return {
    google: { name: 'Google', api: 'google-generative-ai', baseUrl: (env.EDITOR_AI_BASE_URL || GOOGLE_BASE).replace(/\/$/, ''), apiKey: '$' + (env.EDITOR_AI_API_KEY_ENV || DEFAULT_KEY_ENV) },
    openai: { name: 'OpenAI', api: 'openai-completions', baseUrl: 'https://api.openai.com/v1', apiKey: '$OPENAI_API_KEY' },
    openrouter: { name: 'OpenRouter', api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '$OPENROUTER_API_KEY', keyCheck: '/key' },
    deepseek: { name: 'DeepSeek', api: 'openai-completions', baseUrl: 'https://api.deepseek.com', apiKey: '$DEEPSEEK_API_KEY' },
    xai: { name: 'xAI', api: 'openai-completions', baseUrl: 'https://api.x.ai/v1', apiKey: '$XAI_API_KEY' },
    moonshotai: { name: 'Moonshot', api: 'openai-completions', baseUrl: 'https://api.moonshot.ai/v1', apiKey: '$MOONSHOT_API_KEY' },
    siliconflow: { name: 'SiliconFlow', api: 'openai-completions', baseUrl: (env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''), apiKey: '$SILICONFLOW_API_KEY', listQuery: '?type=text&sub_type=chat',
      compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: 'max_tokens' } },
    paratera: { name: 'Paratera', api: 'openai-completions', baseUrl: 'https://llmapi.paratera.com/v1', apiKey: '$PARATERA_API_KEY',
      compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: 'max_tokens' } },
  };
}

/** `input`: what the model reads natively; PDFs and video reach other models through read's fallbacks. */
export interface ModelInfo { id: string; name: string; vision: boolean; contextWindow: number; input: ('text' | 'image' | 'pdf' | 'video')[] }
export interface ProviderInfo { provider: string; name: string; available: boolean; reason?: string; models: ModelInfo[] }
type Listed = { models: (Omit<ModelInfo, 'input'> & { maxTokens: number; reasoning: boolean })[] } | { error: string };
/** Ids a chat listing carries that are not chat models. ponytail: a name pattern; a gateway that
 * publishes capabilities (OpenRouter) is filtered by them instead. */
const NOT_CHAT = /embed|tts|whisper|dall-e|image|audio|rerank|moderation|speech|transcri|vision-preview|ocr/i;
const LIST_TTL_MS = 10 * 60_000;

/** The services, the models each key can use, and a runtime for the one a turn asks for. Keys are
 * read from the server's environment; a service without one is listed as unavailable. */
export class ModelRegistry {
  private readonly providers: Record<string, ProviderConfig>;
  private readonly cache = new Map<string, { at: number; listed: Promise<Listed> }>();
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly request: typeof fetch = fetch,
    private readonly configured?: { providers: Record<string, ProviderConfig>; defaultModel?: { provider: string; id: string }; reasoning?: SimpleStreamOptions['reasoning']; timeoutMs?: number }) {
    if (configured) { this.providers = { ...configured.providers }; return; }
    const extra = env.EDITOR_AI_MODELS_JSON ? (JSON.parse(readFileSync(env.EDITOR_AI_MODELS_JSON, 'utf8')) as { providers?: Record<string, ProviderConfig> }).providers : undefined;
    this.providers = { ...builtInProviders(env), ...extra };
  }
  private key(config: ProviderConfig) {
    return config.apiKey.startsWith('$') ? this.env[config.apiKey.replace(/^\$\{?|\}$/g, '')] : config.apiKey;
  }
  private listed(id: string, config: ProviderConfig, key: string): Promise<Listed> {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.listed;
    const listed = this.probe(config, key).catch(cause => ({ error: `探测模型失败：${cause instanceof Error ? cause.message : String(cause)}` }));
    // A failure is asked again next time rather than cached for ten minutes.
    this.cache.set(id, { at: Date.now(), listed });
    void listed.then(result => { if ('error' in result) this.cache.delete(id); });
    return listed;
  }
  /** Asks the service which models this key can use. Judged by the body, not the status line. */
  private async probe(config: ProviderConfig, key: string): Promise<Listed> {
    if (config.models) return { models: config.models.map(m => ({ id: m.id, name: m.name ?? m.id, vision: !!m.input?.includes('image'), contextWindow: m.contextWindow ?? 128_000, maxTokens: m.maxTokens ?? 16_384, reasoning: m.reasoning ?? false })) };
    if (config.keyCheck) {
      const check = await this.request(`${config.baseUrl}${config.keyCheck}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
      if (!check.ok) return { error: `密钥无效：HTTP ${check.status}` };
    }
    const google = config.api === 'google-generative-ai';
    const url = google ? `${config.baseUrl}/models?pageSize=1000&key=${encodeURIComponent(key)}` : `${config.baseUrl}/models${config.listQuery ?? ''}`;
    const response = await this.request(url, { headers: google ? {} : { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
    if (!response.ok || !body) return { error: `探测模型失败：HTTP ${response.status}` };
    if (google) {
      const models = (body.models as { name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[] }[] | undefined) ?? [];
      return { models: models.filter(m => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !NOT_CHAT.test(m.name)).map(m => {
        const id = m.name.replace(/^models\//, '');
        return { id, name: m.displayName ?? id, vision: true, contextWindow: m.inputTokenLimit ?? 1_048_576, maxTokens: m.outputTokenLimit ?? 65_536, reasoning: true };
      }) };
    }
    const data = (body.data as { id: string; name?: string; context_length?: number; architecture?: { input_modalities?: string[] }; supported_parameters?: string[]; top_provider?: { max_completion_tokens?: number | null } }[] | undefined) ?? [];
    if (!Array.isArray(data)) return { error: '探测模型失败：返回里没有模型列表' };
    // OpenRouter says what each model can do; the agent needs tool calls.
    const described = data.some(m => Array.isArray(m.supported_parameters));
    return { models: data.filter(m => described ? m.supported_parameters?.includes('tools') : !NOT_CHAT.test(m.id)).map(m => ({
      id: m.id, name: m.name ?? m.id, vision: !!m.architecture?.input_modalities?.includes('image'),
      contextWindow: m.context_length ?? 128_000, maxTokens: m.top_provider?.max_completion_tokens ?? 16_384,
      reasoning: !!m.supported_parameters?.includes('reasoning'),
    })) };
  }
  async list(): Promise<ProviderInfo[]> {
    return Promise.all(Object.entries(this.providers).map(async ([provider, config]) => {
      const key = this.key(config);
      if (!key) return { provider, name: config.name, available: false, reason: '未配置密钥', models: [] };
      const listed = await this.listed(provider, config, key);
      if ('error' in listed) return { provider, name: config.name, available: false, reason: listed.error, models: [] };
      const input = (vision: boolean): ModelInfo['input'] => config.api === 'google-generative-ai' ? ['text', 'image', 'pdf', 'video'] : vision ? ['text', 'image'] : ['text'];
      return { provider, name: config.name, available: true, models: listed.models.map(({ id, name, vision, contextWindow }) => ({ id, name, vision, contextWindow, input: input(vision) })) };
    }));
  }
  /** The runtime for one turn: the default model, or the one the author picked. */
  async runtime(ref?: { provider: string; id: string }): Promise<AiRuntime> {
    if (!ref && this.configured) {
      invariantModel(this.configured.defaultModel, 'No default model configured');
      ref = this.configured.defaultModel;
    }
    if (!ref) return createAiRuntime(this.env);
    const config = this.providers[ref.provider];
    invariantModel(config, `模型不可用：${ref.provider}/${ref.id}`);
    const key = this.key(config);
    invariantModel(key, `模型不可用：${ref.provider}/${ref.id}`);
    const listed = await this.listed(ref.provider, config, key);
    const found = 'models' in listed ? listed.models.find(m => m.id === ref.id) : undefined;
    invariantModel(found, `模型不可用：${ref.provider}/${ref.id}`);
    const model = config.api === 'google-generative-ai'
      ? googleModel(found.id, config.baseUrl, this.env, found.contextWindow)
      : { id: found.id, name: found.name, api: config.api, provider: ref.provider, baseUrl: config.baseUrl, reasoning: found.reasoning,
          input: found.vision ? ['text', 'image'] : ['text'], cost, contextWindow: found.contextWindow, maxTokens: found.maxTokens, ...(config.compat ? { compat: config.compat } : {}) } as Model<Api>;
    return this.configured ? createConfiguredAiRuntime({ model, apiKey: key, reasoning: this.configured.reasoning, timeoutMs: this.configured.timeoutMs }) : runtimeFor(model, key, this.env);
  }
}
function invariantModel(value: unknown, message: string): asserts value {
  if (!value) throw new DomainError('AI_MODEL_UNAVAILABLE', message, 400);
}
