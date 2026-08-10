# Notale Harness 架构

> 回答的问题："一个 query 怎样由多个具备 skills、tools、长上下文与长任务治理能力的 agent loop，生成一份可恢复、可交付的互动讲义？"
> 本文描述 Notale 当前内循环的制度边界；研究性验证方案另留在外部实验评估，不冒充已经接入的生成门禁。
> 与既有文档的分工：[`CHARTER.md`](./CHARTER.md)+[`EVAL.md`](./EVAL.md) 是**外循环**（harness 怎么进化）；本文是**内循环与 harness 本体**（一次生成怎么跑、系统由什么构成）；[`PREP.md`](./PREP.md) 的**备课资料**是本图景的**中枢数据结构**。
> 证据库：`research/` 三份前沿调研（2026-08-08，带一手来源）。

---

## §0.5 Harness 必答的十八问（本文的骨架）

多页面网站应用的设计必答问题，抽象成**多单元生产 harness** 的四类通用问题，再加讲义特有的第五类。全文按"问题→负责组件"组织：**每个架构组件的存在理由 = 它回答哪几问；回答不了任何一问的组件不该存在。**

**A 本体与层级**
- **A1** 完整体系包含哪些连续层级？每层的产物是什么、归谁所有？
- **A2** 有哪些角色、对象、状态、权限和异常？

**B 权威与追踪**
- **B1** 唯一真相源在哪？成品上任何元素能否回溯到权威记录？
- **B2** 一次操作会改变哪些对象、影响哪些页面？（变更影响传播）

**C 单元契约与上下文**
- **C1** 页面结构与多形态任务怎样被定义？（页型 schema；deck/讲稿/习题/档位）
- **C2** 当前页承担什么任务，首屏应优先表达什么？（单元职责声明）
- **C3** 怎样编译页面级最小上下文？
- **C4** 哪些系统组件适合当前任务？（知识类型→能力匹配）

**D 闭环与交付**
- **D1** 一次操作如何形成业务闭环？（状态转移+可恢复）
- **D2** 组件选择、来源和缺口如何治理？
- **D3** 怎样避免半成品进入正式工程？
- **D4** 怎样把检查结果与实际提交的 HTML 绑定？
- **D5** 生成期交付检查与实验期质量评估怎样分工？

**E 真值与教学**（讲义特有，网站清单里不存在——我们区别于一切 PPT 生成器的立身之处）
- **E1** 内容为真吗？每种知识类型由什么 oracle（能独立判对错的东西：编译器、sympy、原文出处）判定？
- **E2** 时间怎么分配？（60 分钟如何变成页数、密度与节奏）
- **E3** 学生学会了吗？
- **E4** 多样性从哪来、一致性怎么保？（受控多样：语汇低熵、结构高熵）
- **E5** 谁来验证验证者？（判官自己会说谎）

---

## §0.7 被两条约束逼出来的五个原语

整套架构其实只由两条约束推出来：

- **约束一：模型输出不可靠，且失败方式特殊**——它流利、可信，无论真假。所以必须有一个地方把"看着对"和"是对的"分开。
- **约束二：产物是多单元的、长于一次上下文**——所以必须有一个地方放单页自己无法知道的决定。

由此逼出五个**原语**（其余全是推论）：

| 原语 | 被谁逼出来 |
|---|---|
| **契约**（术语/符号/顺序/风格/时间预算，只决定一次） | 约束二：单页无法知道别页 |
| **规格 + 构造器**（分叉①，见 [`PREP.md`](./PREP.md) §1） | 约束一 + 想要"所有情况"的保证 |
| **独立核对**（分叉②，构造器不存在时的残差） | 约束一 |
| **状态**（哪页做完了、哪页失败了） | 约束二：长于一次上下文 |
| **外部信号**（唯一合法的返工驱动） | 约束一：自我反思已被证伪 |

**正确性的组织方式是一个分叉，不是一串组件**（详见 PREP §1）：每条内容先问"有没有机械构造器"——
有 → **造**（保证所有情况，便宜）；没有但可核 → **生成 + 独立核**（抽查级，贵）；两者皆无 →
**生成 + 如实标注未核实**（无保证，但不许伪装成有）。**全系统唯一的战略命题：把内容尽量从右往左推**；
每造一个新构造器，就把一整类内容从"祈祷 + 抽查"搬进"不可能错"。

