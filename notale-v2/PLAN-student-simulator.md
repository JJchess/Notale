# 学生模拟器类 benchmark 调研 v2：交互式学习环境里的模拟学生

2026-09-14 · 只读调研 · v1 只看了"slide 类教材"的模拟学生，结论"没人做过代理操作交互环境再测学习"是错的；v2 补上交互环境那一支，重写结论。

## 0. 结论（改过）

1. **模拟学生在交互环境里学，是一个有 20 年积累的方向**，分两代：
   - 机理派：SimStudent、Apprentice Learner（AL）。学生是认知架构，从演示和反馈里归纳技能，在几十个智能导学系统（ITS）里复现了真人学习曲线；已经被用来**在电脑里做教学设计的 A/B**（分数导学的替代干预、钢琴学习的视觉辅助）。
   - LLM 派：TutorGym（2025）让 LLM 当学生逐步操作 CTAT / Apprentice / OATutor 三类 ITS 的界面，223 个域，学习曲线和 192 名真人对比"惊人地像"；Hyp-Mix（2024）在开放式物理学习环境里模拟学生动作，是 LLM 在开放交互环境里模拟学习行为的第一份证据。
2. **但它们的"环境"都是 ITS：有符号化状态、有限动作集、每步有对错反馈。** 没有一个把"任意生成的 HTML 讲义页"当环境。TutorGym 加新环境要按它三种导学范式之一建模，不能直接塞网页。
3. 所以对 Notale 的正确路线不是"找一个 benchmark 跑"，而是**把 Notale 的页面做成 TutorGym 式的环境**（导出状态 JSON + 选择-动作-输入三元组），然后复用 TutorGym 的学生代理和学习曲线工具，再套 SLATE 的前后测协议。这条路的每一段都有先例，拼起来是新的。
4. 人类实证对"交互更助理解"的支持是有条件的，且最新的几项研究都在警告：交互带来的**主观投入感与实际学习脱钩**。实验必须能出否定结果。

## 1. 交互环境里的模拟学生：谁做了什么

| 工作 | 学生是什么 | 环境 | 怎么验证 | 对 Notale 的可用性 |
|---|---|---|---|---|
| **TutorGym**（2505.01563，MIT 协议，github Teachable-AI-Lab/tutor_gym） | LLM 代理，每步被问"作为学生你会做什么" | CTAT / Apprentice Tutors / OATutor 三类 ITS，223 个域；状态默认 JSON，可附浏览器渲染截图；动作是 (selection, action_type, input) 三元组 | 学习曲线（按技能的首次尝试错误率，DataShop 口径）对比 192 名真人；ICL 训练的学生曲线"remarkably human-like" | **最可复用的骨架**：`llm_stu_eval.py` 已能跑 LLM 学生；缺的是把我们的页面接成它认的环境 |
| **Apprentice Learner / SimStudent**（MacLellan & Koedinger 2020 等） | 认知架构：how/where/when 三个学习机制从演示和反馈归纳产生式 | ITS | 几十个域复现真人学习曲线 | 机理派学生不会"预先知道"内容，没有泄漏问题；但它学的是程序性技能，不适合概念理解类讲义 |
| **在电脑里做教学设计 A/B**：分数导学替代干预（2408.13684，ACS 2023）、钢琴视觉辅助（AIED 2025） | 按个体校准的 AL 模型 | 分数导学 / 钢琴练习 | 模拟预测与已有真人发现一致，并给出可检验的新预测 | **方法论范本**：这正是我们要做的事——比较两种教学设计，先在模拟学生上跑 |
| **Hyp-Mix**（2410.02110） | GPT-4 Turbo 按"可检验假设"组合出的学生模型 | 开放式物理学习环境 | 学生模型换了、行为仍校准；警告对提示词敏感、可能是记忆 | 证明 LLM 能在开放交互环境里模拟学习行为；但作者自己说结果可能来自训练数据记忆 |
| **SLATE**（2609.06212） | Qwen3-VL-8B | 幻灯片 PNG（静态） | 30 人人测，方向一致 85.7%，系统排序 ρ=1.0 | 前测-学-后测-近/远迁移协议；泄漏靠低资源语言绕开 |
| **EE-Eval**（2606.31012） | 无学生 | AI 生成的 explorable | 抽有限状态机，与理想 FSM 比 | 交互结构的过程指标 |
| 可控"不完美学生"（2605.25601）、SOEI、Agent4Edu、EduAgent、Student Development Agent、Edu-Theater | LLM 扮学生，重点在**控制知识水平和错误模式** | 答题 / 对话 | 与真人答题分布对比 | 解决"学生太聪明"的工具箱：技能向量指定掌握与缺失 |
| EduClaw-Bench、TutorGym 的 tutor 侧、TeachBench、EducationQ、Teach2Eval | — | 对话辅导 | — | 测的是辅导 agent，不是教材 |

