import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
// Highlighting happens in the editor and ships as inline colours, so a slide never needs
// an extra stylesheet and the exported page keeps its look with no runtime.
export const LANGUAGES: [id: string, label: string][] = [
  ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['bash', 'Shell'], ['json', 'JSON'], ['sql', 'SQL'], ['plain', '纯文本'],
];
for (const [id, language] of [['python', python], ['javascript', javascript], ['typescript', typescript], ['bash', bash], ['json', json], ['sql', sql]] as const)
  hljs.registerLanguage(id, language as never);
const COLORS: Record<string, string> = {
  keyword: '#c396f0', built_in: '#8ec7f0', type: '#8ec7f0', literal: '#f0b47a', number: '#f0b47a',
  string: '#a6e3a1', 'meta string': '#a6e3a1', regexp: '#a6e3a1', symbol: '#a6e3a1',
  comment: '#7f849c', doctag: '#7f849c', meta: '#f0b47a', title: '#8ec7f0', 'title function_': '#8ec7f0',
  'title class_': '#f0d07a', params: '#cdd6f4', attr: '#8ec7f0', property: '#8ec7f0',
  variable: '#cdd6f4', operator: '#94e2d5', punctuation: '#cdd6f4', 'attribute': '#8ec7f0',
  section: '#f0d07a', name: '#8ec7f0', tag: '#c396f0', selector_tag: '#c396f0', 'subst': '#cdd6f4',
};
const escapeHtml = (text: string) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
export function highlight(code: string, language: string) {
  if (language === 'plain' || !hljs.getLanguage(language)) return escapeHtml(code);
  const html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  // Class names become inline colours; unknown tokens simply inherit the block colour.
  return html.replace(/<span class="((?:hljs-[\w-]+ ?)+)">/g, (_match, classes: string) => {
    const token = classes.replace(/hljs-/g, '').trim();
    const color = COLORS[token] ?? COLORS[token.split(' ')[0]];
    return color ? `<span style="color:${color}">` : '<span>';
  });
}
