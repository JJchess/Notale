# LectureDoc v1 — 内容协议规范

> **这是什么：** 新一代讲义的唯一内容协议。一门课 = 一个符合 [`lecture-doc.schema.json`](lecture-doc.schema.json) 的 JSON 文档；渲染由 [`../doc-to-deck.js`](../doc-to-deck.js) 运行时完成（reveal.js 引擎 + Cartesian 设计系统 + KaTeX + Observable Plot + CodeMirror/Pyodide，全部离线 vendor）。
>
> **给谁看：** ① 人类作者；② **未来的 LectureGenAgent（Hermes 流水线）**——生成前必读本文，产出 JSON 后必须先过 [`validate.mjs`](validate.mjs) 再交付。
>
> **命名：** 所有 id（scene.kind / block.type / layout.kind / theme）与显示名遵循 `lecture-agent/NAMING.md`（朴素小写英文 id + 中文显示名；外来术语译成本地词、研究编号只作 provenance）。
>
> **参考实现：** [`../course.lecture.json`](../course.lecture.json) 是一门完整课程（自演化智能体，15 页）的合法实例，覆盖大部分 block 类型，当作 few-shot 范例用。

---

## 1. 三层结构

```
LectureDoc                     一门课
 ├─ meta（id/title/language/theme/audience）
 ├─ tutor（AI 助教：建议问题 + 知识库）        ← deck 级横切能力
 └─ scenes[]                   页（reveal.js 的一个 <section>）
     ├─ 页框架字段（kind/eyebrow/headline/lead/notes/decor/layout）
     └─ blocks[]               页内内容块（按序渲染成垂直流）
```

**scene.kind 决定页框架：**

| kind | 用途 | 框架 |
|---|---|---|
| `hero` | 封面 / 收尾 | 无 eyebrow/headline；由一个 `hero` block 填充（tag+大标题+副题+黑色细线+facts+hint），可配 `decor.rings` |
| `content` | 常规内容页 | eyebrow + headline (+lead) + blocks 垂直流 |
| `quiz` | 测验页 | 同 content；含一个 `quiz` block（客观题自动接判分交互） |
| `statement` | 全课回顾式大字陈述页 | eyebrow + 一个 `statement` block，垂直居中 |
| `section` | 章节分隔页（打节拍） | 大号自增序号 + eyebrow(可选) + headline(章节名) + 一个 `statement` block(本章一句话主旨)，垂直居中；≥8 页且分多主题时插于各主题前 |

**scene.layout 决定本页版式（per-scene，可只用于某一页；开放集，起步几种）：**

| kind | 用途 | 内容模型 |
|---|---|---|
| `flow`（默认） | 竖直流；`centered`/`gap` 微调 | 直接排 blocks |
| `index` | 片内分节：左目录 + 右侧逐节"上画"切入（点目录或翻页步进） | `steps:[{label, blockIds:[…]}]`，按 id 把本页 blocks 分成子节；未引用的并入末节，不丢 |
| `split` | 锚定分栏：左锚常驻（核心公式/示意/题面）+ 右侧递进 | `anchor:[blockId,…]` 引用左锚，其余进右栏；`ratio` 控左栏占比(默认 0.4) |
| `compose` | 中间层：12 列区域图 + `role` 语义样式（freeform 与固定版式之间；起步 preset `sidenote`=主栏+右窄旁注） | `areas:[{blockIds:[…], col:[起,止], row?, role?}]` 把块摆到栅格列/行线号，`role∈main/aside/feature/caption/quote`；或 `preset:"sidenote"` 罐装展开；`cols` 默认 12；未引用块整行全宽追加，不丢 |

版式**按内容形态选、非必填**，拿不准就默认 flow；`kind`/引用 id 非法时渲染器**一律回落 flow 且绝不丢内容**（红线在渲染侧兜底，校验器只 warn 不阻断）。

