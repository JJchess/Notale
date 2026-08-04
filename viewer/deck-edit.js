/* ============================================================================
   DeckEdit — 就地编辑外壳

   与 doc-to-deck.js 的分工：那边是渲染运行时，这边只是编辑外壳。**本文件不认识任何
   block 的内部结构**——「哪个字段能改、是什么 kind、改完要不要重渲」全部查
   viewer/schema/fields.mjs 的注册表，渲染器把答案盖在 DOM 上（data-edit-kind /
   data-edit-tier）。这条分工一旦破掉，外壳就会变成 schema 的第二份副本。

   三条红线（都别顺手改回去）：

   ① 「改文字」这条路径完全不重渲。
      runnable 的 CodeMirror 住在 body 下的传送门里，重渲会 remove 它——用户写到一半的
      代码没了；sim.widget 是 sandbox="allow-scripts" 的 null-origin iframe，重渲即回到
      默认参数且无从抢救；fit* 系列把实测出的字号写成内联样式，重渲会重算成另一套。
      改一行文字不需要付这些代价：DOM 已经是目标状态，只要写回 doc + 重跑本页排版。

   ② 编辑的是**源文本**，不是渲染结果。
      字段里存的是受限行内 markdown（**强调** / `等宽` / $LaTeX$），DOM 里是渲染后的
      HTML。所以进编辑时把节点内容换成源文本，编辑纯文本，提交时再渲回去——否则用户
      一编辑就把 markdown 标记洗成了纯文本（contenteditable 最经典的丢信息方式）。

   ③ 生命周期挂在 pointerdown 上，不只挂 focus。
      focus 事件在窗口未获得系统焦点时不会派发（后台标签页里 activeElement 会变但
      focusin 不来），把生命周期挂在焦点上会在这些情形下静默失效。
   ========================================================================== */