下面十条哲学里，**P2/P3/P4/P6 分别是上表四个原语的展开**，其余六条是工程取舍。

## §1 十条设计哲学

每条：主张 → 证据锚点（详见 `research/`）→ 它救哪个问题。

**P1 主干是 workflow，不是 agent。** 一次讲义生成的宏观结构是已知的（研究→契约→fan-out→组装→交付报告；**fan-out** = 一次派出多个 agent 并行干活，下同），应由确定性编排执行；自主性只下放到"这一页具体怎么讲"的局部。多智能体系统的失败大多源自编排设计缺陷而非模型能力（MAST，1600+ 轨迹）；"能用 workflow 就别上 agent"也是本仓自己的判例（hermes-shell 验尸）。〔证据：Anthropic Building Effective Agents；MAST〕

**P2 交互正确性来自构造关系，不来自界面表演。** 页面先执行真实的算法、方程、状态机、判定器或数据变换，产生 trace/result，再由界面投影；输入与操作只能改变领域模型的输入、动作或回放游标。手写逐帧数组、预制步骤状态和直接修改 DOM 都不能代替领域计算。事实内容仍遵循**先查资料，再生成页面**（见 [`PREP.md`](./PREP.md)）。〔证据：AlphaProof/FunSearch 固定骨架+可变槽位；PDE-grounded intent verification〕→ 救正确性（E1）。

**P3 全局隐含决策单线程锁定，无冲突的工作才 fan-out。** 判据只有一条：子任务之间是否共享隐含决策。大纲、术语、符号与证据路由落成稳定的课程领域契约；全书共享/逐页增量的 Builder skill 和 profile 另落成 `builder-plan` 控制面。二者由 Planner 同轮决定，但不混用 schema：增加 skill 不得迫使课程 artifact 扩字段。页面生成在这两份锁定物下相互独立——放心并行。写操作单线程：worker 只写自己那一页，共享文件只有编排者写。〔证据：Anthropic orchestrator-worker +90.2% vs Cognition Flappy Bird 陷阱——两者不矛盾，是同一判据的两侧〕→ 救长程一致性与风格一致性。

**P4 Artifacts > compaction：落盘状态机是长程的脊柱。** 60 分钟讲义是多小时级长跑，跨越多个 context window。靠上下文压缩续命不够；靠结构化 artifact 才鲁棒：每页 `pending → drafted → completed/degraded`，agent task/checkpoint/compaction 与页产物持续落盘，写路径幂等，失败后从 manifest 续跑。主编排上下文里**永远不出现任何一页的完整 HTML**，只有状态摘要。〔证据：Anthropic long-running harness；Temporal durable execution；context rot 实测〕→ 救长程（E2/D1）。

**P5 规则只判断它真正能判断的事。** 原子 `submit_page` 内的确定性检查负责 schema、离线依赖、素材与引用、占位符和 inline JavaScript 语法；它不从“DOM 发生变化”推断学科或交互语义正确。符号计算、执行对拍、视觉审阅等更强 oracle 属于用户监督的实验评估，接入前必须有独立信息优势，不能用同一个模型换 prompt 伪造 generator-verifier gap。〔证据：AeSlides；Nine Judges；weak-verifiers 组合〕→ 救正确性（E1/E5）。

**P6 修复留在产生页面的 Builder loop 内，并由工具信号驱动。** Builder 用一次 `submit_page(html, metadata)` 让 Harness 写入、检查并提交同一份页面；失败时根据具体错误在同一持久会话中 `page_patch`，Harness 自动复检并提交。提交后不再启动第二套 verifier/repair 状态机。更深的语义问题由实验日志、源码、真实领域执行和用户审阅形成诊断，用户确认后再修改 profile/skill/harness。〔证据：LLMs Cannot Self-Correct（ICLR 2024）；DeepPresenter；Reflexion〕→ 救修复有效性与长任务治理。

