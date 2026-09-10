// The insert drawer is generated from data so index.html carries no per-object
// markup; galleries, symbols and word-art previews all live here.
import { shapes, shapeIcon } from './templates.js';
import { icons, iconPreview } from './icon-library.js';
const SYMBOLS = 'α β γ δ ε θ λ μ π σ φ ω Δ Σ Ω ∑ ∏ ∫ ∂ ∇ √ ∞ ≈ ≠ ≤ ≥ ± × ÷ ∈ ∉ ∀ ∃ ⊂ ∪ ∩ → ← ↔ ⇒ ⇐ ⇔ ↑ ↓ ↦'.split(' ');
const WORDART: [kind: string, label: string, preview: string][] = [
  ['gradient', '渐变', 'background:linear-gradient(90deg,#466ddb,#28a69b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent'],
  ['outline', '描边', 'color:#fff;-webkit-text-stroke:1.5px #263449'],
  ['shadow', '阴影', 'color:#466ddb;text-shadow:2px 2px 0 #dee8ff,4px 4px 0 #bcc9db'],
];
const category = (key: string, title: string, body: string, open = false) =>
  `<details class="insert-category" data-insert-category="${key}"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
const grid = (cls: string, buttons: string, id = '') => `<div${id ? ` id="${id}"` : ''} class="resource-grid ${cls}">${buttons}</div>`;
const button = (kind: string, icon: string, label: string, title = '') =>
  `<button data-insert="${kind}"${title ? ` title="${title}"` : ''}>${icon}${label}</button>`;
export function buildInsertPanel(host: HTMLElement) {
  const text = category('text', '文字', `<section data-library="text"><button class="text-sample" data-insert="text">横排文本框</button><button class="text-sample" data-insert="vertical-text">竖排文本框</button>${grid(
    'wordart-grid',
    WORDART.map(([kind, label, preview]) => button(`wordart:${kind}`, `<span style="${preview};font-weight:800">Aa</span>`, label, `${label}艺术字`)).join('') +
      button('date', '<span>📅</span>', '日期') +
      button('code', '<span>&lt;/&gt;</span>', '代码块'),
  )}${category('symbols', '符号', grid('symbol-grid', SYMBOLS.map((c) => `<button data-insert="symbol" data-symbol="${c}" title="插入符号 ${c}">${c}</button>`).join('')))}</section>`, true);
  const elements = category('insert', '元素', `<section data-library="insert">${grid(
    '',
    button('line', '<span>↗</span>', '箭头') + button('table', '<span>▦</span>', '表格') + button('chart', '<span>▥</span>', '图表') + button('equation', '<span>∑</span>', '公式'),
  )}${category('shapes', '形状', grid('shape-grid', shapes.map((s) => button(`shape:${s.name}`, shapeIcon(s.name), s.label, `插入${s.label}`)).join(''), 'shape-gallery'), true)}${category(
    'icons',
    '图标',
    `<input id="icon-search" type="search" placeholder="搜索图标" aria-label="搜索图标" autocomplete="off">${grid('icon-grid', icons.map((i) => button(`icon:${i.name}`, iconPreview(i.name), i.label, `插入图标 ${i.label}`)).join(''), 'icon-gallery')}`,
  )}${category('smart', '版式', grid('shape-grid', button('smart:process', '<span>▭→▭</span>', '流程', '三步流程') + button('smart:list', '<span>☰</span>', '列表', '编号列表') + button('smart:cycle', '<span>↻</span>', '循环', '三段循环')))}<p class="hint">页码、页眉页脚在未选中对象时的「样式 → 母版」中设置。</p></section>`, true);
  const media = category('resources', '媒体', `<section data-library="resources">${grid('', button('image', '<span>▧</span>', '上传图片') + button('video', '<span>▷</span>', '上传视频') + button('audio', '<span>♫</span>', '上传音频'))}</section>`);
  const interactive = category('interactive', '互动', '<section data-library="interactive"><button data-inspect="scene-panel">编辑互动参数</button><button data-inspect="author-components">设置状态与点击事件</button><button id="library-preview">体验本页互动</button></section>');
  host.innerHTML = text + elements + media + interactive;
  const search = host.querySelector<HTMLInputElement>('#icon-search')!;
  search.oninput = () => {
    const q = search.value.trim();
    for (const b of host.querySelectorAll<HTMLButtonElement>('#icon-gallery button')) b.hidden = !!q && !(b.title + b.dataset.insert).includes(q);
  };
}
