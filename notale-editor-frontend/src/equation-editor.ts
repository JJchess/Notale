import katex from 'katex';
import type { Command } from '@notale/editor/browser';
import { renderTex } from './templates.js';
type Item = { id: string; parent?: string; locked: boolean; html: string; attributes: Record<string, string> };
export function createEquationEditor(context: {
  objects: () => Item[];
  selection: () => string[];
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (e: unknown) => void;
}) {
  const button = document.createElement('button');
  button.id = 'open-equation-editor';
  button.textContent = '编辑公式';
  document.getElementById('selection-name')!.after(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'equation-editor-dialog';
  dialog.setAttribute('aria-labelledby', 'equation-editor-title');
  dialog.innerHTML =
    '<header><h2 id="equation-editor-title">编辑公式</h2><button id="close-equation-editor" aria-label="关闭公式编辑">×</button></header><label>LaTeX<textarea id="equation-tex" rows="4" spellcheck="false"></textarea></label><label class="inline"><input id="equation-inline" type="checkbox"> 行内公式（更小，适合嵌在句子里）</label><div id="equation-preview" aria-label="公式预览"></div><p id="equation-status" role="status"></p><footer><button id="save-equation" class="primary">保存公式</button><button id="cancel-equation">取消</button></footer>';
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>('#' + id)!;
  const tex = el<HTMLTextAreaElement>('equation-tex'), inline = el<HTMLInputElement>('equation-inline');
  const display = () => !inline.checked;
  let target = '', slideId = '', busy = false;
  function selected() {
    let item = context.selection().length === 1 ? context.objects().find((o) => o.id === context.selection()[0]) : undefined;
    while (item && item.attributes['data-notale-tex'] === undefined) item = context.objects().find((o) => o.id === item?.parent);
    return item;
  }
  function preview() {
    el('equation-preview').innerHTML = renderTex(tex.value, display());
    try {
      katex.renderToString(tex.value, { displayMode: true, throwOnError: true });
      el('equation-status').textContent = '';
    } catch (e) {
      el('equation-status').textContent = e instanceof Error ? e.message : String(e);
    }
  }
  tex.oninput = preview;
  inline.onchange = preview;
  button.onclick = () => {
    const item = selected();
    if (!item) return;
    target = item.id;
    slideId = context.slideId();
    tex.value = item.attributes['data-notale-tex'];
    inline.checked = item.attributes['data-notale-tex-display'] === '0';
    preview();
    dialog.showModal();
  };
  el('close-equation-editor').onclick = el('cancel-equation').onclick = () => dialog.close();
  el('save-equation').onclick = () => {
    const item = selected();
    if (busy || !item || item.id !== target || context.slideId() !== slideId) return;
    // Keep the stylesheet link the template placed inside the object.
    const link = /<link[^>]*>/i.exec(item.html)?.[0] ?? '';
    busy = true;
    context
      .commands([
        { type: 'element.content', slideId, target, html: link + renderTex(tex.value, display()) },
        { type: 'element.patch', slideId, target, patch: { attributes: { 'data-notale-tex': tex.value, 'data-notale-tex-display': display() ? '1' : '0' }, style: { display: display() ? 'block' : 'inline-block', 'font-size': display() ? '40px' : '32px' } } },
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