## 2. 人类实证：交互到底帮不帮

**支持（有条件）**
- D'Angelo et al. 2014（SRI 元分析）：交互模拟 vs 同内容无模拟 g=0.67；模拟加脚手架 vs 裸模拟 g=0.43。
- Rutten et al. 2012：模拟增强传统教学，效应量最高到 1.54。
- ICAP（Chi & Wylie 2014）：每上一档约多学 8–10%；"Interactive"指对话式共同建构，拖滑块只算 Active。
- **Learn Your Way**（Google，2509.18664 / Frontiers 2026）：60 名高中生 RCT，交互多模态平台 vs 电子教材。即时回忆 77% vs 68%，3–7 天后 78% vs 67%，r≈0.25，p≈0.03。作者把效果归到**分块、随堂小测和反馈、多表征**，不是滑块；对照组没有配平这些脚手架，所以说的是"脚手架"不是"交互"。
- Distill "Communicating with Interactive Articles"（Hohman 2020）综述：有证据的是**先预测再看**（You Draw It 提升回忆）、分段控速、低风险测验；没证据的是版式（滚动 vs 翻页无差异）、社交对比。作者原话："interactive articles 的有效性缺少实证评估"，呼吁找出"交互值得其成本"的情形。

**警告**
- de Jong & van Joolingen 1998：无引导的模拟探索效率差，学生不会提假设、设计实验、解读结果。
- "Games That Teach, Chats That Convince"（2602.17905，2026）：文字游戏组**自评学到更少**，24 小时后测却更高；"互动时长、话多"这类投入代理**只和主观体验相关，不和学习相关**。
- 反事实解释界面研究（2026）：交互界面与静态对照常常把"用户能动性"和"信息量不等"混在一起；更多控制权提高心理负荷和挫败感，成绩不涨。
- SLATE：教学设计与增益 ρ=0.72，内容正确性 ρ=0.38 不显著；有系统增益为负。

**对产品假设的判断**：文献支持的是"**有引导的、要求预测和解释的**交互 + 反馈"，不是"页面可交互"。我们 09-05 量到交互页 14 页里 12 页被判 AI 味、滑块几乎没有一页从知识结构长出来。假设合理，现在的产物大概率没兑现它。

## 3. 三个硬问题与各自的先例解法

| 问题 | 先例给的解法 |
|---|---|
| 泄漏 / 能力悖论：大模型本来就会 | SLATE 用低资源语言；机理派学生天然不会；2605.25601 用技能向量显式指定"缺哪些"。我们：题目用材料自定义的规则 / 虚构机制 / 私有数据，走 `--materials` |
| 静态代理看不见交互 | TutorGym 的环境接口：状态 JSON + 可选截图 + SAI 动作。我们的 chassis 本来就有 `Deck.step`、带 id 的控件，导出一份状态 JSON 和动作表是小工程 |
| 模拟学生保真度 | 只做**两臂排序**不报绝对值（SLATE 的校准结论）；学习曲线对比真人（TutorGym 口径）；最后做 20–30 人人测校准方向 |

## 4. 建议的实验：Notale 交互消融 v2