**P7 Builder 可以写页面实现，但不能伪造教学状态。** 固定的 Reveal 外壳、`global.css`、成熟组件和领域引擎优先复用；遇到长尾内容，Builder 可实现新的领域函数与渲染器，但二者必须分层：模型输入/动作 → domain engine → trace/result → renderer。这样既保留 HTML-native 的表达自由，也让交互状态具有可追踪的计算来源。〔证据：AutoPresent SlidesLib；SlideBot figure 宏；PPTAgent〕→ 救单薄与正确性。

**P8 风格属于表达 skill，而不是课程 schema。** AI 味的本质是分布塌缩（RCT 实证：个体创造力↑、集体新颖性↓），根源是让模型自由发明风格。每个表达 skill 维护自己适用的 profile 集合：Planner 先选 skill，再从该集合离散选择 profile；Builder 只加载被选中的 profile reference，Harness 只把其安全 token 覆盖写入共享 runtime。不同表达系统今后通过增加 skill 扩展，不向 `Globals` 或 `PageSpec` 添字段。视觉语汇要低多样（一致性），页面结构要高多样（丰满感），两个特征空间应分别评估。〔证据：Science Advances 2024；AeSlides；CPT；Vendi 0.79 vs 模板 0.17–0.35〕→ 救多样性（E4）。

**P9 一份统一内容层生成所有形态；时间是一等公民。** 先做一份已按受众分好难度、换好例子的统一内容层，再由它生成 deck/讲稿/习题/导图/三档强度——跨形态一致且个性化只做一次（RCT：保持测验 +11pp）。规划器输出**带 per-node 时间预算的逻辑链**，生成循环里 pacing check 显式决策 refine/expand/stop；**交互组件有自己的时间成本模型**（一个 sim≈3–4 分钟探索，一道 quiz≈1–2 分钟）——时长模型不能只按字数。时间预算同时是对抗"每页塞满"的最好杠杆。〔证据：Learn Your Way；DeepSlide dual-scoreboard；AgentWrite 配额机制；金样本拟合 60min≈35–45 页〕→ 救长程（E2）。

**P10 经验沉淀由人监督，不在生成 workflow 中自动发生。** 每次实验保留完整日志与 artifacts；先由人读取真实样本、归纳跨样本问题，再经用户确认把经验写入 profile、skill、tool、组件或 harness。运行结果本身不会自动生成或应用 library delta。〔证据：Voyager；ACE；Agent Skills 创作论〕→ 救外循环的复利，同时避免错误经验自我强化。

---

## §2 当前架构草图

> 📊 **完整数据流图（推荐先看）：[`harness-architecture.html`](./harness-architecture.html)** —— 单文件离线 SVG，
> 浏览器直接打开。图里能看见下面这段文字讲不清的三件事：两处 **fan-out 的并联多 agent**、
> Builder 内部的检查修复回路、用户监督的实验反馈边界，以及**备课资料作为枢纽**的供给线。
> 下面的 ASCII 是同一件事的速查版。想看**字段级**细节（每个阶段输入输出的具体字段名+中文描述），
> 看 [`pipeline-schema.html`](./pipeline-schema.html)。

```
╔═ 外循环（harness 进化）═ CHARTER + EVAL：基准题集 · 硬门 · 趋势 · 轮次制度（已有，引用）═╗
║                                                                                    ║
║  内循环（一次生成）：                                                                 ║
║                                                                                    ║
║  [0] Intake & Clarify ──── 单线程。受众/先验/时长/深度/强度档位 → course-brief          ║
║        ↓                                                                           ║
║  [1] Research fan-out ──── 多 agent 宽→窄检索（教材目录→逐节深挖，来源质量启发式）        ║
║        ↓                    出处由工具记录**自动绑定**（URL+原文片段，机器校验子串）       ║
║   ┌─────────────────┐                                                              ║
║   │  备课资料 ★       │      示例(非穷举)：事实(断言→出处) / 能跑的(方程/算法+自检条件)  ║
║   │  (PREP.md)       │      / 数量(可复算形式) / 故事(人物-事件+必须成立的条件)         ║
║   └─────────────────┘      / 交互(状态机+自检条件)。页面照着它生成。                    ║
║        ↓                                                                           ║
║  [2] Curriculum Contract ─ ★单线程。锁定物：逻辑链+每页 spec（中心信息/认知动作/          ║
║        ↓                    页型/时间预算/资料绑定）+ 术语/符号 → 课程领域契约            ║
║        ↓                    + shared/page Builder skills → 独立 builder-plan → 用户确认 ║
║  [3] Per-page fan-out ──── 一页一持久 agent loop，prompt 自包含                         ║
║        ↓                    （page + narrative + sources + 精确 SkillAssignment[]）；   ║
║        ↓                    authoring profile + role tools + Planner 路由的 skills；    ║
║        ↓                    交互=真实 domain engine → trace/result → render；           ║
║        ↓                    submit_page 原子写入/检查/提交；失败 page_patch 自动复检；  ║
║        ↓                    stalled/failed → 静态降级页，绝不卡死整本                    ║
║  [4] Assemble & Global ─── 单线程。拼装 + 跨页一致性（术语/符号/难度递进/重复/总时长）     ║
║        ↓                                                                           ║
║  [5] Delivery report ───── completed/degraded 清单；不自动沉淀经验                    ║
║                                                                                    ║
╚═════════════ 产物：Reveal HTML-native deck + 质量报告 + 完整实验日志 ═══════════════╝
```

