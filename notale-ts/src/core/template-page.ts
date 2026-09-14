/** Canonical template assembly shared by explicit Check and final delivery audit. */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, parseFragment, serialize as html, type DefaultTreeAdapterMap } from 'parse5';
import { TEMPLATE_SPEC, digest } from './pptx-template.js';
import type { TemplateSpec } from './template-style.js';
import type { Page } from 'playwright';
type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];
const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value;
function hasContent(root: Node): boolean {
  if (root.nodeName === '#text') return Boolean((root as DefaultTreeAdapterMap['textNode']).value.trim());
  if ('tagName' in root && ['script', 'style'].includes(root.tagName)) return false;
  return ('tagName' in root && ['svg', 'canvas', 'img', 'video', 'input', 'select'].includes(root.tagName)) || ('childNodes' in root && root.childNodes.some(hasContent));
}
function all(root: Node): Element[] { return [...('tagName' in root ? [root] : []), ...('childNodes' in root ? root.childNodes.flatMap(all) : [])]; }
export async function assembleTemplatePage(pages: string, filename: string, workflow?: string): Promise<string[]> {
  const specFile = path.join(path.dirname(pages), TEMPLATE_SPEC);
  if (!existsSync(specFile) || workflow === 'build-code') return [];
  const file = path.resolve(pages, filename);
  if (path.dirname(file) !== path.resolve(pages) || !/^page-\d+\.html$/.test(path.basename(file))) return ['模板检查只接受当前页面'];
  const original = await readFile(file, 'utf8'), document = parse(original), nodes = all(document);
  if (!workflow && nodes.some(n => n.tagName === 'iframe' && (attr(n, 'class') ?? '').split(/\s+/).includes('code-workbench-frame'))) return [];
  const spec = JSON.parse(await readFile(specFile, 'utf8')) as TemplateSpec;
  const stages = nodes.filter(n => attr(n, 'id') === 'stage');
  const stage = stages[0], layout = spec.layouts.find(l => l.id === (stage && attr(stage, 'data-notale-template')));
  if (stages.length !== 1 || !stage || !layout) return ['#stage 必须选择有效的 data-notale-template 版式 ID'];
  if (workflow && !layout.workflows.includes(workflow as typeof layout.workflows[number])) return [`版式 ${layout.id} 不适用于 ${workflow}`];
  const slots = nodes.filter(n => attr(n, 'data-notale-slot') !== undefined), errors: string[] = [];
  for (const slot of layout.slots) {
    const matching = slots.filter(n => attr(n, 'data-notale-slot') === slot.id);
    if (matching.length > 1 || (slot.required && (!matching.length || !hasContent(matching[0]!)))) errors.push(`区域 ${slot.id} 缺失、为空或重复`);
  }
  for (const node of slots) if (node.parentNode !== stage || !layout.slots.some(s => s.id === attr(node, 'data-notale-slot'))) errors.push('内容区域必须为 #stage 直接子节点，且 ID 来自所选版式');
  for (const node of stage.childNodes) if ('tagName' in node && !['script', 'style'].includes(node.tagName) && attr(node, 'data-notale-slot') === undefined && attr(node, 'data-notale-template-fixed') === undefined) errors.push('舞台中的可见内容必须放入模板区域');
  if (stage.childNodes.some(n => n.nodeName === '#text' && (n as DefaultTreeAdapterMap['textNode']).value.trim())) errors.push('舞台文本必须放入模板区域');
  if (errors.length) return errors;
  const source = path.resolve(pages, layout.fixedPath);
  if (!source.startsWith(path.resolve(pages, 'assets/template') + path.sep)) return ['固定模板资源路径越界'];
  const fixed = await readFile(source, 'utf8'); if (digest(fixed) !== layout.fixedHash) return ['模板固定资源被修改'];
  for (const node of nodes.filter(n => attr(n, 'data-notale-template-fixed') !== undefined || attr(n, 'data-notale-template-geometry') !== undefined)) {
    if (node.parentNode && 'childNodes' in node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(c => c !== node);
  }
  const layer = parseFragment(`<div data-notale-template-fixed="${layout.id}" aria-hidden="true" style="position:absolute!important;inset:0!important;width:1600px!important;height:900px!important;pointer-events:none!important;z-index:0!important">${fixed.replaceAll('="assets/', '="assets/template/assets/')}</div>`).childNodes[0]!;
  layer.parentNode = stage; stage.childNodes.unshift(layer);
  const rules = layout.slots.map(s => `#stage[data-notale-template="${layout.id}"]>[data-notale-slot="${s.id}"]{position:absolute!important;left:${s.x}px!important;top:${s.y}px!important;width:${s.width}px!important;height:${s.height}px!important;margin:0!important;transform:none!important;overflow:clip!important;isolation:isolate;z-index:1!important}`).join('\n');
  const geometry = parseFragment(`<style data-notale-template-geometry="">${rules}</style>`).childNodes[0]!;
  const head = nodes.find(n => n.tagName === 'head')!; geometry.parentNode = head; head.childNodes.push(geometry);
  const result = html(document); if (result !== original) await writeFile(file, result);
  return [];
}

export async function templatePageAudit(pages: string, filename: string) {
  const specFile = path.join(path.dirname(pages), TEMPLATE_SPEC);
  if (!existsSync(specFile)) return undefined;
  const source = parse(await readFile(path.join(pages, filename), 'utf8')), nodes = all(source);
  const stage = nodes.find(n => attr(n, 'id') === 'stage'), selected = stage && attr(stage, 'data-notale-template');
  if (!selected) return undefined;
  const spec = JSON.parse(await readFile(specFile, 'utf8')) as TemplateSpec, layout = spec.layouts.find(l => l.id === selected)!;
  const fixed = nodes.find(n => attr(n, 'data-notale-template-fixed') === selected)!;
  const expected = { layout, fixed: html(fixed) };
  return (page: Page) => page.evaluate(({ layout, fixed }) => {
    const errors: string[] = [], stage = document.getElementById('stage'), layer = stage?.querySelector('[data-notale-template-fixed]');
    if (!stage || !layer) return ['固定模板层缺失'];
    const normalized = document.createElement('div'); normalized.innerHTML = fixed;
    if (layer.innerHTML !== normalized.innerHTML) errors.push('脚本修改了固定模板对象');
    const layerStyle = getComputedStyle(layer);
    if (layerStyle.display === 'none' || layerStyle.visibility === 'hidden' || Number(layerStyle.opacity) < 0.99) errors.push('固定模板层被隐藏');
    for (const sheet of [...document.styleSheets].filter(s => s.ownerNode instanceof HTMLStyleElement && !s.ownerNode.hasAttribute('data-notale-template-geometry'))) {
      for (const rule of [...sheet.cssRules]) if ('selectorText' in rule) {
        const selector = (rule as CSSStyleRule).selectorText;
        try { if (layer.matches(selector) || layer.querySelector(selector)) errors.push('本页 CSS 不得覆盖固定模板：' + selector); } catch { /* @ rules do not select nodes */ }
      }
    }
    const origin = stage.getBoundingClientRect(), scale = origin.width / 1600;
    for (const slot of layout.slots) {
      const el = stage.querySelector<HTMLElement>(`:scope > [data-notale-slot="${slot.id}"]`);
      if (!el) { if (slot.required) errors.push('区域缺失：' + slot.id); continue; }
      const box = el.getBoundingClientRect(), actual = [(box.x - origin.x) / scale, (box.y - origin.y) / scale, box.width / scale, box.height / scale];
      if (actual.some((v, i) => Math.abs(v - [slot.x, slot.y, slot.width, slot.height][i]!) > 1)) errors.push('区域几何被修改：' + slot.id);
      for (const child of el.querySelectorAll<HTMLElement>('h1,h2,h3,p,button,input,select,textarea,img,svg,canvas')) {
        if (!child.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const b = child.getBoundingClientRect();
        if (b.width && b.height && (b.left < box.left - 2 || b.top < box.top - 2 || b.right > box.right + 2 || b.bottom > box.bottom + 2)) errors.push('内容超出模板区域：' + slot.id + '/' + child.tagName.toLowerCase());
      }
    }
    return [...new Set(errors)];
  }, expected);
}