**环境侧（工程）**
- chassis 导出 `Deck.state()`：当前步、每个交互控件 (id, 类型, 当前值, 可选值域)、可见的关键文本。
- 动作三元组 (selection, action_type, input)：`step_next`、`set_slider(id, v)`、`click(id)`、`read(region)`。
- 这就是 TutorGym 的 SAI 接口。先不改它的仓库，写一个薄适配把 Notale 页面暴露成同形状的环境，复用它的 `llm_stu_eval.py` 循环和日志格式。

**学生侧**
- 主学生：Qwen3-VL-8B（SLATE 同款，便宜、有余量、可复现），每题 3 个种子。
- 对照学生：Qwen3-VL-4B（看效应是否随能力单调，SLATE 的消融就是这么做的）。
- 不用 3.8-flash 级模型当学生。

**题目**
- 10 个代理不可能预先知道的主题：材料里自定义的机制或规则、编造的数据集、低资源领域。同一份 Planner 页表出三臂。

**三臂**
- A 静态：`?all` 全展开截图逐页看（= SLATE）。
- B 交互：代理操作页面，动作预算每页 6 次，每次动作后截图入上下文。
- C 静态 + 讲稿：分离"交互"与"信息量"（09-05 的 judge 教训；反事实界面研究也指出这个混淆）。

**测量**
- 前测 → 学 → 后测 → 近迁移 / 远迁移（SLATE 协议）。主指标 = B − A、B − C 的增益差及置信区间。
- 过程指标：EE-Eval 式 FSM（可控状态数、转移数、反馈数）；代理动作日志里"预测-验证"行为的比例。
- 学习曲线：如果交互页有多次尝试的活动，按 TutorGym 口径画首次尝试错误率曲线。
- 校准：20–30 人人测，只验方向和排序。

**阶段**
- 阶段 0（2–3 天）：chassis 状态导出 + SAI 适配 + 跑通一页。
- 阶段 1（1 周）：10 题 × 3 臂 × 3 种子，看 B − A 有没有信号。
- 阶段 2：有信号则扩题并人测；无信号则先改交互页契约（预测-验证式引导，见 §2 有证据的那几种交互），再量。

**不做的**
- 不跑 SLATE 原题、TutorGym 原域（都不是我们的内容）。
- 不接对话辅导类 benchmark，除非产品加助教线。
- 不用投入时长、动作次数当效果指标（2602.17905 已证明它们只和主观体验相关）。

## 5. v1 → v2 改了什么

- 撤回"代理操作交互环境再测学习没人做过"：TutorGym、Apprentice Learner 系、Hyp-Mix 都做了，还用它来做过教学设计的 A/B。
- 新增 Learn Your Way 这份直接对着产品假设的人类 RCT，以及 2026 年两项"交互 ≠ 学习"的警告。
- 实验设计从"自己发明学生代理"改成"把页面接成 TutorGym 式环境，复用现成学生和曲线工具"。

## 来源

TutorGym arXiv 2505.01563 · github.com/Teachable-AI-Lab/tutor_gym · Apprentice Learner（MacLellan & Koedinger 2020；chrismaclellan.com/projects/apprentice_learning） · 分数导学替代干预 arXiv 2408.13684 · 钢琴视觉辅助（AIED 2025，Springer 978-3-032-13174-4_12） · Hyp-Mix arXiv 2410.02110 · SLATE arXiv 2609.06212 · EE-Eval arXiv 2606.31012 · 可控不完美学生 arXiv 2605.25601 · SOEI arXiv 2410.15701 · Agent4Edu arXiv 2501.10332 · EduAgent arXiv 2404.07963 · Student Development Agent arXiv 2510.09183 · Towards Valid Student Simulation arXiv 2601.05473 · Substance or Illusion? arXiv 2601.04025 · Learn Your Way arXiv 2509.18664 / Frontiers in AI 2026 · Games That Teach, Chats That Convince arXiv 2602.17905 · Hohman et al. 2020, Distill "Communicating with Interactive Articles" · D'Angelo et al. 2014 SRI · Rutten et al. 2012 · Chi & Wylie 2014 · de Jong & van Joolingen 1998

## 6. v3 补充（2026-09-15）：以"观众答题"为量尺的教学视频类 benchmark