**scene.notes 必填**——演讲者备注是"详细讲解的收纳处"。正文（学生可见）保持克制，展开解释、教学策略、数据出处、诚实的边界说明全部写进 notes。

---

## 2. 行内富文本（inlineMd）

所有标注为 `inlineMd` 的字段接受**受限 markdown 子集**，禁止原始 HTML：

| 写法 | 渲染 | 用途 |
|---|---|---|
| `**文字**` | 衬线斜体强调（ink 色） | 关键术语/结论 |
| `*文字*` | 同上（同义） | — |
| `` `文字` `` | 等宽内联 | 变量名/符号 |
| `$...$` | 行内 KaTeX | 行内公式，如 `$E[\text{偏离}] \approx \varepsilon\cdot\sqrt{n}$` |

展示公式（独立成块、居中带边框）用 `formula` block 或 `callout.latex`，一律 **LaTeX 源码**（KaTeX 方言）。不要用 Unicode 上下标或 HTML 伪造公式。

---

## 3. Block 类型速查

### 3.1 内容类

| type | 何时用 | 说明 |
|---|---|---|
| `list` | 编号要点（≤12 条，建议 ≤8，每条一行内讲完） | items[].fragment 控制逐条渐显 |
| `agenda` | 「标签 + 正文」的等高编号行（≤12，建议 ≤8） | **首选的多要点结构**——逐行等高，不会出现两栏高度不齐 |
| `callout` | 顶线小结/核心思想 | label(小字标签) + text；可附 `latex` 展示公式 |
| `timeline` | 竖向时间线（历史/演进/分步过程） | events[2–8]：{time, title, desc?}；左侧发丝线 + 节点圆点，全走主题 token |
| `formula` | 独立展示公式 | LaTeX；`size` 可调字号（默认 27） |
| `flow` | 2–7 节点流程链 | `state:"on"`=强调实线框，`"q"`=虚线待解框；`loopNote` 加循环注记；节点 title 支持行内公式 |
| `table` | ledger 风格对比表 | 单元格可 `{text, hi:true}` 强调；**能用 agenda 讲清就别用表** |
| `code` | 静态代码卡（展示，不可运行） | filename + language + source |
| `compare` | 两栏对照（典型：修改前/后代码） | 左右天然对称时用；本质是 `grid columns:2` 的便捷特例 |
| `grid` | **通用网格**：N 列容器，子项是普通 block（递归可嵌套） | `columns:2-4` + `items:[{block, span?}]` + `gap?`；灵活版式的主力，能拼出真正的多栏/网格/不对称布局 |
| `pullquote` | 编辑级抽句：从正文抽一句关键话放大旁置（左竖条+斜体衬线大字），制造节奏顿挫与呼吸点 | `text`(必填, inline-md) + `cite`(可选, 出处/署名)；每页≤2；取自 DESIGN_RESEARCH.md T12 |
| `video` | 一等视频块：播放**本地 vendored** 视频（agent 生成的科普讲解 clip） | `src`(本地相对路径,如 `assets/x.webm`)/`poster`/`captions`(.vtt) **只能本地或 data:、禁远程 URL**；`caption`/`loop`/`language`；至少 src 或 poster；无源→占位不 mock。freeform 仍禁 video，仅本块渲染 `<video>` |
| `hero` / `statement` | 见 scene.kind | — |

### 3.2 交互类

**`quiz`（kind:"objective"）** — 客观题。choices 2–6 项（key 为 a/b/c…），answer 单选，explain 必填（判后展示）。题干放 `stem`（在选项上方，支持行内公式；`context` 为兼容旧内容的别名）——不写题干则问题需体现在页 headline 里。运行时自动接判分交互：点对→整行强调，点错→删除线+同时揭示正确项+展示 explain。

**`quiz`（kind:"subjective"）** — 主观/研讨题。prompt（题干）+ angles[]（可选切入角度）+ instruction（作答要求）。运行时渲染为衬线大字题干 + 角度列表 + 顶线说明。未来接 AI 批改时，本块是锚点。

