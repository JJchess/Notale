# 调研：验证优先 / 接地生成（Verification-First & Grounded Generation）2024–2026

> 调研日期：2026-08-08。用途：`methodology/HARNESS.md` 终局图景的证据库之一。
> [一手] = 直接读到论文摘要/正文；[检索摘要] = 搜索结果聚合、未逐篇核实——做架构决策前需核原文。

---

## 0. 一句话结论

2024–2026 的共识收敛到一个不太浪漫的结论：**能被确定性 oracle 判定的部分必须交给 oracle；不能被判定的部分，不要指望"再加一个 LLM 判官"兜底。** judge 可靠性研究已从"怎么调 prompt 让 judge 更准"转向"怎么证明你的 judge 值得信任"——多数结论是负面的（判官误差高度相关、reliability 与 validity 脱钩）。对 lectureAgent：架构核心不是"生成+审稿"，而是**把尽可能多的正确性主张编译成可执行断言**，把 LLM judge 压缩到只负责真正无法形式化的残差，并明确承认这部分的置信度上限。

## 1. Evaluator-Guided Generation Loops

范式三代：**FunSearch**（LLM 在程序空间搜索，手写确定性 evaluate() 打分，骨架固定保证"总是可打分"）→ **AlphaEvolve**（diff 式变异 + 确定性多目标评估；约束："评估器必须 unhackable、机器可判定"）→ **AlphaProof**（oracle = Lean 证明检查器，0/1 无法被欺骗；auto-formalization 100 万→8000 万命题；IMO 银牌线）。共同骨架：**Generator（随机、创造、不可信）+ Verifier（确定、廉价、可信）+ Search**。

**Generator–Verifier Gap**：验证一个解所需的智力远低于生成它——这是 self-improvement 成立的根本前提。坏消息：**验证质量与验证者自身解题能力高度相关**（judge 不天然比 generator 强）；好消息：**多个误差模式不同的弱验证器组合可逼近强验证器**；工程放大 gap 的手段 = 给 verifier 提供 generator 没有的**工具**（执行、查库、跑仿真）——把 gap 从能力差变成信息优势差。

**迁移边界**：无机器可判定评估函数就不成立。成功迁移的共同点：**目标可以写成一个数**。"审美/教学效果/叙事合理"无标量真值，rubric-as-soft-evaluator 退化回 judge 可靠性问题。

**启示**：①把讲义正确性拆成**可判定池**（代码跑、数值对、公式恒等、量纲、有出处、时间线自洽）与**不可判定池**（清楚/好看/类比恰当），只对前者跑 evaluator-guided 循环；②仿 FunSearch"固定骨架+可变槽位"——LLM 生成填进受检骨架的片段而非自由整页；③主动扩大 gap：verifier 配 sympy/pint/执行/截图/检索原文，别用同一个模型换 prompt 当 judge（gap≈0）；④**oracle 前移到表示层**：先产出机器可读 lecture spec（事实三元组、公式符号形式、仿真初值与不变量、场景实体清单），再渲染；校验发生在 spec 层——本调研对架构最重要的单条建议。

## 2. LLM-as-Judge 可靠性（大部分是坏消息）

**偏差清单**：position bias（pointwise rubric 打分同样有）、verbosity bias（15–30 分偏好膨胀 [检索摘要]）、self-preference、fluency 当 correctness、对抗脆弱（**仅改文体就能让 FNR 跳变 0.24；对抗攻击可让某些 judge 把 100% 有害生成判为安全**——Know Thy Judge）。

**两项 2026 降温研究**：
- **Nine Judges, Two Effective Votes**：9 个跨 7 家族前沿模型的 panel 实际只提供约 **2 票独立信息**（~75% 名义独立性被相关误差吃掉）；panel 比理想值低 8–22pp；**单个最好 judge 在所有条件下匹配或超过整个 panel**。瓶颈是"判官相关"，不是聚合算法。
- **Reliability without Validity**（21 judges，54.1 万判决）：exact-match 与 kappa 相差 **33–41pp**（"一致率 85%"系统性高估）；judge 排名跨 benchmark 漂移最多 14 位；**test-retest >0.95 的 judge 同时 position bias >0.10——稳定不等于正确**。

