# 设计取经：博物馆展陈 · Swiss/编辑排版 · 信息设计 → 讲义引擎可移植机制

> 2026-07-12，3 份 web-access 调研的去重综合。一手来源以加拿大人权博物馆(CMHR)图形标准、
> 英国 MDSE / Smithsonian / British Museum 展陈规范、Müller-Brockmann 栅格、Tufte《Envisioning Information》、
> Bringhurst 排版为准。移植目标：reveal.js 1280×720、离线零依赖、确定性渲染、缺字段不崩、不 mock。
> 每条标注落点：① blockRenderers ② sceneLayouts ③ 主题 token / 基础层。
>
> **三份报告一致把"分层字阶 + 克制调色/留白"列为最高 ROI、最先做。**
>
> **命名**：本文件的 T 编号只作 provenance。把任一机制并入系统时，按 `NAMING.md` 起朴素本地 id + 中文显示名（如 marginalia→`sidenote`旁注、tombstone→`specimen`展品标签），别把 T 号或外来术语当暴露名。见 NAMING.md §5 词表。

## 落地优先级（三报告共识）
1. **A/F — token 基础层**（改几个变量、提升最大、最快去 AI 味）：分层字阶、8px 基线与模数间距、正文行宽、左对齐、单一 accent、发丝线、留白分隔、禁阴影/渐变/emoji 标题。
2. **C/pullquote — 新块/块升级**：label(文物墓碑式) / quote(引文面板) / pullquote / callout 重构 / caption 结构化 / section 巨号 / 内联 SVG 图标集。
3. **B/D/E — 版式增强（复用 split/index）**：12 列栅格、figure+context 并置、对齐对比表、timeline 方向自适应、旁注侧栏、Tufte 前景/背景分层。

---

## Tier 1 · token / 基础层（= 工作流 A 排版 + F 克制装饰）

| # | 机制 | 关键量化参数 | 落点 |
|---|---|---|---|
| T1 | **离散模数字阶**：字号从基准×固定比率生成，取 6 级写死；编辑 1.333/1.5，密集 1.25 | 基准 18–20 → `18/24/32/42/56/75`；`--fs-caption/body/lead/h2/h1/hero` | ③ token |
| T2 | **对比度本身也分层**：入口级"标题∶正文"≈3–5×炸裂，细节级≈1.25×近齐平 | hero 2.5–5× / primary 5× / caption 1.25× | ③+① |
| T3 | **8px 基线节奏 + 模数间距刻度**：行高、块距、图高皆 8 的整数倍；间距只从刻度取 | `--base:8px`；`--s1..s5 = 8/16/24/32/48/64`；正文 leading=3×base=24px | ③+① |
| T4 | **非均匀节奏留白**：留白是主动控速结构，不是等 padding | `--gap-rest`(section/quote 前后 48–64) vs `--gap-tight`(组内 8–16) | ② + ① |
| T5 | **正文行宽 = 字符数控制**：45–75 CPL、66 最佳；中文 30–38 字 | `max-width: min(66ch,100%)`；`--measure` | ① |
| T6 | **左对齐齐头散尾为默认**：不居中、不两端对齐；居中仅 cover/section 例外 | 全局 `text-align:left` 兜底 | 基础层 |
| T7 | **单一 accent + 墨 + 纸 三色**：accent 只点 kicker/竖线/关键数字/线，禁大面积；同屏唯一满饱和实心块=入口点 | 调色板 ≤3 色；`--accent/--ink/纸底` | ③ |
| T8 | **发丝线 + 留白分隔，少画线**：要线则细、低对比、对齐网格；Tufte 1+1=3 多余线生噪 | `--line` = 1px `--ink`@~15%；块距 32–48 代替线 | ③+① |
| T9 | **衬线×无衬线配对，角色固定**：标题/正文分族靠结构差造层级；x-height 相近；禁第三族 | `--serif`(hero/section 标题) × `--sans`(正文/caption) | ③ |
| T10 | **三维度对比造层级**：只用 字号级差 × 字重(400/700/900) × 空间；禁下划线/阴影/多色 | 每块预设 (级, 重, margin) 三元组；kicker 小号大写 `letter-spacing:.08em` | ① |
| T11 | **禁 AI 味装饰**：无渐变、无投影、无 emoji 当标题、无 feature pills；图标克制且统一 | 红线级约束 | 基础层 |

## Tier 2 · 新块 / 块升级（= 工作流 C + pull quote）