**`sim`** — 参数仿真（滑块 → 实时重算 → 出图）。**注册表优先 + 代码逃生舱**：

- `engine:"dynamics1d"` — 一维迭代动力学。`model`:
  ```jsonc
  { "stateVar":"c", "init":0.05, "steps":40,
    "update":"c + alpha*(T - c) + sigma*xi",   // 受限表达式，见 §4
    "consts":{ "T": 1 } }
  ```
  `regimes[]` 按序取第一个 `when` 为真者，决定曲线样式（tone: line/accent/ink 三档 + dash）与面板文案。`noiseNote` 满足条件时在 regime 文案后追加一句。`chart:{ xLabel, yLabel, targetLine:{value,label} }`。
- `engine:"searchCompare"` — 一维黑箱优化三策略对比（网格/随机/贝叶斯，贝叶斯=GP 代理+LCB 采集，引擎内置）。`model`:
  ```jsonc
  { "objective":"sin(x) + sin(10*x/3)",        // 受限表达式，变量只有 x
    "domain":[2.7,7.5], "yDomain":[-2.4,2.2],
    "strategies":["grid","random","bayes"], "budgetParam":"n" }
  ```
  `labels` 给各策略中文名；`legend` 为图例行。
- `engine:"custom"` — **逃生舱**。`computeJs` 为沙箱 JS 纯函数源码（`AsyncFunction` 执行，无 DOM/网络访问），契约：
  ```js
  // (params, rng) => { series:[{ points:[{x,y}], dash?, tone? }], note? }
  ```
  配 `chart:{ xLabel, yLabel, xDomain?, yDomain? }`。**优先选注册表引擎；只有教学内容确实无法用现有引擎表达时才用 custom。**
- `engine:"widget"` — **逃生舱（借鉴 GenUI）**。给 `custom`（纯计算、只出折线、无 DOM）补上做不到的：**实时动画、canvas 粒子/波/摆、几何作图、任意交互**。`html` 为**自包含 HTML 片段**（`<style>`→markup→`<script>`，控件如按钮/滑块长在片段内部），运行时把它放进 **`<iframe sandbox="allow-scripts">`**（`srcdoc` 注入，**不含** `allow-same-origin`）：
  ```jsonc
  { "engine":"widget",
    "caption":"点「采一个点」看置信带收缩",     // 可选：组件下方一行说明
    "html":"<style>…</style><canvas id=cv></canvas><script>…</script>" }
  ```
  - **安全 = 真隔离**：iframe 是 null origin，脚本能跑但取不到 `vendor/`、发不出网络、碰不到父页面——比 `custom` 的"omission 沙箱"更强。故**无需 DOM 净化**（隔离而非过滤），但仍过 `validate.mjs` 的静态契约（必须是片段、含 `div/svg/canvas/style` 之一）与反 AI-slop lint（见 §5）。
  - **离线铁律 → 片段必须零依赖纯 vanilla**（canvas/SVG + 原生 JS）。null-origin iframe 取不到任何本地/远程资源，**禁 CDN / 图表库**。
  - **主题一致**：运行时把当前主题 token 序列化进 iframe 的 `:root{--ink…}` 并设 `data-theme`；片段内 canvas 颜色用 `getComputedStyle(document.documentElement).getPropertyValue('--ink')` 读 token（切 `?theme=lab` 即随之变仪表感）。**权衡**：null-origin iframe 加载不到 vendored woff2，字体降级到 Georgia/系统栈——sim 以 canvas 绘制为主、排版极少，可接受。
  - **优先级最低**：注册表引擎（dynamics1d/searchCompare）→ `custom`（能表达为参数驱动折线即可）→ 只有确需上面那些"活"效果时才用 `widget`。

