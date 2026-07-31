# 讲义生成 workflow 诊断报告（2026-07-30）

## Context

- **分析对象**：实验 `lecture-agent/experiments/app/a02d897f43ce/lecture.lecture.json`（数据结构课，40 页），以及 `resultforanalysis/` 下 40 张全套截图、Kimi 的视觉评审 `docs/deck-visual-review-2026-07-30.md`。
- **本报告目的**：定位整个讲义生成 workflow 的问题，把每类问题归因到具体层（**环节 / 渲染器 / skill·schema**），并回答"我们是否剥夺了 AI 的 design 能力"。
- **本阶段结论性质**：**仅诊断，不改代码**。文末给出推荐方向（结构化图块优先 + freeform 去污名化），供后续分阶段实施决策。
- 关键代码坐标（供后续定位）：
  - 生成流水线：`lecture-agent/lecture_agent/engine/pipeline.py::generate_lecture`
  - 规划/骨架 prompt：`lecture-agent/lecture_agent/domain/planning.py`
  - 单块生成 prompt：`lecture-agent/lecture_agent/domain/generation/blocks.py`、全局规则 `domain/skills/authoring.py::AUTHORING_RULES`
  - 渲染器（唯一）：`viewer/doc-to-deck.js`（1491 行，vanilla JS + reveal.js）
  - App 外壳/主题 CSS：`viewer/app.html`
  - Schema/合约：`lecture-agent/skills/lecture-doc-schema/`、各 skill 的 `contracts.json`

---

## 一、核心判断

这套 deck 的问题不是"审美烂"，而是**三个不同性质的故障叠加在三个不同的层**。模板主题本身（米灰底+橙点缀+大衬线）是协调的——这是唯一站得住的部分。问题全部在**内容填充层 + 执行层 + 被删掉的把关环节**。

| 层 | 性质 | 一句话 |
|---|---|---|
| **环节（workflow）** | 承重回归 | hermes 收敛提交把"真机渲染校验"环节归档删除，流水线变成**前向、无视觉反馈的盲管线**，所有"坏了没人管"的故障失去唯一把关口。 |
| **渲染器（doc-to-deck.js）** | 一批可精确定位的实现缺陷 | 没有树/图渲染能力；inline 数学/代码在部分字段泄漏；溢出到 zoom 下限后直接裁切；调试 chrome 渗进演示态；章节大金数字。 |
| **skill·schema** | 潜在漂移 + 表达力不足 | `diagram/chart/stats` 存在于 skill 合约但**不在** schema/enums；`diagram/flow` 合约**没有边（from/to/父子）字段**，即使渲染器能画也画不出指定的树。 |

---

## 二、环节（workflow）层 —— 最重要的回归

**流水线现状**（`pipeline.py::generate_lecture`）：物料浓缩 →① plan（STORM 式多视角+骨架+分章）→② fan-out（每个 block 一次聚焦 LLM 调用 + 自校验/自修）→③ 组装（确定性回填+图标）→④ 整档 schema 校验+结构自修 →④.5 讲者备注 →⑤ 覆盖度审计。**控制流线性、无外层迭代。**

### 2.1 真机渲染校验环节被删（THE 根因）
- `ports/renderer.py::RenderVerifier` 声称做"0 console error / 无溢出 / 字体加载"检查，但唯一实现 `adapters/render/structural.py::StructuralVerifier` **只是重跑 `validate_doc`（纯 schema 校验，无浏览器、无像素、无溢出）**；其 docstring 明说真机 verifier "因运行时无处注入 + 依赖缺失已删"，`ports/__init__.py` 注明随 agent 外壳归档到 `legacy/hermes-shell`。
- 而且这个 stub **连 `generate_lecture` 都没调用**，只在实验 harness `scripts/run_matrix.py` 里用。
- **后果**：SPEC 里白纸黑字的验收线"每页 scrollHeight ≤ 720、禁溢出、控制台无错"**现在没有任何东西在执行**。所有"坏了没人管"的故障（正文缺失、空占位框、源码泄漏、溢出裁切、调试信息）——全都没有把关口，直接出街。

### 2.2 模型在生成时完全不知道"页面高度/溢出"
- planner 与 block prompt 里**没有任何字符预算、行数预算、像素/高度约束**。唯一的量是 planner 里抽象的"视觉重量 ≈ 6"（`xl=4/l=3/m=2/s=1` 心算），这是版面节奏提示，不是高度约束。
- 完整性闸 `domain/evaluation/completeness.py` 只抓**文本截断**（悬空标点、不平衡 `$…$`、未闭合公式），抓不到**版面溢出**。
- **后果**：密度失控 + 溢出裁切。SPEC 说"溢出页→回炉拆页而非缩字号"，但没有任何环节去测量是否溢出，这条规则等于空文。

