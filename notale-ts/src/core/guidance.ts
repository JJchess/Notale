/** Deterministic guidance assembly. No model calls. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { decodeText } from './text.js';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const RESOURCES = fileURLToPath(new URL('../../resources/', import.meta.url));
export const SKILLS = path.join(RESOURCES, 'skills');
export const PROMPTS = path.join(RESOURCES, 'prompts');
export const PAGE_SKILLS = ['build-cover', 'build-page', 'build-interaction', 'build-code'] as const;
export const FONT_SCALE = { h1: 40, h2: 30, lead: 26, body: 24, sec: 24, label: 20, tick: 18 } as const;
export const FONT_FLOOR = `按 1600×900 逻辑画布：普通页标题默认 ${FONT_SCALE.h1}px（主题可选 36–44px）；正文与成句说明 ≥${FONT_SCALE.body}px，控件标签、图例、图注和提示 ≥${FONT_SCALE.label}px，纯数字刻度 ≥${FONT_SCALE.tick}px，多行文字行高 ≥1.35。数学上下标按相对比例；模板固定文字、原始图片与独立代码工作台不套此字号要求。不得缩放整个内容组绕过阅读尺度。`;
const read = (file: string, strict = false) => decodeText(readFileSync(file), strict);

export function available(root = SKILLS): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(name => existsSync(path.join(root, name, 'SKILL.md'))).sort();
}

export function pageSkillDescriptions(root = SKILLS): string {
  return PAGE_SKILLS.map(name => {
    const file = path.join(root, name, 'SKILL.md');
    const header = read(file, true).match(/^---\n(.*?)\n---(?:\n|$)/s);
    if (!header) throw new Error(`missing skill frontmatter: ${file}`);
    const { name: displayName, description } = YAML.parse(header[1]!);
    return `- ${displayName}: ${description.trim()}`;
  }).join('\n');
}

function auxSampleCatalog(name: string, root: string): string {
  const skill = path.join(root, name);
  const file = path.join(skill, 'samples/catalog.json');
  if (!existsSync(file)) return '';
  const catalog = JSON.parse(read(file, true));
  const categories = new Map<string, string[]>();
  for (const sample of catalog.samples ?? []) {
    if (sample.aux === false || !sample.mini || typeof sample.mini !== 'object' || Array.isArray(sample.mini)) continue;
    const file = path.resolve(skill, 'samples/bundles', sample.category, `${sample.id}.mini.md`);
    if (!existsSync(file)) throw new Error(`registered auxiliary sample is missing: ${file}`);
    if (!categories.has(sample.category)) categories.set(sample.category, []);
    categories.get(sample.category)!.push(sample.id);
  }
  if (!categories.size) return '';
  return [
    `<aux_sample_catalog skill="${name}">`,
    'Auxiliary mode is enabled for this run. In the same first response, after choosing Main, read zero to three ids below from the selected category. Never choose the Main sample\'s id again.',
    'Path: `samples/bundles/<category>/<id>.mini.md`',
    ...[...categories.keys()].sort().map(category => `- ${category}: ${categories.get(category)!.join(', ')}`),
    '</aux_sample_catalog>',
  ].join('\n');
}

function sampleReadPolicy(name: string, samples: string, aux: boolean): string {
  return [
    '<sample_read_policy>',
    samples === 'none'
      ? 'In the same first response, Read exactly one reference for the selected category. This run supplies no worked sample; do not look for one.'
      : 'In the same first response, choose Main by the transferable pattern, not topic similarity; issue parallel Read calls for exactly one reference and one Main from that category. '
        + (aux ? 'Follow the appended <aux_sample_catalog> for additional samples.' : 'Do not read any other sample.'),
    ...(name === 'build-interaction' ? ['The 3d category has no approved sample; read only its reference.'] : []),
    '</sample_read_policy>',
  ].join('\n');
}

export function routedSkill(name: string, root = SKILLS, options: { includeAux?: boolean; samples?: string; template?: boolean } = {}): string {
  const samples = options.samples ?? 'mini';
  if (!(PAGE_SKILLS as readonly string[]).includes(name)) throw new Error(`unknown page skill ${name}`);
  if (!['mini', 'none'].includes(samples)) throw new Error(`unknown sample mode ${samples}`);
  const includeAux = options.includeAux ?? samples !== 'none';
  if (includeAux && samples === 'none') throw new Error('--aux-samples 需要一个 Main,不能配 samples=none');
  const file = path.join(root, name, 'SKILL.md');
  if (!existsSync(file)) throw new Error(`page skill is not installed: ${file}`);
  let body = read(file).trim();
  if (name === 'build-code') return `<page_skill name="build-code">\n${body.replace(/^---\n.*?\n---\s*/s, '')}\n</page_skill>`;
  if (options.template && name !== 'build-interaction') {
    const sections = [...body.matchAll(/<!--teaching:start-->\s*([\s\S]*?)\s*<!--teaching:end-->/g)];
    if (sections.length !== 1 || !sections[0]![1]!.trim()) throw new Error(`${file} needs exactly one teaching section`);
    return `<page_skill name="${name}">\n${sections[0]![1]}\n</page_skill>`;
  }
  body = body.replace(/<!--teaching:(?:start|end)-->\n?/g, '').replace(/^---\n.*?\n---\s*/s, '');
  if (samples === 'none') {
    const start = body.indexOf('## Samples');
    if (start < 0) throw new Error(`${file} has no '## Samples' section`);
    body = body.slice(0, start).trimEnd();
  }
  const aux = includeAux ? auxSampleCatalog(name, root) : '';
  body = body.replaceAll('<skill-dir>/', '').replaceAll('<skill-dir>', path.resolve(root, name));
  return `<page_skill name="${name}">\n${body}\n</page_skill>\n\n${sampleReadPolicy(name, samples, Boolean(aux))}`
    + (aux ? `\n\n${aux}` : '');
}

export function philosophyBlock(scope: string, root = PROMPTS): string {
  if (!['deck', 'page'].includes(scope)) throw new Error(`unknown philosophy scope ${scope}`);
  const file = path.join(root, 'philosophy.md');
  const blocks = read(file).match(new RegExp(`<([a-z-]+) scope="${scope}">\\n.*?\\n</[a-z-]+>`, 'gs')) ?? [];
  if (!blocks.length) throw new Error(`${file} 里没有 scope="${scope}" 的块`);
  return `<design_philosophy>\n${blocks.join('\n\n')}\n</design_philosophy>`;
}

export function directionBlock(root = PROMPTS): string {
  return `<direction src="direction.md">\n${read(path.join(root, 'direction.md'), true).trim()}\n</direction>`;
}
function sourceBlock(root: string, sources: [string, string][]): string {
  return sources.map(([tag, name]) => {
    const file = path.join(root, name);
    if (!existsSync(file)) throw new Error(`guidance source is missing: ${file}`);
    return `<${tag}>\n${read(file).trim()}\n</${tag}>`;
  }).join('\n\n');
}
export function antiSlopBlock(root = SKILLS, includeVisual = true): string {
  const copy = sourceBlock(root, [['anti_ai_slop_copy', 'scrub-copy-slop.md']]);
  return copy + (includeVisual ? '\n\n' + visualSlopBlock(root) : '');
}
export function visualSlopBlock(root = SKILLS): string {
  return sourceBlock(root, [['anti_ai_slop_visual', 'scrub-visual-slop.md']]);
}
export function themeSlopBlock(root = SKILLS): string {
  return sourceBlock(root, [['anti_ai_slop_theme', 'scrub-theme-slop.md']]);
}

/** Literal substitution; missing slots only warn. */
export function fill(text: string, values: Record<string, string | number>, where = '?', warn = console.warn): string {
  const missing = [...new Set(text.match(/\{[a-z_][a-z0-9_]*\}/g) ?? [])].filter(slot => !(slot.slice(1, -1) in values)).sort();
  for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{${key}}`, String(value));
  if (missing.length) warn(`      ⚠ 提示词 ${where} 里有 ${missing.join(' ')},调用处没传这几个键 —— 它们会原样进模型的输入,再原样出现在产物里。`);
  return text;
}