**可信手段（按证据强度）**：①给 judge 工具/参考答案（判断→核对）②analytic rubric 分解 ③**canary/honeypot 测 judge 的 FPR/FNR 并给分数加置信区间** ④position swap + 长度归一化（卫生措施）⑤panel 只在**机制真正不同**时有价值（同族多模型投票基本无效）。

**启示**：不用多 LLM 投票给知识正确性背书；要多样性就要机制多样性（符号计算/检索原文/执行/VLM 看图）；每个 judge 建"体检档案"（canary 漏检率写进质量报告）；agreement 用 kappa；判决必须结构化（per-claim 布尔 + 证据 span），不要 "score: 8/10"。

## 3. 引用忠实度与检索接地

**度量体系**：AIS；**ALCE**（citation recall/precision，NLI 判蕴含）；**FActScore**（原子事实分解逐条验证——核心手法）；AttrScore/RAGAS/ALiiCE/Think&Cite/GenerationPrograms。归因指标跨数据集迁移性存疑。

**生产级数字（难看）**——*Cited but Not Verified*：前沿模型**链接有效率 >94%、相关性 >80%，但事实准确率只有 39–77%**；**工具调用从 2 次涨到 150 次，事实准确率平均掉约 42%**（检索越多≠越可靠）。[检索摘要] post-rationalization rate ≈55–57%（引用常是事后合理化而非真实证据链）。

**架构做法**：Anthropic 用独立 CitationAgent 做后置 pass（生成与引用绑定分离——内联引用容易变成事后合理化）。反面教材："claim 与源段落的绑定仅由 prompt 指令强制执行，系统层面没有任何机制能抓到幻觉引用。"

**启示**：每条事实做成一等公民对象 `{claim, atoms[], source_url, source_span, entailment, verifier_version}`；引用验证必须独立 pass 且**回抓原文**做 span 级 NLI（链接有效/内容相关几乎没有信息量）；原子分解必需（一句话常含 3–5 个可独立证伪断言）；限制检索广度、加大每条证据验证深度；给"无源可依"留显式 `unsourced` 状态（教学性简化必须声明而非混入）。

## 4. 视觉/多模态输出的验证

**VQA-based 检查**：把 spec 改写成是非问句让 VQA 答（TIFA/VQAScore/Gecko/WISE）。

**VLM 判官不可靠**：*Seeing Isn't Believing*（40 维、4000+ 定向扰动）——**超过 50% 的劣化输出检测不出**，组合关系/空间关系尤差；*Judge Without Seeing*——VLM 判官**欠用视觉信息、过度依赖文本**（可能只是在核对 caption）。与人类一致性仅 Spearman 0.57–0.75 [检索摘要]。

**最佳实践**：级联（启发式粗筛→VLM→人工校准）+ **反向一致性**（图→caption→与 spec 做文本 NLI）+ **强制看图的问句设计** + **注入式盲测**（故意生成"应当失败"的图测 checker）。

**历史/文化叙事（曹冲称象直接对口）**：*Synthetic History*（HistVis，3 万张）——扩散模型**频繁刻板化历史时代、引入年代错误**；*TAB-VLM*（600 题/1600 件文物）——**10 个 SOTA 模型最好者（GPT-5.2）总体准确率仅 58.7%**，非西方视觉文化能力缺口明确。**双红灯：生成大概率错，检查器本身在中国古代器物上 ~59%。**

**启示**：视觉正确性尽量**不靠生成**——参数化 2D/SVG/Three.js 场景 + 显式资产清单，正确性在构造时保证（oracle 前移的视觉版）；必须写**负面清单**（不得出现：现代衣着/玻璃/现代船型…）逐条 VQA 盲测（负面断言更容易被抓到）；视觉 checker 自带体检（注入错误集测召回率，<70% 不得标"已验证"）；降维到文本（图→结构化描述→与实体表符号级比对——judge 从"评价"变成"抄写+比对"）。

## 5. 仿真接地 & 过程监督 & 叙事一致性

**符号引擎 oracle**：NL→符号表示（FOL/方程/约束）→外部 solver（SymPy/SMT）判定。Step-Wise Formal Verification、AXIOM（"trust-first"）。

