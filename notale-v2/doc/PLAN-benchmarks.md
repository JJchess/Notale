# notale-v2 产品定位与可用 benchmark 调研

2026-09-10 · 只读调研，未改代码 · 供选型

## 1. 产品定位

**一句话**：把一个课题（或一份资料）变成一套**可交互的 HTML 讲义 deck**，给老师备课、上课用，之后还能打开改。

四个坐标，决定了哪些 benchmark 能用、哪些不能：

| 维度 | Notale 的位置 | 同类产品 |
|---|---|---|
| 输入 | 课题 / 长文档（含图） → 整套 deck，一次成片 | NotebookLM Slides、Gamma、Manus、aippt、PPTAgent / DeepPresenter / SlideTailor |
| 载体 | HTML（1600×900 逻辑画布、chassis 分步、讲稿区），**不是 pptx** | Claude Code / Cursor 直接写 HTML 幻灯片；DECKBench 基线也是 HTML |
| 页型 | 封面 / 内容页 / **交互页（仿真、参数滑块、可运行代码）** / 代码页；交互是一等公民 | InteractScience、I-WebGenBench 所测的"科学交互 demo" |
| 用途 | 教育：课堂讲授 + 学生自学，有测验 | SLATE、EduVisBench、TeachBench 所测的"教学有效性" |

自家三目标（G1 风格自适应、G2 工艺对齐金样本/Pudding、G3 去 AI 味）都是**工艺/设计**指标，外部 benchmark 里没有直接同构的，只能用"设计维度分项"近似。

## 2. 候选 benchmark（按贴合度排序）

### A. 文档 → 整套 deck（主战场）