### 2.3 结构化单轨，freeform 从不被选中
- fan-out 对每个占位块按固定合约生成一个 block。**没有任何分支**在"这一页意图是画一棵树"时把它路由到"AI 自绘 SVG"。所以图解永远走弱鸡的 `diagram/flow` 块。

> **环节层要改的**：① 把真机渲染校验环节接回来，形成 **render→截图→评审→回炉** 的视觉反馈闭环（这是唯一能系统性消灭"坏了没人管"的手段）；② 给模型一个真实的高度/密度预算信号；③ 允许流水线在图解意图下路由到自绘能力。

---

## 三、渲染器（`viewer/doc-to-deck.js`）层 —— 可精确定位的实现缺陷

| 症状（Kimi/截图） | 根因（file:line） | 定性 |
|---|---|---|
| **树画成"叠盘子"、流程箭头指向空白** | 无树/图渲染器。`flow`（`:281`）是 flex 行 + **文字 `→`**，换行时箭头指向页边；非径向 `diagram`（`:549-599`）是 div 盒 + 文字 chevron；未知 `diagramType` 静默回落 `arrow-seq`（`:396`）。只有 `cycle/circular-grid/connected-circles` 走 `diagramRadial`（`:495`）画真 SVG 边。`adjList/stages` 键存在（`:1300`）但无人消费。 | **能力缺失**，非 bug |
| **inline `$math$`/`` `code` `` 泄漏源码** | 只发生在**绕过 `inlineMd` 直接 `escapeHtml` 的字段**：表头（`:294`）、callout/agenda 标签（`:253/246`）、compare caption（`:363`）、code filename（`:353`）、eyebrow（`:1148/1154`）、quiz choice key（`:406`）。正文经 `inlineMd`（`:135-149`，已用 PUA 哨兵修好旧 bug）是**正确**的。 | 窄 bug，易修 |
| **代码/要点贴底被裁** | 有 fit 机制（`balanceScene :1185`、`fitCode :1242`、`fitScroll :1252`）但 **zoom 有下限 0.72/0.6**，`.pad`/`.codecard` 是 `overflow:hidden`（`app.html:229`），超过下限就裁而不是拆页。`lab/runlab/widlab` 直接跳过 fit（`:1191`）。 | 策略 bug：应回炉拆页 |
| **每页右上 `87/87 block · 100%`** | 是 app 外壳顶栏 `#overallTxt`（`app.html:772`，markup `:680`），钉在预览 deck 之上；外加 reveal 自带 `slideNumber:'c/t'`（`:1348`）再来一个数字。 | 开发态/演示态未分离 |
| **章节页巨大金色数字与"第 N 章"矛盾** | `.section-num` 是**自增章节计数器**（`01/02…`，`doc-to-deck.js:1146`），CSS 112px accent，与 50px 标题只隔 6px（`app.html:431-433`）。 | 设计/CSS |
| **字号"小字 vs 巨标题"** | 主题 token 固定 px：标题 42–112px，正文 `--fs-body`≈19–20px，**caption/eyebrow/label 13–14px**（`app.html:37` 起各 `data-theme` 块）。正文其实不算太小，落差主要来自 caption 层 13–14px 对 112px。无视口相对/内容自适应字阶。 | 主题字阶设计 |

> **渲染器层要改的**：inline 泄漏字段全部改走 `inlineMd`；新增真正的**树/DAG 分层图**渲染器（真 SVG + 计算边）；溢出到下限时**上报回炉拆页**而非静默裁切；演示态隐藏所有构建/调试 chrome；章节数字降权。

---

## 四、skill·schema 层 —— 漂移与表达力

- **schema 与 skill 合约漂移**：`diagram`/`chart`/`stats` 作为 skill `contracts.json` 存在，但 `lecture-doc-schema` 下的 `lecture-doc.schema.json` 与 `enums.mjs` **没有这些类型**（block 枚举停在 `video`）。校验时可能漏检。SKILL.md 注明 `references/`、`scripts/` 由 `viewer/schema/` sync，但两处已漂移。
- **`diagram/flow` 合约没有边字段**：`flow` = `nodes[2..7]{title,sub?,state?}` + `loopNote?`，**无 from/to、无分支**，只能表达单条线性链；`diagram` = `nodes[2..8]{title,sub?}` + `diagramType` 枚举，**无邻接、无位置、无父子**。→ **一棵带命名父子边的真实树，在现有 schema 里根本不可表达**。这就是"即使渲染器再好也画不出指定树"的上游原因。
- **freeform 被刻意污名化**：`freeform` 是唯一能画真 SVG 的逃生口（限 `path/rect/circle/line/g/text/polyline/polygon`，配色仅 `var(--token)`），但渲染时**永远加虚线框 + `⚠ 未分类内容` 标签**。模型被劝退，即使它是画树的正确工具。

