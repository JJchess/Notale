# Benchmark 评分机制与指标定义（原论文 + 本地代码对照）

2026-09-15 · 来源标注在每条后：〔P§〕= 论文章节/表，〔C〕= 本地代码路径。论文与代码不一致处集中在 §14。

## 0. 总表

| Benchmark | 指标 | 计算方式 | judge | 聚合 | 人测对齐 |
|---|---|---|---|---|---|
| PresentBench | 5 维：基本功、视觉版式、完整、正确、忠实 | 每题定制 checklist，逐条二元判，每条单独一次调用 | gemini-3-flash-preview | 类内 yes/valid，5 类各 20 分等权，总分 0–100 | 24 题 × 5 系统排序，Spearman 0.532（PPTEval 0.303，人际上限 0.664） |
| SlidesGen-Bench | Content（QuizBank）、Aesthetics 四项、Editability PEI | 10 道 MCQ 由 VLM 凭 slide 文本答；四项确定性图像计算再加权；PEI 解析文件结构 | Content 用 gemini-3-flash-preview 默认；Aesthetics 无 judge | Content = 准确率；Aesthetics = 四项加权和（约 12–27）；PEI L0–L5 淘汰制 | Slides-Align1.5k，平均 Spearman 0.71（LLM judge 0.57，PPTAgent 0.53；人际 0.85） |
| SLATE | D1 知识有效性、D2 教学设计、D3 视觉统计、D4 学习增益 + 近/远迁移 | D1/D2 各 5 子项 1–5 分；D4 = 后测 − 前测准确率 | D1/D2：Claude Opus + Gemini 3.1 Pro + GPT-5.4 各跑 5 次取均；D4 学生 = Qwen3-VL-8B | 90 单元宏平均 | D1/D2 vs 3 位专家 r=0.80/0.69；D4 vs 30 人人测方向一致 85.7%，系统排序 ρ=1.0 |
| TutorGym | 学生：学习曲线；导师：判对/判错/示范准确率 | 每步 SAI 动作由导学模型 check() 给 ±1；按 DataShop 口径记首次尝试错误率 | 无 LLM judge，导学模型是 oracle | 按技能与机会数求均值曲线 | 与 192 名真人曲线定性对比（"remarkably similar"），无统计量 |
| EE-Eval | S_struct、S_sem、S_iso → S_total | few-shot LLM 从 HTML/JS 抽 FSM，与参照 FSM 比 | 抽取用 LLM；参照 FSM 专家 + LLM 半自动 | 0.4·struct + 0.4·sem + 0.2·iso | 166 件 × 2 人，四维；总体 r=0.696，交互性 r=0.728（VLM 基线 0.530） |
| DECKBench | 页级/deck 级：文本相似、图相似、困惑度、忠实、DTW、转场一致、LLM 连贯 | 嵌入余弦、CLIP、GPT-2 困惑度、DTW；多轮编辑看每轮向参照靠近多少 | LLM judge 可配（默认空，注释 gpt-5） | 按轮次与人设聚合 | 论文未量化人测 |
| X+Slides | Audience Coverage、Domain-wise Coverage、Efficiency、Correctness、SafeEfficiency | 8,133 探针，LLM 给每个受众 0–1 效用权，τ=0.7 定"必需"；效率 = 效用 / 注意成本（0.25×页数 + 词数/130） | LLM 效用 judge + 答题 judge | 按受众分别报 | 未报 |
| UniPPTBench | 5 项共享（指令遵循、吸引力、准确、视觉一致、视觉完整）+ 场景专属 | 0–10 分，视觉完整 = 10×(1−错误率) | Gemini 3 Flash（GPT-4 复核相关 >0.9） | 等权归一化到 [0,10] 取均 | 四场景 Spearman 0.52 / 0.72 / 0.89 / 0.92 |
| LecEval | CR、EC、LS、AE 各 1–5 | 微调 MiniCPM-V2.5 8B 打分 | 微调奖励模型 | 四项均值 | 2,097 样本 3 人标注 α 0.57–0.84；与人 Pearson 0.79（GPT-4V 0.32） |
| PPTEval | Content、Design、Coherence 各 1–5 | 看 slide 图 | GPT-4o | Content/Design 页均，Coherence 全 deck 一次 | Pearson 0.71，Spearman 0.74，Fleiss κ 0.59 |
| EduVisBench | 情境可视化、图解设计、图文整合、思维引导、交互性 各 0–5 | 五级 rubric | gpt-4.1（代码）/ GPT-4o（论文） | 五项和 /25 归一到 0–100 | 150 样本 vs 本科生：余弦 0.9655，MSE 0.5702 |
| InteractScience | PFT：OPR / APR / PPR；VQT：ASR、CLIP、VLM-judge | Playwright 用例；VLM 按 checklist 1–5 再缩放 0–100 | Gemini-2.5-Pro | 见 §12 | 30 题人工校验 ≥4/5；judge 排序一致 ρ>0.91；完整配置 vs 人 ρ=0.8827 |