第三轮换了搜索面（教学视频生成、代码生成动画、论文讲解视频），找到一支之前漏掉的：**让 VLM 当观众看完生成的讲解视频后答题，用答对率的提升当学习指标**。它们的产物形态比 slide 类更接近我们（从一个主题出发、代码生成、多场景、带讲解），量尺是学生模拟器本身，但输入仍是线性视频，交互依旧进不去。

| Benchmark | 输入 → 输出 | 学生怎么当量尺 | 其他指标 | 人测 | 代码 |
|---|---|---|---|---|---|
| **Code2Video / MMMC**（2510.01174，showlab） | 主题词 → Manim 代码 → 讲解视频 | **TeachQuiz**：Gemini-2.5-Pro 先用"遗忘提示"屏蔽该主题知识答 10 道 MCQ 得基线，再看视频重答；分 = 看后准确率 − 遗忘基线 | 美学 5 维各 0–100（版式、吸引力、逻辑流、视觉一致、准确与深度），Gemini-2.5-Pro 判 | 中学生 + 本科生；美学分与 TeachQuiz 相关 r=0.97 | github.com/showlab/Code2Video，`eval_TQ.py` / `eval_AES.py`，MMMC 456 段视频 13 学科 |
| **Paper2Video**（2510.05096） | 论文 → 讲解视频 | **PresentQuiz**：LLM 从论文出四选一题，VideoLLM 看视频作答，准确率 = 信息传达度；**PresentArena**：VideoLLM 当观众成对比较，正反序各一次 | Meta Similarity（与真人 slide/字幕/语音相似）、IP Memory（看 5 秒片段后能否把讲者和内容对上） | 10 人排序 | 开源承诺，101 篇论文 |
| **PresentAgent / PresentEval**（2507.04036） | 长文档 → 叙述式演示视频 | 观众答题准确率 | VLM 判内容保真、视觉清晰 | 30 对样本 | github.com/AIGeeksGroup/PresentAgent |
| **Teaching Monster Challenge**（2608.08852） | 主题 + 学习者画像 → 完整教学视频 | 无模拟学生；学习者画像是评判标准 | LLM 初筛 → 众包成对投票 → 专家终审 | 有众包与专家 | 发布 benchmark、rubric、人判 |
| TheoremExplainBench（2502.19400） | 定理 → Manim 视频 | 无 | VLM 判 5 维：准确深度、视觉相关、逻辑流、元素版式、视觉一致 | — | 有 |
| VisualEDU（EMNLP 2025 Findings） | 教育解题 → Manim 视频 | 无 | 时序一致、逻辑正确、视觉清晰 | — | 有 |

**对 Notale 的意义**
- 我们的 deck 可以无损投影成视频：`?all` 或分步截图序列 + 讲稿区文本（或 TTS）。这个投影比 PDF 保留得多：分步顺序、讲解与画面的对应都在，只丢"用户可操作"这一层。
- TeachQuiz 的协议能直接套：主题 → 我们的 deck 视频 → 遗忘基线 → 看后答题。缺点是"遗忘提示"的效度存疑（模型并没有真忘），SLATE 用低资源题目绕开这个问题更严谨；可以两种都做，看结论是否一致。
- PresentArena 的"VideoLLM 观众成对比较"可以直接用于 G2（对齐金样本）的成对盲评，替代现在只看单张图的 judge。
- Teaching Monster Challenge 的"LLM 初筛 → 众包 → 专家"三级流程是人测协议的现成模板。

**仍然没有的**：把"用户能操作"当输入的学生模拟器。EE-Eval 量交互结构但不量学习；TeachQuiz 量学习但不看交互。交互消融实验（§4）还是要自己搭，但现在 A 静态臂可以升级成"视频臂"（TeachQuiz 协议），比 PNG 臂更接近真实使用。

**修正 v2 的一句话**：v2 说"没有一个把任意生成的 HTML 讲义当环境"仍然成立；但"教材级、学生模拟器当量尺、产物是代码生成的多模态讲解"这个组合，Code2Video 已经做了，我们不用从 SLATE 的 PNG 起步。