| # | 机制 | 结构 | 落点 |
|---|---|---|---|
| T12 | **pullquote / quote 引文面板**：抽一句放大旁置；少字大面积+衬线+署名；每页≤2 | `border-left:4px accent` + 斜体 h2/h3 级 + `cite` 右对齐 caption 级 | 新 ① block |
| T13 | **label / 墓碑式文物标签**：元数据块(斜体 caption) + 解读段(正体正文) | `meta`[键值] + 可选 `body`；字段缺则跳过 | ① (figure 变体) |
| T14 | **callout 重构**：左竖条定调 + 极淡底纹 + 语义色；仅"无法融入正文"时用，每屏≤1–2 | `border-left:4px` + `color-mix(accent 8%,transparent)` + `radius:4px`；type→语义色 | ① 重构 |
| T15 | **caption 一等公民 + 论点句优先**：图注写"为何重要"非"这是什么"；首句加重，后续降级 | `{text, credit}`；前缀 `Fig N` 加粗、说明 caption 级 `opacity:.8` | ① 统一 caption 渲染器 |
| T16 | **section 巨号升级**：巨型低饱和/描边章节号作视觉锚，与标题错位 | 加 `index` 字段，`--fs-hero`+ 描边巨号叠放；缺则退纯标题 | ② 升级(iter57) |
| T17 | **自建内联 SVG 图标集**：6–10 个线性图标，仅用于 callout 类型/timeline 节点/状态；宁缺勿滥 | `stroke:currentColor;stroke-width:1.5;24×24;fill:none`；标题默认不配图标 | ① 新原语 |

## Tier 3 · 版式增强（= 工作流 B/D/E，多复用 split/index）

| # | 机制 | 关键参数 | 落点 |
|---|---|---|---|
| T18 | **12 列模数栅格**：块声明整数列线号，不写像素宽；非对称占格打破对称 | `repeat(12,1fr)` + `gap:--gutter`；缺 span→`1/-1` | ② 底层 |
| T19 | **非对称构图**：内容偏置非居中 | `grid-template-columns:1fr 8fr 3fr` 之类 | ② |
| T20 | **figure + context 并置**：图与"讲图的话"同屏、自足、互不索引 | split：图 55–65% + context 文本 35–45%；单侧缺则塌成全宽 | ② (split) |
| T21 | **对齐对比表**：跨项比同一属性→属性对齐成列供纵扫；卡片仅用于视觉浏览 | compare/table：共享行标签、同属性同行、缺值补占位、差异格 accent 淡底；`mode:table|cards` | ① |
| T22 | **timeline 方向自适应**：≤10 项横排、多/分支纵排；统一节点符号 + 节奏间距 | 节点数阈值切向；gap 桌面 40px；节点=8–10px SVG 圆填 accent，轴=`--line` | ① |
| T23 | **旁注 / 语境面板**：深读内容退窄侧栏、低对比、白空间分隔 | split 侧栏 30–35%、caption 级、`--ink` 降透明度 | ② (split) |
| T24 | **Tufte 前景/背景分层**：主数据高对比前景，脚手架(轴/网格/次注)压低对比背景 | 脚手架统一 `--line` 或 `opacity:.4–.6`；small multiples 可作新 layout | ① 通用 |

## 内容侧约束（生成 prompt / 校验软告警）
- **每级绑字数上限**（25% 收敛法则）：caption 10–30 词、解释 30–80 词、导言 ≤150 词；写完砍一半再砍一半。→ validate.mjs 软告警（超限不崩）。
- **渐进披露 ≤3 级**：每 scene 一条主命题（hero/lead 大字承载），其余降级为 caption/旁注/callout；靠视觉重量而非交互折叠（离线静态）。
- **图注/标签写判断句**：不写"图1:架构图"，写"为什么这张图重要"。

## 关键来源（一手优先）
- CMHR 展陈文字层级与可读性规范（6 级 + 字号/字数/视高，最硬量化） https://id.humanrights.ca/graphic-standards-for-exhibits/text-hierarchy-and-readability/
- Smithsonian Guide to Interpretive Writing / British Museum Interpretation Guidelines / MDSE Labelling Guidelines
- Müller-Brockmann《Grid Systems》；International Typographic Style (Wikipedia)；maxsoweski/claude-design-skills（12列/8px/单accent 可编码参数）
- Bringhurst 45–75 CPL；模数 type scale 比率 (cieden / A List Apart)
- Tufte《Envisioning Information》(layering & separation / micro-macro / small multiples)
- Pull quote (Wikipedia/CreativePro/Smashing)；serif×sans 配对；admonition/callout 规范 (MarkdownTools)
- 对比：Cards vs Tables (Smart Interface Design / UX Movement)；timeline (Infogram/Venngage)；引线标注 (arXiv 1902.01454)；progressive disclosure (LogRocket)
