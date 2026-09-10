import type { Command, DeckDocument } from '@notale/editor/browser';
// Whole-lecture find and replace, shaped like PowerPoint's Replace dialog: a query, a
// replacement, a match list you can jump from, and one "replace all" that undoes as a
// single step. Only leaf text objects are rewritten, so structure and markup survive.
type Hit = { slideId: string; slideName: string; target: string; text: string };
export function createFindReplace(context: {
  document: () => DeckDocument;
  commands: (commands: Command[]) => Promise<unknown>;
  show: (slideId: string) => Promise<unknown>;
  select: (id: string) => void;
  error: (e: unknown) => void;
}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'find-replace-dialog';
  dialog.setAttribute('aria-labelledby', 'find-replace-title');
  dialog.innerHTML = `<header><h2 id="find-replace-title">查找和替换</h2><button id="close-find" aria-label="关闭查找">×</button></header>
 <label>查找内容<input id="find-query" autocomplete="off"></label>
 <label>替换为<input id="find-replacement" autocomplete="off"></label>
 <label class="inline"><input id="find-case" type="checkbox"> 区分大小写</label>
 <p id="find-status" role="status"></p>
 <div id="find-results" class="find-results"></div>
 <footer><button id="find-replace-all" class="primary">全部替换</button><button id="find-close">完成</button></footer>`;
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>('#' + id)!;
  const value = (id: string) => el<HTMLInputElement>(id).value;
  let hits: Hit[] = [], busy = false;
  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  function search() {
    const query = value('find-query');
    hits = [];
    if (query) {
      const sensitive = el<HTMLInputElement>('find-case').checked;
      const needle = sensitive ? query : query.toLocaleLowerCase();
      for (const slide of context.document().slides) {
        const parsed = new DOMParser().parseFromString(slide.html, 'text/html');
        for (const node of parsed.querySelectorAll<HTMLElement>('[data-notale-id]')) {
          if (node.children.length || node.id === 'stage') continue;
          const text = node.textContent ?? '';
          if (!text.trim()) continue;
          if ((sensitive ? text : text.toLocaleLowerCase()).includes(needle))
            hits.push({ slideId: slide.id, slideName: slide.name, target: node.dataset.notaleId!, text });
        }
      }
    }
    el('find-status').textContent = !query ? '输入要查找的文字。' : hits.length ? `找到 ${hits.length} 处` : '没有找到匹配的文字。';
    el('find-results').innerHTML = hits
      .slice(0, 50)
      .map((hit, index) => `<button type="button" data-hit="${index}"><small>${escape(hit.slideName)}</small>${escape(hit.text.trim().slice(0, 60))}</button>`)
      .join('');
    for (const button of el('find-results').querySelectorAll<HTMLButtonElement>('[data-hit]'))
      button.onclick = () => {
        const hit = hits[Number(button.dataset.hit)];
        void context.show(hit.slideId).then(() => context.select(hit.target)).catch(context.error);
      };
    el<HTMLButtonElement>('find-replace-all').disabled = !hits.length;
  }
  function replaceAll() {
    const query = value('find-query'), replacement = value('find-replacement');
    if (busy || !query || !hits.length) return;
    const sensitive = el<HTMLInputElement>('find-case').checked;
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), sensitive ? 'g' : 'gi');
    const edits = hits.map(
      (hit) => ({ type: 'element.patch', slideId: hit.slideId, target: hit.target, patch: { text: hit.text.replace(pattern, replacement) } }) as Command,
    );
    busy = true;
    const count = hits.length;
    void context
      .commands(edits)
      .then(() => {
        // Re-run the search first so the count reflects what is left, then report the result.
        search();
        el('find-status').textContent = `已替换 ${count} 处`;
      }, context.error)
      .finally(() => (busy = false));
  }
  for (const id of ['find-query', 'find-replacement', 'find-case']) el(id).addEventListener('input', search);
  el('find-case').addEventListener('change', search);
  el('find-replace-all').onclick = replaceAll;
  el('close-find').onclick = el('find-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => (hits = []));
  return {
    open(query = '') {
      if (query) el<HTMLInputElement>('find-query').value = query;
      search();
      if (!dialog.open) dialog.showModal();
      el('find-query').focus();
    },
  };
}