---

## 1. PresentBench〔arXiv 2603.07244〕

**指标**：Presentation Fundamentals、Visual Design & Layout（material-independent）；Content Completeness、Content Correctness、Content Fidelity（material-dependent）〔P§3〕。
**判法**：每题一份人工写的 checklist（均 54.1 条）+ 领域共用 checklist；每条一次独立调用，二元 satisfied/violated 并要求给出定位证据；judge gemini-3-flash-preview〔P§4〕。education 域共用条目：类 1 有 13 条、类 2 有 17 条、类 3（逐页忠实）模板 35 条〔C `PresentBench-data/education/common_judge_prompt.json`〕。
**聚合**：论文写 s_i = yes_i / N_i，s = (1/5)Σ s_i〔P eq.1–2〕。代码实现为类权重 20/20/20/20/20，类内 `cls_total × yes/valid`，总分 = Σ类分 / 100〔C `PresentBench/scoring.py:70-120`，`judge_weights.yaml`〕，与论文等价。valid_count 只数回答了 yes/no 的条目；类内 valid=0 则该类 0 分。页数超限先截断到上限再判〔P§4〕；页数区间本身是代码判的（我们的日志见 "[judged by code]"）。
**人测**：24 题（约 10%）× 5 系统，人排序；Spearman：PresentBench 0.532、PPTEval 0.303、整体 MLLM 排序 0.258、人际 0.664〔P§5〕。
**榜**：NotebookLM 62.5（Education 55.0）、Manus 57.8、Tiangong 54.7、Zhipu 53.6、PPTAgent v2 50.2、Gamma 49.2、Doubao 48.0、Qwen 35.9〔P Table〕。
**已知偏差**：judge 见结果目录已有 `*_score.yaml` 直接跳过不重判〔C `judge.py` resume 逻辑，2026-09-11 实测〕；人测参与者 3 分钟内排序，不核材料，所以去掉忠实维反而不降相关——作者仍保留忠实维〔P§5 ablation〕。
**复核**：r2 总分 67.1 = (85+59+100+92+0)/5 = 67.2（四舍五入差异来自类内 yes/valid 非整数）✓。

## 2. SlidesGen-Bench〔arXiv 2601.09487〕

**Content（QuizBank）**：三阶段出题（取证→批评→出卷），每文档 10 道 MCQ，5 概念 5 数据；slide 先转 Markdown 再由 VLM 只凭 slide 上下文作答；准确率即分数；oracle 上下文 100%，抽取错误仅占 1.2%〔P§3.2〕。
**Aesthetics**〔P§3.3；C `eval/aesthetics_metrics.py`〕：
- Harmony：HSV 色相直方图拟合调和模板得每页最佳距离 D；S_slide = exp(−D²/2σ²)；S_harmony = w·(w_m·mean − w_d·std)。
- Engagement：Hasler–Süsstrunk 色彩度 M = √(σ²_rg+σ²_yb) + 0.3√(μ²_rg+μ²_yb)，加 deck 级节奏项 exp(−(σ_pacing−μ_target)²/2w²)。
- Usability：PaddleOCR PP-DocLayout_plus-L 检测文字区域，区域内 WCAG 对比度 c=(L_max+0.05)/(L_min+0.05)，S = ln(c)/ln(21)。
- Visual Rhythm（VisualHRV）：子带熵（pyrtools 可控金字塔）度量每页杂乱 + 页间 RMSSD。
- 总分 = 四项加权和，权重在 `aesthetics_config.json`。
**Editability（PEI）**：L0 静态 → L5 有动画，低层不过则高层不计分；pptx 解析 OOXML，HTML 解析 DOM〔P§3.4〕。
**人测**：Slides-Align1.5k，1,435 条美学记录，标注者含 CS 博士生、美术本科生、职员，排序任务，人际 ρ=0.85；SlidesGen 平均 Spearman 0.71（std 0.16），LLM-judge Rating 0.57 / Arena 0.52，PPTAgent 0.53〔P Table 2〕。暗色模式无系统性惩罚〔P§5〕。
**已知偏差**：仓库 `aesthetics_config.json` 里 harmony_sigma=0.0005（代码默认 0.05，注释说合理区间 0.01–0.1）；我们的每页最佳距离在 0.17–1.31，任一 sigma≤0.05 下 S_slide≈0，Harmony 恒为 0；sigma=0.5 时得 −1.12，才落到榜表 −0.35～−2.15 的区间。**榜表的 Harmony 口径与随仓库发布的配置不一致**，Aesthetics 总分跨系统比较时应把 Harmony 剔除或统一 sigma 后重算。Usability 无版面检测时会退化为整图对比度（我们实测 0.17 → 检测后 4.56）。
**复核**：27.26 = 4.56 + 7.77 + 0.00 + 7.48 + 7.45 ✓〔C `calculate_total_aesthetics_score`〕。

