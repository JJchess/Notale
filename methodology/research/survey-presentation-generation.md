# 调研：自动化演示/教育内容生成与视觉设计 Agent（2024–2026）

> 调研日期：2026-08-08。用途：`methodology/HARNESS.md` 终局图景的证据库之一。
> 未标注 [检索摘要] 的均有一手来源链接；practitioner 类来源非同行评审，采信时注意。

---

## 0. 一句话结论

pipeline 形态已收敛：`研究/取材 → 大纲(逻辑链) → 页面级设计 → 代码化渲染 → 渲染后视觉回看(render-observe-fix) → 局部修订`。三个最重要的架构级发现：
1. **"渲染后再看一眼"（environment-grounded reflection）是可验证收益点，且外部 critic 比自我反思强得多**（DeepPresenter：外部验证增益比纯 SFT 大 67%，发现 308 vs 212 个布局缺陷）。
2. **美学/布局可做成 rule-based 可验证奖励**（溢出/碰撞/留白/重心），成本≈0 且 **F1 是 VLM 判别的 2–7 倍**（AeSlides）。**别让 VLM 当布局警察。**
3. **视觉多样性已是被正式测量的维度**：Vendi Score + DINOv2 量化 deck 内视觉方差——模板系统 0.17–0.35，自由生成 0.79。这是"避免 AI 味"最可操作的落地指标。

## 1. 演示生成系统

