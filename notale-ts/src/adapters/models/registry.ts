import { loadConfig, resolveBuilderProfile, type ModelConfig } from './profiles.js';
import { modelRefSchema, type ModelRef } from './selection.js';
import { createConfiguredFixModel } from '../../fix/istar.js';
import type { Api, Model, SimpleStreamOptions } from '../../fix/pi/index.js';

/** A server-owned allowlist. Catalog entries identify models, never credentials or URLs.
 * Each resolution returns a fresh configuration for one turn; concurrent turns share no overrides. */
export class ModelRegistry {
  constructor(private readonly config: ModelConfig = loadConfig(), readonly env: NodeJS.ProcessEnv = process.env) {}

  catalog() {
    return {
      defaultModel: this.config.model_selection?.default,
      providers: Object.entries(this.config.model_selection?.providers ?? {}).map(([id, provider]) => ({
        id, label: provider.label,
        models: Object.entries(provider.models).map(([modelId, entry]) => {
          const profile = resolveBuilderProfile(this.config, entry.profile, this.env);
          return { id: modelId, label: entry.label, configured: !!this.env[profile.api_key_env]?.trim() };
        }),
      })),
    };
  }

  resolve(value?: unknown) {
    const parsed = modelRefSchema.safeParse(value === undefined ? this.config.model_selection?.default : value);
    const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
    if (!parsed.success) return fail('请选择有效的模型。');
    const ref: ModelRef = parsed.data;
    const entry = this.config.model_selection?.providers[ref.providerId]?.models[ref.modelId];
    if (!entry) return fail('此模型不在服务端允许的列表中，请重新选择。');
    const profile = resolveBuilderProfile(this.config, entry.profile, this.env);
    if (profile.model !== ref.modelId) return fail('服务端模型配置不一致。', 503);
    if (!this.env[profile.api_key_env]?.trim()) return fail('此模型尚未配置服务端凭据，请选择其他模型。', 503);
    if (!['chat', 'responses'].includes(profile.adapter)) return fail('此模型尚未适配完整讲义流程。', 503);
    const config = structuredClone(this.config);
    config.model = { ...profile, name: profile.model, wire_api: profile.adapter };
    config.planner = { reasoning_effort: profile.reasoning_effort };
    config.builder = { ...config.builder!, default_profile: entry.profile, skill_profiles: undefined };
    return { ref, profile, config };
  }

  agent(value?: unknown) {
    const selected = this.resolve(value), { profile, ref } = selected;
    const google = ref.providerId === 'google';
    const model: Model<Api> = {
      id: ref.modelId, name: ref.modelId, provider: ref.providerId,
      api: google ? 'google-generative-ai' : profile.adapter === 'responses' ? 'openai-responses' : 'openai-completions',
      baseUrl: google ? profile.base_url.replace(/\/$/, '').replace(/\/openai$/, '') : profile.base_url,
      reasoning: true, input: google ? ['text', 'image', 'pdf', 'video'] : ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: google ? 1_048_576 : 128_000, maxTokens: Math.min(profile.max_output_tokens, google ? 65_536 : 128_000),
    };
    return createConfiguredFixModel({ model, apiKey: this.env[profile.api_key_env]!, vision: profile.vision_input,
      reasoning: profile.reasoning_effort as SimpleStreamOptions['reasoning'],
      timeoutMs: Math.min(profile.http_timeout_sec, 300) * 1000, requestOptions: profile.request_options });
  }
}