**`runnable`** — 可编辑可运行代码单元（CodeMirror 编辑器 + Python(Pyodide)/JS 双引擎 + stdout 控制台 + 结果图）。
- `starter.{python,js}`：初始代码。约定：把最终结果赋给 `result` 变量（点数组 `[{x,y}]`）→ 运行时自动绘图。
- `env.kind:"objective1d"`：运行时向两种语言注入等价 helper——`truef(x)`（由 `objective` 表达式生成）、`candidates`（domain 均匀采样）、`predict(observed,x)`（最近邻代理，返回 `[mu, sd]`）。
- `env.kind:"custom"`：`pythonPreamble` 为字面 Python 源码；`jsPreamble` 为求值后返回 helper 对象的 JS 表达式。
- **一个 deck 可以有多个 runnable block**：各自独立编辑器/传送门/状态（见 knowledge-base/001 多实例泛化），共享一个 Pyodide 解释器但每块有独立命名空间，互不污染变量。建议每页至多一个（布局上的整屏特判以此为前提），全 deck 通常 0-2 个。

**`embed`** — 保留位。未来嵌入后端三产品（代码实验室 JupyterLab / 互动视频 AutoVideo / 互动实验室 GenUI），沿用 `launch`（拉起参数）/`artifact`（url/status 回填）契约。当前运行时只渲染占位框。

### 3.3 逃生舱：`freeform`（未分类内容）

当教学内容需要的**版式/内容形态**不在上述 正式类型里、且 `grid`/`sim.custom`/`embed` 也不适用时的最后手段。字段：

```jsonc
{ "type": "freeform",
  "rationale": "必须具体说明现有类型为何都不适用（≥10 字，不接受\"需要自定义排版\"这类泛泛之词）",
  "html": "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:var(--…)\">…</div>" }
```

**这是有意做得"能用但显眼"的设计，不是普通 block**：
- 永远渲染成带虚线边框 + `⚠ 未分类内容` 标签 + 底部展示 `rationale` 的样式，**绝不会悄悄融入正常排版**——排版审查一眼就能认出它。
- **能力（自由在布局，不在裸视觉）**：`html` 支持结构/文本标签、`<img>`（仅本地 `vendor/`/`assets/`/`data:image/`）、`<svg>`（path/rect/circle/line/g/text/polyline/polygon）、`<a>`，以及**布局类 `style`**（grid/flex/gap/尺寸/`position:relative|absolute`/transform/text-align/aspect-ratio/border-radius/font-size…）。于是它终于能做"带图带定位的时间轴""自定义网格拼贴"这类现有积木拼不出的版式。
- **约束（强制在主题内）**：`style` 里的 `color`/`background`/`border(-color)`/`fill`/`stroke`/`font-family`/`box-shadow` **只接受 `var(--token)` 或 `currentColor`/`transparent`/`none`**——裸色值/裸字体会被剥离；SVG 的 `fill`/`stroke` 同理。禁 `script`/`style`/`iframe`/`object`/`embed` 标签、内联事件、`javascript:`、`url()`、`position:fixed`、远程 `img`。**两道关**：`validate.mjs` 静态预检（命中即校验失败，给出带 JSON 路径的可读报错）；运行时 `sanitizeFreeformHtml` 权威净化（剥离不合规标签/属性/声明；被剥的标签保留其文字内容不吞可见文本）。
- **agent 应把它当稀有出口，不是默认选项**：生成前必须先确认 正式类型（尤其 `grid` 能否搞定版式、`sim.custom` 能否搞定交互）都无法表达，才允许落到 `freeform`；`rationale` 写清楚具体卡在哪——这些 rationale 会被 `validate.mjs` 汇总成警告，反复出现的诉求就是该长出新正式 block 类型的信号（见 §7 流水线里 batch_runner 的角色）。

### 3.4 流式生成

每个 block 可带 `status:"ready"|"pending"|"error"`（默认 ready）。渲染器对 `pending` 出骨架占位——这是"骨架先出、逐块回填"流式协议（doc.skeleton → block.fill → doc.done）的地基；本版运行时只实现占位渲染路径，WS 推送留给主仓库集成。

---