**本节最重要一篇**——*Your Simulation Runs but Solves the Wrong Physics*：**execution-based evaluation 对科学仿真不充分**——代码顺利运行但控制方程与意图不同（comprehension–generation gap）。方法：从生成代码**反向重构实际求解的 PDE**与意图规格比对（Intent Fidelity Score）。**"跑起来了、画面动了"完全不能证明模拟的是要教的那个物理。**

**过程监督 vs 结果监督**：PRM 在 step/trajectory 级评估优于 ORM（Let's Verify Step by Step 已确立）。**对讲义特别重要：讲义的价值恰在过程——"答案对但中间步骤错"的推导比答案错更糟，学生会把错的步骤学走。outcome-only 验证对 lectureAgent 结构性不足。**

**自我纠错天花板**：无外部反馈时 LLM 极少修正自己的推理错误，甚至把对的改错（ICLR 2024）；被质疑就翻供（FlipFlop）。共识：intrinsic 无效，extrinsic（工具/执行/外部模型）有效。

**叙事一致性（最不成熟、恰是曹冲称象的核心需求）**：SCORE（动态状态追踪+混合检索）；**Entity-Event Knowledge Graphs**（实体-事件图显式表达时序/因果边——正是需要的 narrative spec 形态）；Plot Hole Detection（叙事一致性检查本身是难任务）；Consistency-bugs taxonomy。**诚实汇报：没有找到成熟的叙事确定性 oracle**——当前 SOTA 是"LLM 抽实体-事件图→图上跑符号约束检查"，第一步仍不可靠。这是需要自己造轮子、风险最高的模块。

**启示**：物理/数学演示走 **spec→仿真→反向重构→比对**，至少做不变量断言（浮力等式 `ρ·V·g = m·g` 以可执行断言存在于 spec、每步被检查）；讲义用 process supervision（每步推导/每个关键帧/每条旁白句）；不设计任何依赖模型自查的环节；叙事层用实体-事件图做 spec，渲染前跑**确定性不变量检查**（实体不凭空出现、时序无环、因果链完整）；叙事检查器按 bug taxonomy 建规则库，而不是问 LLM"这个故事连贯吗"。

## 6. 综合：目标架构建议

**第一原则：正确性在 spec 层保证，不在渲染产物层检测。**

```
用户意图 → [1] Lecture Spec（facts[]/math[]/sims[]/narrative 实体-事件图/visuals[]
           正负清单/pedagogy 不可判定池显式标注）
        → [2] Deterministic Verifier Bank（跑在 spec 上：sympy/pint/执行+断言/
           回抓原文 NLI/图上约束求解/VQA 正负断言——最弱环节标注置信度）
        → [3] Evaluator-Guided Repair（只对失败原子项定向重生成）
        → [4] Renderer（固定骨架+受检槽位）
        → [5] Quality Report（每个验证器的 canary 漏检率一并输出）
```

**六条硬规则**：
1. 可判定的绝不交给 judge。
2. judge 必须有 generator 没有的工具或参考。
3. 不用同族多模型投票（九判官两票）。
4. 每个 verifier 必须有 canary 体检并公开漏检率。
5. 验证粒度 = 过程级，不是结果级。
6. 视觉与叙事是当前最弱环节（VLM 盲检 >50% 漏检、古代文化 58.7%）——靠**可控构造**绕开而非事后检测；绕不开的显式降级"未验证"进人审队列。

**最大未解风险**：叙事一致性缺确定性 oracle + 视觉检查器在中国古代题材不可靠——曹冲称象同时踩中两个。对策：受控资产库 + 参数化场景构造（"正确"变成构造时的不变量）+ v1 就把人审 gate 设计进流程。

---

## Sources（一手来源清单）

