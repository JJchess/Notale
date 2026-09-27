/** Model profile resolution from resources/config.yaml. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { PAGE_SKILLS, RESOURCES } from '../../core/guidance.js';

const common = {
  api_key_env: z.string(), reasoning_effort: z.string(), vision_input: z.boolean(),
  http_timeout_sec: z.number().int().optional(), max_output_tokens: z.number().int().optional(),
  replay_reasoning: z.boolean().optional(), request_options: z.record(z.string(), z.unknown()).optional(),
};
const ModelSection = z.object({
  ...common, name: z.string(), base_url: z.string(), adapter: z.string().optional(), wire_api: z.string().optional(),
  reasoning_effort: z.string().optional(), vision_input: z.boolean().optional(),
});
const BuilderProfile = z.object({
  ...common, model: z.string(), base_url: z.string().optional(), base_url_env: z.string().optional(),
  adapter: z.string().toLowerCase().pipe(z.enum(['responses', 'chat', 'messages'])),
});
const Config = z.object({
  model: ModelSection,
  planner: z.object({ reasoning_effort: z.string() }),
  media: z.object({ image_search_backend: z.string().optional() }).optional(),
  builder: z.object({
    default_profile: z.string().optional(),
    skill_profiles: z.record(z.string(), z.string()).optional(),
    workflow_profiles: z.undefined({ error: 'builder.workflow_profiles 已改名为 builder.skill_profiles' }).optional(),
    profiles: z.record(z.string(), BuilderProfile).default({}),
  }).optional(),
});
export type ModelConfig = z.infer<typeof Config>;

export interface ResolvedProfile {
  id: string; model: string; base_url: string; api_key_env: string; adapter: string;
  reasoning_effort: string; vision_input: boolean; http_timeout_sec: number;
  max_output_tokens: number; request_options: Record<string, unknown>; replay_reasoning: boolean;
}

export function loadConfig(file = path.join(RESOURCES, 'config.yaml')): ModelConfig {
  return Config.parse(YAML.parse(readFileSync(file, 'utf8')));
}

export function resolveBuilderProfile(cfg: ModelConfig, requested?: string, env: NodeJS.ProcessEnv = process.env): ResolvedProfile {
  const profiles = cfg.builder?.profiles ?? {};
  const id = requested || cfg.builder?.default_profile;
  if (!id || !Object.hasOwn(profiles, id)) throw new Error(`unknown builder profile '${id ?? ''}'; choices: ${Object.keys(profiles).sort().join(', ') || '(none)'}`);
  const raw = profiles[id]!;
  const base_url = (raw.base_url_env ? env[raw.base_url_env] : '') || raw.base_url;
  if (!base_url) throw new Error(`builder profile '${id}' has no base_url`);
  return {
    id, model: raw.model, base_url, api_key_env: raw.api_key_env, adapter: raw.adapter,
    reasoning_effort: raw.reasoning_effort, vision_input: raw.vision_input,
    http_timeout_sec: raw.http_timeout_sec || cfg.model.http_timeout_sec || 900,
    max_output_tokens: raw.max_output_tokens || cfg.model.max_output_tokens || 128000,
    request_options: { ...raw.request_options }, replay_reasoning: raw.replay_reasoning ?? raw.adapter === 'chat',
  };
}

export function defaultModelProfile(cfg: ModelConfig = loadConfig()): ResolvedProfile {
  const raw = cfg.model;
  const adapter = (raw.adapter || raw.wire_api || 'responses').toLowerCase();
  return {
    id: 'default', model: raw.name, base_url: raw.base_url, api_key_env: raw.api_key_env, adapter,
    reasoning_effort: raw.reasoning_effort || 'medium', vision_input: raw.vision_input ?? true,
    http_timeout_sec: raw.http_timeout_sec || 900, max_output_tokens: raw.max_output_tokens || 128000,
    request_options: { ...raw.request_options }, replay_reasoning: raw.replay_reasoning ?? adapter === 'chat',
  };
}

export function skillProfiles(cfg: ModelConfig, defaultProfile: ResolvedProfile, env: NodeJS.ProcessEnv = process.env): Record<string, ResolvedProfile> {
  const overrides = cfg.builder?.skill_profiles ?? {};
  const unknown = Object.keys(overrides).filter(key => !(PAGE_SKILLS as readonly string[]).includes(key)).sort();
  if (unknown.length) throw new Error(`skill_profiles names unknown skills: [${unknown.map(key => `'${key}'`).join(', ')}]`);
  const cache = new Map([[defaultProfile.id, defaultProfile]]);
  return Object.fromEntries(PAGE_SKILLS.map(name => {
    const id = overrides[name] ?? defaultProfile.id;
    if (!cache.has(id)) cache.set(id, resolveBuilderProfile(cfg, id, env));
    return [name, cache.get(id)!];
  }));
}