## 4. 受限表达式（sim 引擎用）

`update` / `objective` / `when` 字段是**数学表达式字符串**，不是任意 JS。求值前做白名单校验：

- 允许的标识符：该 block 的 `params[].name`、`model.consts` 键、`stateVar`、噪声项 `xi`（标准正态，每步一个）、数学函数 `sin cos tan exp log sqrt abs pow min max floor round` 与常量 `PI E`。
- 允许的字符：标识符、数字、`+ - * / % ( ) , . < > = ! ? : & |` 与空白。
- 出现白名单外的标识符 → 渲染器报错拒绝执行（validate.mjs 也会静态检查）。

这让 agent 能自由表达新动力学/新目标函数，而不必获得任意代码执行权；确需完整编程时走 `engine:"custom"` 的沙箱通道。

---

## 5. Agent 创作规范（authoring rules，来自真实迭代反馈的硬约束）

以下规则来自本项目与真实用户的多轮迭代，**违反其中任意一条都曾被用户明确打回**：

1. **正文克制，细节进 notes。** 每页一个清晰观点；`lead` 是一句短陈述（如"同样的预算，谁更快逼近最优？"），**不是**"这一页将向你展示…"式的产品引导文案。操作提示（"点 Run 查看结果"）压到最短或不写。
2. **禁 AI 味元素。** 不写"让我们一起…""值得注意的是…"；不造边框胶囊徽标堆（hero.facts 就是一行纯文字）；不用彩虹强调色（主题只有一种 ink + 一种 accent 小字色，这由主题层保证，内容层不要试图指定颜色）。
3. **多要点用 agenda（等高行），别把两个不等高的块并排。** `compare` 只用于左右天然对称的内容（前/后代码）。
4. **中文排版**：全角标点用于中文句；汉字与拉丁/数字间留空格（`2026 年`、`AI 产品`）；标题不带句号；标签类小字不做 uppercase 处理（内容层直接写自然大小写）。
5. **公式一律 LaTeX**（`$...$` 行内 / formula 块展示）。不要 Unicode 上下标拼公式。
6. **仿真优先选注册表引擎**（dynamics1d / searchCompare），并诚实设置 regimes 的分界条件；`custom`（参数驱动折线）次之，`widget`（sandbox iframe 里的 canvas 动画/任意交互）优先级最低——只在确需实时动画/canvas/几何/自由交互时用。`widget`/`freeform` 的 `html` 会过反 AI-slop lint：交互组件须有动效、不写自我介绍 `<h1>`、不贴"提示:"说明胶囊、不用 `@media (prefers-color-scheme)`（走 `[data-theme]`/token）、不抄样例桩色。
7. **quiz.explain 必须解释"为什么对/为什么最像的干扰项不对"**，不只是复述正确项。
8. **notes 里可以（且应该）写**：展开推导、教学建议（"可让学生先举手再点开"）、数据的诚实说明（"预算极小时贝叶斯偶尔被随机反超，n≥8 稳定领先"）、下一页的衔接。
9. **`freeform`（§3.3）是稀有出口，不是默认选项。** 生成前必须先确认 正式类型（版式想想 `grid`、交互想想 `sim.custom`）都表达不了，才允许用它；`rationale` 要写清楚具体卡在哪一点，泛泛的"需要自定义排版"不合格（`validate.mjs` 会拒绝短于 10 字的 rationale，但更长不等于更合格——要具体）。
10. **颜色/字体/间距永远走主题 token，内容层绝不写具体色值/字体。** 主题（§8）选定后一切视觉从其 token 流出——这是"放开自由但不变 slop"的核心；连 `freeform` 的内联 `style` 也只接受 `var(--…)`。想要不同观感就换 `theme`，不是在内容里调色。

---

## 6. 校验与交付流程

```
agent 产出 course.lecture.json
  → node demo/schema/validate.mjs <file>     # 结构 + 受限表达式静态检查，第一道关
  → 运行时渲染（python demo/serve.py → http://localhost:8778）
  → 无头/预览验收：每页 scrollHeight ≤ 720（禁溢出）、控制台无错、交互可用
```

