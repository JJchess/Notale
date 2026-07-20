---
id: 001
title: CodeMirror 5 装进 transform:scale() 容器会导致光标错位
severity: critical
status: fixed
components: [reveal.js, codemirror5, css-transform-scale]
discovered: 2026-07-05
fixed_in: viewer/index.html
mirrors: ~/.claude/lessons/frontend.md#FE-48
---

# 🎯 CodeMirror 5 装进 `transform:scale()` 容器会导致光标错位

> **一句话版：** reveal.js 会给整页幻灯套一个 `transform: scale(...)` 来适配窗口大小；CodeMirror 5 的坐标计算**没考虑过自己可能活在一个被缩放的祖先里**，于是光标位置和真实文字位置对不上——**且窗口越窄、缩放比例越偏离 1，错位越夸张**。这不是"没刷新"、也不是"CSS 写错了"，是两个库的假设互不兼容。

---

## 🧭 TL;DR（给赶时间的人 / 给 Agent）

```
症状：编辑器里点哪个字，光标却出现在别的地方；越往编辑器右下角偏差越大
根因：CodeMirror 5 的坐标系假设"没有祖先缩放"，reveal.js 恰好会缩放
判定：把窗口变窄再看 —— 偏差和窗口尺寸(=缩放比例)强相关，就是这个坑
修法：编辑器做成"传送门"(Portal)——挂在 <body> 下、不在被缩放的祖先里，
      每帧用 getBoundingClientRect() 把它对齐到 slide 里的占位框上
禁忌：不要指望 refresh() / resize 事件 / ResizeObserver 能解决 —— 它们只能
      解决"测量过期"，解决不了"坐标系本身不兼容缩放"
```

---

## 🩻 现象

在 reveal.js 讲义里嵌入一个真实可编辑、可运行的代码框（`CodeMirror` 5 + `Pyodide`/JS 双引擎做"改代码 → Run"交互，详见 `viewer/index.html` 第 5 页），用户反馈：

> "code runtime 部分，光标的位置和代码的位置有很大偏差，偏右偏下"

第一次修复（把 CodeMirror 的创建时机从"页面加载时"推迟到"该 slide 真正显示出来时"）**只解决了一部分**——用户刷新后仍然看到偏差。追查发现问题分两层，第一层是烟雾弹，第二层才是真凶。

---

## 🔬 根因：两层坑，缺一层都排查不干净

### 第一层（容易发现，容易误以为已经修好）

CodeMirror 的创建代码写在了 `Reveal.on('ready', ...)` 里——这个事件在**第 1 页**显示时就触发，而代码编辑器在**第 5 页**。reveal.js 默认所有非当前页都是 `display:none`，CodeMirror 在一个尺寸为 0 的隐藏容器里初始化时，**量不出正确的字符宽度/行高**（实测量出 `1.6px`，而正常该是 `~8px`），这个错误的内部度量会一直被缓存使用。

**只修这一层**（把 `new CodeMirror(...)` 推迟到 slide 真正当前页时才执行 + `refresh()`）在**正常窗口大小**下看起来是修好的——因为此时 reveal 的缩放比例恰好接近 `1`，第二层的坑还不明显。这就是为什么"看起来改了但用户说没用"。

### 第二层（真凶，只有缩放比例明显偏离 1 时才会暴露）

reveal.js 为了让固定逻辑尺寸（本项目用 `1280×720`）的幻灯适配任意大小的窗口/预览面板，会给 `.reveal .slides` 整体套一个：

```css
transform: matrix(0.57, 0, 0, 0.57, -640, -360);  /* 举例：缩放到 57% */
```

CodeMirror 5（2011 年设计，从未考虑过"祖先带 CSS transform"这种场景）内部对光标定位混用了两套坐标：

