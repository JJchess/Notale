import type { Command, DeckDocument } from '@notale/editor/browser';
// Review comments, shaped like PowerPoint's comment pane: a list for the current page,
// anchored to the page or to the selected object, with replies and a resolved state.
// Comments live with the document rather than in slide HTML, so a show or an export
// never renders them.
type Comment = NonNullable<DeckDocument['comments']>[number];
type ObjectInfo = { id: string; tag: string; text: string; attributes: Record<string, string> };
const AUTHOR_KEY = 'notale.comment.author';
// Refreshing is only held back while a field is being typed in; clicking the panel's own
// buttons must not freeze the list.
const editing = (root: HTMLElement) =>
  !!root.querySelector('textarea:focus, select:focus, input:is([type=text],[type=search],[type=number],[type=url],[type=email]):focus');
export function createCommentsPanel(context: {
  document: () => DeckDocument;
  slideId: () => string;
  objects: () => ObjectInfo[];
  selected: () => string[];
  commands: (commands: Command[]) => Promise<unknown>;
  show: (slideId: string) => Promise<unknown>;
  select: (id: string) => void;
  uuid: () => string;
  error: (e: unknown) => void;
}) {
  const panel = document.createElement('section');
  panel.id = 'comments-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '批注');
  panel.innerHTML = `<div class="comments-head"><strong>批注</strong><label class="inline"><input id="comments-all" type="checkbox"> 显示全部页面</label><label class="inline"><input id="comments-resolved" type="checkbox"> 含已解决</label></div>
 <div id="comments-list" class="comments-list"></div>
 <form id="comment-form"><label>作者<input id="comment-author" autocomplete="off" placeholder="你的名字"></label><label id="comment-anchor-label" class="inline"><input id="comment-anchor" type="checkbox"> 关联当前选中对象</label><label>批注内容<textarea id="comment-text" rows="3" required></textarea></label><button type="submit" class="primary">添加批注</button></form>`;
  document.querySelector('.center')?.append(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>('#' + id)!;
  const value = (id: string) => el<HTMLInputElement>(id).value.trim();
  let busy = false, rendered = '';
  const author = () => value('comment-author') || '我';
  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const label = (comment: Comment) => {
    if (!comment.target) return '整页';
    const object = context.objects().find((o) => o.id === comment.target);
    return object ? object.attributes['data-notale-name'] || object.text.trim().slice(0, 12) || object.tag : '已删除对象';
  };
  function write(commands: Command[]) {
    if (busy) return;
    busy = true;
    rendered = '';
    void context.commands(commands).catch(context.error).finally(() => (busy = false));
  }
  function visible() {
    const all = el<HTMLInputElement>('comments-all').checked, resolved = el<HTMLInputElement>('comments-resolved').checked;
    return (context.document().comments ?? []).filter(
      (comment) => (all || comment.slideId === context.slideId()) && (resolved || !comment.resolved),
    );
  }
  const api = {
    toggle(show?: boolean) {
      panel.hidden = show === undefined ? !panel.hidden : !show;
      if (!panel.hidden) api.render();
      return !panel.hidden;
    },
    render() {},
  };
  for (const id of ['comments-all', 'comments-resolved'])
    el(id).addEventListener('change', () => { rendered = ''; api.render(); });
  el('comment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = value('comment-text');
    if (!text) return;
    const target = el<HTMLInputElement>('comment-anchor').checked ? context.selected()[0] : undefined;
    try { localStorage.setItem(AUTHOR_KEY, author()); } catch { /* a private window simply forgets the name */ }
    write([
      {
        type: 'comment.set',
        comment: { id: context.uuid(), slideId: context.slideId(), target, author: author(), text, createdAt: new Date().toISOString(), resolved: false, replies: [] },
      } as Command,
    ]);
    el<HTMLTextAreaElement>('comment-text').value = '';
  });
  function bind() {
    for (const button of el('comments-list').querySelectorAll<HTMLButtonElement>('[data-comment-action]')) {
      const comment = (context.document().comments ?? []).find((c) => c.id === button.dataset.commentId);
      if (!comment) continue;
      button.onclick = () => {
        const action = button.dataset.commentAction;
        if (action === 'go') {
          void context.show(comment.slideId).then(() => comment.target && context.select(comment.target)).catch(context.error);
          return;
        }
        if (action === 'resolve') return write([{ type: 'comment.set', comment: { ...comment, resolved: !comment.resolved } } as Command]);
        if (action === 'remove') return write([{ type: 'comment.remove', id: comment.id } as Command]);
        if (action === 'reply') {
          const input = el<HTMLInputElement>(`reply-${comment.id}`);
          const text = input.value.trim();
          if (!text) return;
          write([
            { type: 'comment.set', comment: { ...comment, replies: [...comment.replies, { id: context.uuid(), author: author(), text, createdAt: new Date().toISOString() }] } } as Command,
          ]);
        }
      };
    }
  }
  api.render = () => {
    {
      if (panel.hidden) return;
      const comments = visible();
      const key = JSON.stringify([context.slideId(), comments, context.selected()]);
      if (key === rendered || editing(panel)) return;
      rendered = key;
      try { el<HTMLInputElement>('comment-author').value ||= localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { /* ignore */ }
      el('comment-anchor-label').hidden = context.selected().length !== 1;
      el('comments-list').innerHTML = comments.length
        ? comments
            .map(
              (comment) => `<article class="comment${comment.resolved ? ' is-resolved' : ''}">
 <header><strong>${escape(comment.author)}</strong><time>${new Date(comment.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></header>
 <p>${escape(comment.text)}</p>
 <small>${escape(label(comment))}</small>
 ${comment.replies.map((reply) => `<p class="comment-reply"><strong>${escape(reply.author)}</strong>${escape(reply.text)}</p>`).join('')}
 <div class="comment-actions"><input id="reply-${comment.id}" placeholder="回复…" autocomplete="off"><button type="button" data-comment-action="reply" data-comment-id="${comment.id}">回复</button><button type="button" data-comment-action="go" data-comment-id="${comment.id}">定位</button><button type="button" data-comment-action="resolve" data-comment-id="${comment.id}">${comment.resolved ? '重新打开' : '标记解决'}</button><button type="button" data-comment-action="remove" data-comment-id="${comment.id}">删除</button></div>
</article>`,
            )
            .join('')
        : '<p class="hint">这一页还没有批注。放映和导出都不会显示批注。</p>';
      bind();
    }
  };
  return api;
}
