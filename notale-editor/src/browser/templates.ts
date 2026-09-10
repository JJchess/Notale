import { chartSvg } from '../domain/charts.js';
const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const box = 'position:absolute;left:120px;top:160px;';
export function template(kind: string, value = ''): string {
  if (kind === 'text')
    return `<p style="${box}font-size:42px;color:var(--text,#263449);width:600px;line-height:1.4">${esc(value || '输入你的内容')}</p>`;
  if (kind === 'shape')
    return `<svg width="300" height="160" viewBox="0 0 300 160" style="${box}overflow:visible"><rect x="2" y="2" width="296" height="156" rx="16" fill="#dee8ff" stroke="#466ddb" stroke-width="3"/></svg>`;
  if (kind === 'line')
    return `<svg width="400" height="80" viewBox="0 0 400 80" style="${box}overflow:visible"><path d="M 5 40 L 370 40 M 350 20 L 370 40 L 350 60" fill="none" stroke="#466ddb" stroke-width="4"/></svg>`;
  if (kind === 'table')
    return `<table style="${box}width:650px;border-collapse:collapse;font-size:26px;background:#fff"><thead><tr>${['模型', '准确率', '说明'].map((t) => `<th style="padding:14px;border:1px solid #bcc9db;text-align:left;background:#e4ebf8">${t}</th>`).join('')}</tr></thead><tbody>${[
      '基线,78%,初始方案',
      '集成,91%,改进结果',
    ]
      .map(
        (row) =>
          `<tr>${row
            .split(',')
            .map((t) => `<td style="padding:14px;border:1px solid #bcc9db">${t}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</tbody></table>`;
  if (kind === 'chart')
    return chartSvg(value ? JSON.parse(value) : { labels: ['A', 'B', 'C'], values: [48, 72, 91] });
  if (kind === 'image')
    return `<img alt="插入图片" src="${esc(value)}" style="${box}width:500px;height:320px;object-fit:contain">`;
  if (kind === 'video' || kind === 'audio')
    return `<${kind} controls src="${esc(value)}" style="${box}width:600px${kind === 'video' ? ';height:340px' : ''}"></${kind}>`;
  throw new Error(`Unknown object type ${kind}`);
}