**Evaluator-guided / generator-verifier gap**
- [AlphaEvolve (arXiv 2506.13131)](https://arxiv.org/abs/2506.13131) · [白皮书 PDF](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/AlphaEvolve.pdf) · [Blog](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/)
- [AlphaProof (Nature 2025)](https://www.nature.com/articles/s41586-025-09833-y)
- [Solver-Verifier Gap 理论建模 (2507.00075)](https://arxiv.org/html/2507.00075v3) · [Variation in Verification (2509.17995)](https://arxiv.org/abs/2509.17995) · [Weak Verifiers (2506.18203)](https://arxiv.org/html/2506.18203v1) · [Trust but Verify 综述 (2508.16665)](https://arxiv.org/pdf/2508.16665)

**LLM-as-judge**
- [Nine Judges, Two Effective Votes (2605.29800)](https://arxiv.org/abs/2605.29800) · [Reliability without Validity (2606.19544)](https://arxiv.org/pdf/2606.19544) · [Know Thy Judge (2503.04474)](https://arxiv.org/abs/2503.04474)
- [LLM-as-a-Judge 综述 (2411.15594)](https://arxiv.org/html/2411.15594v6) · [Self-Preference Bias (2410.21819)](https://arxiv.org/pdf/2410.21819) · [Rubric Position Bias (2602.02219)](https://arxiv.org/pdf/2602.02219) · [RoPoLL (2606.30931)](https://arxiv.org/html/2606.30931) · [Autorubric (2603.00077)](https://arxiv.org/html/2603.00077v2) · [Awesome-LLMs-as-Judges](https://github.com/CSHaitao/Awesome-LLMs-as-Judges)

**引证/接地**
- [Cited but Not Verified (2605.06635)](https://arxiv.org/abs/2605.06635) · [ALCE (2305.14627)](https://arxiv.org/abs/2305.14627) · [ALiiCE (NAACL 2025)](https://aclanthology.org/2025.naacl-long.23.pdf) · [Think&Cite (2412.14860)](https://arxiv.org/pdf/2412.14860) · [GenerationPrograms (2506.14580)](https://arxiv.org/pdf/2506.14580) · [CiteGuard (2510.17853)](https://arxiv.org/html/2510.17853v1) · [Attribution Metrics Transfer (2606.23915)](https://arxiv.org/html/2606.23915) · [DeepFact (2603.05912)](https://arxiv.org/html/2603.05912v2)

**视觉验证**
- [Seeing Isn't Believing (2604.21523)](https://arxiv.org/pdf/2604.21523) · [Judge Without Seeing (2604.17768)](https://arxiv.org/pdf/2604.17768) · [Synthetic History / HistVis (2505.17064)](https://arxiv.org/pdf/2505.17064) · [TAB-VLM (2605.15071)](https://arxiv.org/abs/2605.15071) · [Awesome-Evaluation-of-Visual-Generation](https://github.com/ziqihuangg/Awesome-Evaluation-of-Visual-Generation)

**仿真/过程监督/叙事**
- [Wrong Physics / IFS (2605.09360)](https://arxiv.org/abs/2605.09360) · [LLMPhy (2411.08027)](https://arxiv.org/pdf/2411.08027) · [PhysCodeBench](https://openreview.net/forum?id=T9NxKVoqiu) · [Physics Supernova (2509.01659)](https://arxiv.org/pdf/2509.01659) · [BuildArena (2510.16559)](https://arxiv.org/pdf/2510.16559)
- [PRM 综述 (2510.08049, ACL 2026)](https://arxiv.org/abs/2510.08049) · [Awesome-PRM](https://github.com/RyanLiu112/Awesome-Process-Reward-Models) · [Step-Wise Formal Verification (2505.20869)](https://arxiv.org/pdf/2505.20869) · [AXIOM (2606.00671)](https://arxiv.org/pdf/2606.00671)
- [Cannot Self-Correct (2310.01798)](https://arxiv.org/pdf/2310.01798) · [When Can LLMs Correct (TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177/) · [FlipFlop (2311.08596)](https://arxiv.org/pdf/2311.08596)
- [SCORE (2503.23512)](https://arxiv.org/html/2503.23512v1) · [Entity-Event KG (2506.05939)](https://arxiv.org/pdf/2506.05939) · [Plot Hole Detection (2504.11900)](https://arxiv.org/pdf/2504.11900) · [Consistency Bugs (ACL Findings 2026)](https://aclanthology.org/2026.findings-acl.410.pdf) · [Temporal Consistency (2604.23051)](https://arxiv.org/pdf/2604.23051)
