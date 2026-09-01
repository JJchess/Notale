# Workflow Skills 学习计划

更新时间：2026-08-31

这是一份持续修订的研究与决策文档，用来对齐三个视觉/交互主体系及独立代码执行路由的边界、reference、sample 和测试方法。它不是 Agent 运行时 reference，不应被自动加载进构建上下文。

## 2026-09-01 生产接线 checkpoint

- Planner 四个标签现已一一对应 `build-cover / build-page / build-interaction / build-code`；代码仍属于学习交互体系，但因 `CodeScaffold` 和受保护多文件运行时而独立路由。
- `SKILL.md` 随路由直接进入 system，第一轮由 Agent 使用原生并行 `Read` 读取唯一 reference 和一个 Main；默认不注册 Aux/mini，没有 `WorkflowContext`、`Skill` 选择工具或字符数字段。
- 完整 sample 原件保留在各 workflow 的 `samples/`；Agent 读取 `samples/bundles/` 下的生成上下文版本。bundle 保留文件边界与 HTML/JS/算法/状态，只剥离独立 CSS 和 HTML 内联 `<style>`。
- Planner 单次调用、单次校验，不设最少页数/字符数/规则数，不重试、不复用旧 run，也不生成空 HTML 骨架。
- Builder 工具面从第一轮到结束保持不变，effort 不分阶段；模型停止调用工具即结束。产物存在性与一次独立审计分开记录，不再有首次 Write、重复 Write、Check clean 或停止确认闸门。
- 当前可执行测试计划以 `EVAL_PLAN.md` 为准；下面 2026-08-31 及更早 checkpoint 保留研究演进记录，冲突处均由本节覆盖。

## 2026-08-31 测试接口 checkpoint

- 当时的三个 `SKILL.md` 已收敛为标签路由、唯一 reference 选择、sample catalog 和执行交接；代码路由后来按上方 2026-09-01 checkpoint 独立。
- Planner-shaped fixture 是完整 16 页 deck，但每份 `pNN.md` 只保留 `# page-NN [标签]` 与一句主题级意图。Planner 不替 Builder 规定变量、控件、布局、renderer 或交互机制。
- 运行时上下文默认固定为“一份 reference + 一份 full 主 sample”。mini 与 catalog 保留，只有 Builder 显式 `--aux-samples` 时才作为对照臂注册，并在 manifest 留痕。
- 每个 sample 在生成 bundle 中独立用 XML 包裹并保留真实相对文件路径；由原生 `Read` 直接加载，不加行号、不跨类别、不拼接 reference。
- `build-code` 一次加载四份 compact author layer 组成的 `code-core-bundle`；`interaction/3d` 当前没有批准 sample。
- 新实验器位于 `experiments/codex-workflow-skills-next/`，提供 3 套 Planner fixture、9 类覆盖、52-run 消融矩阵、隔离 Codex workspace、读取审计、渲染 selfcheck 和盲评页。
- 原生 Codex sandbox 不能稳定启动 Chromium；实验器因此增加 host-side `workflow-check` broker。Agent 在隔离 workspace 内发起 Builder Check，harness 在外侧执行真实 Chromium 检查并回传结果，interaction 至少要用 `--after` 覆盖一个改变后的状态。
- Agent 运行时真正需要的内容限定在各 `build-*` 目录中的 `SKILL.md`、`agents/`、`references/`、显式 catalog、sample author source/必要素材，以及 code template 生成器；未列入 catalog 的审计、截图、来源记录和淘汰材料不由 loader 注入。

## 2026-08-31 实施 checkpoint

- 23 份正式页面 sample 已按 `skill → category` 归位到生产 `workflows/build-*/samples/`；四份 code author-layer sample 位于 `workflows/build-code/samples/code`。
- 审计 staging、review 记录和两个早期源 sample 与运行时 sample 分离，统一放在 `sample-workbench/{improve,mini,review,sources}`。原公共 `samples/` 和更早的 `experiments/samples/` 均已移除，整个集合仍可从 `experiments/workflow-skills-next/` 单目录迁移。
- 23 份页面 full 均已具备 `sample-workbench/improve/<category>/<sample>/{baseline,candidate,report.json}` 审计记录；独立复核达到 23/23，并在用户整体确认后全部晋级 formal archive。
- `http://127.0.0.1:41031/sample-workbench/improve/` 提供固定 1600×900 的 baseline/candidate 对照；`sample-workbench/improve/verify.py --base-url http://127.0.0.1:41031` 当前结果为 inventory 23、pass 23、failures 0。
- 当前页面 mini 归档为 19 份 promoted、3 份 already-under-10k、1 份 full-only；`climate-zones-title`（9,660）、`lenna-pixel-field`（6,896）和 `telescope-zoom`（9,994）直接承担辅助样例角色，不重复制作 mini。
- `code` 的四份课程 author-layer sample 不重复携带固定 template，也不制作 mini；四份核心代码可以与 `code` reference 一起进入上下文，以多种算法结构降低对单一样例的过拟合。
- 19 份获批 mini 已晋级到 `<category>/<sample>/mini/pages/`：author layer 合计 188,608 字符，相对对应 full 的 463,244 字符减少 59.3%；正式树与获批 candidate 逐文件一致，19×3 浏览器矩阵为 57/57 通过。
- 三份 already-under-10k full 已另行通过 author inventory、去 AI 味规则和 9 个浏览器档位的 exemption audit；22 份可用于辅助位的实现合计 215,158 字符，比它们对应的 489,794 字符 full 集合减少 56.1%。
- `future-climate-analogy` 的 full 仍保留为正式主样例；其 mini 因视觉质量未达到用户要求而被拒绝，不得进入辅助 sample 上下文。`sample-workbench/mini/` 只保留该候选用于审计追溯。
- `http://127.0.0.1:41031/sample-workbench/mini/` 提供 full/正式 mini 并排预览；严格 verifier、正式路径浏览器矩阵和专项测试均已建立。旧实验器不修改，新一代隔离 harness 单独建立在 `experiments/codex-workflow-skills-next/`。