## 3. SLATE〔arXiv 2609.06212〕

**D1 知识有效性**（1–5 × 5 子项）：规则覆盖、数据保真、元语言准确、答案不泄漏、范围恰当。**D2 教学设计**（1–5 × 5）：认知负荷、工作样例、脚手架、双通道整合、练习质量。judge = Claude Opus、Gemini 3.1 Pro、GPT-5.4 三家各 5 次取均〔P§4.1–4.2〕。
**D3**：自动统计（页数、每页词数、表格、色彩多样性、视觉辅助完整度、有无练习）〔P§4.3〕。
**D4**：前测（材料相关题，无讲义；宏基线 23.78%）→ 学（PNG 逐页）→ 后测（同题）→ 近迁移（同结构新输入）/ 远迁移（跨域或跨功能）。增益 = 后测 − 前测准确率（原始差，非归一化增益）〔P§4.4〕。学生 Qwen3-VL-8B-Instruct，从 4 个 Qwen VLM 消融中选出；效应随容量单调：3B −1.4%，4B +4.3%，7B +4.0%，8B +5.0%〔P Table 5〕。
**结果**：Claude Opus 4.7 +5.46%，Qwen3.6-Max +5.14%，MiniMax-M2.7 +3.27%，GPT-5.4 +2.61%，Gemini-3.1-Pro −2.51%；近迁移 35–42%，远迁移 11–16%〔P Table 3〕。D2 与增益 ρ=0.72（p=0.019），D1 ρ=0.38（p=0.28），N=10 系统，作者自称"suggestive"〔P§6〕。
**人测**：30 人，三系统（高/中/负增益），方向一致 85.7%，排序 ρ=1.0，人后测增益 t(29)=6.78；D1/D2 三位专家 ICC 0.80/0.72，人机 r 0.80/0.69〔P§5, App. N〕。
**局限**：一次性、非交互学习；VLM 无情景记忆、不能提问；仅显式规则型教学〔P§7〕。**代码与数据未见发布**。

## 4. TutorGym〔arXiv 2505.01563；C `benchmark/tutor_gym`〕

**环境**：`ProblemState` = 界面对象字典（元素 id、标签、控制流），可附浏览器截图〔C `tutorgym/shared.py:23`〕。动作 = (selection, action_type, input) 三元组〔C `shared.py:206`〕。正确性由导学模型 `check()` 给 +1/−1〔C `env_classes/env_base.py:58`〕。三类导学：CTAT、Apprentice、OATutor，223 域。
**学生指标**：学习曲线 = 每技能每次机会的**首次尝试错误率**，DataShop 口径；日志走 `DataShopLogger` 生成事务表〔C `eval/llm_stu_eval.py:188-215`〕；每模型 5 次模拟取均，与 192 名真人（Apprentice 域）曲线对比，论文给的是定性判断（"qualitatively quite similar"），没有 RMSE 等统计量〔P§5〕。
**导师指标**：判对准确率 52–92%，判错检出 10–50%（低于随机），示范生成准确率 36–71%〔P§5〕。
**对 Notale**：接入需把页面暴露成 `ProblemState` + SAI；其学习曲线只对"多次尝试的技能型活动"有定义，讲义的概念页没有"机会数"，要配 SLATE 的前后测。

