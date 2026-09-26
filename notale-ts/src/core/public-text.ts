/** What a person is told about a failure. Raw reasons stay in builder-results.json, trace.jsonl and run.error records. */
import type { Page } from './builder.js';

const CATEGORIES: Array<[RegExp, string]> = [
  [/target missing/, '未生成页面文件'],
  [/代码工作台自检失败|Traceback|AssertionError|\[(?:runtime|tests|observation|limit)\]/, '课程代码运行或测试未通过'],
  [/JS 报错|console\.error|无法渲染|资源加载失败|底盘契约|可视化渲染失败/, '页面运行检查未通过'],
  [/超过单页时限/, '生成超时'],
  [/交付检查连续 \d+ 次未通过/, '多次修正后仍未通过交付检查'],
];
/** One plain sentence for a page that did not deliver; never paths, stacks, tool text or model prose. */
export function publicReason(page: Pick<Page, 'why' | 'last_stop_error' | 'audit'>): string {
  const raw = [page.why, page.last_stop_error, ...(page.audit?.fatal_errors ?? [])].join('\n');
  for (const [pattern, text] of CATEGORIES) if (pattern.test(raw)) return text;
  return '未通过交付检查';
}
/** A run-level error for the API: first line only, no filesystem paths or stack frames, bounded. */
export function publicMessage(error: unknown): string {
  const first = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
  const cleaned = first.replace(/\/[\w./@-]+/g, '').replace(/\s+/g, ' ').trim();
  return [...cleaned].slice(0, 160).join('') || '讲义生成失败';
}