## 目标

构建三个能被 code agent 稳定执行的 workflow skill：

- `build-cover`：当前目录名；负责标题页、封面和背景视觉。用户概念中的名称是 `build-background`，最终命名仍待确认。
- `build-page`：构建由作者编排、以主张和证据关系为核心的页面。
- `build-interaction`：构建有学习意义的互动页面；学习者动作必须改变模型状态和可见证据。

当前研究重点不是增加 skill 数量，而是提高 reference 的有效性，尤其是最终页面的视觉吸引力、构图完成度和学习有效性。

## 已确认的总原则

### 1. 只保留三个主 skill

- 不测试或继续建设 `get-photo-ref`、`get-illustration`。
- chart、2D、3D、simulation、learning game 等不独立成为顶层 workflow。
- `web-artifacts-builder` 不进入候选，它解决工程脚手架交付，不解决学习设计或视觉构图。

### 2. 研究 skill 有效性，不追求完整复制 Builder 上下文

- Codex 实验环境应对齐任务、chassis、theme、可用依赖和交付约束。
- 不需要携带真实 Builder 的全部历史上下文；过多上下文可能稀释 skill 信号。
- 测试应尽量隔离 reference 本身造成的行为变化。

### 3. Theme CSS 负责视觉主题

Theme CSS 负责：

- 色板和语义色；
- 字体家族和基础 type roles；
- 圆角、边框、阴影和基础控件皮肤；
- 产品级通用视觉身份。

三个构建 reference 不重复建立硬编码 palette、字体栈或组件主题，也不移植 GenerativeUI 的八套 aesthetic directions。Reference 只需规定如何使用现有 theme，以及题目特有的场景、图形语言、构图和运动方式。

### 4. 去 AI 味由三个 scrub workflow 负责

- `workflows/scrub-copy-slop.md`
- `workflows/scrub-theme-slop.md`
- `workflows/scrub-visual-slop.md`

构建 reference 不重复放置反面教材和 anti-slop 清单。已发现的缺口应回补 scrub workflow：

- copy：重复用户请求的自我介绍式标题、双语标签、instruction pill；
- visual：把阶段或状态做成 KPI、异质内容组成同款等宽卡片行。

去除坏模式不等于主动创造好设计；正向视觉生成仍由三个构建 skill 负责。

### 5. Reference 只写会改变 Agent 决策的内容

- 不写研究过程、来源介绍、许可说明和泛泛设计理念。
- 不写“设计要精美”“保持清晰”这类无法执行的要求。
- 优先写适用条件、设计决定、可观察结果和失败后的修正方式。
- 不重复 theme、scrub、chassis 或其他层已经可靠提供的规则。
- 使用渐进披露，只加载当前任务真正需要的 reference 和 sample。

### 6. 类别单选，Reference 不拼接

- `SKILL.md` 只负责根据主导媒介、证据结构和运行架构选出一个类别；
- 每次构建只加载该类别的一份完整 reference，不先加载 `general.md`，也不叠加第二份专项 reference；
- 每份类别 reference 必须自包含完成当前任务所需的构图、motion、状态、实现和验证规则；
- 共同原则按类别语境分别改写，允许少量受控重复，不通过 shared/general reference 继承；
- 一个页面同时含有多种媒介时，按承担主要证据和主要实现风险的媒介选唯一类别，其余元素由该 reference 内的完整页面合同约束；
- 不在运行时拼装 fragment、章节或多个 reference。研究阶段可以从多份来源吸收，但交付给 Agent 的文档必须是单一、稳定、无条件分支的整体。

## 从 GenerativeUI 学习什么

研究对象：`/data1/home/zhuyifan/ws2/Notale/refs/GenerativeUI/agent`

GenerativeUI 外部实现较复杂，但生成 Agent 真正感知的是拼装后的 guideline/reference 和一份匹配的完整 sample。我们学习的是这套 Agent 可感知材料的写法，而不是它的外部工具架构。

### 八份 generated guideline 的去重结论

八份顶层 guideline 都由共享 `CORE` 加条件模块拼装而成，不能把它们当作八套互不相关的方法，也不能按 336 KB 的 generated 总量重复吸收：

- `CORE.md` 是所有文档共享的设计、构图、微交互和宿主技术基础；
- `interactive.md` 是 CORE + UI 结构 + 物理/电解 Canvas recipe + palette + scenery；
- `mockup.md` 是 CORE + UI 结构 + palette；
- `chart.md` 与 `chart_interactive.md` 字节级相同，没有独立的“互动 chart”知识；
- `art.md` 是 CORE + SVG 基础 + art/scenery；
- `art_interactive.md` 是 art 模块和 UI 模块的并集，不代表新的顶层类别；
- `diagram.md` 是 CORE + palette + SVG 基础 + diagram types，是独有内容最多的一份。

吸收时以 source fragment 中唯一、可迁移的机制为单位；generated 文件只用于确认 Agent 最终会看到怎样的组合。

### 八份 guideline 的吸收映射