```
┌─────────────────────────────────────────────────────────────┐
│  CodeMirror 内部坐标计算的两种来源                              │
│                                                               │
│  ① wrapper.getBoundingClientRect()                           │
│     —— 真实 DOM API，天然"感知缩放"(会反映 transform 效果)      │
│                                                               │
│  ② 行号 × 内部缓存的 lineHeight                                │
│     列号 × 内部缓存的 charWidth                                │
│     —— 纯数值运算，"不感知缩放"(缩放前后这两个值本身不变)        │
│                                                               │
│  cursorTop = ①.top + ②(行号 × lineHeight)                    │
│              ↑ 已经是缩放后的坐标      ↑ 却是未缩放的逻辑像素   │
│                                                               │
│  → 两个坐标系直接相加，缩放比例 s 越偏离 1，加出来的位置就越偏，  │
│    且偏差随"行号/列号"线性放大(离容器左上角越远偏得越多)。       │
└─────────────────────────────────────────────────────────────┘
```

实测数据（同一处代码，只是把浏览器视口从 `1280×800` 缩到 `760×480`）：

| 视口 | reveal 缩放比例 | 光标 vs 真实字符位置的偏差 |
|------|:---:|:---:|
| 1280×800 | 0.96（接近 1） | `diffLeft ≈ -3px, diffTop ≈ -2px`（正常渲染误差） |
| 760×480 | 0.57（明显偏离 1） | `diffLeft ≈ -21px, diffTop ≈ -11px`（肉眼可见的错位） |

**关键判据：如果偏差量随窗口/容器尺寸变化而变化，就是这个坑，不是别的。**

---

## ❌ 走过的弯路（都验证过无效，记下来防止未来重复尝试）

1. **`cm.refresh()` 在 slide 切换时调用一次** —— 只修得了第一层（隐藏容器初始化），修不了第二层（坐标系不兼容缩放），因为问题根本不是"测量过期"。
2. **监听 `Reveal.on('resize', ...)` 重新 `refresh()`** —— 实测这个版本/触发方式下，窗口 resize 后 `.slides` 的 `transform` 矩阵确实变了，但 reveal 的 `'resize'` 自定义事件**不总会触发**，不能作为可靠信号。手动调用 `Reveal.layout()` 同样测过，也没有可靠触发该事件。
3. **`ResizeObserver` 盯住 `.reveal` 容器再 `refresh()`** —— 触发本身没问题，但 `refresh()` 只是重新测量 CodeMirror 自己的字符宽高，**测量结果依然会被同一个缩放坐标系问题污染**，因为 CodeMirror 从未打算跑在缩放容器里，重新测也测不出"对的"结果。

> 这三条的共同教训：**"重新测量/重新渲染"类的修法，只能治愈"缓存过期"类问题；治不了"两套坐标系设计上不兼容"类问题。** 遇到"越靠边缘偏差越大"这种非均匀误差时，先怀疑坐标系冲突，别一直加 `refresh()`。

---

## ✅ 正确修法：传送门模式（Portal Pattern）

**核心思路：不让编辑器活在会被缩放的祖先里。**

```
┌──────────────────────────────┐        ┌───────────────────────────────┐
│  <section> (reveal slide)     │        │  <body>                        │
│  ┌──────────────────────────┐ │        │  ┌───────────────────────────┐ │
│  │ #rcEditor                │ │        │  │ #rcEditorPortal            │ │
│  │ (visibility:hidden 占位)  │◄┼────────┼──┤ (position:fixed,           │ │
│  │  只用来"量出该在哪里"      │ │  rAF   │  │  真正的 CodeMirror 挂在这) │ │
│  └──────────────────────────┘ │  同步   │  └───────────────────────────┘ │
│                                │  屏幕矩形                               │
│  ← 在 transform:scale() 子树内 →│        │  ← 不在缩放子树内，天然免疫 →   │
└──────────────────────────────┘        └───────────────────────────────┘
```

### 实现（节选自 `viewer/index.html`）

**1. HTML：slide 里只留占位框，编辑器挂在 body 下**

```html
<!-- slide 内：只占版面，不渲染内容 -->
<div class="rc-editor-anchor" id="rcEditor"></div>

<!-- body 下：真正的编辑器，脱离 reveal 的缩放子树 -->
<div class="rc-editor-portal" id="rcEditorPortal"></div>
```

```css
.rc-editor-anchor{ flex:1; min-height:0; visibility:hidden; } /* 只占位 */
.rc-editor-portal{ position:fixed; z-index:45; display:none;
  border:1px solid var(--line); border-radius:12px; overflow:hidden; }
```