| Benchmark | 规模 / 输入 | 判法 | 对 Notale 的贴合 | 链接 |
|---|---|---|---|---|
| **PresentBench**（2026-03） | 238 实例，五类含 **Education**；每实例附背景材料，平均 54 条二元 checklist | LLM judge，五维：基本功、视觉版式、内容完整/正确/忠实；有榜（aippt 70.8、NotebookLM 62.5、Manus 57.8） | **首选**。按渲染图判，HTML 可直接进；Education 子集就是我们的场景；能跟 NotebookLM 同榜比 | [arXiv 2603.07244](https://arxiv.org/abs/2603.07244) · [站点](https://presentbench.github.io/) · [代码](https://github.com/PresentBench/PresentBench) · [数据](https://huggingface.co/datasets/lynnzuo/PresentBench) |
| **SlidesGen-Bench**（EMNLP 2026） | 189 条指令，七场景含 **course preparation**；均长 4.5k 字，高难度带 20+ 图 | 三维：Content（10 题 QuizBank 由 VLM 答）、Aesthetics（四项可计算：和谐/吸引/对比/节奏）、Editability（PEI L0–L5）；Slides-Align1.5k 校准 | **次选**。明确接受 HTML 范式，全部转渲染图；Aesthetics 是确定性的，可做 G2 的廉价代理；Editability 对 HTML 会吃亏，只报前两维 | [arXiv 2601.09487](https://arxiv.org/abs/2601.09487) · [代码](https://github.com/YunqiaoYang/SlidesGen-Bench) |
| X+Slides（2026-06） | 113 题 × 7 场景，8,133 条源文档探针，按受众加权 | Coverage / Efficiency / Correctness | 测"讲义有没有把该讲的讲到"，正好补我们 judge 只看画面的短板；已测 NotebookLM / SlideTailor / DeepPresenter | [arXiv 2606.19256](https://arxiv.org/abs/2606.19256) |
| UniPPTBench（2026-05） | 四种输入：模糊题目 / 长文档 / 多模态文档 / 多源 | 共享 + 场景专属指标 | 覆盖"只给一个课题"的模糊输入，和我们 query 入口同形；代码"将公开"，待确认 | [arXiv 2605.17356](https://arxiv.org/abs/2605.17356) |
| DECKBench（2026-02） | 论文→slides 配对 + 模拟编辑指令 | 页级/deck 级忠实度、连贯、版式、多轮指令遵循 | 输出就是 HTML，且带**编辑**任务，对应 editor 线；学术论文场景偏离教学 | [arXiv 2602.13318](https://arxiv.org/abs/2602.13318) · [代码](https://github.com/morgan-heisler/DeckBench) |
| PPTEval / Zenodo10K（PPTAgent） | 10K pptx | MLLM 三维：内容/设计/连贯 | 老基线，面向 pptx，只当参考 | [arXiv 2501.03936](https://arxiv.org/pdf/2501.03936) |

### B. 交互页 / 科学演示

| Benchmark | 规模 / 输入 | 判法 | 贴合 | 链接 |
|---|---|---|---|---|
| **InteractScience**（2025-10） | 五个理科领域，题目 → 单页交互前端 | 单元测试验交互逻辑 + 参照快照 + checklist；测过 30 个模型 | **交互页首选**。和我们 `Check` 工具同思路，可直接拿它的题当交互页输入，跑 selfcheck 之外的外部判 | [arXiv 2510.09724](https://arxiv.org/abs/2510.09724) |
| I-WebGenBench（2026-06） | 19 篇论文 → 交互系统，专家做的参照 | 能否操纵输入观察动态 | 规模小，适合做交互页的定性对照 | [arXiv 2606.00750](https://arxiv.org/abs/2606.00750) |
| EduVisBench | STEM 教学可视化 | 教学有效性的静态视觉 | 测"图解是否有教学价值"，但不测交互 | 见 InteractScience 相关工作 |

### C. 前端工艺 / 视觉（对应 G2、G3）

| Benchmark | 特点 | 用法 | 链接 |
|---|---|---|---|
| **ArtifactsBench**（腾讯） | 渐进截图 + 逐题 checklist 的 MLLM judge，与 WebDev Arena 排名一致 94.4% | 不直接跑它的题，**借它的判法**重写我们的 G2/G3 judge（现在是整体印象判） | [arXiv 2507.04952](https://arxiv.org/abs/2507.04952) · [代码](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark) |
| Design Arena | 人投票，含 Data Visualization / Website 类 | 人类偏好的外部锚点，不能批量跑 | [UI-Bench 引述](https://arxiv.org/pdf/2508.20410) |
| LiveEvalBench（2026-08） | agent 式评：构建 / 代码 / UI 测试三角色 | 适合评"整套 deck 作为一个前端工程"是否能跑、能改 | [arXiv 2608.03689](https://arxiv.org/html/2608.03689v1) · [代码](https://github.com/wyysteelhead/LiveEvalBench) |
| WebGen-Bench | 导航 agent 验功能 + GPT-4o 评外观 | 参考 | [Semantic Scholar](https://www.semanticscholar.org/paper/f48b6e503ab68a50a77af89c9d6d4d22422a2a3d) |

### D. 教学有效性（别人都没测、我们该测的）

| Benchmark | 规模 / 方法 | 贴合 | 链接 |
|---|---|---|---|
| **SLATE**（2026-09） | 90 个教学单元、1,133 道题，前后测 + 近/远迁移，用 VLM 当"学生代理"（人测校准） | 唯一测"学完这套 slides 学生学到没"的；核心发现**教学设计与学习增益强相关，内容正确性弱相关**，正好支撑我们 G2 优先于堆内容的路线；语言学题材，需迁移 | [arXiv 2609.06212](https://arxiv.org/html/2609.06212) |
| TeachBench（2026-01） | 教学大纲锚定的教学能力 | 测 LLM 教学能力，不测 slides；做 quiz 页可借 | [arXiv 2601.21375](https://arxiv.org/pdf/2601.21375) |
| AI-Generated Slides: Are They Good?（WCCCE 2026） | 5 个工具 × 课堂实测；学生分不出 AI/人，且"低质量↔AI"有偏 | 无数据集，但它的**课堂盲评协议**可直接抄来做 G3 人测；结论也提醒 G3 judge 要防这个偏 | [arXiv 2605.13532](https://arxiv.org/html/2605.13532v1) |

## 3. 建议

1. **先跑 PresentBench 的 Education 子集**：背景材料喂进 Planner→Builder，`core/sample_shots.py` 出每页截图，用它的 checklist judge 打分，跟 NotebookLM 62.5 对位。这是唯一能给出"我们在市面上排第几"的数。
2. **同批产物再过 SlidesGen-Bench 的 Aesthetics 四项**（确定性、零 token），作为 G2 的日常回归指标；Content 用 QuizBank 补 judge 只看画面的短板。
3. **交互页单独用 InteractScience**：题目当交互页输入，单元测试 + 快照两道判，不再只靠 selfcheck。
4. **教学效果用 SLATE 的方法而不是它的数据**：前后测 + VLM 学生代理，套到我们自己五套 deck 上，是三目标之外唯一的"用户价值"读数。
5. **判法上抄 ArtifactsBench**：逐页 checklist + 渐进截图，替换现在的整体印象 judge。

不贴合、不建议投入：PPTC / PPTC-R / PPT-Eval（计算机操作 PowerPoint）、Paper2Poster / EvoPresent（学术论文→海报/演讲，题材偏离）。

已知落差：没有任何 benchmark 同时测"整套 deck + 交互 + 教学效果"，最终还得靠自家 refs/quality 三目标；以上都是单次生成、无编辑回合（DECKBench 除外）。