### 交付检查与正确性边界

| 位置 | 管什么 | 信号来源 | 失败后果 |
|---|---|---|---|
| **Builder / submit_page** | 原子写入并检查 schema、placeholder、运行时值泄漏、离线依赖、资料绑定、本地素材和 inline JS 语法 | 确定性程序 | 当前 Builder loop 内定点修复；持续失败则 stalled/degraded |
| **Builder skills** | 教学状态必须来自真实算法、方程、状态机、判定器或数据变换；界面只投影其 trace/result | 构造纪律 | 不满足就不应生成该交互；不能由“DOM 动了”补票 |
| **实验评估** | 学科正确性、交互教学价值、视觉质量与跨样本趋势 | 用户监督下读取日志、源码、浏览器效果和必要 oracle | 形成诊断；用户确认后才修改 skill/profile/harness |

`submit_page` 内的检查是交付门，不是语义验证器。浏览器随机点击只能证明控件能改变页面，无法区分真实
计算与手写帧，因此不进入生成内循环。将来接入独立 oracle 时，它属于实验评估链，不能复制一套
提交后的页面状态机或重新打开已经完成的 Builder task。

### 组件职责与十八问的映射

| 组件 | 职责 | 回答 |
|---|---|---|
| **层级链**（brief→备课资料→课程契约 + builder-plan→page context→page artifact→deck/report） | 领域 artifact 与 Agent 控制面分别落盘，明确归谁所有；上层是下层的唯一输入 | **A1** |
| **系统本体** | 角色：Researcher / Planner / Builder / 人。对象：备课资料、契约、页、素材、manifest、agent task/checkpoint 与实验日志。**权限：只有一处能写**（globals 只有 Planner 能改，Builder 只能写自己那一页）。异常：Builder stalled、预算耗尽、资料缺失都有明确降级或续跑路径 | **A2** |
| **备课资料** | 唯一的知识来源；成品上任何东西（数字/代码/水位线/滑块反应）都要能在资料里找到出处，**找不到 = 编的**。它内部躺着两种生命周期不同的东西：**规格**（分叉①，构造器的输入）与**已核事实**（分叉②，独立核对的产物）——接口层面应当分开 | **B1, E1** |
| **出处的确定性绑定** | 出处不是模型填的字段，是**工具调用记录自动带出来的**（URL + 原文片段 + 抓取时间），并机器校验引文是抓回文档的字面子串。**让"事后补出处"在结构上不可能发生**，而不是事后去检测它；残差（引文真但概括错）退化为一个无状态的两串文本蕴含判断（PREP §2.1） | **B1, E1** |
| **教法笔记**（备课资料的姊妹通道） | **页面照着备课资料生成，大纲照着教法笔记生成**。收讲授顺序、能搬走的教法、常见误解库；给排大纲的用，不给写页面的用。**大纲上任何结构性决定说不出依据 = 临场偏好**。总原则：并行查回来的每份东西，要么进一条说得出谁要用的记录，要么明确丢弃并写下原因——不许悄悄蒸发 | **B1, E3** |
| **notation ledger 反向索引** | globals 变更（术语/符号）→ 依赖页全部转 dirty；没有它，跨页一致性只是祈祷 | **B2** |
| **页型契约**（formula-derivation / sim-explorable / code-runnable / quiz-check / worked-example / section-break / narrative-scene…） | 描述该页的教学形态与时间权重，不等同于 skill 路由或组件名；多形态由同一内容层生成 | **C1** |
| **页 spec 的职责声明** | 强制字段：唯一中心信息（CLT 硬约束）、认知动作、页型、时间预算和资料绑定。标题、视觉对象、媒体与交互实现属于 Builder | **C2, E2** |
| **上下文编译器** | 为每个 worker 编译最小投影：当前页 brief + narrative + sources/guardrails + `builder-plan` 合成的精确 SkillAssignment 列表。不累积前页全文，不允许 worker 私改全局 | **C3** |
| **Builder skill 路由** | Builder 的常驻流程固定在角色契约；Planner 只从角色授权 catalog 显式选择全书共享与逐页增量的可选能力，Harness 校验从属关系并执行，绝不按 pageType 猜测 | **C4** |
| **参照物绑定** | 每个会跑的东西（仿真/动画/代码/交互）必须绑至少一个**外生**参照物——闭式解 / 独立参考实现 / 声明的规格 / 学科定律 / 变换不变性。绑不到 → 降级为静态图并标注。**正确 = 与外生参照物一致**（[`VERIFY-EXEC.md`](./VERIFY-EXEC.md)） | **E1, D4** |
| **页状态机 + agent task ledger** | `pending → drafted → completed/degraded`；task/checkpoint/compaction、页文件和 manifest 共同支持断点续跑与幂等提交 | **D1** |
| **能力与组件库** | skills 定义工作方法，tools 提供可执行动作；成熟领域引擎/组件优先复用，缺口由实验复盘后在人监督下补齐 | **D2, C4** |
| **WIP 门禁** | 只有 `completed` / `degraded` 页并入成品；草稿即使已经落盘也不能混入 | **D3** |
| **原子 submit** | 同一次 `submit_page` 工具执行写入、检查并接受 HTML；失败页保留为唯一 workspace，`page_patch` 后自动复检，结构上消除“检查 A、提交 B” | **D4** |
| **评估边界** | 交付门只报告确定性可交付条件；语义、教学价值和视觉质量在用户监督的实验评估中诊断，不能伪装成自动证明 | **D5, E5** |
| **时长模型 + pacing 决策** | 分钟→章→页→每页密度与交互时间成本；循环内 refine/expand/stop | **E2** |
| **DeckQuiz + RCT 协议** | 教学有效性的代理与慢验证（60 人/40 分钟/即时+保持测验的轻量 RCT 可复制） | **E3** |
| **skill-owned profile 库 + 实验评估** | Planner 只能从所选表达 skill 自有 profile 中选择；同 deck 共享语汇、单页保持构图自由，跨样本多样性由实验评估 | **E4** |
| **人工监督的实验复盘** | 读取日志与 artifacts，用户确认后才把经验沉淀到 profile / skill / tool / component / harness | **D2, E3** |