**2. JS：CodeMirror 创建在 portal 里，不在 anchor 里**

```js
function initRunCell(){
  if(rcCM || !window.CodeMirror || !$('#rcEditorPortal')) return;
  rcCM = CodeMirror($('#rcEditorPortal'), { value:starterCode, mode:'python', ... });
}
```

**3. 每帧同步 portal 的屏幕矩形到 anchor 的位置（这是真正解决问题的部分）**

```js
let rcPortalRAF = null;
function syncPortalRect(){
  const anchor = $('#rcEditor'), portal = $('#rcEditorPortal');
  if(!anchor || !portal) return;
  const r = anchor.getBoundingClientRect();      // 这个 rect 是"缩放感知"的真实屏幕坐标
  portal.style.left   = r.left   + 'px';
  portal.style.top    = r.top    + 'px';
  portal.style.width  = r.width  + 'px';
  portal.style.height = r.height + 'px';
}

function activateRunCell(slide){
  const portal = $('#rcEditorPortal');
  const on = !!(slide && slide.querySelector('#rcEditor'));
  if(!on){
    if(portal) portal.style.display = 'none';
    if(rcPortalRAF){ cancelAnimationFrame(rcPortalRAF); rcPortalRAF = null; }
    return;
  }
  initRunCell();
  portal.style.display = 'block';
  if(rcCM) rcCM.refresh();
  if(!rcPortalRAF){
    const loop = () => { syncPortalRect(); rcPortalRAF = requestAnimationFrame(loop); };
    loop();
  }
}
```

**为什么用 `requestAnimationFrame` 循环而不是猜测某个事件时机：** reveal 幻灯切换的过渡动画、窗口 resize、DPI 变化、预览面板被拖拽调整……触发"anchor 位置变了"的场景太多、太难穷举。rAF 循环（只在该 slide 是当前页时跑，离开就 `cancelAnimationFrame`）成本极低（一次 `getBoundingClientRect()` + 4 个样式写入），却能覆盖所有场景，不需要为每一种触发源单独接线。

---

## 🔍 验证方法：ground truth，别自己骗自己

**反面教材（我第一次就是这么测的，测出了假阳性）：**

```js
// ❌ 这样测不出问题 —— cursorCoords() 和 .CodeMirror-cursor 可能"一起错"，
//    两者互相印证，看起来一致，但都偏离了真实文字位置。
const coords = cm.cursorCoords({line, ch}, 'window');
const cursorRect = document.querySelector('.CodeMirror-cursor').getBoundingClientRect();
// diff 很小 ≠ 光标是对的，只能说明 CodeMirror 自己的两个 API 互相一致
```

**正确做法：用 `Range.getBoundingClientRect()` 拿到目标字符在 DOM 里的真实渲染位置（ground truth），和光标元素的位置做差：**

```js
function checkCursorAlignment(cm, {line, ch}) {
  cm.setCursor({line, ch});
  const lineEl = document.querySelectorAll('.CodeMirror-line')[line];
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  let node, acc = 0, targetNode = null, targetOffset = 0;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (acc + len >= ch) { targetNode = node; targetOffset = ch - acc; break; }
    acc += len;
  }
  const range = document.createRange();
  range.setStart(targetNode, targetOffset);
  range.setEnd(targetNode, targetOffset);
  const glyphRect = range.getBoundingClientRect();          // ground truth
  const cursorRect = document.querySelector('.CodeMirror-cursor').getBoundingClientRect();
  return { diffLeft: cursorRect.left - glyphRect.left, diffTop: cursorRect.top - glyphRect.top };
}
```

**并且一定要在"缩放比例明显偏离 1"的视口下测**（比如把宽度从 1280 降到 760），正常窗口大小下这个坑几乎不可见，容易漏判。

---

## 🤖 给自动化流程的检查清单

> LectureGenAgent（或任何会往 reveal.js 幻灯里生成交互组件的流程）在生成"嵌入富编辑器/白板/画布类组件"的代码前，过一遍：

