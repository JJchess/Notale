import type { Command } from '@notale/editor/browser';
import { LANGUAGES, highlight } from './code-highlight.js';
type Item = { id: string; parent?: string; locked: boolean; text: string; attributes: Record<string, string> };
export function createCodeEditor(context: {
  objects: () => Item[];
  selection: () => string[];
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (e: unknown) => void;
}) {
  const button = document.createElement('button');
  button.id = 'open-code-editor';
  button.textContent = '编辑代码';
  document.getElementById('selection-name')!.after(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'code-editor-dialog';
  dialog.setAttribute('aria-labelledby', 'code-editor-title');
  dialog.innerHTML = `<header><h2 id="code-editor-title">编辑代码</h2><button id="close-code" aria-label="关闭代码编辑">×</button></header>
 <label>语言<select id="code-language">${LANGUAGES.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
 <label>源代码<textarea id="code-source" rows="10" spellcheck="false"></textarea></label>
 <pre id="code-preview" aria-label="高亮预览"></pre>
 <footer><button id="save-code" class="primary">保存代码</button><button id="cancel-code">取消</button></footer>`;
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>('#' + id)!;
  const source = el<HTMLTextAreaElement>('code-source'), language = el<HTMLSelectElement>('code-language');
  let target = '', slideId = '', busy = false;
  function selected() {
    const ids = context.selection();
    if (ids.length !== 1) return undefined;
    const item = context.objects().find((o) => o.id === ids[0]);
    return item && item.attributes['data-notale-code'] !== undefined ? item : undefined;
  }
  function preview() {
    el('code-preview').innerHTML = highlight(source.value, language.value);
  }
  source.oninput = preview;
  language.onchange = preview;
  button.onclick = () => {
    const item = selected();
    if (!item) return;
    target = item.id;
    slideId = context.slideId();
    // Blocks inserted before highlighting existed keep their text as the source.
    source.value = item.attributes['data-notale-code'] || item.text;
    language.value = item.attributes['data-notale-code-lang'] || 'python';
    preview();
    dialog.showModal();
  };
  el('close-code').onclick = el('cancel-code').onclick = () => dialog.close();
  el('save-code').onclick = () => {
    const item = selected();
    if (busy || !item || item.id !== target || context.slideId() !== slideId) return;
    busy = true;
    context
      .commands([
        { type: 'element.content', slideId, target, html: highlight(source.value, language.value) },
        { type: 'element.patch', slideId, target, patch: { attributes: { 'data-notale-code': source.value, 'data-notale-code-lang': language.value } } },
      ])
      .then(() => dialog.close(), context.error)
      .finally(() => (busy = false));
  };
  return {
    render() {
      const item = selected();
      button.hidden = !item;
      button.disabled = !!item?.locked;
    },
  };
}