- **PPTAgent/PPTEval**（[2501.03936](https://arxiv.org/abs/2501.03936)）：编辑式两阶段（分析参考稿→functional type+content schema→大纲→检索模板→可执行编辑动作，REPL 报错回灌自纠错）；**不让 LLM 直接写 OOXML 而是 HTML-like 表示**（全领域反复验证的选择）；PPTEval 三维（Content/Design/Coherence，与人评 r≈0.71）。局限：多样性上限被参考库锁死。→ 借 functional type 概念做**页型契约**（formula-derivation/sim-explorable/code-runnable/quiz-check/worked-example…），自由度落在内容、结构合法性可程序校验。
- **DeepPresenter**（[2602.22839](https://arxiv.org/html/2602.22839v1)）★最贴近 agent harness：Researcher+Presenter 双 agent（消融 −0.40 全表最大）；**environment-grounded reflection**（inspect_slide 渲染成像素图再看——暴露代码层看不出的重叠/低对比/溢出）；可验证约束注入+规则校验；**Diversity=Vendi(DINOv2) 0.79 vs 模板 0.17–0.35**；**外部 critic 增益比纯微调大 67%（308 vs 212 个布局问题）——自我验证有系统性盲区**。→ render→screenshot→inspect→patch 做成一等工具；critic 推理期也保留。
- **AutoPresent/SlidesBench**（[2501.00912](https://arxiv.org/abs/2501.00912)）：**程序化合成优于端到端图像生成**；SlidesLib 高层 API。→ 建 lectureLib：`formula/sim/code_cell/quiz/figure`，模型只调 API——"多样但不崩"的关键杠杆。
- **Design First, Code Later**（[2605.26451](https://arxiv.org/html/2605.26451v1)）：页面设计（布局/美学决策）先于代码实现，两段式；template-free。→ 先出 design spec（JSON：网格/色彩角色/层级/留白预算/焦点）再由 builder 落成 HTML。
- **EvoPresent/PresAesth**（[2510.05571](https://arxiv.org/abs/2510.05571)，ICLR 2026）：美学 RL 模型；**"高质量反馈是自改进的必要条件；初始能力强≠会自我纠错"**；**视觉↔内容 trade-off 实测存在**。→ 反馈质量 > 生成模型能力；美学重排不得动公式/数值/代码（frozen regions）。
- **MemSlides**（[2606.17162](https://arxiv.org/abs/2606.17162)）：分层记忆（user profile/tool/working）+ **scoped slide-local revision**（最小受影响区域）。→ region-scoped patch + 冻结区必须是架构原语。
- **SlideTailor**（[2512.20292](https://arxiv.org/abs/2512.20292)）：偏好用"一对示例"而非文字表达。→ art direction 入口是"给我一页你喜欢的讲义"，不是让用户描述"简洁现代科技感"（后者正是 AI 味来源）。
- 商业系统：Gamma（内容与主题彻底解耦、re-theme）；**Genspark 100+ Skills（每个打包"某类专家的思考框架+配套设计"）**→ 学科教学法 Skill（叙事框架+页型配比+交互偏好+视觉语汇）；Kimi（上传参考图定风格）；NotebookLM（**三档强度 Cinematic/Explainer/Brief**）→ 同一源材料多档输出。
- **评测维度全景**：PPTEval 三维；Paper2Poster 的 **PaperQuiz**★（VLM 只看产物答源材料的测验——直接测"教会了没有"）→ DeckQuiz；DECKBench 的**多轮 DTW 漂移**（编辑轮次越多与目标结构距离单调上升）→ 防"越改越散"；X+Slides（受众覆盖/效率=单位注意力成本的效用/correctness）；DeepPresenter 的 Constraint+Diversity。
- **普遍失败模式**（做成 lint）：元素越界/图片缩放不可读/内容重叠；图注错配/**placeholder 冒充真实内容**/上游解析失败向下游传播；累积编辑结构发散。可靠性与质量存在 trade-off，需显式选择。

## 2. Image-first / native-rendering 混合

- 实测（practitioner）：HTML 模式可编辑、0–500 词优雅降级；Image 模式 5–15 词出色、**80+ 词崩溃**。2026 主流=混合：**image-mode 用于 hero/分隔页，HTML-mode 用于内页**。
- **Images2Slides**（[2602.07645](https://arxiv.org/abs/2602.07645)）：VLM 抽 region-level JSON→重建原生元素。**元素召回 0.989、图片 1.000，但文本区版式 IoU 仅 0.364**——"东西都找回来了，但摆得不对"。这就是整页出图→逆向的真实天花板。
- Design2Code（[2403.03163](https://arxiv.org/abs/2403.03163)）：**screenshot→code 已基本不是瓶颈**（2026 榜首 94.8%）；visual self-revision prompting 是 inspect_slide 的祖先。
- **启示**：❌不走"整页出图→逆向拆解"主路线（IoU 0.36；讲义的公式/sim/code 逆向后是死的）。✅**image-as-asset**（hero/插图/纹理，语义信息一律不进图）+ **image-as-design-reference**（图像模型出 moodboard，builder 用 HTML+lectureLib 复现其视觉语汇——拿到设计品味、保留原生交互）。✅ LLM 输出语义槽位与相对布局意图，**绝对像素由布局引擎算**（确定性后处理不可省）。

## 3. 视觉多样性与风格控制（如何不"一股 AI 味"）

- **实证根基**——Doshi & Hauser, Science Advances 2024（RCT）：AI 辅助提升个体创造力，**但 AI 辅助的作品彼此更相似**——"个体创造力↑，集体新颖性↓"。AI slop 的本质是**分布塌缩**，不是单件质量。
- 症状负面清单（practitioner）：紫蓝渐变、厚无衬线、blob 背景、圆角套圆角、无差别柔和阴影、每页居中大标题+三卡片。机制：mode collapse + design fixation 自我强化。
- **Vendi Score**（[2210.02410](https://arxiv.org/abs/2210.02410)）：相似度矩阵特征值 Shannon 熵的指数；不需要参考分布；相似度函数自定义→**可以指定"要哪种多样性"**。实际用法：DINOv2 CLS embedding 做 kernel。
- **AeSlides**（[2604.22840](https://arxiv.org/html/2604.22840v1)）：布局四项（溢出/碰撞/留白/重心）rule-based 可验证奖励，**F1 是 VLM 的 2–7 倍、成本≈0**；**去掉 KL 正则后策略熵塌缩、退化成保守模板**——"优化美学"本身就是把设计推向单一模板的力，必须显式对抗。
- **CPT**（[2604.04380](https://arxiv.org/html/2604.04380)）：CML 结构化表示 + **masked infill 局部换风格**（只 mask 颜色属性重生成，其余逐字不变）；**色彩对比是最脆弱环节（41.3% vs 人类 94.6%）**→ 对比度必须用 WCAG 确定性算法校验。
- **启示**：AI 味的根源是"让模型自由选风格"——解法是**先离散化再采样**（显式 art direction 库：配色角色表+字体配对+网格+图形语汇+禁用清单，模型**选择**而非**发明**）；Vendi 做 **CI 区间门禁**（视觉语汇要低多样=一致性，页面结构要高多样=丰满感，**两个特征空间分别测**）；负面清单进 lint（CSS 层大部分可静态检查）；任何偏好优化保留熵约束；多样性预算随阶段变化（探索期高温多候选，定稿期锁风格只许局部编辑）。

## 4. 交互式教育内容生成

- **Generative Interfaces**（[2508.19227](https://arxiv.org/html/2508.19227v3)，ACL 2026）：query → **interaction flows（UI 视图有向图）+ FSM（组件行为有限状态机）** → 预定义组件合成 HTML/JS；自适应 reward 迭代（对每个 query 生成特定评分标准）。对话式界面胜率 84%。→ **FSM + interaction flow 作为交互的 IR**：先声明状态/事件/转移/可观测量，再生成实现——可解释、可 diff、**可自动测试**。
- **Evaluating Interactivity**（[2606.31012](https://arxiv.org/pdf/2606.31012)）★：交互性四维——**Responsiveness / Feedback richness / State persistence / Exploration depth**；**FSM 建模 + Playwright 驱动模拟用户交互**自动评测。→ 目前唯一成型的交互质量自动评测方案，直接采纳。
- **ViviDoc**（[2603.27991](https://arxiv.org/pdf/2603.27991)）：Content/Interaction/**Verification agents** 分工生成嵌入式 widget；关键决策点由人引导。
- **sim/代码的可验证性**：*Wrong Physics*（[2605.09360](https://arxiv.org/html/2605.09360v1)）——**execution-only repair 留下 39–40% "能跑但解错物理"**；**PhysVEC**（[2604.00149](https://arxiv.org/html/2604.00149)）双层验证器——`Programming verifier`（单元测试）+ `Scientific verifier`（物理有效性）。→ sim 验证必须分两层；"能跑"明确降级为最低门槛。代码单元自带测试（test-driven），学生也能验证（Verifiable Literate Programming）。
- **测验生成**：**EQGBench**（[2508.10005](https://arxiv.org/html/2508.10005v1)）五维——KP 知识点对齐/QT 题型/QQ 题干质量/SQ 解析质量/**CG 能力导向（所有模型最弱维）**；干扰项用"学生会怎么错"生成（[2501.13125](https://arxiv.org/pdf/2501.13125)）而非"再编三个错的"；retrieval practice 需要 desirable difficulty 梯度。
- **学习科学作为生成约束**：Auto-Slides（[2509.11062](https://arxiv.org/html/2509.11062v1)）把 CLT/CTML 操作化——**每页只有一个中心信息**、复杂度递增、图文空间邻接、PMRC 教学叙事替代论文叙事；**其明确局限"无法处理动态媒体/交互式绘图"正是 lectureAgent 的立身之地**。SlideBot（[2511.09804](https://arxiv.org/html/2511.09804v1)）：**预写 figure 宏只需填参数→降错误率保一致**★★；每个事实有出处；**带检索的小模型胜过无检索的大模型→架构 > 模型规模**★。Mayer 原则中 **redundancy** 反直觉但重要：别把旁白文字原样堆在页面上。

## 5. 长文档 / 课程级生成：时长、节奏与规划

- **DeepSlide**（[2605.15202](https://arxiv.org/abs/2605.15202)）★唯一显式建模时间预算的 slide agent：**可控逻辑链规划器 + per-node 时间预算**；Markov 式顺序渲染+风格继承；循环=检索→起草→**pacing check→refine/expand/stop**；**dual-scoreboard 把"静态产物质量"与"动态交付表现"分开**。
- 节奏公式（practitioner）：目标分钟×语速=总词预算→按页拆分→校准→timing table。
- **Survey generation 范式**（成熟度最高可迁移）：SurveyForge（人写综述作大纲先验+memory-driven 检索）、SurveyGen-I（**evolving plans + 记忆引导写作**）、Structure-Guided Memory Consolidation（对抗**复合误差**）。共同结论：**长文档质量瓶颈在大纲质量与跨节记忆一致性，不在单段生成能力**；复合误差是核心敌人（与 DECKBench 多轮 DTW 漂移同一现象）。
- **Learn Your Way**（Google LearnLM，[2509.13348](https://arxiv.org/abs/2509.13348)）★★最强教育内容生成+RCT 证据：四形态（Immersive Text/Slides&Narration/Audio Lesson/Mind Map）；**个性化 pipeline：先重分级+按兴趣换例得到规范化文本，作为所有后续表征的共同基底**；**专门微调教育插图模型**（通用图像模型不够用）；**RCT n=60：即时 +9%，3–5 天保持 +11pp（78% vs 67%）**。Audio Lesson **故意包含学生误解并由教师澄清**。
- **启示**：时间预算一等公民（交互组件有自己的时间成本模型：一个 sim≈N 分钟、一道 quiz≈M 分钟——**时长模型不能只按字数**）；dual-scoreboard（Artifact score vs Pedagogical score 分开优化，防美学吞内容）；**canonical content layer**（一次个性化，多形态派生，跨形态一致）；**misconception bank 一次投入三处复用**（常见错误页/quiz 干扰项/sim 反例参数）；教育插图是已知模型能力缺口；RCT 轻量可复制（60 人/40 分钟/即时+保持测验）。

## 6. 综合优先级（按证据强度 × 实现成本）

| 优先级 | 事项 | 依据 |
|---|---|---|
| P0 | render→inspect→patch 循环 | DeepPresenter 消融，全领域共识 |
| P0 | rule-based 布局/对比度 verifier | AeSlides F1 2–7×，成本≈0 |
| P0 | lectureLib 高层组件 API（禁裸写） | AutoPresent+SlideBot 双佐证 |
| P0 | sim/code 双层验证（程序+学科） | 39–40% runnable-but-wrong |
| P1 | Canonical Content Layer | Learn Your Way RCT +11pp |
| P1 | 独立 external critic（推理期保留） | DeepPresenter +67% |
| P1 | 显式 art direction 库 + 负面清单 | Science Advances 分布塌缩 |
| P1 | Vendi(DINOv2) 区间门禁 | 0.79 vs 0.17–0.35 |
| P2 | FSM 交互 IR + Playwright 四维评测 | 2508.19227 + 2606.31012 |
| P2 | per-node 时间预算与 pacing check | DeepSlide |
| P2 | DeckQuiz 教学保真度 | Paper2Poster PaperQuiz |
| P2 | scoped revision + frozen regions | MemSlides + DECKBench 漂移 |
| P3 | misconception bank 三处复用 | EQGBench CG 最弱维 + Learn Your Way |
| P3 | 教学法 Skill 打包 | Genspark Skills |

**三条"别做"**：①别做"整页文生图→逆向拆解"主路线（IoU 0.36）；②别用 VLM 当布局/对比度警察（规则能算的一律规则算）；③别让美学优化无约束地跑（trade-off 实测 + 熵塌缩）。

---

## Sources（精选一手来源）

- [PPTAgent (2501.03936)](https://arxiv.org/abs/2501.03936) · [DeepPresenter (2602.22839)](https://arxiv.org/html/2602.22839v1) · [AutoPresent (2501.00912)](https://arxiv.org/abs/2501.00912) · [Design First Code Later (2605.26451)](https://arxiv.org/html/2605.26451v1) · [EvoPresent (2510.05571)](https://arxiv.org/abs/2510.05571) · [MemSlides (2606.17162)](https://arxiv.org/abs/2606.17162) · [SlideTailor (2512.20292)](https://arxiv.org/abs/2512.20292) · [DECKBench (2602.13318)](https://arxiv.org/html/2602.13318v1) · [SlidesGen-Bench (2601.09487)](https://arxiv.org/abs/2601.09487) · [X+Slides (2606.19256)](https://arxiv.org/abs/2606.19256) · [Paper2Poster (2505.21497)](https://arxiv.org/abs/2505.21497) · [SlideCoder (2506.07964)](https://arxiv.org/html/2506.07964v1)
- [Images2Slides (2602.07645)](https://arxiv.org/abs/2602.07645) · [Design2Code (2403.03163)](https://arxiv.org/abs/2403.03163) · [HTML vs Image 指南 (Tosea 2026)](https://tosea.ai/blog/ai-slides-html-vs-image-generation-guide-2026)
- [Vendi Score (2210.02410)](https://arxiv.org/abs/2210.02410) · [Doshi & Hauser, Science Advances 2024](https://www.science.org/doi/10.1126/sciadv.adn5290) · [AeSlides (2604.22840)](https://arxiv.org/html/2604.22840v1) · [CPT (2604.04380)](https://arxiv.org/html/2604.04380) · [The AI design aesthetic (Kompozy)](https://kompozy.io/guides/the-ai-design-aesthetic)
- [Generative Interfaces (2508.19227)](https://arxiv.org/html/2508.19227v3) · [Evaluating Interactivity (2606.31012)](https://arxiv.org/pdf/2606.31012) · [ViviDoc (2603.27991)](https://arxiv.org/pdf/2603.27991) · [Wrong Physics (2605.09360)](https://arxiv.org/html/2605.09360v1) · [PhysVEC (2604.00149)](https://arxiv.org/html/2604.00149) · [EQGBench (2508.10005)](https://arxiv.org/html/2508.10005v1) · [学生选择预测生成干扰项 (2501.13125)](https://arxiv.org/pdf/2501.13125)
- [Auto-Slides (2509.11062)](https://arxiv.org/html/2509.11062v1) · [SlideBot (2511.09804)](https://arxiv.org/html/2511.09804v1) · [DeepSlide (2605.15202)](https://arxiv.org/abs/2605.15202) · [Learn Your Way (2509.13348)](https://arxiv.org/abs/2509.13348) · [Mayer 原则 (UCSD)](https://multimedia.ucsd.edu/best-practices/multimedia-learning.html)
- [SurveyForge (2503.04629)](https://arxiv.org/html/2503.04629) · [SurveyGen-I (2508.14317)](https://arxiv.org/html/2508.14317v1) · [Structure-Guided Memory Consolidation (2508.04306)](https://arxiv.org/pdf/2508.04306)
- 商业系统：[Genspark AI Slides](https://www.genspark.ai/helpcenter/ai-slides) · [NotebookLM Video Overviews](https://support.google.com/notebooklm/answer/16454555) · [Gamma 评述](https://tech-now.io/en/blogs/gamma-ai-in-2025-the-future-of-ai-powered-presentations) · [Presenton](https://github.com/presenton/presenton)