| Guideline | 有用的独有机制 | 进入哪里 | 不原样复制 |
|---|---|---|---|
| `CORE` | 主导关系、stage/evidence integration、布局选择、变化反馈、初始画面、通用几何与溢出检查 | 按职责改写进每份独立类别 reference；不建立共享运行时文档 | aesthetic palette、anti-slop、宿主 API、固定 widget 尺寸 |
| `interactive` | 舞台即界面、控件—状态—证据邻接、物理世界使用统一 render surface/坐标系、实时读数和因果反馈 | `build-interaction/general.md` | metric-card UI、产品 mockup、原始小 widget 布局 |
| `mockup` | 区分“完整页面”和“页面中的有边界对象”；被展示对象需要明确承载环境，不应悬空 | `build-page/general.md` 的 bounded-object 情形 | 把产品 UI、表单、账户记录扩成独立分类 |
| `chart` | canvas 尺寸、标签防裁切、直接 legend/数值、number formatting、初始状态无需 hover、resize/dispose | `build-page/chart.md`；互动时作为 `general` 的证据 renderer | dashboard 默认结构、固定 Chart.js 主题 |
| `chart_interactive` | 无新增内容；证明 chart 是否互动应由 page/interaction 状态合同决定 | 研究时去重；分别写入 `build-page/chart.md` 或 `build-interaction/general.md`，运行时不跨 skill 复用 | 重复文档和重复路由 |
| `art` | subject geometry、背景/中景/前景分层、重复形成纹理、连续物理属性才使用渐变、signature detail | `build-cover` 为主；页面和互动场景吸收必要部分 | 固定 palette、把“填满画布”当作所有页面通则 |
| `art_interactive` | art scene 与 interaction state 可以正交组合；视觉世界和操作逻辑都必须完整 | `build-interaction/general.md` | 新建 `art-interactive` 类别，或只给装饰画面加控件 |
| `diagram` | 按意图而非名词选图；reference/intuition 区分；flow/structure/illustrative；draw the mechanism；label/arrow/packing 校验；复杂内容拆页 | `build-page/general.md`；有真实操作时进入 `build-interaction/general.md` | 680px、预置 class、`sendPrompt`、Mermaid 初始化等宿主实现 |

### 必须完整吸收的唯一机制

1. **按意图选择表现，而不是按题目名选择媒介**
   - “组成/架构/位置”需要 reference or structural representation；
   - “如何工作/为什么发生”优先机制图、截面、空间隐喻或可操作场景；
   - “步骤/因果链”使用有稳定身份的路径或 authored sequence；
   - “数量/趋势/分布”先写 reader question 和 encoding，再选择 chart；
   - 同一个名词可以因提问动词不同而采用完全不同的页面。

2. **Reference diagram 与 intuition diagram 分工**
   - Reference diagram 用精确标签、连接、包含和顺序建立可指认地图；
   - Intuition diagram 通过简化物体、截面或空间隐喻直接画出机制；
   - 不能把两种语言混成既像流程图又像插画的中间物；
   - 如果真实系统有一个会改变机制的控制，可转为 `build-interaction`，但静态页仍必须先有完整决定性视图。

3. **Diagram 的可计算构图**
   - 根据最长真实标签计算盒宽和文字区域，不靠目测；
   - 在放置连接线前检查与每个对象和标签的交叉；
   - 先计算层级总宽、间距、容器 padding 和 annotation margin；
   - 复杂主题先数实体与关系，超出画面容量就拆成 overview + detail，而不是压缩字号；
   - cycle 只有在环形空间本身表达机制时才画环，否则使用线性路径、返回关系或 authored sequence；
   - callout 集中在一侧的安静区域，leader 明确指向目标。

4. **Draw the mechanism, not a diagram about it**
   - 物理题目使用可识别的功能部件、截面、流向和状态区域；
   - 抽象题目创造能暴露机制的空间隐喻，而不是给抽象名词配图标；
   - silhouette、部件身份和空间关系优先于轮廓精度；
   - 颜色只通过 theme token 承担 category、intensity、state 或 physical property，不能按步骤轮流着色；
   - label 用来确认对象，不能代替图形本身表达机制。

5. **Art/scenery 的正向构建能力**
   - 视觉内容按背景场、主结构、前景细节分层，各层承担不同角色和更新频率；
   - texture 来自重复、hatching、粒子或生成规律，不依赖模糊滤镜堆效果；
   - ridgeline、branch、blob、field、particle 等 recipe 只有在对应题目材料或机制时使用；
   - 使用一个题目相关的 signature visual，不把通用 glow、gradient 或 noise 当完成度。

6. **Chart 是证据，不是页面模式**
   - 先定义 reader question、字段—视觉通道、单位、domain、baseline、missing/uncertainty；
   - 初始视图已经回答一个问题，hover 只补充信息；
   - annotation、legend、DOM evidence 和 chart marks 使用同一数据与格式；
   - 互动 chart 是否属于 `build-page` 或 `build-interaction`，取决于输入是否改变模型和学习后果，而不是是否有 filter/hover。

7. **实现 recipe 必须保留可迁移的不变量**
   - 一个 canonical state 驱动 DOM、SVG、Canvas、Chart 或 3D；
   - 一个视觉世界尽量共享逻辑坐标、resize 路径和 renderer lifecycle；
   - 文字、标注和 accessible evidence 不被困在像素或 mesh 内；
   - 初始化一次，更新现有实例，reset 从初始快照重建，teardown 停止 loop/observer/listener 并释放资源；
   - exact library API 只有与 Notale chassis 一致时才进入最终 reference。

### 值得吸收

1. **把抽象质量要求改写成可执行决定**
   - 先确定页面主角、空间结构、图形语言、运动行为和 signature mechanism。
   - 让 Agent 选择一种完整构图，而不是任意组合组件。

2. **一个明确的主导关系**
   - Widget 中的“one dominant element”需要改写为页面中的主张—证据、操作—后果或主视觉关系。
   - 辅助信息在面积、对比、位置和运动上从属于主导关系。

3. **让证据成为页面结构**
   - 标签靠近对象；数值靠近产生它的证据；结论靠近支持它的关系。
   - 控件靠近被操纵变量，反馈进入原场景，不建立外围卡片柜。
   - 优先用对齐、共享基线、路径、嵌套、比例和空间位置表达关系。

4. **具体的构图和实现 recipe**
   - 明确什么时候选择哪种页面结构。
   - 对 Canvas、SVG、DOM、图表、粒子和 3D 场景给出足够具体的组合方式和常见故障修复。
   - 规则必须落到 Agent 能直接写出的结构，而不仅是设计原则。

