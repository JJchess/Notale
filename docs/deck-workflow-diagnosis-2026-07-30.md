# 讲义生成 workflow 诊断报告（2026-07-30，2026-07-31 复核修订）

## Context

- **分析对象**：实验 `lecture-agent/experiments/app/a02d897f43ce/lecture.lecture.json`（数据结构课，40 页，`theme: slate`），以及 `resultforanalysis/` 下 40 张全套截图、Kimi 的视觉评审 `docs/deck-visual-review-2026-07-30.md`。
- **本报告目的**：定位整个讲义生成 workflow 的问题，把每类问题归因到具体层（**环节 / 渲染器 / skill·schema**），并回答"我们是否剥夺了 AI 的 design 能力"。

> ### ⚠ 版本基线（读本文前务必先看）
>
> 初版把两个不同版本的东西混在一起论证，导致几处「症状 → 代码行」的对应关系失真。本次修订钉死基线：
>
> - **症状与截图**：产出自 `HEAD = 2a8942a` 渲染的 40 页 deck。
> - **代码坐标**：正文所有 `file:line` 已按 **2026-07-31 复核时的代码** 重新核对；凡 HEAD 与当时工作区不一致处，均显式标注。
> - **实施状态**：初版写作时，工作区里已有一批未提交的修复（初版没意识到），复核时又完成了余下各项。**§三/§六 每条都带「现状」标注**，别照着已完成的条目重复劳动。
>
> 方法论教训：拿产物截图去归因到 `file:line` 之前，必须先确认产物是哪个版本渲染的。工作区一脏，`file:line` 这种精确坐标就最先失真——而且失真方式很有迷惑性：代码「看起来是对的」，容易误判成报告在胡说。

- 关键代码坐标：
  - 生成流水线：`lecture-agent/lecture_agent/engine/pipeline.py::generate_lecture`
  - 规划/骨架 prompt：`lecture-agent/lecture_agent/domain/planning.py`
  - 单块生成 prompt：`lecture-agent/lecture_agent/domain/generation/blocks.py`、全局规则 `domain/skills/authoring.py::AUTHORING_RULES`
  - 渲染器（唯一）：`viewer/doc-to-deck.js`（vanilla JS + reveal.js）
  - App 外壳/主题 CSS：`viewer/app.html`
  - Schema/合约：`viewer/schema/`（单一事实源）、`lecture-agent/skills/*/contracts.json`

---

## 一、核心判断

这套 deck 的问题不是"审美烂"，而是**三个不同性质的故障叠加在三个不同的层**。模板主题本身（米灰底+橙点缀+大衬线）是协调的——这是唯一站得住的部分。问题全部在**内容填充层 + 执行层 + 被删掉的把关环节**。

| 层 | 性质 | 一句话 |
|---|---|---|
| **环节（workflow）** | 承重回归 | 真机渲染校验环节被归档删除，流水线变成**前向、无视觉反馈的盲管线**，所有"坏了没人管"的故障失去唯一把关口。 |
| **渲染器（doc-to-deck.js）** | 一批可精确定位的实现缺陷 | 没有树/图渲染能力；表头等字段绕过 inlineMd；溢出到 zoom 下限后直接裁切；调试 chrome 渗进演示态；章节数字过大且数值本身是错的。 |
| **skill·schema** | 表达力不足 + 校验闸缺口 | `diagram/flow` **没有边（from/to/父子）字段**，即使渲染器能画也画不出指定的树；且 Python 宽松 / JS 严格的双校验器里，**严格的那个根本不在流水线回路里**。 |

---

## 二、环节（workflow）层 —— 最重要的回归

**流水线现状**（`pipeline.py::generate_lecture`）：物料浓缩 →① plan（STORM 式多视角+骨架+分章）→② fan-out（每个 block 一次聚焦 LLM 调用 + 自校验/自修）→③ 组装（确定性回填+图标）→④ 整档 schema 校验+结构自修 →④.5 讲者备注 →⑤ 覆盖度审计。**控制流线性、无外层迭代。**

### 2.1 真机渲染校验环节被删（THE 根因）— ✅ 已修复

- `ports/renderer.py` 声称做"0 console error / 无溢出 / 字体加载"检查，但唯一实现 `adapters/render/structural.py::StructuralVerifier` **只是重跑 `validate_doc`（纯 schema 校验，无浏览器、无像素、无溢出）**。
- 而且这个 stub **连 `generate_lecture` 都没调用**，只在实验 harness `scripts/run_matrix.py` 里用。
- **后果**：SPEC 里白纸黑字的验收线"每页 scrollHeight ≤ 720、禁溢出、控制台无错"（`viewer/schema/SPEC.md:187`、`:208-209`）**没有任何东西在执行**。