## §3 关键取舍

| 决策 | 选什么 | 放弃什么 | 依据 |
|---|---|---|---|
| 图像模型的角色 | **image-as-asset**（hero/插图/纹理，语义不进图）+ **image-as-design-reference**（moodboard→builder 用 HTML 复现视觉语汇） | 整页出图→逆向拆解为主路线 | 逆向版式 IoU 仅 0.36；公式/sim/code 逆向后是死的 |
| fan-out 边界 | 研究与页面生成 fan-out；大纲/术语/风格单线程 | "全并行"或"全单线程" | 判据=是否共享隐含设计决策（+90.2% vs Flappy Bird） |
| 仿真环境 | 浏览器内执行真实领域模型并产出 trace/result | 手写帧或直接 DOM 模拟状态 | 界面只投影计算结果；重 PDE 是内容上限问题，defer |
| 美学优化 | 受限优化：frozen regions（不得动公式/数值/代码）+ 熵约束 + 防多轮结构漂移的锚定 | 无约束美学 RL | 视觉↔内容 trade-off 实测；去 KL 熵塌缩；DTW 漂移单调上升 |
| LLM judge 的保留地 | 只判真不可判定项（教学质量/文化语感/类比恰当），全部过抽查五条，判决要结构化（逐条断言 + 指出页面上的出处） | 用 judge 兜底一切；同族投票 | 规则 F1 2–7×；九判官两票；稳定≠正确 |
| 布局的绝对坐标 | LLM 输出语义槽位+相对意图，**绝对像素由布局引擎算**（约束求解/网格量化） | 文本 LLM 裸猜像素坐标 | 文本模型无视觉先验（本仓 2026-08-07 run 的第一因） |
| 成本护栏 | 全局紧急预算、并发上限、Builder stall 检测与降级继续、大 run 告警、努力规模显式规则（60min≈N 页≈M worker） | 无界循环 | 多智能体 token 开销高；一页不能卡死整本 |
| 用户在环 | 两个固定点：契约确认（[2] 后）、降级页人审队列；其余全自动 | 全自动或步步确认 | Gemini collaborative planning；60 分钟走错方向返工成本最高的点恰在契约 |

