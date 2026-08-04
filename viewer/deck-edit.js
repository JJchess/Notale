/* ============================================================================
   DeckEdit — 就地编辑（P0：场景级文本槽）

   与 doc-to-deck.js 的分工：那边是渲染运行时，这边只是编辑外壳。所有对 DOM 的
   写操作都通过 LectureDeck 暴露的原语走，本文件不认识任何 block 的内部结构。

   为什么"改文字"这条路径刻意不重渲（红线，别顺手改回去）：
     · runnable 的 CodeMirror 住在 body 下的传送门里，重渲会 remove 它——用户写到一半的代码没了；
     · sim.widget 是 sandbox="allow-scripts" 的 null-origin iframe，重渲即回到默认参数且无从抢救；
     · fit* 系列（fitFormulas/fitCode/balanceScene/…）把实测出的字号写成内联样式，重渲会重算成另一套。
   改一行文字不需要付这些代价：DOM 已经是目标状态，只要写回 doc + 重跑本页排版。

   字段里存的是**受限行内 markdown**（**强调** / `等宽` / $LaTeX$），而 DOM 里是渲染后的 HTML。
   所以进入编辑时把节点内容换成**源文本**，编辑纯文本，提交时再用 renderInline 渲回去——
   否则用户一编辑就把 markdown 标记洗成了纯文本（这是 contenteditable 最经典的丢信息方式）。
   ========================================================================== */
(function () {
  'use strict';

  const FIELD_LABEL = { eyebrow: '眉标', headline: '标题', lead: '导语' };

  let on = false;
  let dirty = 0;
  let badge = null;

  const deck = () => window.LectureDeck;

  /* ---------- doc 反查：DOM 节点 → doc 上的那一个字段 ---------- */
  function sceneOf(node) {
    const sec = node.closest('section[data-scene-id]');
    const doc = deck() && deck().getDoc();
    if (!sec || !doc) return null;
    const scene = (doc.scenes || []).find(s => s && s.id === sec.dataset.sceneId);
    return scene ? { sec, scene } : null;
  }

  /* ---------- 编辑生命周期 ---------- */
  function beginEdit(node) {
    if (node.dataset.editing) return;
    const hit = sceneOf(node);
    if (!hit) return;
    const src = hit.scene[node.dataset.editField];
    if (typeof src !== 'string') return;
    node.dataset.editing = '1';
    node.dataset.editRendered = node.innerHTML;   /* 取消时原样还原，不必重渲 */
    node.textContent = src;                        /* 换成源文本：编辑的是 markdown 本体 */
  }

  function commitEdit(node) {
    if (!node.dataset.editing) return;
    const hit = sceneOf(node);
    const field = node.dataset.editField;
    const next = node.innerText.replace(/ /g, ' ').trim();
    const prev = hit ? hit.scene[field] : null;

    /* 清空即撤销：字段整个消失需要改结构（节点该不该存在），那是 P3 的事，不在这条零重渲路径里做。 */
    if (!hit || !next) return cancelEdit(node);

    if (next === prev) return cancelEdit(node);
    hit.scene[field] = next;
    node.innerHTML = deck().renderInline(next);
    delete node.dataset.editing;
    delete node.dataset.editRendered;
    deck().relayoutScene(hit.sec);                 /* 文字变长/变短 → 重跑本页自适应排版 */
    bumpDirty();
  }

  function cancelEdit(node) {
    if (!node.dataset.editing) return;
    node.innerHTML = node.dataset.editRendered || node.innerHTML;
    delete node.dataset.editing;
    delete node.dataset.editRendered;
  }

  /* ---------- 编辑态开关 ---------- */
  function fields() { return Array.from(document.querySelectorAll('#slides [data-edit-field]')); }

  function enable() {
    for (const node of fields()) {
      /* plaintext-only 让浏览器自己挡掉富文本粘贴；不支持的浏览器回落 true + paste 拦截。 */
      node.setAttribute('contenteditable', 'plaintext-only');
      if (node.contentEditable !== 'plaintext-only') node.setAttribute('contenteditable', 'true');
      node.setAttribute('spellcheck', 'false');
      node.title = (FIELD_LABEL[node.dataset.editField] || node.dataset.editField) + '（点击编辑，Esc 取消）';
    }
    document.body.classList.add('deck-editing');
  }

  function disable() {
    for (const node of fields()) {
      commitEdit(node);   /* 退出编辑态视为提交；丢弃改动的显式动作是 Esc */
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
      node.removeAttribute('title');
    }
    document.body.classList.remove('deck-editing');
  }

  function toggle(force) {
    const next = force == null ? !on : !!force;
    if (next === on) return on;
    on = next;
    if (on) enable(); else disable();
    renderBadge();
    return on;
  }

  /* ---------- 脏标记（P2 会接到"保存自身"上；P0 先只显示） ---------- */
  function bumpDirty() {
    dirty += 1;
    renderBadge();
    document.dispatchEvent(new CustomEvent('deck:edited', { detail: { edits: dirty } }));
  }

  function renderBadge() {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'deck-edit-badge';
      document.body.appendChild(badge);
    }
    badge.textContent = on
      ? '编辑中' + (dirty ? '（' + dirty + ' 处改动，未保存）' : '（E 退出）')
      : (dirty ? dirty + ' 处改动未保存' : '');
    badge.classList.toggle('show', on || dirty > 0);
    badge.classList.toggle('warn', dirty > 0);
  }

  /* ---------- 事件绑定（一次性，全局委托：重渲后新节点自动生效） ----------
     用 pointerdown 而不是只用 focusin 来开始/结束一次编辑：focus 事件在窗口未获得
     系统焦点时不会派发（后台标签页里 activeElement 会变但 focusin 不来），把生命周期
     挂在焦点上会在这些情形下静默失效。指针按下是用户的真实动作，任何时候都可靠。
     focusin/focusout 仍然保留——键盘 Tab 走位靠它们。 */
  document.addEventListener('pointerdown', e => {
    const node = e.target.closest && e.target.closest('[data-edit-field]');
    /* 先提交别处正在编辑的字段（点到别的地方就等于收工），再开始这一个 */
    for (const other of Array.from(document.querySelectorAll('[data-edit-field][data-editing]'))) {
      if (other !== node) commitEdit(other);
    }
    if (on && node) beginEdit(node);
  }, true);

  document.addEventListener('focusin', e => {
    if (!on) return;
    const node = e.target.closest && e.target.closest('[data-edit-field]');
    if (node) beginEdit(node);
  });

  document.addEventListener('focusout', e => {
    const node = e.target.closest && e.target.closest('[data-edit-field]');
    if (node) commitEdit(node);
  });

  document.addEventListener('keydown', e => {
    const node = e.target.closest && e.target.closest('[data-edit-field][data-editing]');
    if (node) {
      /* 编辑中：Enter 提交、Esc 取消，其余按键一律留给 contenteditable。
         翻页键不用管——reveal 自己有 isContentEditable 守卫。 */
      if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(node); node.blur(); }
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggle(); }
  });

  /* 粘贴兜底：plaintext-only 不被支持时，自己把富文本降级成纯文本。 */
  document.addEventListener('paste', e => {
    const node = e.target.closest && e.target.closest('[data-edit-field][data-editing]');
    if (!node || node.contentEditable === 'plaintext-only') return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
  });

  window.DeckEdit = {
    toggle,
    isOn: () => on,
    edits: () => dirty,
    /** 当前（可能已被编辑过的）doc；P2 的"存回自身"从这里取。 */
    doc: () => deck() && deck().getDoc(),
    json: () => JSON.stringify(deck() && deck().getDoc(), null, 2),
  };
})();