> **修订补充（重要，且是好消息）**：初版说"归档的真机 Playwright verifier 在 `legacy/hermes-shell`"——**名字和位置都错**。实物是 `legacy/tools/render-check.mjs` + `lib/browser.mjs`：**零依赖裸 CDP 驱动本地 Edge/Chrome**（不是 Playwright），已实现 A–I 九项断言（含 `F 逐页 0 纵向溢出`、`B 0 console error`、`C 字体 loaded`），还带 `--shot` 截图。`ports/__init__.py` 指向 hermes-shell 是过时注释，那里没有浏览器代码。所以接回成本远低于初版暗示的。
>
> **现状**：已提升到 `tools/render-check.mjs`，新建 `adapters/render/headless.py` 实现 `RenderVerifier`，pipeline 新增 ④.7 阶段（验收 → 溢出页回炉精简）。`viewer/app.html` 同时补了 `?doc=` 静态渲染入口——此前**根本没有任何静态渲染路径**，必须经 `/api` 走完整生成才看得到成品，验收工具无从下手。
>
> **首次真机验收结果**：对本报告分析的同一份 40 页样本，抓出 **10–11 页纵向溢出，最多一页 476px 内容被裁**。这些此前全部无声出街——正是本节论点最直接的实证。

### 2.2 模型在生成时完全不知道"页面高度/溢出" — ⚠ 部分改善

- planner 与 block prompt 里**没有任何由高度/溢出推导出来的预算**。
- 完整性闸 `domain/evaluation/completeness.py` 只抓**文本截断**（悬空标点、不平衡 `$…$`、未闭合公式），抓不到**版面溢出**。

> **修订**：初版说"唯一的量是抽象的视觉重量 ≈ 6"——**过头了**。`planning.py:105` 有**总页数硬约束**；块契约随 prompt 贴入，带条目数上限（`1-12 项`、`2-7 个节点`、`2-6 项 KPI`）。准确说法是：**没有任何由高度/溢出推导出来的预算**。
>
> **现状**：④.7 阶段是**事后**反馈（测出溢出→回炉精简），事前的高度预算信号**仍未加**。这是目前最主要的遗留项——事后回炉能兜住，但每次都要多花一轮 LLM 调用。

### 2.3 结构化单轨，freeform 从不被选中 — ✅ 已修复

- fan-out 对每个占位块按固定合约生成一个 block，**没有任何分支**在"这一页意图是画一棵树"时把它路由到自绘。

> **修订**：初版说 freeform 是"被污名化、模型被劝退"——**比这严重**。它是**不可达**：`domain/skills/registry.py` 的 `AUTO_EXCLUDE = frozenset(["freeform","embed"])` 把它挡在规划菜单外，规划器根本选不到；`planning.py:108` 又写死"禁止新造类型名"。**只去掉 ⚠ 框毫无作用。**
>
> **现状**：`freeform` 已移出 `AUTO_EXCLUDE`（`embed` 仍排除），⚠ 框与虚线边框已去掉。更根本的是新增了带边的 `graph` 块（见 §四），树/DAG 现在有一等的结构化表达，freeform 回到它该在的位置——长尾兜底。

---

## 三、渲染器（`viewer/doc-to-deck.js`）层