5. **有生命的初始画面**
   - 静态页首次呈现就能看到决定性证据。
   - 互动页初始状态已可观察、可操作，不是空白舞台或等待点击开始。
   - 动效呈现状态、因果、流动和阅读顺序，不作为统一装饰。

6. **对象级视觉完成度**
   - 可点击、拖动、选择和变化的对象具有可感知反馈。
   - 变化通过 trace、flash、count、ghost、shared baseline 或过渡保持可追踪。
   - 页面具有一个与题目机制相关、可被记住的 signature visual/interaction。

7. **完整 vertical-slice sample**
   - Sample 同时展示真实内容、完整构图、theme 使用、状态、交互、运动和交付完成度。
   - Sample 的作用是给出完成度标尺，而不是提供可复制的题目答案。
   - 目标题目不必和 sample 相同，但结构和交互机制必须可迁移。
   - 主 sample 加载最相关的一份完整实现；为降低对主样例的过拟合，可再加载少量不同机制的辅助 mini，而不是把完整样例库全部注入上下文。

### 不吸收

- 八套硬编码 aesthetic direction 的 palette、font、surface 和通用 component kit；
- GenerativeUI 的宿主 API、iframe、CSP 和专用 CSS variables；
- 与当前任务无关的模块和大而全 guideline bundle；
- anti-AI 反例清单；
- 把小型 inline widget 的布局规则原样套到完整页面；
- 不满足学习有效性、可访问性或实际 chassis 约束的 sample 实现细节。

### GenerativeUI 现有 sample 的研究定位

GenerativeUI 按 aesthetic direction 选择以下八份样例：

- `lab-dark`：阻尼摆实验；
- `paper-editorial`：诗歌翻页；
- `studio-pop`：颜色混合器；
- `terminal-data`：KPI 数据面板；
- `soft-organic`：呼吸练习；
- `blueprint`：杠杆实验；
- `ink-wash`：水墨夜景生成器；
- `host-calm`：账户记录与筛选组件。

排序算法不是完整 sample，只是 use-case 文案。电解食盐水也不是完整 sample，只有一段 Canvas-first 实现 recipe。

这八份现有 sample 和 `diagram-types.md` 内的长例子只用于反推 guideline 如何驱动实现；它们的题目、完成度和小 widget 架构均不满足我们的目标，不作为新 skill 的 sample 候选，也不会被复制进正式样例库。后续实际样例按类别保存在各自 `build-*/samples/<category>/`。

## Reference 的写作格式

每一条重要 guideline 尽量回答四件事：

1. **Condition**：什么内容关系或任务状态下适用？
2. **Decision**：Agent 应做出什么设计或实现选择？
3. **Invariant**：最终画面必须能观察到什么？
4. **Repair**：如果不成立，应当如何改构图或状态，而不是只报告失败？

每份 reference 是一个类别的完整决策文档，不能要求 Agent 再读取另一份 reference 才能完成页面。`SKILL.md` 在加载前完成单选，类别 reference 内不再放“再去读取 general/chart/3d”的二次路由。

完整 sample 单独保存，并归属于一个明确类别。Sample 中只保留可迁移的实现，不把上游项目的宿主约束和固定视觉主题带入 Notale。

## `build-cover` 学习计划

### 职责边界

构建标题页、封面和背景视觉。它可以使用静态图形、motion、Canvas、SVG 或 p5.js 算法艺术，但不承担正文解释和学习交互。

### 需要学会

- 从题目提取一个可视化母题，而不是使用无语义装饰背景；
- 一个主视觉焦点和稳定的标题安全区；
- 标题、署名或副信息与背景的前后景关系；
- 背景、中景、前景的深度和裁切策略；
- 算法艺术如何围绕主题参数、种子和构图生成，而不是展示随机技术效果；
- motion 如何建立氛围、空间或节奏，同时保持标题可读；
- 在实际 Notale 画布和投影条件下维持对比、焦点和裁切。

### 单选 Reference 规则

`build-cover` 也不拼接 reference。当前三类按主导构造方式单选：

- `composition.md`：排版、图像/图形构图和静态主视觉承担封面身份；可以包含必要 motion，但不读取 `motion.md`；
- `motion.md`：时间编排本身承担封面身份和视觉记忆；文档内自带标题安全区、构图与降级规则；
- `generative.md`：p5/Canvas/SVG 的算法系统承担主视觉；文档内自带构图、标题关系、motion 和 lifecycle 规则。

每次只加载其中一份。若未来发现类别边界需要调整，直接重写类别文档，不通过同时加载两份来补能力。

### Sample 状态

- cover full sample 保存在 `build-cover/samples/{composition,generative,motion}/`，不塞进 reference 文档；
- 每份 sample 归属唯一类别，并完成职责匹配、可迁移性、宿主耦合、输入和 lifecycle 审查；
- full 的 readable-compact 候选先进入 `sample-workbench/improve/`，review 后才允许晋级；
- GenerativeUI 的八份旧 sample 仍只作为研究材料，不进入正式样例库。

## `build-page` 学习计划

### 职责边界

构建由作者编排、首次呈现即可理解主要证据关系的页面。这里的“静态”只表示学习者不会通过输入改变学习模型，并不表示页面没有动画；HTML 特有的 transition、reveal、scroll/step progression、对象变形和时间编排都是默认页面能力。如果理解依赖学习者改变模型状态并观察不同结果，则路由到 `build-interaction`。

### 需要学会

