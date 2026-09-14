import { TEMPLATE_SPEC } from './pptx-template.js';
import type { TemplateSpec } from './template-style.js';
/** Prompt assembly port of core/builder.py; ordering is part of the model contract. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { decodeText, PYTHON_SPACE, stripText } from './text.js';
import * as skills from './guidance.js';
import { planContext } from './planner-contract.js';

const constants = JSON.parse(readFileSync(path.join(skills.RESOURCES, 'builder-instructions.json'), 'utf8'));
const read = (file: string, strict = false) => decodeText(readFileSync(file), strict);
const escape = (value: string, quote = false) => {
  let result = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (quote) result = result.replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  return result;
};
export interface PageEntry { pid: string; label: string; body: string }
export function pageEntries(text: string): PageEntry[] {
  const heading = new RegExp(`(?:^|(?<=\\n))#${PYTHON_SPACE}+(page-(\\p{Nd}+))${PYTHON_SPACE}+\\[(标题页|内容页|交互页|代码页)\\]${PYTHON_SPACE}*(?=\\n|$)`, 'gu');
  const hits = [...text.matchAll(heading)];
  return hits.map((hit, index) => ({ pid: hit[1]!, label: hit[3]!, body: stripText(text.slice(hit.index! + hit[0].length, hits[index + 1]?.index ?? text.length)) }));
}
function xmlPage(page: PageEntry, current = false): string {
  return `  <page id="${escape(page.pid, true)}" label="${escape(page.label, true)}"${current ? ' current="true"' : ''}>${escape(page.body)}</page>`;
}
export function deckOutline(file: string): string {
  return `<deck_outline>\n${pageEntries(read(file)).filter(page => page.label === '标题页').map(page => xmlPage(page)).join('\n')}\n</deck_outline>`;
}
export function chapterPreloads(root: string, total: number): Record<string, string> {
  const groups: PageEntry[][] = [];
  let group: PageEntry[] = [];
  for (let index = 1; index <= total; index++) {
    const number = String(index).padStart(2, '0');
    const pid = `page-${number}`;
    const file = path.join(root, 'pages/plan', `p${number}.md`);
    const entries = pageEntries(read(file));
    if (entries.length !== 1 || entries[0]!.pid !== pid) throw new Error(`${file} 必须且只能包含 ${pid} 的一份规格`);
    const page = entries[0]!;
    if (page.label === '标题页' && group.length) { groups.push(group); group = []; }
    group.push(page);
  }
  if (group.length) groups.push(group);
  const plan = path.join(root, 'pages/plan/pages.md');
  const context = existsSync(plan) ? planContext(read(plan)) : { continuity: [] };
  const result: Record<string, string> = {};
  for (const chapter of groups) for (const current of chapter) {
    const selected = context.continuity.filter(entry => entry.pages.includes(current.pid));
    const continuity = selected.length ? `<continuity>\n${selected.map(entry => `  <item id="${escape(entry.id, true)}">${escape(entry.body)}</item>`).join('\n')}\n</continuity>\n\n` : '';
    result[current.pid] = continuity + `<chapter_context current="${current.pid}">\n${chapter.map(page => xmlPage(page, page.pid === current.pid)).join('\n')}\n</chapter_context>`;
  }
  return result;
}
export function themeInterface(file: string): string {
  const match = read(file).match(/\/\*\s*==== INTERFACE ====(.*?)==== \/INTERFACE ====\s*\*\//s);
  if (!match) throw new Error(`theme interface delimiter is missing: ${file}`);
  return match[0].replace(/^\s*修订\s+[^\n]*\n/gm, '');
}
export function libsIndex(root: string): string {
  const file = path.join(root, 'pages/assets/lib/LIBS.md');
  const text = read(file, true);
  const marker = '## 按「要做的事」查';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`dependency index anchor ${marker} is missing: ${file}`);
  return text.slice(start + marker.length).split('\n## ', 1)[0]!.trim() + '\n\n本页使用上列库时，首轮一并 Read `assets/lib/LIBS.md`；它完整返回版本、调用方式和限制，无需阅读库源码。不用库就不读。';
}
export function techBlock(root: string, total: number, prompts = skills.PROMPTS): string {
  return '<tech>\n' + skills.fill(read(path.join(prompts, 'tech.md'), true), { n_pages: total, font_floor: skills.FONT_FLOOR, libs: libsIndex(root), ...constants.TECH_SLOTS }, 'tech.md').trim() + '\n</tech>';
}
export function sharedPreload(root: string, total: number, prompts = skills.PROMPTS, workflow?: string): string {
  const outline = () => deckOutline(path.join(root, 'pages/plan/pages.md'));
  let content: string;
  if (workflow === 'build-code') content = outline() + '\n\n<tech>\n' + read(path.join(prompts, 'tech-code.md')).trim() + '\n</tech>';
  else {
    const chassis = read(path.join(root, 'pages/assets/CHASSIS.md'), true).trim();
    content = [techBlock(root, total, prompts), `<theme_css>\n${themeInterface(path.join(root, 'pages/assets/theme.css')).trim()}\n</theme_css>`, `<chassis>\n${chassis}\n</chassis>`, outline()].join('\n\n');
  }
  const { audience } = planContext(read(path.join(root, 'pages/plan/pages.md')));
  return (audience ? `<audience>\n${escape(audience)}\n</audience>\n\n` : '') + content;
}
export function environmentContext(pagesDir: string, pid: string, resourceRoot: string): string {
  return `<environment_context>\n  <cwd>${escape(path.resolve(pagesDir), true)}</cwd>\n  <target>${escape(path.resolve(pagesDir, `${pid}.html`), true)}</target>\n  <target_state>absent</target_state>\n  <read_only_skill>${escape(path.resolve(resourceRoot), true)}</read_only_skill>\n  <paths>页面路径相对 cwd；references/ 与 samples/ 相对 read_only_skill。</paths>\n</environment_context>`;
}
export interface InstructionOptions { workflowRoot?: string; prompts?: string; samples?: string; includeAux?: boolean; notes?: string; visualFocus?: boolean }
export function instructionBlocks(root: string, total: number, workflow: string, options: InstructionOptions = {}): Record<string, string> {
  const workflowRoot = options.workflowRoot ?? skills.WORKFLOWS;
  const template = existsSync(path.join(root, TEMPLATE_SPEC)) && workflow !== 'build-code';
  const blocks: Record<string, string> = { identity: constants.IDENTITY, philosophy: skills.philosophyBlock('page', options.prompts), anti_slop: skills.antiSlopBlock(workflowRoot, workflow !== 'build-code') };
  if (workflow !== 'build-code') {
    if (options.visualFocus && !template) blocks.visual_focus = constants.VISUAL_FOCUS_BLOCK;
    const notesMode = options.notes ?? 'cap';
    if (!(constants.NOTES_MODES as string[]).includes(notesMode)) throw new Error(`unknown notes mode ${options.notes}`);
    const notes: string[] = [];
    if (['cap', 'notes'].includes(notesMode)) {
      const limit = constants.TEXT_CAPS[workflow];
      if (limit !== undefined) notes.push(constants.TEXT_CAP_TEMPLATE.replace('{max_chars}', String(limit)));
    }
    if (['notes', 'only'].includes(notesMode)) notes.push(constants.SPEAKER_NOTES_BLOCK);
    if (notes.length) blocks.notes = notes.join('\n\n');
    blocks.steps = workflow === 'build-cover' ? constants.COVER_STEPS_BLOCK : constants.STEPS_BLOCK;
  }
  blocks.shared = sharedPreload(root, total, options.prompts, workflow);
  blocks.workflow = skills.routedWorkflow(workflow, workflowRoot, { ...options, template });
  if (template) {
    blocks.workflow += '\n\n<template_constraints>\n' + read(path.join(options.prompts ?? skills.PROMPTS, 'build-template.md'), true).trim() + '\n</template_constraints>';
    const spec = JSON.parse(read(path.join(root, TEMPLATE_SPEC))) as TemplateSpec;
    const layout = spec.layouts.filter(layout => (layout.workflows as string[]).includes(workflow)).map(({ id, slots }) => ({ id, slots }));
    blocks.shared += '\n\n<template_layouts>\n' + JSON.stringify(layout) + '\n</template_layouts>';
  }
  if (workflow === 'build-code') return blocks;
  return Object.fromEntries(['identity', 'workflow', 'shared', 'philosophy', 'anti_slop', 'notes', 'visual_focus', 'steps'].filter(key => key in blocks).map(key => [key, blocks[key]!]));
}