| 症状（Kimi/截图） | 根因 | 现状 |
|---|---|---|
| **树画成"叠盘子"、流程箭头指向空白** | 无树/图渲染能力。`flow` 是 flex 行 + **文字 `→`**，换行时箭头指向页边；非径向 `diagram` 是 div 盒 + 文字 chevron；未知 `diagramType` 静默回落 `arrow-seq`。只有 `cycle/circular-grid/connected-circles` 走 `diagramRadial` 画真 SVG 边。**根上是 schema 无边字段（§四）**，不是渲染器偷懒。 | ✅ 新增 `graph` 块 + 真 SVG 分层渲染器 |
| **inline `$math$`/`` `code` `` 泄漏源码** | **初版归因只对了一半，另一半至今才修**。见下方专条。 | ✅ 两半都已修 |
| **代码/要点贴底被裁** | 有 fit 机制（`balanceScene`/`fitCode`/`fitScroll`）但 **zoom 有下限 0.72/0.6**，触底就裁而不是拆页。`lab/runlab/widlab` 直接跳过 fit。 | ✅ 溢出改为上报回炉（§2.1）；zoom 下限退居微调兜底 |
| **每页右上 `87/87 block · 100%`** | app 外壳顶栏 `#overallTxt` 钉在预览 deck 之上；外加 reveal 自带 `slideNumber:'c/t'`。 | ✅ `body[data-view="preview"]` 隐藏构建 chrome |
| **章节页巨大金色数字与"第 N 章"矛盾** | **初版与 Kimi 都归错了**，且漏掉真 bug。见下方专条。 | ✅ 已修（两处） |
| **字号"小字 vs 巨标题"** | 主题 token 固定 px。**但初版的数字是错的**：主题里**不存在 112px**；本产物用 `slate`（`--fs-hero:70px`、`--fs-caption:13px`），16 个主题里 hero 最大是 coral 的 92px、`--fs-h2` 34–48px。13-vs-112 的落差来自那个硬编码的 `.section-num`，**不是字阶设计问题**。"无 `clamp()`/视口相对字阶"成立，但运行时 zoom fit 与 `scene.headlineSize` 确实在事后调整字号。 | ⚠ 不改（结论：非真问题） |
| **`list.items[].lead` 被静默丢弃** | **初版完全漏掉的 P0**。见下方专条。 | ✅ 已修 |

### 3.1 专条：LaTeX/Markdown 泄漏其实是两个独立机制

初版与 Kimi 都归因为"渲染器 escapeHtml 绕过 inlineMd"。实际是两件事：

1. **确实是 escapeHtml bug**：HEAD 的表头用 `escapeHtml(h)` 而同表体用 `inlineMd`——表头反引号原样输出、表体正常，截图里这个**不对称就是指纹**。已连同另外 8 处字段（hero.tag / statement.cite / agenda.label / callout.label / timeline.time / code.filename / compare.caption / eyebrow×2）一起改走 `inlineMd`。
2. **不是渲染器问题**：Kimi 点出的两处 LaTeX 泄漏是 `scenes[12].blocks[0].caption`（`ρ_{密度}=4/12`）与 `scenes[19].blocks[0].caption`（`S=\texttt{"ababc"}`、`\pi[4]=2`）。这两个字段**本来就走 `inlineMd`**，KaTeX 也在正常工作（同页 formula 块完美排版）。真因是**模型写了不带 `$` 分隔符的裸 LaTeX**，而 `checkInline` 只检查 `$` 奇偶配对——**零个 `$` 即偶数即通过**。

第 2 类是**校验闸缺口**，不是渲染覆盖不全。更糟的是核查时发现 `formula.caption` **根本没被任何校验触及**（`formula` 分支只查 `latex`）。

**已修**：`checkInline` 增裸 LaTeX 闸（JS/Python 两侧同步），并把两侧 `checkInline` 的覆盖面对齐到「渲染器过 `inlineMd` 的字段集合」。同时把"禁原始 HTML"也改成只看 `$…$` 与 `` `code` `` 之外的部分——讲 XML 的课件写 `` `<catalog>` `` 完全合法，旧规则会误报。

### 3.2 专条：章节页金色数字——症状对，两个根因都归错了

`112px` 在 HEAD 属实。但初版定性为"自增计数器与『第N章』语义矛盾"、Kimi 定性为"把页码字段当视觉锚点"——**两者都错**。真 bug 是：

`ctx` 是模块级单例，`renderDoc` 重置了 `runnableRegistry`/`activePortals`/主题，**唯独没重置 `ctx.sectionNo`**；而 app.html 一个会话内渲染三次（骨架/更新/终稿）。6 个 divider × 3 轮 → 截图上显示的是 **13–18** 而不是 01–06。**第 2 页就显示「13」本身即否证了「序号=页码」的说法。**

**已修**：序号改为**按 scene 在 doc 里的位置推导**，而非累加 mutation——这样不只整档重渲幂等，`rerenderScene` 单页重渲也不会漂（纯加个重置只能解决一半）。同时 `.section-num` 112px → 28px 降权。真机截图确认：现在显示 `01`。

### 3.3 专条：`list.items[].lead` 静默丢弃（初版漏掉的 P0）

渲染器的 `list` 只读 `it.icon` 与 `it.text`。而被分析的产物里 **79 个 list item 全部带 `lead`**（79/79）——例如「集合结构 / 线性结构 / 树形结构 / 图状结构」。**79 条作者写好的粗体小标题一条都没上屏。**

全链路零报错、零警告：校验通过、渲染成功、只是内容不见了。这就是 Kimi 抱怨的「文字墙 / 没有层级」的直接来源，也可能贡献了部分「正文缺失」观感。