- 从 audience、claim、evidence 和 page job 出发，而不是从组件出发；
- 为比较、顺序/因果、分类、一般化、部分—整体、空间关系和单焦点选择适当页面结构；
- 让主证据区域明显占优，辅助说明不挤压证据；
- 用对齐、共享尺度、路径、嵌套和空间位置表达真实关系；
- 将注释、单位、图例和结论放在对应证据附近；
- 使用留白、基线和面积建立层级，边框和卡片仅用于必要分组；
- motion 建立入场层级、阅读顺序、对象对应、状态显现、连续变化和适度的场景生命感；
- 在实际画布中验证中文长度、窄区域、投影可读性和证据完整性。

### 从 Widget 规则到页面规则的改造

- “one dominant stage”改为“一页一个主导主张—证据关系”；
- “visualization is the interface”改为“证据就是页面结构”；
- “stage + readout row”不原样复制，改为适合页面的焦点证据、比较基线、序列路径、对象—注释场等结构；
- “first paint is mid-action”在静态页改为“首次呈现已经包含决定性证据”。

### 静态页面 reference 的精简结论

现有 `build-page` 把三种不同维度放在同一级路由：

- `composition` 是默认页面构造方法；
- `sequence` 是时间与阅读顺序；
- `chart`、`2d`、`3d` 是证据媒介。

这会让 Agent 误以为它们是互斥页面类型，也会造成 `composition.md`、`sequence.md` 与 `2d.md` 分别描述本应共同设计的构图、时间、坐标、图层和渲染。motion 会广泛存在于普通 HTML 页面中，因此不能作为单独类别；计划把 composition、普通 2D 和 authored motion 全部合入 `general` 类别：

```text
build-page/
├── SKILL.md
└── references/
    ├── general.md
    ├── chart.md
    └── 3d.md
```

路由是严格三选一：

1. `general.md`：主证据不是统计图表或 3D 空间；覆盖普通 HTML/SVG/Canvas/p5/Pixi 页面、机制图、插画式解释和 authored motion；
2. `chart.md`：定量 encoding、尺度、趋势、分布或不确定性承担主要证据；
3. `3d.md`：深度、视点、遮挡或空间结构承担主要证据。

选中 `chart.md` 或 `3d.md` 时不再加载 `general.md`。两份专项 reference 必须各自包含适用于该类别的页面构图、motion、首次呈现、文字证据、可访问性和交付验证，不能把这些能力当作来自 `general.md` 的前置条件。

不再建立独立的 `sequence`、`2d`、`diagram`、`art` 或 `mockup` 页面类别：

- authored sequence 是 `general.md` 的 motion 章节：由命名状态、解释节拍和状态间过渡组成；
- 普通 2D 是页面默认能力，吸收到 `general.md`；
- diagram 是关系表达方法，按 reference/intuition 和题目意图进入 `general.md`；
- art/scenery 是 subject-specific visual language，同样进入 `general.md`；
- bounded mockup 只是“页面内有边界对象”的构图情形，不值得独立路由。

第一版已经完成合并：旧 `composition.md`、`sequence.md` 和 `2d.md` 的有效内容进入 `general.md`，随后删除旧文件。`chart.md` 与 `3d.md` 分别补齐独立页面合同，不依赖 `general.md`。

### `general.md` 的目标内容

- audience、page job、claim、evidence 和首次呈现合同；
- compare、sequence/causality、classification、generalization、part—whole、spatial、single-focus 等关系构图；
- reference diagram 与 intuition diagram 的选择，以及“draw the mechanism”原则；
- 标签宽度、盒宽、层级 packing、连线避让、callout、画面容量和 overview/detail 拆分；
- subject geometry、背景/中景/前景、纹理与 signature visual；
- motion 作为页面语言：入场建立层级，transition 保持对象身份，变形揭示对应关系，timeline 编排解释节拍，克制的环境运动让场景保持生命感；
- 为多阶段过程定义命名状态和稳定终态；简单过渡使用 CSS/Web Animations，多对象编排可使用 GSAP timeline，但不把库写成页面分类；
- autoplay、step/replay/reset、打断与重复播放保持确定性；`prefers-reduced-motion` 下直接呈现等价终态和全部证据；
- 区分 authored playhead 与 learner-controlled model：前者仍属于 page，后者进入 interaction；
- HTML、SVG、Canvas、p5、Pixi 等普通 2D renderer 的选择，不建立媒介导向的页面类型；
- canonical scene/state、逻辑坐标、resize、文字证据、renderer lifecycle 和 teardown；
- bounded object 的承载环境，以及页面与被展示对象的边界；
- actual canvas、中文长度、单位、投影可读性和 decisive first view 的验证与 repair。

motion 是每个页面都要主动考虑的设计维度，但不要求每个元素都运动；它既可以解释关系，也可以让主场景具有 HTML 页面应有的呼吸和活性，但不能形成与证据争夺注意力的无关运动。`general.md` 不以短为目标，也不重复 theme/scrub/chassis；合入 sequence 后预计需要约 8,000–11,000 个中文字符，最终以覆盖度而不是字数验收。

### `chart.md` 的独立合同

`chart.md` 不是加载在 `general.md` 之后的技术补丁。它必须独立覆盖：

- page job、reader question、主张—证据构图和 decisive first view；
- 字段到视觉通道、尺度、单位、baseline、domain、missing 和 uncertainty；
- chart marks、annotation、legend、DOM evidence 和结论的空间整合；
- 入场、数据状态切换、比较追踪和 reduced-motion；
- renderer sizing、中文标签、number formatting、resize、update、reset 和 teardown；
- 在实际 Notale 画布中的投影可读性、统计真实性和 failure repair。

### `3d.md` 的独立合同

`3d.md` 同样不是附加渲染章节。它必须独立覆盖：

- page job、主张—证据构图、为何深度必要以及首次视图；
- semantic model、对象身份、空间参照、命名视点、相机、光照和材质；
- DOM 标注/证据与 mesh 的同步，以及必要的 2D fallback；
- authored camera/object motion、稳定终态、reduced-motion 和 replay/reset；
- resize、性能预算、renderer lifecycle、资源释放和 failure repair。