## 5. EE-Eval〔arXiv 2606.31012；代码 github.com/WangZhewei1027/EE-Eval〕

**FSM 抽取**：few-shot LLM 读 HTML/JS，输出 JSON：metadata、states（进入/退出动作、UI 线索）、events、transitions、component→DOM selector 映射；经 schema 校验〔P§3.2〕。
**参照 FSM**：专家定设计原则 → 专家写代表性概念的参照 → LLM 扩展 → 人工抽检〔P§3.3〕。
**指标**：S_struct = 节点数相似 × 边数相似（1 − |Δ|/max）；S_sem = all-MiniLM-L6-v2 嵌入余弦（状态标签、动作、事件、元数据）；S_iso = 同构分（度序列 + 语义类别，命中 1 否则 0）；S_total = 0.4·S_struct + 0.4·S_sem + 0.2·S_iso，权重网格搜索〔P§3.4〕。
**人测**：166 件 × 2 人，6 位有 CS 训练的评审，四维（功能正确、视觉、交互、教学）；总体 r=0.696，交互性 r=0.728；基线：VLM 看首末截图 r=0.530，LLM 生成的 Playwright 单测 r=−0.600〔P§5〕。
**规模**：2,497 件、127 个 CS 概念、6 模型。**局限**：不量内容正确与学习结果；连续交互被离散化〔P§7〕。

## 6. DECKBench〔arXiv 2602.13318；C `benchmark/DeckBench/metrics`〕

**页级**：参照型——文本嵌入余弦、CLIP-ViT 图相似、顺序感知匈牙利匹配〔C `slide_metrics.py:106-150`〕；无参照型——GPT-2 困惑度、忠实度（与最相近论文块的相似）、版面几何指标〔C `slide_metrics.py:35-105`〕。
**deck 级**：DTW 软对齐、转场一致性、deck 忠实/保真（覆盖论文内容）、LLM 连贯判〔C `deck_metrics.py:25-195`〕。judge 模型在 `evaluation_config.yaml` 里留空（注释 gpt-5）。
**多轮编辑**：用户模拟器比较中间 deck 与人工终稿，三种人设（细/中/粗），每轮分 = DTW 距离与转场相似度的改善量〔P§4.2〕。294 对论文-deck，论文均 19.5 页、deck 均 15.4 页。**人测未量化**。

## 7. X+Slides〔arXiv 2606.19256〕

113 题（50 学术 + 63 非学术）→ 8,133 条源文档探针（问题、答案、证据段、深度 1–4、信息域六类、证据模态五类），三次生成去重。LLM 效用 judge 给每个受众（专家 / 学习者 / 决策者）0–1 权重，τ=0.7 为"必需"。Audience Coverage = deck 能答出的必需探针效用占比；Domain-wise 按六域拆；Efficiency = 效用 / 注意成本，注意成本 = 页数 或 0.25×页数 + 词数/130 分钟；Correctness = 声明级对源核验；SafeEfficiency = 时间效率 × 正确率〔P§3–4〕。结果：DeepPresenter 学习者覆盖 0.714 / 专家 0.496；SlideTailor 0.594 / 0.331；NotebookLM 决策者 0.853 但正确率偏低〔P§5〕。人测未报；代码与提示词已发布。

## 8. UniPPTBench〔arXiv 2605.17356〕

126 题：模糊题目 27、长文档 32、多模态文档 48、多源 19。共享 5 项各 0–10：指令遵循、吸引力、内容准确、视觉一致、视觉完整（=10×(1−渲染错误率)）；场景项：长文档加要点覆盖与声明忠实，多模态加视觉元素利用、图-声明对齐（0/0.5/1）、图表转译保真，多源加跨文档覆盖、整合、去重。judge Gemini 3 Flash，GPT-4 复核相关 >0.9；等权归一后取均〔P§3–4〕。人测 Spearman：0.52 / 0.72 / 0.89 / 0.92〔P§5〕。代码"将公开"。

## 9. LecEval〔arXiv 2505.02078〕