- [ ] 目标容器（reveal.js 的 `.slides`，或任何"整体 `transform:scale()` 来适配视口"的容器）**是否会缩放**？—— 如果是，绝对定位/自算像素坐标的第三方组件（CodeMirror、部分富文本编辑器、Canvas 库、拖拽库）默认**不能**直接塞进去。
- [ ] 该组件是否**只在文档流内用相对布局**渲染（没有自己的 `getBoundingClientRect` + 手算像素偏移逻辑）？如果是，通常安全，可以直接塞进缩放容器。
- [ ] 如果不确定/文档没说，**默认按"传送门模式"处理**：组件挂 `<body>`，用一个 `visibility:hidden` 的占位框 + `requestAnimationFrame` 同步屏幕矩形。这个模式的成本很低，且对"安全"的组件也无害，可以作为默认策略而非例外处理。
- [ ] 验证时**必须在非默认（更小/更大）视口下测一次**，且用上面的 ground-truth 方法（`Range.getBoundingClientRect()`），不要只信组件自己的内部 API。
- [ ] 组件如果是在页面加载早期（非当前可见 slide）时创建的，还要同时检查**第一层坑**（隐藏容器初始化导致度量为 0）——两层坑经常一起出现，别只查一层就收工。

---

## 🔁 多实例泛化（2026-07 追记）

传送门模式最初只做了**一个**：`#rcEditorPortal` 是 `index.html` 里的静态单例 div，配一个全局 `window.__rcCM`、一个全局 `runnableActivator`、一个全局 `rcPortalRAF`。一份讲义因此被硬限制"至多一个 runnable block"（两侧校验器都会拒第 2 个），这个限制其实**不是传送门模式本身要求的**，只是 v1 图省事的单例实现。

**推广到 N 个的关键认识**：reveal.js 任一时刻只显示一张 slide，所以传送门模式天生就是"当前激活集"问题，不是"唯一实例"问题——把所有单例状态改成按 block id 键控的登记表即可：

```
runnableRegistry: Map<uid, { portal, initCM, anchor, cm }>   // 每个 runnable 一份
activePortals: Set<uid>                                       // 当前 slide 上正显示的子集
一个共享 rAF 循环遍历 activePortals，逐个 syncRect(entry.anchor, entry.portal)
```

`activateRunCell(slide)` 从"查一个 `#rcEditor` 存不存在"改成"`slide.querySelectorAll('[data-rc-anchor]')` 找出当前页全部锚点"，对每个锚点懒挂载/显示对应 portal，不在当前页的一律隐藏并移出 `activePortals`。

**Pyodide 的处理是分开的两件事，别混为一谈**：
- **传送门/CodeMirror**：必须每实例一份（各自的编辑状态、DOM、光标），不能共享。
- **Pyodide 解释器**：一次性 WASM 加载很贵，可以全局共享一份；但 `pyPreamble` 会写进解释器的全局命名空间、用户代码也在全局命名空间里跑，**两个 runnable 共享同一个解释器会互相污染变量**。解法是解释器共享 + 每块一个独立命名空间 dict（`pyodide.globals.get('dict')()` 建一个新 dict，`runPython(code, {globals: ns})` 传进去执行）——Pyodide 官方支持的命名空间隔离用法，不是本项目发明的技巧。

一句话教训：**传送门模式解决的是"这个组件不能活在缩放子树里"，跟"能不能有多个"是两个正交问题；遇到"每 xxx 至多一个"的约束时，先确认是真的架构限制，还是只是 v1 实现图简单——后者往往一次性能推广成"当前激活集"模型，不需要重新设计。**

---

## 🔗 相关

- 同 session 内另一条相关但独立的坑：本地静态服务器必须用 `ThreadingHTTPServer`（Pyodide 并发请求在单线程服务器上会死锁）——不属于本条范围，如需要另建条目。
- 全局镜像：`~/.claude/lessons/frontend.md` → `[FE-48]`
- 触发场景源码：`viewer/index.html`（第 5 页"贝叶斯选点循环：改一行，亲自跑"）、`viewer/doc-to-deck.js` `renderRunnable`/`activateRunCell`/`syncAllPortals`（多实例登记表实现）