### Sample 状态

- page full sample 保存在 `build-page/samples/{general,chart,3d}/`；
- 它们是完整 Notale 页面，不是孤立 widget，并按页面关系与实现架构归类，不按视觉主题匹配；
- readable-compact 候选和验证证据保存在 `sample-workbench/improve/`，不把 audit 文案注入 Agent 上下文；
- GenerativeUI 旧 sample 和 `diagram-types.md` 内嵌例子仍不进入正式样例库。

## `build-interaction` 学习计划

### 共同底线

所有 interaction 都必须形成：

`learner action → canonical model state → visible evidence → meaningful next action`

点击 reveal、装饰运动、hover-only 细节、filter-only chart、任意得分和自由相机 orbit 都不能单独构成学习交互。

### 三类交互

交互类别按实现和运行架构划分，不再按 `explore / simulate / construct / decide / play` 拆文件。

#### `general`

覆盖普通浏览器交互：

- DOM、SVG、Canvas、Chart、p5、Pixi；
- 2D 操作与模拟；
- 拖拽、参数探索、构建、判断、决策和学习游戏。

`explore / simulate / construct / decide / play` 只作为可组合的交互手法，不再作为 skill 路由或独立 reference。

#### `3d`

仅当深度、空间关系或三维操作本身承担学习意义时使用。需要处理场景、相机、光照、picking、dragging、constraint、性能、resize、dispose 和可访问 fallback。自由旋转观看一个模型不够。

#### `code`

学习者编写或修改代码，运行结果、测试、trace、console 或代码派生的可视输出构成反馈证据。固定工作台负责编辑器、隔离运行、轨迹播放、错误恢复和布局；每个课程只编写 starter、语义 trace、测试和 visualizer。首版完整支持浏览器内 Python/Pyodide，并通过 runtime adapter 为其他语言保留扩展点。

标准数据结构与算法通过 sequence、network、tree、grid/table、stack/call-tree、scalar/bit 和 generic 等稳定表示覆盖；题目特有的几何可实现同一 adapter 下的自定义 SVG、Canvas 或 DOM。框架不猜测任意代码的专业语义，无法识别时明确降级为通用调试视图。

### 第一版结构

```text
build-interaction/
├── SKILL.md
├── scripts/
│   └── generate_template.py
├── assets/
│   └── code-runtime-template/
├── references/
│   ├── general.md
│   ├── 3d.md
│   └── code.md
└── samples/
    ├── general/
    ├── 3d/                 # 有正式样例后启用
    └── code/               # 四份 compact author layer
```

第一版已经把旧 `explore.md`、`simulate.md`、`construct.md`、`decide.md`、`play.md`、`chart.md` 和 `2d.md` 的有效机制吸收到 `general.md`，随后删除旧文件。`3d.md` 已补齐独立的学习、视觉、motion、输入、降级和生命周期合同。

运行时严格单选：代码编辑与执行承担学习动作时加载 `code.md`；空间操作承担学习意义时加载 `3d.md`；其余普通浏览器交互加载 `general.md`。三份都是自包含类别 reference，不互相叠加。

### `code.md` 需要学会

- 把当前编辑器 model 作为唯一执行源，不使用隐藏替代算法或预录帧；
- 区分语言执行 trace 与题目语义，使用作者侧 adapter 保持学生代码自然；
- 通过统一 JSON-safe step 同步源码行、状态、focus、changes、metrics、测试和 visualizer；
- 按关系选择 sequence、tree/network、grid/table、stack/call-tree、scalar/bit、generic 或 custom 表示；
- 把测试失败变成可检查的输入、观察值、性质与修复证据，而不只显示红绿结果；
- 在 Worker 内执行并处理 timeout、payload/frame/stdout 限制、stale message 和重建；
- 明确浏览器 Worker 不是 hostile-code 安全沙箱；
- 完整处理 source、runtime、trace、playback、output、tests、view 的 reset 与 teardown。

### `general.md` 需要学会

- 把学习关系导演成一个可操作、可观察的页面世界；
- 舞台占据主要视觉面积，控件和读数靠近对应对象；
- 为题目选择 material/world、stage metaphor、graphic vocabulary、motion behavior 和 signature mechanism；
- 使用 theme token，但自行决定题目特有的图形、层次、标注和运动；
- 背景层、中景系统、前景操作对象形成可读空间；
- 按学习意图选择 reference representation 或 intuition representation，直接画出被操纵的机制；
- 对 SVG/Canvas 场景计算标签、对象、连线、callout 和操作空间，不把文字压进拥挤的小组件；
- 使用语义色表达 category、state、intensity 或连续物理属性，但具体颜色来自 theme；
- 直接操作、状态变化和反馈保持同一对象身份；
- 图表作为证据 renderer：初始状态可读，annotation、DOM readout 和 marks 共用数据、单位与格式；
- 物理/系统场景使用 canonical state、统一逻辑坐标、分层 renderer 和确定的 resize/update/reset/teardown 路径；
- wrong、boundary、partial progress、reset 和 retry 都有可见且一致的状态；
- hover、drag、press、selection、trace、flash、ghost 和 transition 服务于可供性或因果追踪；
- reduced motion 下保留全部规则和结果。

`general.md` 预计需要约 5,000–7,000 个中文字符；这不是硬上限，不能为压缩字数而丢掉完整的构图、状态和实现 recipe。

### `3d.md` 需要学会

- 先证明为什么二维表示不足；
- 让空间动作改变模型状态，而不是只改变相机；
- 建立明确的主对象、操作点、空间参照和视觉层次；
- 把 picking、dragging、constraint 和结果证据连接到同一状态模型；
- DOM 控件、文字证据和 3D 场景同步；
- 控制相机、光照、材质、尺度、资源和帧循环；
- 提供键盘/非指针路径、reduced-motion 和 renderer fallback；
- 正确处理 resize、cancel、dispose 和 reset。