**已修**：`lead` 渲染为 `.li-lead`（复用 `.agenda-row .k` 的编辑式处理）并补进 JS/Python schema。真机截图确认四条 lead 已上屏，该页从文字墙变成可扫读的层级。

---

## 四、skill·schema 层

### 4.1 `diagram/flow` 没有边字段 —— 全文最强的一点，✅ 已修复

`flow` = `nodes[2..7]{title,sub?,state?}` + `loopNote?`，**无 from/to、无分支**；`diagram` = `nodes[2..8]{title,sub?}` + `diagramType` 枚举，**无邻接、无位置、无父子**。全 schema 搜 `from/to/edges/parent/children/adjac` 只命中 `codeBlock.source`（无关）。更狠的是节点对象是 `additionalProperties:false`，**agent 连夹带一个 `from` 字段都做不到**。

→ **一棵带命名父子边的真实树，在原 schema 里根本不可表达。** 这就是"即使渲染器再好也画不出指定树"的上游原因，也解释了为什么模型只能把树硬塞成"叠盘子"。

**现状**：新增 `graph` 块（`graphType: tree|dag|flowchart` + `nodes[{id,title,…}]` + `edges[{from,to,label,style}]` + `orientation`），配真 SVG 分层渲染器与图论完整性校验（断边/自环/孤立节点/tree 单父单根/禁环/flowchart 回边须虚线）。

### 4.2 真正的 schema 漂移在别处（初版指错了地方）

初版说"`diagram/chart/stats` 在 skill 合约里但不在 schema/enums，校验时可能漏检"——**双重错误**：

1. 复核时三者已在 schema/enums 里（工作区未提交改动，初版没意识到）。
2. 即便在 HEAD，后果也**不是「漏检」而是「硬失败」**：`validate.mjs` 对未知类型是 `err(...)` 直接拒绝。方向判反了。
3. `references/` 与 `viewer/schema/` 的所谓漂移，实测只差一行同步脚本盖的生成物 banner，零语义差异。

**真实的漂移是：Python 宽松 vs JS 严格，且严格的那个不在回路里。** `schema/document.py` 每个块模型都是 `ConfigDict(extra="allow")`，接受任意额外字段；JS 侧 `listBlock.items` 是 `additionalProperties:false` 且只声明了 `text`/`fragment`。而流水线**只跑 Python 校验器**，SPEC 声称"单一事实源"的 JS 校验器**从不校验生成产物**。于是 `lead`/`icon` 一路绿灯通过，再在渲染器里悄悄消失——§3.3 那个 P0 的结构性原因就在这里。

**根因之下还有一层**：负责把 `viewer/schema/` 同步到技能镜像的 `sync.mjs`，在目录重组后被搬进 `legacy/` 且仍指向早已改名的 `demo/schema/`，**双重失效**。守卫 `legacy/tools/check-consistency.mjs` 同样因 import 已删的 JS agent 而报错退出。**守卫本身烂掉之后，漂移就再没人管。**

**现状**：`sync.mjs` 恢复到 `lecture-agent/sync.mjs` 并指向 `viewer/schema/`，带 `--check` 模式；新增 `tests/test_enum_consistency.py` 守「enums.mjs ⇄ schema JSON ⇄ Python StrEnum 三处集合相等 + 镜像同步」，随 `pytest` 自动跑——不再是"没人记得执行"的独立脚本。

### 4.3 freeform 不是被污名化，是不可达 — ✅ 已修复

见 §2.3。另：初版说 `FF_TAG_ALLOW` 只允许 8 个 SVG 形状——实际是**宽 HTML 子集**（div/table/h1-h5/img/svg…）。配色限 `var(--token)` 属实，这条也确实是唯一在做有用功的约束（保证主题协调），已保留。

---

## 五、你的核心问题：我们是否剥夺了 AI 的 design 能力？

**是——而且是刻意的、写进设计信条的，并且正是"画不出来"这一类问题的直接根因。**

系统的明文信条（`viewer/schema/SPEC.md:237`）是：*"schema 即接口——agent 不接触 HTML/CSS/渲染代码；渲染质量由运行时统一保证。"* 这句话把**两件性质完全不同的事**混为一谈，并且**两件一起夺走了**：

- **(a) 裸视觉样式**——颜色/字体/间距。**理应**由主题 token 独占。从 AI 手里拿走这个是**对的**：它正是防止彩虹 slop、保证全 deck 协调的机制（Kimi 也确认主题是唯一站得住的部分）。
- **(b) 空间/结构设计**——树的节点摆哪、边怎么连、流程如何分支。这是**依赖内容语义的推理**，AI 恰恰擅长、固定渲染器恰恰最差。系统**把这个也一起拿走了**——这才是错误所在。