输入 = slide 图 + 人工清洗对齐的讲解转写；四 rubric 各 1–5：内容相关、表达清晰、逻辑结构、受众参与。2,097 样本 / 56 讲，3 位专家标注，Krippendorff α 0.57–0.84。微调 MiniCPM-V2.5 8B；与人 Pearson 0.79（分项 0.74/0.86/0.78/0.79），GPT-4V 0.32〔P Table 3〕。数据、工具、模型已发布。**注意它需要讲解文本**，我们有讲稿区正好能喂。

## 10. PPTEval〔arXiv 2501.03936〕

Content、Design（页级，看 slide 图）、Coherence（全 deck 一次）各 1–5，GPT-4o；页级取均。人测 Pearson 0.71（0.70/0.90/0.55），Spearman 0.74，Fleiss κ 0.59。Zenodo10K 10,448 份 pptx；实验用 5 域各 50 份〔P§4–5〕。PresentBench 指出它整体判分偏高、诊断价值低〔PresentBench §5〕。

## 11. EduVisBench〔arXiv 2505.16832；C `EduVisBench/run_evaluation.py`〕

五维各 0–5：情境可视化、图解设计、图文整合、思维引导、交互性（代码第 46、53 行有后两维 rubric）；总分 /25 归一到 0–100。judge 论文写 GPT-4o，代码写死 `gpt-4.1`。150 样本对本科生：余弦 0.9655、MSE 0.5702〔P§4〕。1,154 题：数学 732、化学 215、物理 207，三难度。

## 12. InteractScience〔arXiv 2510.09724；C `InteractScience/cal_metrics.py`、`vlm_as_judge.py`〕

**PFT**：150 题 779 条 Playwright 用例。OPR = 全部用例通过数 / 总数（微平均）；APR = 每题通过率再平均（宏平均）；PPR = 全部用例都过的题占比〔C `cal_metrics.py:20-46`〕。
**VQT**：590 条快照用例。ASR = 动作能执行出快照的比例；CLIP = 生成快照与参照快照嵌入余弦；VLM-judge = Gemini-2.5-Pro 按 checklist 逐条 1–5 再缩放 0–100〔C `vlm_as_judge.py:19-88`〕。
**校验**：30 题人工评 ≥4/5；单测正确率 >86%；不同 judge 排序 ρ>0.91；完整配置（参照快照 + checklist）vs 人 ρ=0.8827〔P§4–5〕。
**复核**：我们 47.9 / 45.1 / 16.7 = OPR / APR / PPR，定义与代码一致 ✓。

## 13. 人测对齐一览（越高越可信）

| Benchmark | 统计量 | 值 | 样本 |
|---|---|---|---|
| SLATE D4 | 排序 ρ / 方向一致 | 1.0 / 85.7% | 30 人 × 3 系统 |
| UniPPTBench | Spearman | 0.52–0.92 | 四场景 |
| InteractScience | Spearman | 0.88 | 专家 |
| LecEval | Pearson | 0.79 | 2,097 样本 |
| PPTEval | Pearson / Spearman | 0.71 / 0.74 | — |
| SlidesGen-Bench | Spearman | 0.71 | 1,435 记录 |
| EE-Eval | Pearson | 0.70（交互 0.73） | 166 件 × 2 |
| PresentBench | Spearman | 0.53（人际 0.66） | 24 题 × 5 系统 |
| EduVisBench | 余弦 / MSE | 0.97 / 0.57 | 150 样本 |
| TutorGym | 定性 | — | 192 人曲线 |
| DECKBench、X+Slides | 未报 | — | — |

## 14. 论文与代码不一致 / 未公开

1. SlidesGen Harmony：仓库配置 sigma=0.0005 使该项恒 0；榜表为负值，口径未随仓库给出。跨系统比较应剔除或统一重算。
2. SlidesGen Aesthetics 权重：代码默认（contrast 20、harmony 0.5×100）与 `aesthetics_config.json`（contrast 7、harmony 0.4×5/20）不同；我们按配置文件算。
3. EduVisBench judge：论文 GPT-4o，代码 gpt-4.1。
4. PresentBench 聚合：论文写 1/5 等权均值，代码为类权重 20×5 再除 100，数值等价；但 valid_count 规则（跳过未答条目）只在代码里。
5. SLATE、UniPPTBench：代码与数据未发布。
6. DECKBench：judge 模型留空，人测未量化。