### Sample 状态

- `general` / `3d` 页面 full sample 保存在对应 skill 的 `samples/<category>/`，但不内嵌进 reference；
- `code` 的四份正交 sample 只保留在 `samples/code/*/lesson/` 的课程 author layer，固定 template 不重复进入 sample；
- 所有样例均须验证学习状态、输入路径、证据、复位、teardown 和实际 Notale 运行；
- GenerativeUI 的八份旧 sample 仍只作为研究材料。

## Sample 的索引与加载合同

- 样例库可以包含多份 sample；一次生成先选一份属于所选类别的完整主 sample，再按机制互补选择少量同类别辅助 mini；
- 运行时上下文是“一份类别 reference + 一份完整主 sample + 零或少量辅助 mini”，不追加另一份 reference、跨类别 sample 或零散技术 recipe；
- 主 sample 提供完整 vertical slice 和质量标尺；辅助 mini 只提供不同构图、状态或 renderer 机制，不能退化为截图、伪代码或没有真实后端逻辑的片段；
- 辅助 mini 为 0–3 份，代码总预算 30,000 字符；整个 `SKILL.md + reference + samples` bundle 不超过 110,000 字符。选择应增加机制覆盖，而不是按题材、palette 或表面相似度堆叠；
- `code` 是明确例外：四份 sample 只保留课程 author layer，不制作 mini；运行时把四份作为单个 `code-core-bundle` 与 `code.md` 一次加载，用正交实现共同暴露稳定接口与题目变量；
- `future-climate-analogy` 是用户确认的 full-only 例外：可以被选为完整主 sample，但不能占用辅助位，也不能加载已拒绝的 mini candidate；
- 如某个关键 renderer recipe 是该类别稳定所需的能力，应吸收进该类别完整 reference，而不是运行时临时拼接；
- 先按 workflow 边界选择 `cover / page / interaction`，再选唯一类别，最后在该类别内选择 sample；
- topic 相似度和视觉主题不作为首要路由条件，避免模型复制题材或 palette；
- index 只记录触发条件、可迁移机制、依赖和不适用条件，不塞入 sample 正文；
- 当前页面库为 23 份 full，另有 4 份 `code` author-layer sample；具体主/辅内容由模型按机制选择，数量与字符上限由 loader 强制执行。

## 完整 Sample 的质量门槛

本节用于审查当前及后续新增的 sample。每份被允许进入 Agent 上下文的完整 sample 都必须满足：

### 内容与学习

- 使用真实且自洽的内容、单位、关系和状态；
- 页面主张或学习目标可以从画面中验证；
- 交互的 action、state、evidence 和 consequence 一致；
- 不把动画完成、点击次数或任意分数当成学习证据。

### 视觉

- 在实际 theme 下形成明确焦点和空间层次；
- 题目特有的图形语言和 signature mechanism 清晰可见；
- 不是组件陈列、卡片柜或技术 demo；
- 首次呈现已经具有视觉和信息完成度。

### 实现

- 完整可运行，不依赖隐藏的上游宿主能力；
- 使用实际 chassis、依赖和资源路径；
- 输入、状态、渲染、reset 和 teardown 一致；
- 支持必要的键盘、触摸和 reduced-motion 路径；
- 无运行错误、裁切、失联状态或不可恢复循环。

### 上下文使用

- Sample 作为结构和完成度先验，不作为可复制题目答案；
- 主 sample 只加载当前任务最相关的一份；辅助位只加载机制互补的 mini；
- 不因 sample 主题相似而牺牲任务真实关系；
- 不把 research notes、来源说明和评价文字放进 sample/reference 上下文。

## Full 与 mini 的制作顺序

1. 先改善并冻结 full：提高 Agent 可读性和可学性，同时在不缩短语义名称、不重新 minify 的前提下尽量减少字符。
2. 对 full 做双尺寸、正常/减少动态、关键状态、输入、reset、resize、fallback、dispose 和 reload 验证；视觉、动画、交互、数据与真实算法质量不得有任何降级。
3. 只从验证通过的 full 派生 mini。是否需要 mini 以改善后的 full 字符数为准，不能用原先单行压缩版本的字符数逃避制作。
4. Full author layer 低于 10,000 字符时直接作为辅助样例，不重复制作 mini；达到或超过 10,000 字符时原则上必须派生一份低于 10,000 字符的 mini。经用户视觉 review 明确否决的 mini 不得为了凑齐库存进入上下文；对应 full 只保留主样例资格。
5. Mini 是同等完成度的代表性 vertical slice，不是 full 的全功能副本。它压缩重复脚手架、非决定性说明、次要状态、辅助镜头、重复输入和由 reference 覆盖的通用实现；保留 signature mechanism、真实算法/数据、代表状态、必要输入、reduced-motion、reset 与可理解的生命周期边界。
6. mini 仍是可运行、可读的实现，不允许用短标识符、长单行、预计算截图、视频或删减视觉层次来换字符。

## 验证计划

旧 harness 保持不变；新建的隔离 harness 至少区分：

1. 当前 skill；
2. 新 reference、无完整 sample；
3. 新 reference、加入匹配完整 sample。

如果成本允许，再增加截图 critique/repair 作为第四组。这样可以区分构图规则、完整 sample 和后置视觉检查各自的贡献。

测试时保持以下变量一致：

- Codex model 和 reasoning 配置；
- 任务文本和输入资源；
- Notale chassis、theme CSS 和本地依赖；
- 三个 scrub workflow 均不可用；
- 初始对话上下文范围；
- 输出目录、运行时间和验证方式。

评价维度至少分开记录：

- visual attraction；
- visual hierarchy/composition；
- learning validity；
- task/content correctness；
- interaction correctness；
- runtime/layout stability；
- accessibility and reduced-motion path。