结果是：**懂内容（且能推理出正确树形）的智能，被隔离在像素之外；掌管像素的渲染器，没有任何理解。** 对任何 schema 没有预先表达的视觉关系（树、图、真流程图），AI 在结构上**被禁止设计**，唯一逃生口还被做成"丑且羞耻"的——**更准确地说，是被 `AUTO_EXCLUDE` 做成了根本够不着的**。

更糟的是**叠加了被删的反馈闭环**：即使在 AI 确实有权的地方（选块、密度），它现在也是**盲的**。一个看不见画布的设计师无法设计。所以"剥夺 design"其实是两刀：**夺走结构设计权** + **蒙住眼睛**。

**结论不是"推翻结构化"**——结构化 schema 是那 80% 内容（列表/表格/callout/代码/公式）可靠与协调的根本。**正确的修正是**：只夺走 (a)，**把 (b) 结构设计权还给 AI**，并**把 AI 的眼睛还回来**。两刀现在都已经收回：`graph` 块给回结构设计权，④.7 真机验收给回眼睛。

---

## 六、实施状态

用户选定的方向是**"结构化优先 + freeform 不再羞辱"**。三阶段现状：

1. **止血（correctness）— ✅ 完成**：9 处字段改走 `inlineMd`；裸 LaTeX 闸（两侧同步，并对齐 `checkInline` 覆盖面）；演示态隐藏构建 chrome；章节序号改推导 + 降权；`list.lead` 上屏；quiz key 走 `inlineMd`；修好失效的 `sync.mjs` 与过时注释。
2. **还眼睛（feedback loop）— ✅ 完成**：`tools/render-check.mjs` 接回流水线（④.7），溢出页走精简回炉而非缩字号；`app.html` 补 `?doc=` 静态渲染入口；`--shot` 截图可作回炉证据。
   **遗留**：① 事前的高度/密度预算信号仍未加（现在只有事后回炉）；② **拆页未实现**——精简到极限仍溢出时如实报 warning，不假装修好（拆页会改页数与 scene id，牵动 layout/anchor 引用，需单独设计）。
3. **还结构设计权 — ✅ 完成**：`graph` 一等图块 + 真 SVG 分层渲染器（分层/重心排序/正交折线/回边绕行）；`freeform` 解除 `AUTO_EXCLUDE` 并去掉 ⚠ 框。

---

## 七、Kimi 症状 → 根因归属速查（已按复核结果更正）

- 正文整片缺失 / 空占位框残骸 → **环节**（无渲染校验兜底，pending/error 块未回炉）
- 图解组件缺失、树像叠盘子、箭头悬空、决策树乱穿 → **schema 无边字段**（根因）+ 渲染器无树/图能力 + 规划器够不着逃生口（= design 被剥夺）
- LaTeX/Markdown 记号泄漏 → **一半渲染器**（表头 escapeHtml）+ **一半校验闸缺口**（裸 LaTeX 无人拦、`formula.caption` 根本没被校验）
- 「文字墙 / 没有层级」→ **渲染器静默丢弃 `list.lead`**（79/79 条），以及两套 schema 里严格的那套不在回路里
- 调试信息 `87/87 block` → **外壳演示态未分离**
- 章节号显示 13–18 → **模块级计数器跨三次 renderDoc 累加**（不是页码、不是模板复制错）
- 溢出裁切、密度失控 → **环节**（无高度预算 + 无溢出回炉）+ **渲染器**（zoom 下限静默裁切）
- 字号/对比度/网格 → 复核后认定**非真问题**（落差来自硬编码的 `.section-num`，主题字阶本身协调）

---

## 附：本轮复核的方法论产出

两条已沉淀进全局 lessons，值得在下次做同类诊断时先读：

- **归因前先钉版本基线**。产物（截图/日志）冻结在生成它的版本，代码永远是"现在"；工作区一脏，`file:line` 最先失真，且失真方式会让正确的报告看起来像胡说。
- **两套 schema 时，先问"谁在回路里"**。"某处存在一份严格 schema"不等于它在把关；宽松侧（`extra="allow"`）配上消费端静默忽略未知字段，就是一条无声的数据泄漏管道。审计手法很便宜：统计产物字段频次 ∖ 渲染器实际消费的 key，几秒钟就能定位（本例一条脚本得出 `lead:79`）。