> **skill·schema 层要改的**：先把 schema/enums 与 skill 合约**同步**；为常见结构（树/DAG/流程）新增**带边的一等图块**；把 freeform **去污名化**（去掉警示框）作为长尾兜底。

---

## 五、你的核心问题：我们是否剥夺了 AI 的 design 能力？

**是——而且是刻意的、写进设计信条的，并且正是"画不出来"这一类问题的直接根因。**

系统的明文信条是：*"schema 即接口——agent 不接触 HTML/CSS/渲染代码；渲染质量由运行时统一保证。"* 这句话把**两件性质完全不同的事**混为一谈，并且**两件一起夺走了**：

- **(a) 裸视觉样式**——颜色/字体/间距。**理应**由主题 token 独占。从 AI 手里拿走这个是**对的**：它正是防止彩虹 slop、保证全 deck 协调的机制（Kimi 也确认主题是唯一站得住的部分）。
- **(b) 空间/结构设计**——树的节点摆哪、边怎么连、流程如何分支。这是**依赖内容语义的推理**，AI 恰恰擅长、固定渲染器恰恰最差。系统**把这个也一起拿走了**——这才是错误所在。

结果是：**懂内容（且能composed 出正确树）的智能，被隔离在像素之外；掌管像素的渲染器，没有任何理解。** 对任何 schema 没有预先表达的视觉关系（树、图、真流程图），AI 在结构上**被禁止设计**，唯一逃生口还被做成"丑且羞耻"的。

更糟的是**叠加了被删的反馈闭环**：即使在 AI 确实有权的地方（选块、密度），它现在也是**盲的**。一个看不见画布的设计师无法设计。所以"剥夺 design"其实是两刀：**夺走结构设计权** + **蒙住眼睛**。

**结论不是"推翻结构化"**——结构化 schema 是那 80% 内容（列表/表格/callout/代码/公式）可靠与协调的根本，推翻它会退回"每页一坨随机 HTML"的混乱。**正确的修正是**：只夺走 (a)，**把 (b) 结构设计权还给 AI**，并**把 AI 的眼睛还回来**。

---

## 六、推荐方向（本阶段仅记录，不实施）

用户已选定**"结构化优先 + freeform 不再羞辱"**。据此，后续若实施，方向为：

1. **止血（correctness）**：inline 泄漏字段改走 `inlineMd`；演示态隐藏构建/调试 chrome（`#overallTxt`、reveal slideNumber/progress）；章节数字降权；schema/enums 与 skill 合约同步。
2. **还眼睛（feedback loop）**：把归档的真机 Playwright verifier 接回流水线，形成 **render→截图→评审→回炉**；溢出页真的走"拆页/精简"而非裁切；给模型真实高度/密度预算信号。
3. **还结构设计权（design authority，结构化优先）**：为树/DAG/流程新增**带 `from/to` 边的一等图块** + 真 SVG 分层图渲染器；同时把 `freeform` **去污名化**（去掉 `⚠` 框、限 token 配色不变）作为长尾兜底。这样既保住"schema 即接口"的可靠性，又在图解上把结构设计权还给 AI。

---

## 七、Kimi 症状 → 根因归属速查

- 正文整片缺失 / 空占位框残骸 → **环节**（无渲染校验兜底，pending/error 块未回炉）
- 图解组件缺失、树像叠盘子、箭头悬空、字符画、决策树乱穿 → **渲染器无树/图能力** + **schema 无边字段** + **环节不路由自绘**（= design 被剥夺）
- LaTeX/Markdown 记号泄漏 → **渲染器**（escapeHtml 字段绕过 inlineMd）
- 调试信息 `87/87 block`、页码/章节号矛盾 → **渲染器/外壳**（演示态未分离、章节计数器）
- 溢出裁切、密度失控、两极分化 → **环节**（无高度预算 + 无溢出回炉）+ **渲染器**（zoom 下限静默裁切）
- 字号/对比度/网格/中西混排/图标语义 → **主题字阶设计 + 渲染器细节**（次要，主题大盘协调）

---

## 交付方式

本报告即交付物。经确认后，建议将其落盘为 `docs/deck-workflow-diagnosis-2026-07-30.md`（与 Kimi 的视觉评审并列），作为后续分阶段实施的依据。**本阶段不改动任何生成/渲染/schema 代码。**