不能再用“treatment 胜出”代替绝对质量判断；胜出但仍不合格的结果应明确标记。

## 当前待对齐事项

1. `build-cover` 是否最终改名为 `build-background`。
2. 23 份 full 的库内数量已经冻结；主/辅选择由模型完成，loader 已固定辅助数量、字符预算和 XML 注入格式，待实验验证选择质量。
3. `build-page` 的 `general / chart / 3d` 单选边界在真实任务中是否足够清晰。
4. Notale theme CSS 暴露给 sample/reference 的稳定 token 和 component contract。
5. 三个 scrub workflow 的缺口何时回补。
6. 是否、何时加入浏览器截图 critique/repair。
7. 何时加入 JavaScript Worker 或真正的多语言后端 sandbox；当前 Python adapter 已稳定预留接口，但不虚构多语言支持。

## 决策记录

### 2026-08-29

- 顶层分类收敛为标题/背景、页面、交互三个 skill。
- 不继续测试 photo reference 和 illustration 获取。
- 上一轮测试只能说明 `build-page` 是较差结果中相对较好的一个，不能证明其达到质量标准。
- Theme CSS 接管 palette、字体和通用组件主题。
- anti-slop 内容归三个 scrub workflow，不重复进入构建 reference。
- GenerativeUI 的核心研究对象改为 Agent 可感知的拼装 reference 和完整 sample。
- `build-interaction` 不再按 `explore / simulate / construct / decide / play` 拆分；使用 `general`、`3d` 和 `code` 三类。
- `code` 类别在 Python/Pyodide 首版中正式加入；固定 runtime/template 与课程 author modules 分离。
- GenerativeUI 八份 generated guideline 按唯一机制去重吸收；不按八份文件重复搬运共享 CORE。
- `chart.md` 与 `chart_interactive.md` 没有内容差异，`art_interactive.md` 也是现有模块组合，因此都不产生新类别。
- `diagram.md` 中按意图选图、reference/intuition、机制图和可计算构图是静态页 `general.md` 的主要新增来源。
- `build-page` 计划精简为独立的 `general.md`、`chart.md`、`3d.md` 三类；取消 `sequence` 和普通 `2d` 类别，通用内容合入 `general.md`。
- build-page 的“静态”只表示作者控制状态序列而非学习者改变模型；motion 是三份类别 reference 各自内建的设计维度，GSAP 只是多对象 timeline 的可选实现。
- 所有 workflow 都采用单选类别：一次只加载一份自包含 reference，不使用 `general + 专项`、跨类别引用或 fragment 拼装；必要的共同规则在各类别内受控重复。
- **Superseded（2026-08-31）**：三个 skill 只在计划中预留 `references/examples/`；GenerativeUI 旧 sample 不采用，等待用户提供新 sample 后再建文件和索引。当前已有按 skill/category 归位的 full sample 与独立 `sample-workbench/improve/` staging，sample 仍不内嵌进 reference。
- **Superseded（2026-08-31）**：一次生成使用一份类别 reference，并最多加载一份同类别完整 sample。当前合同已改为一份完整主 sample + 零或少量同类别辅助 mini；仍不注入零散技术 recipe。
- skill 已落实到 `experiments/workflow-skills-next/`：cover 保留 `composition / motion / generative`，page 收敛为 `general / chart / 3d`，interaction 收敛为 `general / 3d / code`。
- 首批外部改造 Sample 按任务职责而非实现技术归档：`tactile-grid` 进入 `cover-generative`，因为程序化形态表面承担封面身份，指针输入只唤起氛围；`rain-paths` 进入 `page-general`，因为五类表面与水路是预先编排的比较证据，浏览、hover 和详情只承担检查既定内容。
- 旧的 page `composition / sequence / 2d` 和 interaction `explore / simulate / construct / decide / play / chart / 2d` 文件在完成内容吸收与入口引用检查后删除。
- **Superseded（2026-08-31）**：三个 skill 均通过 `skill-creator` 的 `quick_validate.py`；确认后的 sample 已开始归档，skill 尚未安装，也未修改 harness。当前 23 份页面 full staging 已齐并完成独立复核；harness 仍未修改。
- 在 reference、sample 和分类边界对齐前，不修改 harness。

### 2026-08-31

- Sample 上下文方案从“最多一份完整 sample”修订为“一份完整主 sample + 少量同类别辅助 mini”；目的不是增加示例数量，而是用机制互补降低对主 sample 的过拟合。
- `code` 类别的四份 sample 只包含课程 author layer，不制作 mini；运行时四份合并为一个 `code-core-bundle` 一次加载。
- **阶段目标已完成**：在制作任何 mini 前，先完成所有 full 的 readable-compact 改善；23 份页面 full 已进入 staging 并通过独立复核。字符优化仍不能牺牲可读性、视觉、动画、交互、真实数据/算法或生命周期质量。
- mini 判定以改善后的 full 为准：低于 10k 直接使用，达到或超过 10k 制作 `<10,000` 字符的代表性 vertical slice；用户 review 是最终质量门槛。当前为 19 promoted、3 already-under-10k、1 full-only，另有 4 份 code author-layer no-mini。
- 用户批准除 `future-climate-analogy` 外的 19 份 mini 正式归档；该被拒版本只留作审计证据，不参与任何模型上下文选择。
- 正式 sample 按 skill/category 归位；运行时加载边界由每个 skill 的 catalog 和 `workflow-context` 明确限定，未列出的审计材料、截图、许可副本和来源记录不进入 Agent 上下文。
- 所有页面 full 改善先进入 `sample-workbench/improve/` staging 和统一对照预览，用户 review 后才允许晋级；正式测试使用独立的新 harness，不回写旧实验器。
- 23 份已审计 full 在用户明确整体批准后完成 formal 晋级；各 report 的 `formal_current` 清单记录当前 author 文件、字符数和哈希。