(function () {
  'use strict';

  let on = false;
  let dirty = 0;
  let badge = null;

  const deck = () => window.LectureDeck;
  const registry = () => window.LectureFields;      /* 惰性读：module script 是 deferred */
  const validator = () => window.LectureValidate;

  /* ---------- doc 反查：DOM 节点 → doc 上的那一个字段 ----------
     作用域不需要额外属性，从既有 DOM 自然得出：
       在 block 节点内 → 落到那个 block（含 compare/grid 里的嵌套块，findBlock 会走到）
       在 block 外     → 落到 scene（eyebrow/headline/lead 就在 .pad 里、任何块之外）
     hero 页把 hero 块根直接放进 .pad，于是 hero 字段落到块——两者都对，无需特例。 */
  function resolve(node) {
    const sec = node.closest('section[data-scene-id]');
    const doc = deck() && deck().getDoc();
    if (!sec || !doc) return null;
    const scene = (doc.scenes || []).find(s => s && String(s.id) === sec.dataset.sceneId);
    if (!scene) return null;
    const blockNode = node.closest('[data-block-id]');
    const block = blockNode ? deck().findBlock(scene.id, blockNode.dataset.blockId) : null;
    const target = block || scene;
    const scope = block ? block.type : 'scene';
    const path = node.dataset.editField;
    return { sec, scene, block, target, scope, path };
  }

  /** 字段的 kind：优先用渲染器盖上的 data-edit-kind，其次查注册表，最后兜底 inlineMd。
      兜底成 inlineMd 正是本功能之前的行为，所以「注册表没加载」的降级态就等于旧产品。 */
  function kindOf(node, hit) {
    if (node.dataset.editKind) return node.dataset.editKind;
    const reg = registry();
    const spec = reg && hit && reg.fieldSpec(hit.scope, hit.path);
    return (spec && spec.kind) || 'inlineMd';
  }

  function labelOf(node, hit) {
    const reg = registry();
    const spec = reg && hit && reg.fieldSpec(hit.scope, hit.path);
    return (spec && spec.label) || (hit && hit.path) || node.dataset.editField;
  }

  const readPath = (target, path) => {
    const reg = registry();
    return reg ? reg.getPath(target, path) : target[path];
  };
  const writePath = (target, path, value) => {
    const reg = registry();
    if (reg) return reg.setPath(target, path, value);
    if (!(path in target)) return false;
    target[path] = value; return true;
  };

  /* ---------- 提交前校验 ----------
     错误阻断提交（回滚旧值、留在编辑态、就地显示原因）。对 inlineMd 字段这是整个功能里
     价值最高的一处：人手打出 \pi、ρ_{密度}、不配对的 $ 会原样印在幻灯片上，而 checkInline
     正好抓这三种，今天在编辑时无人拦。警告只提示不阻断。
     校验器缺失 → 视为「校验不可用」并放行，绝不因此阻断编辑。 */
  function validateValue(kind, value, hit) {
    const V = validator();
    if (!V) return { errors: [], warnings: [] };
    try {
      if (kind === 'inlineMd' && V.validateInline) return V.validateInline(value, hit.path);
      /* block 级字段：改完先整块过一遍，能抓到跨字段不变式（如 quiz.answer 必须是某个选项 key） */
      if (hit.block && V.validateBlock) {
        const snapshot = readPath(hit.target, hit.path);
        writePath(hit.target, hit.path, value);
        const res = V.validateBlock(hit.block, hit.block.type);
        writePath(hit.target, hit.path, snapshot);
        return res;
      }
    } catch (e) {
      /* 校验器自身抛了 → 记一笔但放行，不能让校验 bug 变成"没法编辑" */
      console.warn('[deck-edit] 校验器抛错，本次放行:', e);
    }
    return { errors: [], warnings: [] };
  }

  function showFieldError(node, msg) {
    node.dataset.editError = '1';
    node.title = '✗ ' + msg;
    document.dispatchEvent(new CustomEvent('deck:edit-error', { detail: { msg } }));
  }
  function clearFieldError(node) {
    delete node.dataset.editError;
  }

  /* ---------- 编辑生命周期 ---------- */
  function beginEdit(node) {
    if (node.dataset.editing) return;
    const hit = resolve(node);
    if (!hit) return;
    const src = readPath(hit.target, hit.path);
    if (typeof src !== 'string') return;             /* 非字符串字段不走就地编辑，交给面板 */
    node.dataset.editing = '1';
    node.dataset.editRendered = node.innerHTML;      /* 取消时原样还原，不必重渲 */
    node.textContent = src;                          /* 换成源文本：编辑的是 markdown 本体 */
    clearFieldError(node);
  }

  function commitEdit(node) {
    if (!node.dataset.editing) return;
    const hit = resolve(node);
    if (!hit) return cancelEdit(node);

    const kind = kindOf(node, hit);
    /*  ：contenteditable 会把行尾空格换成不换行空格，不归一化会让"没改"看起来像改了 */
    const next = node.innerText.replace(/ /g, ' ').trim();
    const prev = readPath(hit.target, hit.path);

    /* 清空即撤销：字段整个消失需要改结构（这个节点该不该存在），属数组/结构编辑那一层。 */
    if (!next) return cancelEdit(node);
    if (next === prev) return cancelEdit(node);

    const res = validateValue(kind, next, hit);
    if (res.errors && res.errors.length) {
      showFieldError(node, res.errors[0]);
      return;                                        /* 留在编辑态，光标不走，用户能直接改 */
    }
    clearFieldError(node);

    if (!writePath(hit.target, hit.path, next)) return cancelEdit(node);
    renderField(node, kind, next);
    delete node.dataset.editing;
    delete node.dataset.editRendered;
    node.title = labelOf(node, hit) + '（点击编辑，Esc 取消）';
    deck().relayoutScene(hit.sec);                   /* 文字变长/变短 → 重跑本页自适应排版 */
    bumpDirty();
    if (res.warnings && res.warnings.length) {
      document.dispatchEvent(new CustomEvent('deck:edit-warning', { detail: { warnings: res.warnings } }));
    }
  }

  /** 按 kind 把新值画回节点。默认 inlineMd；plainText 走 textContent（渲染器对它用 escapeHtml，
      当 inlineMd 处理会把标记注进一个本该转义的字段）。 */
  function renderField(node, kind, value) {
    if (kind === 'plainText') { node.textContent = value; return; }
    node.innerHTML = deck().renderInline(value);
  }

  function cancelEdit(node) {
    if (!node.dataset.editing) return;
    node.innerHTML = node.dataset.editRendered || node.innerHTML;
    delete node.dataset.editing;
    delete node.dataset.editRendered;
    clearFieldError(node);
  }

  /** 任何**结构性**改动（数组增删、块增删、换版式）之前必须先调它。
      路径是位置性的（items[3].text），面板删掉 items[1] 会让在飞的编辑写错位置。
      不用给数组项发稳定 id 来解决：那会漏进保存的 JSON、churn 每份 doc，
      并破坏 ensureBlockIds 刻意买来的确定性。收工在飞的编辑就够了。 */
  function beforeStructuralChange() {
    for (const node of Array.from(document.querySelectorAll('[data-edit-field][data-editing]'))) {
      commitEdit(node);
      cancelEdit(node);   /* 校验没过而留在编辑态的，结构改动前一律回滚，不能带着脏路径过去 */
    }
  }

  /* ---------- 编辑态开关 ---------- */
  function anchors() { return Array.from(document.querySelectorAll('#slides [data-edit-field]')); }

  function enable() {
    for (const node of anchors()) {
      const hit = resolve(node);
      const spec = registry() && hit ? registry().fieldSpec(hit.scope, hit.path) : null;
      if (spec && spec.surface === 'panel') continue;   /* 只能在面板改的字段不开 contenteditable */
      /* plaintext-only 让浏览器自己挡掉富文本粘贴；不支持的浏览器回落 true + paste 拦截。 */
      node.setAttribute('contenteditable', 'plaintext-only');
      if (node.contentEditable !== 'plaintext-only') node.setAttribute('contenteditable', 'true');
      node.setAttribute('spellcheck', 'false');
      node.title = labelOf(node, hit) + '（点击编辑，Esc 取消）';
    }
    document.body.classList.add('deck-editing');
  }

  function disable() {
    for (const node of anchors()) {
      commitEdit(node);   /* 退出编辑态视为提交；丢弃改动的显式动作是 Esc */
      cancelEdit(node);   /* 校验没过的回滚，不把非法值留在 DOM 里 */
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
    /* 让 deck-frame.js 之类的兄弟模块订阅，而不是互相 import（避免加载顺序耦合） */
    document.dispatchEvent(new CustomEvent('deck:editmode', { detail: { on } }));
    return on;
  }

  /* ---------- 脏标记 + 保存 ---------- */
  function bumpDirty() {
    dirty += 1;
    renderBadge();
    document.dispatchEvent(new CustomEvent('deck:edited', { detail: { edits: dirty } }));
  }

  function docName() {
    const param = new URLSearchParams(location.search).get('doc') || '';
    const base = param.split('/').pop().replace(/\.lecture\.json$/i, '').replace(/\.json$/i, '');
    const d = deck() && deck().getDoc();
    return (base || (d && d.id) || 'deck') + '.lecture.json';
  }

  /** 存盘：下载一份新 JSON。没有服务端写路径（serve_app 只有 GET /api/doc），
      ?doc= 静态模式更是压根没有服务端，所以下载是唯一在两种模式下都成立的做法。 */
  function save() {
    const json = jsonText();
    if (!json) return false;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = docName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dirty = 0; renderBadge();
    return true;
  }

  async function copyJson() {
    const json = jsonText();
    if (!json) return false;
    try { await navigator.clipboard.writeText(json); return true; }
    catch { return false; }
  }

  function jsonText() {
    const d = deck() && deck().getDoc();
    return d ? JSON.stringify(d, null, 2) : '';
  }

  function renderBadge() {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'deck-edit-badge';
      badge.addEventListener('click', () => { if (dirty) save(); });
      document.body.appendChild(badge);
    }
    badge.textContent = on
      ? '编辑中' + (dirty ? '（' + dirty + ' 处改动 · 点此下载 JSON）' : '（E 退出）')
      : (dirty ? dirty + ' 处改动未保存 · 点此下载 JSON' : '');
    badge.classList.toggle('show', on || dirty > 0);
    badge.classList.toggle('warn', dirty > 0);
    badge.style.pointerEvents = dirty ? 'auto' : 'none';
    badge.style.cursor = dirty ? 'pointer' : 'default';
  }

  /* ---------- 事件绑定（一次性，全局委托：重渲后新节点自动生效） ---------- */
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
    if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); return; }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toggle(); }
  });

  /* 按住 Alt 亮出全部锚点（松手即灭）。默认只 hover 才描边——锚点从 3 个涨到 30 个之后，
     满屏虚线框读起来是噪音而不是提示。窗口失焦时也灭，否则 Alt+Tab 走了会留在亮着的状态。 */
  const setAnchors = (v) => document.body.classList.toggle('deck-anchors', !!(v && on));
  document.addEventListener('keydown', e => { if (e.key === 'Alt') setAnchors(true); });
  document.addEventListener('keyup', e => { if (e.key === 'Alt') setAnchors(false); });
  window.addEventListener('blur', () => setAnchors(false));

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
    save,
    copyJson,
    /** 结构性改动前的收工钩子——面板/数组编辑必须先调它 */
    beforeStructuralChange,
    /** 当前（可能已被编辑过的）doc */
    doc: () => deck() && deck().getDoc(),
    json: jsonText,
    /** 给兄弟模块（deck-frame.js）共用脏计数与徽标 */
    bumpDirty,
  };
})();