`validate.mjs` 是零依赖 Node 脚本，错误信息带 JSON 路径，专为 agent 自修循环设计（读错误 → 改 JSON → 重跑）。

---

## 7. Hermes 流水线（Phase 3 骨架已落地 → `lecture-agent/`）

> **已落地**：本节的流水线已实现为一套建在 Hermes harness 上的技能套件，见 `lecture-agent/`（`generate-lecture` 编排器 + `create-{content,quiz,sim,code-runtime,freeform}` 家族技能 + `lecture-doc-schema` 共享契约 + `evolve-schema` 自演化 + 确定性管道 `demo/schema/{validate,assemble,render-verify}.mjs`）。装好 Hermes+LLM 后 `/generate-lecture <题>` 即走 input→clarify→output。详见 `lecture-agent/README.md`。下面是其设计骨架。

基于 `refs/hermes-agent`（技能自创建 / 子代理并行 / RPC 工具管道 / batch_runner）：

```
Hermes 技能: generate-lecture <课题> <素材目录?>
  ① PlanScenes    读本 SPEC + course.lecture.json 范例 → 产出 deck 骨架
                  （meta + tutor + scenes[] 全部 blocks 标 status:"pending"）
  ② FillBlocks    逐 scene fan-out 子代理并行生成 block 内容
                  （每个子代理领：SPEC §对应类型 + 该页的教学意图 + 素材切片）
  ③ Validate      node validate.mjs — 失败则把带路径的错误喂回对应子代理自修
  ④ Assemble      合并为 status 全 ready 的 course.lecture.json
  ⑤ Verify        无头浏览器加载渲染：0 溢出 / 0 控制台错误 / 交互冒烟
                  （溢出页 → 回炉：按 §5.1 拆页或精简，而不是缩字号）
  ⑥ 批量评测      batch_runner 对多个课题跑 ①–⑤，产出通过率/回炉率作为质量指标
  ⑦ Schema 生长   汇总所有课题里 freeform 的 rationale；同类诉求反复出现
                  （如"时间轴""地图标注"）→ 提案为新正式 block 类型，
                  走 schemaVersion 加法式升级（见 §3.3 末尾）——不是靠预先
                  猜测扩充词汇表，是靠 freeform 暴露的真实缺口来长
```

### 7.1 `sim.widget` 的生成子配方（借鉴 GenUI，Phase 3 实现）

`widget` 是唯一让 agent 直接产 HTML/JS 的 block，故它的 FillBlocks 子代理走一条**独立的 plan→build→repair 内循环**（对齐 `refs/genui/finalskill/generative_ui`：`tool.py` 的两阶段生成 + 修复循环）：

```
生成 widget.html:
  ① Plan   产出 planning-contract（声明式，先想清楚再写码）:
           { core_insight: 这个组件要让学生"看见"的一件事,
             render_medium: "canvas" | "svg",           # 几何/结构→svg；粒子/场/连续运动→canvas
             state_model:  [ {name, type, init, range} ],# 命名的状态变量
             interactions: [ {trigger, effect} ],        # 每个控件：触发→效果
             update:       "单一 update() 重绘入口——每次状态变化都调它，从当前 state 重推整幅画面" }
  ② Build  按 contract 写自包含片段（<style>→markup→<script>），遵守：
           零依赖 vanilla / 颜色读 --token / 有动效 / 无自我介绍 h1 / 无"提示:"胶囊 / 走 [data-theme]
  ③ Validate  node validate.mjs → checkWidgetHtml（片段契约）+ aestheticLint（反 slop）
  ④ Repair  把带路径的错误/警告喂回 ②，≤3 次（同 GenUI 的 repair / validation_repair）
```

