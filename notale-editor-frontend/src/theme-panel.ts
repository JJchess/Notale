import type { Command, DeckDocument } from '@notale/editor/browser';
// Deck theming follows PowerPoint's Design tab: a row of variant swatches plus the
// individual colours behind them. The lecture's own tokens are the vocabulary, so
// changing them repaints authored pages and every inserted object at once.
type Token = { key: string; label: string; fallback: string };
const TOKENS: Token[] = [
  { key: '--model', label: '主色', fallback: '#17628E' },
  { key: '--text', label: '正文', fallback: '#142630' },
  { key: '--muted', label: '次级文字', fallback: '#50616B' },
  { key: '--bg', label: '页面底色', fallback: '#E8EEF1' },
  { key: '--rule', label: '分隔线', fallback: '#71828B' },
];
const PRESETS: { name: string; values: Record<string, string> }[] = [
  { name: '讲义蓝', values: { '--model': '#17628E', '--text': '#142630', '--muted': '#50616B', '--bg': '#E8EEF1', '--rule': '#71828B' } },
  { name: '石墨', values: { '--model': '#3F4A57', '--text': '#15191E', '--muted': '#5A646F', '--bg': '#EDEFF1', '--rule': '#8B949D' } },
  { name: '松绿', values: { '--model': '#1F7A5C', '--text': '#12241D', '--muted': '#4B6459', '--bg': '#E9F1EC', '--rule': '#7B948A' } },
  { name: '朱红', values: { '--model': '#B23A32', '--text': '#241413', '--muted': '#6B4F4C', '--bg': '#F4EBEA', '--rule': '#A2837F' } },
  { name: '墨紫', values: { '--model': '#5B3FA0', '--text': '#1B1626', '--muted': '#584F6D', '--bg': '#EFECF6', '--rule': '#8C83A4' } },
  { name: '暗夜', values: { '--model': '#6FA8DC', '--text': '#F2F5F8', '--muted': '#A9B6C2', '--bg': '#161C22', '--rule': '#3C4854' } },
];
const FONTS = ['system-ui', "'Microsoft YaHei'", "'PingFang SC'", "'Source Han Serif SC'", 'Georgia', 'Arial'];
// Refreshing is only held back while a field is being typed in; clicking the panel's own
// buttons must not freeze the list.
const editing = (root: HTMLElement) =>
  !!root.querySelector('textarea:focus, select:focus, input:is([type=text],[type=search],[type=number],[type=url],[type=email]):focus');
export function createThemePanel(context: {
  document: () => DeckDocument;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (e: unknown) => void;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'deck-theme';
  panel.className = 'property-group';
  panel.innerHTML = `<legend>主题配色</legend>
 <div id="theme-presets" class="theme-presets">${PRESETS.map(
   (preset, index) =>
     `<button type="button" data-theme-preset="${index}" title="套用${preset.name}"><span class="theme-swatch">${TOKENS.slice(0, 4)
       .map((token) => `<i style="background:${preset.values[token.key]}"></i>`)
       .join('')}</span>${preset.name}</button>`,
 ).join('')}</div>
 <div class="field-grid">${TOKENS.map((token) => `<label>${token.label}<input data-theme-token="${token.key}" type="color"></label>`).join('')}</div>
 <label>字体<input id="theme-font" list="theme-fonts" placeholder="沿用页面字体"><datalist id="theme-fonts">${FONTS.map((font) => `<option value="${font}">`).join('')}</datalist></label>
 <p class="hint">主题变量作用于整份讲义；页面里写死的颜色不受影响。</p>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  let busy = false, rendered = '';
  function apply(values: Record<string, string>) {
    if (busy) return;
    const theme = { ...context.document().theme, ...values };
    for (const [key, value] of Object.entries(theme)) if (!value) delete theme[key];
    busy = true;
    rendered = '';
    void context
      .commands([{ type: 'deck.update', theme } as Command])
      .catch(context.error)
      .finally(() => (busy = false));
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-theme-preset]'))
    button.addEventListener('click', () => apply(PRESETS[Number(button.dataset.themePreset)].values));
  for (const input of panel.querySelectorAll<HTMLInputElement>('[data-theme-token]'))
    input.addEventListener('change', () => apply({ [input.dataset.themeToken!]: input.value }));
  el<HTMLInputElement>('#theme-font').addEventListener('change', () => apply({ 'font-family': el<HTMLInputElement>('#theme-font').value }));
  function attach() {
    if (panel.isConnected) return;
    const host = document.querySelector('#global-style .global-settings-section:has(#open-theme-settings)') ?? document.getElementById('global-style');
    if (host) host.after ? host.after(panel) : host.append(panel);
  }
  return {
    render() {
      attach();
      const theme = context.document().theme ?? {};
      const key = JSON.stringify(theme);
      if (key === rendered || editing(panel)) return;
      rendered = key;
      for (const input of panel.querySelectorAll<HTMLInputElement>('[data-theme-token]')) {
        const token = TOKENS.find((t) => t.key === input.dataset.themeToken)!;
        input.value = (theme[token.key] ?? token.fallback).trim();
      }
      el<HTMLInputElement>('#theme-font').value = theme['font-family'] ?? '';
      const active = PRESETS.findIndex((preset) => TOKENS.every((token) => (theme[token.key] ?? '').trim().toLowerCase() === preset.values[token.key].toLowerCase()));
      for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-theme-preset]'))
        button.setAttribute('aria-pressed', String(Number(button.dataset.themePreset) === active));
    },
  };
}