## §4 四大问题在此图景下的归宿

| 问题 | 归宿 |
|---|---|
| **单薄** | P7（HTML-native + 真实领域模型）+ P8（结构高多样）+ 布局引擎取舍 + 人监督的实验复盘 |
| **长程** | P4（状态机脊柱）+ P9（时间预算+canonical layer）+ [2] 契约 + notation ledger + 降级打捞 |
| **正确性** | P2（真实计算→trace/result→投影）+ 资料绑定 + Builder 内工具反馈 + 用户监督的实验评估 |
| **多样性** | P8（离散采样+区间门禁+负面清单 lint）+ art direction 库 + misconception/组件库让"内容手法"也多样 |

## §5 已知薄弱与研究项（诚实清单）

1. **叙事一致性没有确定性 oracle。** 当前最优 = 实体-事件图 spec + 图上不变量检查 + 单帧盲测 VQA，但"LLM 抽图"这一步本身不可靠。这是全图景风险最高的模块，需要自己造轮子。
2. **VLM 视觉判官不可靠**（定向扰动 >50% 漏检；中国古代题材最好模型 58.7%）。因此当前不把 VLM 放进生成门禁；视觉问题在实验评估中保留截图与人审证据。
3. **教育插图是已知模型能力缺口**（Google 为此专门微调了模型）。短期靠"语义不进图"规则回避，长期是能力等待项。
4. **多拍动画的因果/时序验证、对抗式判官**：研究级，defer。
5. **时长模型的经验基础还很薄**（目前只有两份金样本拟合的初值 60min≈35–45 页），需随金样本库扩充持续校准。

## §6 参考文献

证据全文与完整来源清单见 `research/` 三份调研：
- [`survey-agent-orchestration.md`](./research/survey-agent-orchestration.md) — 编排、长程、多智能体成败、Skill 库
- [`survey-verified-generation.md`](./research/survey-verified-generation.md) — evaluator-guided、judge 可靠性、引证、视觉验证、仿真接地、叙事一致性
- [`survey-presentation-generation.md`](./research/survey-presentation-generation.md) — 演示系统、image-first、多样性、交互生成、时长与课程

本文各哲学的关键锚点（精选）：Anthropic Building Effective Agents / multi-agent research system / long-running harnesses / Agent Skills；Cognition Don't Build Multi-Agents；MAST (2503.13657)；AlphaEvolve (2506.13131)；AlphaProof (Nature 2025)；Nine Judges (2605.29800)；Reliability without Validity (2606.19544)；LLMs Cannot Self-Correct (2310.01798)；Wrong Physics/IFS (2605.09360)；PhysVEC (2604.00149)；Cited but Not Verified (2605.06635)；TAB-VLM (2605.15071)；Seeing Isn't Believing (2604.21523)；DeepPresenter (2602.22839)；AeSlides (2604.22840)；Vendi (2210.02410)；Doshi & Hauser (Science Advances 2024)；CPT (2604.04380)；Images2Slides (2602.07645)；Generative Interfaces (2508.19227)；Evaluating Interactivity (2606.31012)；EQGBench (2508.10005)；Auto-Slides (2509.11062)；SlideBot (2511.09804)；DeepSlide (2605.15202)；Learn Your Way (2509.13348)；LongWriter (2408.07055)；ACE (2510.04618)；Voyager；METR time-horizon。