质量闸 = 主题（尤其 `lab`，见 §8）+ 上面这套 lint。**与 GenUI 的关键分道：GenUI 允许 CDN allowlist + Chart.js；我们离线优先，widget 必须零依赖 vanilla，且靠 iframe sandbox 而非 GenUI 参考前端的 inline 执行来保证安全。**

关键设计意图：**schema 即接口**——agent 不接触 HTML/CSS/渲染代码；渲染质量（设计系统、排版、交互实现）由运行时统一保证并独立演进。（`sim.widget`/`freeform` 是这条意图下**受控的例外**：仅在逃生舱内允许产 HTML，且被 sandbox 隔离 + lint 约束住。）`freeform` 逃生舱是这条设计意图在"内容形态"维度的延伸：结构层（scene/block 的骨架、校验规则）保持强约束，内容形态层留出可控的开口，让 schema 能被真实需求驱动着长大，而不是被预先猜测撑大或被完全放开而失控。

---

## 8. 主题选择指南（`theme` 字段）

**自由在"选哪套主题 + 怎么排布"，一致性由"整份讲义所有视觉都从这一套主题的 token 流出"保证。** agent 按课程气质选一套主题，**选定后不允许 per-page 覆盖**——这就是"内容选主题、从此一致"。

| theme | 气质 | 适合 |
|---|---|---|
| `cartesian`（默认） | 暖沙米色画布 + Playfair 衬线 + 克制留白，博物馆图录/编辑感 | 人文、思辨、综述、慢节奏讲授；不确定时的安全默认 |
| `cobalt-grid` | 电钴蓝双色 risograph + 方格坐标纸 + 封面反相，研究公报/技术印刷感 | 理工、算法、数据、系统架构；想要"研究报告"的硬朗气质 |
| `lab` | 暗磷光仪表台（示波器感）：深底 + 单一 phosphor 青 accent + 细网格 | 物理/化学/算法**仿真**为主的课；尤其多 `sim.widget` canvas 动画时，暗底让活迹最醒目 |

规则：
- **颜色/字体/间距一律走主题 token**，内容层（course.lecture.json）**永远不写具体色值/字体**——这条由主题层保证，也是 `freeform` 的 `style` 只接受 `var(--…)` 的原因（见 §3.3）。
- 主题只影响**观感**，不影响**内容/结构**：同一份 scenes/blocks 换 `theme` 就换一套观感，内容一字不改。
- **加新主题 = 在 `index.html` 加一个 `:root[data-theme="x"]` token 块（+ 可选主题作用域装饰规则）**，渲染器与 schema 数据零改动；未来可从 `refs/frontend-slides`（34 套 design.md）按需增补，届时把新 theme 名加进本表与 schema enum。

---

## 9. Media 能力与资产分层

Media 是可选设计能力，不是每页配额。规划器只有在 `create-media` 声明的能力比 diagram、chart、sim、runnable 或原生图形更合适时才选择它。

- `LectureDoc.assets` 保存离线资产、来源、alt、查询或提示词与焦点；页面只按 `assetId` 引用。
- `media` block 只承载 `illustration|decoration`。必须声明 `purpose=evidence|explanatory|narrative|atmospheric`。
- 背景资产写入 `scene.background`，并声明安全区、蒙版与强度。整页海报采用背景视觉层加原生文字层，不把关键文字烘焙进图片。
- 算法状态、执行结果、定量数据、精确关系和坐标约束分别由 sim、runnable、chart、diagram、geometry-sim 证明，Media 不得替代。
- `scene.compositionFamily` 记录页面的构图家族；它编译到既有 layout primitive，并保持旧文档兼容。

---

## 附：与旧草稿的差异

早期草稿（原 `demo/lecture-doc.js`，已删除）以「嵌入三产品 iframe」为中心；经用户定向（"不强塞产品 URL、用 Quarto 技术方案原生实现交互"），v1 以**原生交互 block**（sim/runnable/quiz）为中心，`embed` 降级为保留位。scene/block/status 三层与流式协议的思路保持不变。
