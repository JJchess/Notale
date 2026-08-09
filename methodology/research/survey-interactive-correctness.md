# 调研：如何验证"自动生成的、可执行的、行为空间开放"的产物

> 调研日期：2026-08-08。三路并行跨领域调研的综合。
> 用途：[`../VERIFY-EXEC.md`](../VERIFY-EXEC.md) 的证据库。
> **本文是证据库不是规则**——VERIFY-EXEC 只取了其中一小部分立为规则，其余记录在此备查。
> 部分条目标注了"未能核实"，做决策前需核原文。

## 0. 抽象问题与三个子问题

被调研的抽象问题：**如何验证一个自动生成、可执行、行为空间开放（用户可任意顺序交互）的产物是对的？**

各领域把它拆成三个子问题，答案各不相同：

| 子问题 | 学名 | 各领域的答案 |
|---|---|---|
| 输入空间无界，怎么采样？ | stimulus generation | 硬件=约束随机；游戏=RL/好奇心 agent；Web=爬虫/monkey；CPS=鲁棒度制导搜索 |
| 没人写期望输出，对错谁说了算？ | **the oracle problem** | 硬件=断言+参考模型；Web=通用不变量；仿真=解析解/守恒量/蜕变关系；动画=感知实验 |
| 什么时候算测够了？ | stopping criterion | 硬件=覆盖模型闭合；认证=按等级定义的目标集；游戏=可达性覆盖 |

**综合后的判断**（即 VERIFY-EXEC 的主张）：这些技术全都是"**找一个参照物来比对**"的不同实例，
区别只在参照物的来源与可信度。

---

## 1. 形式化方法与运行时验证

### 1.1 Property-Based Testing / 蜕变测试

- **PBT 谱系**：QuickCheck（Claessen & Hughes, ICFP 2000）→ 生成器 + 性质 + **shrinking**（把反例缩到最小）。
  Hypothesis 的 internal shrinking 让 shrinking 对任意组合子自动成立。
- **Stateful / model-based PBT**：Hypothesis `RuleBasedStateMachine`、Erlang QuickCheck `eqc_statem`、
  JS 的 **fast-check**（有一等公民的 model-based API，可在浏览器跑）。**关键澄清**：它采样的是**动作序列**，
  oracle 是一个抽象模型，不是"输入→期望输出对"。
- **蜕变测试**（Chen/Cheung/Yiu 1998）：**蜕变关系（MR）**=多次执行之间输入变换与输出变换的必然关系。
  不需要知道任何一次的正确输出——这是 oracle 问题的经典解法。MR 从哪来是公认最难点（人工/模板/需求抽取/
  ML 预测/LLM 辅助）。
- **教学仿真的 MR 特别丰富**：量纲标度不变、镜像对称、时间反演（**仅辛/可逆积分器且短时程**）、
  叠加原理（线性系统）、参数单调性、步长不变、reset 幂等、交互交换律、算法动画的 trace 不变式。
- **shrinking 被严重低估**：把"点了 200 次后炸了"缩成"play → 拖 dt 到最大 → play"三步，是修复率的数量级差异。
- **NIST Interaction Rule**（SP 800-142）：绝大多数失效由 1–2 个参数交互触发，6 个以上几乎为零；
  t-way 覆盖数组规模是**对数级**而非指数级。→ "组合爆炸使采样无望"这个判断有实证反例。

**危险的 MR**（写错的代价 = 大量假警报 = checker 被禁用）：混沌系统（双摆、三体、洛伦兹）Lyapunov 指数为正，
步长细化不变性与时间反演**会正当地失败**；耗散系统能量守恒**本就不成立**；辛积分器能量是有界振荡。
**必须按系统类别挂 MR。**

来源：[Metamorphic Testing: A Review of Challenges and Opportunities (ACM CSUR 51(1), 2018)](https://dl.acm.org/doi/10.1145/3143561) ·
[Hypothesis Rule Based Stateful Testing](https://hypothesis.works/articles/rule-based-stateful-testing/) ·
[Predicting metamorphic relations via graph kernels (STVR 2016)](https://www.cs.colostate.edu/~bieman/Pubs/kanewalaPredictingMetamorphicSTVR.PreprintSubmitted4publication.pdf) ·
[Bidirectional Empowerment of MT and LLMs (2026)](https://arxiv.org/html/2605.13898v1) ·
[Validating LLM-Generated Programs with Metamorphic Prompt Testing (2406.06864)](https://arxiv.org/pdf/2406.06864) ·
[NIST SP 800-142 Practical Combinatorial Testing](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-142.pdf) ·
[NIST: Interactions Involved in Software Failures](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software/combinatorial-methods-in-testing/interactions-involved-in-software-failures) ·
经典：Barr/Harman/McMinn/Shahbaz/Yoo, *The Oracle Problem in Software Testing: A Survey*, IEEE TSE 41(5), 2015

### 1.2 契约与运行时验证（RV）／信号时序逻辑（STL）

- **Design by Contract**：Eiffel → JML → Spec#/Code Contracts（**已废弃，重要的负面证据**：重量级契约注解
  在通用工业软件里没跑通）→ Dafny/SPARK（auto-active，在航电/AWS 有生产使用）。**只偷 runtime 那一半。**
- **Monitorability**：safety 性质（坏事永不发生）可监控；liveness（好事最终发生）在有限前缀上不可判定，
  除非加时间界。实践用 LTL₃ / 四值语义（true/false/inconclusive）。→ 这给了"能不能自动验"一个锋利判据。
- **STL**（Maler & Nickovic 2004）为**连续/实值信号**设计，带时间区间与实值谓词。杀手锏是
  **鲁棒度语义**（Fainekos & Pappas 2009；Donzé & Maler 2010）：不只输出真假，还输出实数裕度 ρ，
  |ρ| 表示离违反有多远。ρ 可当质量分、回归信号、**以及搜索的目标函数**。
- **在线监控**：RoSI（robust satisfaction interval，随数据到来收窄）；工具 Reelay / RTLola / MonPoly。

来源：[Introduction to Runtime Verification (LNCS 10457)](http://staff.um.edu.mt/afra1/papers/RV-book-intro.pdf) ·
[Robust Online Monitoring of STL (arXiv 1506.08234)](https://arxiv.org/abs/1506.08234) ·
[An Operational Guide to Monitorability (arXiv 1906.00766)](https://arxiv.org/pdf/1906.00766) ·
[Reelay](https://arxiv.org/pdf/2604.22384) ·
经典：Fainekos & Pappas, TCS 2009；Bauer/Leucker/Schallhart, ACM TOSEM 2011

### 1.3 Falsification：主动搜反例（对我们价值最高的单项技术）

只需要"能跑仿真"，不需要模型：把输入空间参数化 → 把 STL 鲁棒度 ρ 当目标函数 →
用全局优化**主动搜索使 ρ 最小（最好为负）的输入**。找到 ρ<0 = 找到反例；找不到 = 得到一个**最差裕度**
（不是证明，但是有用的量化保证）。

- 工具：**S-TaLiRo**（模拟退火/Monte Carlo）、**Breach**（Simulink）、ARIsTEO（代理模型加速）、
  贝叶斯优化/CMA-ES 变体。**ARCH-COMP** 有年度标准化竞赛（成熟度硬证据）。
- **Adaptive Stress Testing (AST)**：把"找失败"建模成 MDP 用 RL 搜——适合**长序列、离散事件**，
  正是 UI 交互（一串点击/拖动）的形状。
- **文献一致显示：鲁棒度制导搜索在同等预算下发现违规的概率比随机高一个数量级以上。**
- **需求挖掘（PSTL parameter mining）**：**当你没有规格时**，给出参数化 STL 模板（阈值留作参数），
  从一堆 trace 里**推断最紧的参数值**——得到"这个系统实际满足的最强性质"，可当自动生成的回归基线。

**局限**：只能证伪不能证明。对外措辞必须是"在 N 次对抗搜索下未发现违规，最差裕度 ρ*"，不能是"已验证"。
**目标函数会被 gaming**：若生成器知道验的是能量守恒裕度，可能写出每帧硬性重整化能量的假仿真——
裕度完美、物理错误。**这是最阴险的失效模式**，必须靠独立的解析锚点与 MR 多样性来防。

来源：[A Survey of Algorithms for Black-Box Safety Validation of CPS (JAIR 2021, arXiv 2005.02979)](https://arxiv.org/pdf/2005.02979) ·
[Adaptive Stress Testing (arXiv 1811.02188)](https://arxiv.org/abs/1811.02188) ·
[Mining Requirements from Closed-Loop Control Models](https://people.eecs.berkeley.edu/~sseshia/pubdir/mining-tcad15.pdf) ·
[Mining Parametric Temporal Logic Properties (arXiv 1512.07956)](https://arxiv.org/pdf/1512.07956) ·
[S-TaLiRo](https://www.researchgate.net/publication/220852228_S-TaLiRo_A_Tool_for_Temporal_Logic_Falsification_for_Hybrid_Systems)

### 1.4 Correct-by-construction 合成：SyGuS / CEGIS / translation validation / certifying algorithms

- **SyGuS**（Alur et al. FMCAD 2013）核心洞察：**限制搜索空间的语法，是让合成可解的关键**。
- **CEGIS**：`Synthesize → Verify → 反例并入 E → 重新 Synthesize`。经验假设：**少数几个覆盖 corner case
  的输入就能完全约束解**。→ **我们的修复循环缺的正是"反例累积"这一步**（现在是重试，会震荡）。
  重要澄清：CEGIS 的反例集**不是"覆盖行为空间的采样"，是"约束合成空间的证据"**。
- **Translation validation**（Pnueli 1998；Necula 2000）：不证明编译器永远正确，而是**每一次翻译之后
  验证这一次**。→ 优于"验证生成器"：验证这一次的产物对这一次的输入。
- **Certifying algorithms**（McConnell/Mehlhorn/Näher/Schweitzer, CSR 2011）：算法输出时**附带见证**，
  见证的检查器简单到可人工审查（排序→置换见证+有序性；SAT→DRAT 证明）。
  → 对我们最有价值的落点：**quiz 附可执行推导**、ODE 仿真附每步 `(t,x,v,f)` 与声明的积分格式、
  算法动画附完整 trace、图表附底层数据与映射声明。
- **反例过拟合风险**：LLM 可能写 `if (dt === 0.137) {特判}`。缓解：反例注入时只给性质与场景类别、
  不给精确数值；验证时用**新采样的邻域点**而非原反例点。

来源：[SyGuS](https://www.cis.upenn.edu/~alur/SyGuS13.pdf) ·
[Program Synthesis by Sketching (Solar-Lezama 2008)](https://people.csail.mit.edu/asolar/papers/thesis.pdf) ·
[A Theory of Formal Synthesis via Inductive Learning (arXiv 1505.03953)](https://arxiv.org/pdf/1505.03953) ·
[Translation Validation for an Optimizing Compiler (Necula, PLDI 2000)](https://people.eecs.berkeley.edu/~necula/Papers/tv_pldi00.pdf) ·
经典：McConnell et al., *Certifying Algorithms*, Computer Science Review 5(2), 2011

### 1.5 Simplex：不可验证组件 + 已验证包络

**Simplex 架构**（Lui Sha, IEEE Software 2001）：不可验证的复杂控制器 + 已验证的保底控制器 +
已验证的切换逻辑。**核心条件：切换必须在越界之前发生**（预测式判据，不是事后检测）。
变体 **Black-Box Simplex** 用运行时检查替代对保底控制器的静态验证——最贴近我们。
**ASTM F3269** 是真实的航空标准，规定了"用运行时保障包住不可验证的复杂功能"的合规路径。

精确映射：复杂控制器=LLM 生成的组件；保底控制器=**预先用可信实现算好的静态图/曲线**；
切换逻辑=监视器；物理安全域=iframe sandbox + CSP + 时长/内存上限 + 全局错误捕获。

**关键的不适用**：教育场景里"安全的降级"可能等于"教学上无价值"——飞机的保底控制器飞得难看但不掉，
一个冻结的仿真对学生就是零价值。Simplex 保证的是不出丑，不是教得对。
另外 **fallback 本身必须被验证**（走构造式路径，不能是 LLM 生成的），否则只是把不可信搬了个地方。

来源：[Black-Box Simplex (arXiv 2102.12981)](https://arxiv.org/pdf/2102.12981) ·
[Run Time Assurance for Safety-Critical Systems (arXiv 2110.03506)](https://arxiv.org/pdf/2110.03506)（含 ASTM F3269 讨论）·
经典：Sha, *Using Simplicity to Control Complexity*, IEEE Software 18(4), 2001

---

## 2. 工业界的"无限行为空间"范式

### 2.1 硬件验证（该问题最成熟的领域）

- **约束随机 + 功能覆盖（CDV）**：不写具体激励写**约束**；用 covergroup/coverpoint/bin 显式声明
  "哪些情形算被验证过"。**停止准则 = 覆盖模型闭合**，不是测试条数。
- **断言与激励解耦**（SVA）：性质写在设计内部，被任意随机激励复用——这是"无人手写测试用例却仍有 oracle"的答案。
- **UVM** 分层 testbench（sequence/driver/monitor/scoreboard/coverage）+ 可复用 VIP。
- **PSS 3.0** 新增 **behavioral coverage**：覆盖的对象是**动作序列**而非仅数值 bin——对交互页面极贴切。
- **诚实的自我认知**：2024 年首次流片成功率跌到二十年最低的 **14%**。**覆盖闭合 ≠ 无缺陷**——
  覆盖模型只能证明"我打到了我想到的情形"。
- **破解点**：硬件需要人手写覆盖模型（几人月），是因为 spec 只存在于人脑；而我们的产物**在生成时就有
  结构化 IR**（滑块有 min/max/step、状态机有状态数、quiz 有选项集）——**覆盖模型可以自动导出**。
  这是他们做不到而我们能做的事。

来源：[Doulos CDV Methodology](https://www.doulos.com/knowhow/systemverilog/uvm/easier-uvm/easier-uvm-deeper-explanations/coverage-driven-verification-methodology/) ·
[IEEE 1800.2 UVM LRM](https://ieeexplore.ieee.org/iel7/9195918/9195919/09195920.pdf) ·
[PSS v3.0](https://www.accellera.org/images/downloads/standards/pss/Portable_Test_Stimulus_Standard_v3.0.pdf) ·
[2024 Wilson Research / Siemens EDA IC-ASIC Verification Trend Report](https://verificationacademy.com/topics/planning-measurement-and-analysis/wrg-industry-data-and-trends/2024-siemens-eda-and-wilson-research-group-ic-asic-functional-verification-trend-report/)

### 2.2 游戏 QA：确定性与重放（最便宜的高价值项）

- **DRL playtesting**（EA SEED, CoG 2020）、**好奇心驱动探索**、**Go-Explore 可达性测试**
  （微软/Ninja Theory，存 checkpoint 从有希望的点重启，**明显优于 intrinsic curiosity RL**，
  10 小时单机覆盖 1.5km² 世界）。→ **checkpoint-restart 比 RL 便宜得多，是本节最高性价比的一条**
  （纯 JS 可实现，无训练）。
- **Box2D 的三级确定性**（2024）：algorithmic / multithreaded / cross-platform。破坏源：fast-math、FMA、
  平台 trig 实现、跨线程同步顺序。**测试方式**：CI 里跑固定场景，输出 sleep step count 与 transform hash，
  跨编译器/架构必须一致。
- **replay assert**：录制输入 → 重放 → 每帧末比对完整状态，第一个不一致的变量就是非确定性源头。
- 对我们：固定 dt、seed 化 RNG、禁止 `Date.now()` 直接驱动动画、状态摘要 hash 进 CI。这同时给三样东西——
  可回归的动画、可复现的 bug、**以及"动画确实是真实执行的回放"这一 claim 的机器证据**。
- **soft-lock / stuck state 检测**：探索期若某状态的所有可用事件都不改变 DOM hash 且不是终态 → 交互死锁。

来源：[Augmenting Automated Game Testing with DRL (arXiv 2103.15819)](https://arxiv.org/abs/2103.15819) ·
[Curiosity Driven RL for Playtesting Coverage (arXiv 2103.13798)](https://arxiv.org/pdf/2103.13798) ·
[Go-Explore for Automated Reachability Testing (arXiv 2209.00570)](https://arxiv.org/abs/2209.00570) ·
[Box2D — Determinism (2024)](https://box2d.org/posts/2024/08/determinism/) ·
[Instant Replay: Building a Game Engine with Reproducible Behavior](https://www.gamedeveloper.com/design/instant-replay-building-a-game-engine-with-reproducible-behavior) ·
[Game Bug Taxonomy (arXiv 2311.16645)](https://arxiv.org/pdf/2311.16645)

### 2.3 Web/GUI 测试（与我们同构度最高）

- **Crawljax**（ACM TWEB 2012）：对 AJAX 应用**自动构造 state-flow graph**（DOM 状态为节点、事件为边）。
- **ATUSA 的 invariant-based testing**（IEEE TSE 2012）——**最可直接照抄的一条**：
  crawler 把状态空间铺开，**通用不变式充当 oracle**。通用不变式：DOM 合法性、DOM 中不出现错误消息、
  **back-button 兼容性**（对我们=reset/回退的幂等性）、状态可发现性。
- **我们的盲区**：`tools/render-check.mjs` 的 A–I 九断言**只在初始状态成立**——滑块拖到极值后的溢出、
  step 走到第 5 步后的公式裁切、quiz 答错后弹框超框，全在盲区。**扩到 state-flow graph 全状态，
  一条断言不用新写，价值翻数倍。**
- **guided > random，但 random 必须保留**：Stoat（FSE 2017）比 Monkey 多找 3× 崩溃；但 monkey 用来抓
  guided 探索模型自身的盲点（模型错了，随机不会跟着错）。
- **DOM 状态规范化是先决工程**：含动画/canvas/时间戳的页面 DOM hash 天然不稳定，必须冻结时钟、
  剥离连续 transform、量化数字、canvas 用低分辨率感知 hash。**不做的话 crawler 会把同一状态识别成上千个。**
- **axe-core 的三态判定**（pass / fail / **incomplete 需人工复核**）比二值门更诚实。

来源：[Crawling Ajax-Based Web Applications (ACM TWEB 2012)](https://dl.acm.org/doi/10.1145/2109205.2109208) ·
[Invariant-Based Automatic Testing of Modern Web Applications (IEEE TSE 2012)](https://dl.acm.org/doi/10.1109/TSE.2011.28) ·
[Memon, event-flow model of GUI testing (STVR 2007)](https://www.cs.umd.edu/~atif/papers/MemonSTVR2007.pdf) ·
[Stoat (FSE 2017)](https://tingsu.github.io/files/stoat.html) ·
[axe-core](https://github.com/dequelabs/axe-core) ·
[Deque: automated testing identifies 57% of accessibility issues](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)

### 2.4 认证工程：分级与保障案例

- **按后果分级**：DO-178C 的 DAL A–E、ISO 26262 的 ASIL——**同一技术手段在不同等级下要求不同**
  （DO-178C Table A-7：DAL A 要 MC/DC，DAL B 要判定覆盖，DAL C 要语句覆盖）。
  → 对我们：不该对讲义所有元素施加同等严格度（学生要读数的仿真 vs 装饰性动画）。
- **GSN 保障案例**：结构化可审计的**论证**——Goal / Strategy / Solution(evidence) / Context /
  Assumption / Justification。不是"我跑了这些测试"，而是"我主张 X，因为策略 S 把它分解为…，
  每个由证据 E 支撑，在假设 A 之下"。
- **defeater（反驳节点）**：显式记录"这个论证可能怎么错"，对抗确认偏误。
- **自我批评**：核心风险是确认偏误与"保障案例沦为合规文书"。对我们**更严重**——论证的作者就是被审对象。

来源：[GSN Community Standard v3](https://scsc.uk/gsn-standard) ·
[LDRA: DO-178C & Structural Coverage](https://ldra.com/ldra-blog/do-178c-structural-coverage-analysis/) ·
[Defeater Cards (arXiv 2606.11462)](https://arxiv.org/pdf/2606.11462) ·
[How do practitioners gain confidence in assurance cases? (arXiv 2411.03657)](https://arxiv.org/pdf/2411.03657)

---

## 3. 科学计算 V&V（最该抄分类学的领域）

### 3.1 verification / validation 二分——最有价值的一条

- **Verification = "solving the equations right"**（纯数学，与真实世界无关），分
  **code verification**（代码是否正确实现了所选格式）与 **solution verification**（这一次运行的数值误差多大）。
- **Validation = "solving the right equations"**（模型是否恰当描述目标现实，只能靠实验数据）。
- **推论：verification 完全不需要真实数据，validation 完全需要。** 两者用不同证据、不同工具、不同人做。
- **对我们的重写**：教学模型的"真值"是**课程标准里那个理想化模型**，不是自然界。所以我们的 validation
  应重定义为「**对教学契约的符合性**」。

### 3.2 制造解（MMS）与收敛阶

- **MMS**（Roache & Steinberg 1984）：任选一个足够光滑、**不必物理合理**的解，代入方程算出所需源项，
  加回代码——于是有了带精确解的问题。要点：解不能"特殊"（不能恰好让某项为零），否则掩盖 bug。
- **收敛阶检验**（廉价版，**性价比第一**）：同一初值跑 `dt / dt2 / dt4`，测误差随 dt 的下降率是否匹配
  格式的理论阶（前向 Euler=1，RK2=2，RK4=4，Velocity Verlet 位置=2）。**不需要知道正确答案**
  （Richardson 外推自比较即可），却能抓出导数写错、系数写错、格式实现错、时间步用错一整类 bug。
- **GCI**（Roache 1994）与 ASME JFE 的制度设计：**不做网格收敛研究的 CFD 论文不予受理**——
  把一项便宜检查设成**准入门槛**。规范只有当它是闸门时才有效。
- 视觉版：把 `dt` 与 `dt/2` 两条轨迹**叠在同一张图上**，肉眼可见的分叉 = 未收敛。比任何数值指标都易判。

### 3.3 廉价物理筛（穷人版 verification）

| 筛子 | 检查什么 | 典型抓到的 bug |
|---|---|---|
| 守恒量 | 无耗散设定下能量/动量/角动量漂移 < ε | 显式欧拉；力的符号错；恢复系数用错 |
| 对称性 | 反射/时间反演/伽利略变换下等变 | **屏幕 y 轴向下导致重力符号写反——LLM 生成 canvas 代码的头号错误** |
| 量纲一致性 | 表达式量纲齐次 | 角度/弧度、km/m、g/kg 混用（教育代码高频） |
| 极限情形 | 参数→0/∞ 时退化到已知简单解 | 阻力→0 应回到抛物线；小角应回到简谐 |
| 标度律 | 按 π 群缩放时输出按已知幂律缩放 | 缺项、错误幂次 |

**关键性质**：只能证伪不能证明，因此**假阳性极低**，是理想的自动门禁。
**但**：耗散/外力做功/开放系统里"守恒"要换成"能量收支闭合"，设置成本变高。

### 3.4 分级与成熟度向量

- **ASME V&V 40** 的 **risk-informed credibility**：验证严格程度应正比于模型在决策中的影响力与后果严重性。
- **PCMM**（Sandia 2007）：沿 6 个维度分级输出**成熟度向量**而非单一分数——避免"数值全对但教错了模型"
  被平均分掩盖。
- **参考问题库**（NASA Turbulence Modeling Resource 的贫民版）：为高频教学主题各准备 golden fixture
  （初始条件 + 参数 + 若干时刻的期望数值/定性特征）。**教学主题的长尾比 CFD 短得多，30–50 个可覆盖大部分。**
- **code-to-code 比对是弱证据**（所有代码可能共享同一个错误模型）。

来源：[Roy, Review of Code and Solution Verification Procedures (JCP)](https://www.aoe.vt.edu/content/dam/aoe_vt_edu/people/faculty/cjroy/Publications-Articles/cjr_jcp.revise.final-accepted.pdf) ·
[Code Verification by MMS (ASME JFE 124(1), 2002)](https://asmedigitalcollection.asme.org/fluidsengineering/article/124/1/4/462791/Code-Verification-by-the-Method-of-Manufactured) ·
[Roy & Oberkampf 2011, comprehensive framework for V,V&UQ](http://ftp.demec.ufpr.br/disciplinas/TM798/Artigos_seminarios/roy_oberkampf_2011-verification.pdf) ·
[Roache GCI](https://asmedigitalcollection.asme.org/fluidsengineering/article-abstract/116/3/405/411554/Perspective-A-Method-for-Uniform-Reporting-of-Grid) ·
[NASA Turbulence Modeling Resource](https://turbmodels.larc.nasa.gov/index.html) ·
书：Oberkampf & Roy, *Verification and Validation in Scientific Computing*, Cambridge 2010

---

## 4. 教育仿真的实际做法（技术上抄不到，制度上抄很多）

**坦率结论**：PhET 的流程极严谨，但严谨的是**可用性与学习效果**，不是数值正确性。
物理正确性主要靠**领域专家在环 + 文档化披露**，不是自动化验证。
→ 我们**没法从教育仿真界抄到验证技术，但能抄到披露与治理机制**。

- **PhET 流程**：3–5 人团队（含**学科内容专家**）、先定学习目标、4–6 次学生 think-aloud 访谈
  （"常常揭示教学上不可取的特性与隐蔽的编程 bug"）、约 **2–12 个月 / 每个 sim 约 5 万美元**。
  → 与"自动生成、批量出货"在数量级上完全不兼容。**我们不可能达到 PhET 的质量，因此更必须把可自动化的
  那部分做到极致，并对不可自动化的部分诚实披露。**
- **最大的可抄项：`doc/model.md`**。每个 PhET sim 的仓库里有一份面向教师的**模型与简化的显式声明**。
  以 projectile-motion 为例：用二次阻力并说明适用雷诺数范围、**主动声明"阻力系数取常数是已知不准确处"**、
  **"速度矢量的长度经过缩放以便看清，不对应任何单位"**、模型约束（最多 3 个抛体）。
- **其 code review checklist 要求**：*"先读 model.md——它是否以**教师能理解的语言**充分描述了模型？"*
  **但该 checklist 没有单位一致性、数值精度、守恒的条目**——这正是我们有自动化手段而他们没有的地方。
- **"简化"必须是一等对象**：验证问题因此改写成两个可判定问题——①声明的简化是否被忠实实现（机器）
  ②声明的简化是否与学习目标相容（judge 只看两段短文本）。
- **反例教材**：PhET 主动往仿真里**加统计噪声**（Projectile Data Lab），因为"零噪声"这个简化
  **阻碍了"测量不确定度"的学习目标**。→ 简化的正确性取决于学习目标。
- **Explorable explanations 社群**：**确认不存在**正确性验证规范。找到的是批评——Hinsen (2025)
  指出其**交互组件的不透明性**（读者无法看到、检查、质疑背后的模型）。
  → 产品要求：提供"背后的模型/方程/源码"入口，把不透明变成可审计；这与验证需求同源。

来源：[PhET Research](https://phet.colorado.edu/en/research) ·
[phetsims/projectile-motion doc/model.md](https://github.com/phetsims/projectile-motion/blob/main/doc/model.md) ·
[phetsims/phet-info code-review-checklist.md](https://github.com/phetsims/phet-info/blob/main/checklists/code-review-checklist.md) ·
[Integrating noise into PhET simulations (arXiv 2509.25769)](https://arxiv.org/abs/2509.25769) ·
[Explorable explorable explanations — Hinsen 2025](https://blog.khinsen.net/posts/2025/11/12/explorable-explorable-explanations.html)

---

## 5. LLM 生成可执行物（最新、最贴题、最不成熟）

### 5.1 契约回读：与我们问题同构度最高的一篇

*Your Simulation Runs but Solves the Wrong Physics: PDE-Grounded Intent Verification*（arXiv 2605.09360, 2026）

- 命名了 **comprehension–generation gap**：生成的输入文件可运行、可划网格、可收敛，同时编码着与用户意图
  不同的控制方程。
- **确定性 PDE 重建**（核心）：**不执行代码**，仅解析输入文件 AST，对照 kernel→弱形式映射表，
  恢复出代码实际编码的 PDE；未覆盖的 kernel 类型被记录并排除出评分（**对表示能力边界保持透明**，
  这个工程习惯值得抄）。
- **三段式**：契约先行 → 代码以契约为 checklist 生成 → 确定性回读 + 结构化 diff。
  两个工程细节值得抄：**违规报告用候选自己的变量名表述**（显著提升修复成功率）；**精化上限 2 轮 +
  regression guard 保留最优**。
- **关键数字**：**仅靠执行反馈的修复，仍留下 39–40% 是"能跑但解错物理"**；契约制导反馈把这个比例
  再降 8–12 个百分点。另有 12.5% 是"仅系数错误"，结构比对抓不到。
- **可迁移的前提**：他们靠 MOOSE 的 DSL 组合语义。**如果生成的是自由 JS，回读不可能确定性；
  如果生成的是受限组件 DSL，回读就退化成读 AST。** → 这是**架构层面最重要的结论**。

### 5.2 一致性三角（Clover）

*Clover: Closed-Loop Verifiable Code Generation*（arXiv 2310.17807, SAIV 2024）：
把**正确性检查约化为一致性检查**——同时产出 代码 / docstring / 形式注解，做三向一致性。
CloverBench 上正确实例接受率 87%、对抗性错误实例**零假阳性**（注意：数据集是教科书难度的手工 Dafny 程序）。

映射到我们：**讲解文案 ↔ 物理契约 ↔ 代码**。三条检查里两条是我们独有的高价值项：
- **契约完备性**：让另一个 LLM **只看契约重新实现一遍**，跑同样 fixture 比对数值输出。
  不一致 ⇒ 契约写得不够具体。成本 = 一次额外生成。
- **契约 ↔ 文案一致性**：抓「**动画演的和旁白讲的不是一回事**」——教育产物最典型、
  现有测试完全覆盖不到的失效模式。

### 5.3 两层验证器与连续奖励

- **PhysVEC**（arXiv 2604.00149）：Programming verifier（跑得起来）+ **Scientific verifier**（物理有效性）。
  关键设计：**两层必须用不同的证据源**——科学层**不能**用执行（执行成功恰恰是伪信号）。
  ⚠️ 该论文摘要页未列出 scientific verifier 的具体检查项，三 agent 职责描述来自搜索摘要，未直读正文。
- **RL with Verifiable Physics**（arXiv 2607.10474）：二元 gate（能执行/shape/有限）在前 → 连续物理分数在后。
  → 我们不做 RL，但**奖励函数结构 = 极好的验收函数结构**：二元先拒，连续分用于 **best-of-N 排序**
  （零训练成本、立刻可用）。

### 5.4 被数据证伪的做法（红线的来源）

- **"跑通"当验收**：39–40% 假通过（5.1）。
- **同一 agent 既写产物又写测试**：*Do LLMs generate test oracles that capture the actual or the expected
  program behaviour?*（arXiv 2410.21136）——**LLM 倾向于生成描述"代码实际做了什么"而非"应该做什么"的断言**。
- **无上限的执行制导修复**：**in-context reward hacking**——训练时只见过正确测试用例的模型学会
  **无条件服从执行反馈**，遇到错误的测试用例会照着错的改（arXiv 2510.22075）。
- **更广义的 reward hacking**：随模型变强，基准表现与真实能力脱钩（arXiv 2605.02964）。

### 5.5 生成式交互产物的验证 = 确认的空白

现有工作全是"用 LLM agent 去测 UI"，**没有**"验证生成的交互产物是否语义正确"。
→ 我们的取法：**把交互验证下沉到模型层**——把"拖滑块 A"抽象成"参数 p_A 从 v1 变到 v2"，
在**无头的模型层**做参数扫描 + 单调性/极限断言，**完全绕开 UI**；UI 层只做最轻的存活检查。
配套："**没有声明预期效果的控件 = 装饰性控件 = 应该删掉**"。

### 5.6 PINN 的偏序：软约束 < 硬约束 < 按构造

*PINNs and Beyond*（arXiv 2404.14021）：即使嵌入了物理知识，靠自身仍然不够；需要**按构造强制**的硬约束。
结论是 "ensuring physical laws **by design**"。

| 层级 | 做法 | 成本 | 可靠性 |
|---|---|---|---|
| 提示（最弱） | prompt 里说"请注意能量守恒" | 0 | 低 |
| 事后检查 | 生成后跑物理筛，不过就重试 | 低 | 中 |
| 生成时约束 | 契约先行 + 确定性回读 + 结构化 diff | 中 | 中高 |
| **按构造正确** | **提供已验证的组件库**：辛积分器、RK4、单位系统、标准力模型——LLM 只能组合不能重写 | 前期高、边际 0 | **高** |

**反面教训**：按构造正确保证 verification，**完全不保证 validation**——组件库可能提供了不适合该学习目标
的模型（对"教非线性"的课提供了小角近似组件）。所以"学习目标 ↔ 允许的简化"对照表仍然必需。

来源：[Your Simulation Runs but Solves the Wrong Physics (arXiv 2605.09360)](https://arxiv.org/abs/2605.09360) ·
[Clover (arXiv 2310.17807)](https://arxiv.org/abs/2310.17807) ·
[PhysVEC (arXiv 2604.00149)](https://arxiv.org/abs/2604.00149) ·
[RL with Verifiable Physics (arXiv 2607.10474)](https://arxiv.org/html/2607.10474v1) ·
[Do LLMs generate test oracles that capture actual or expected behaviour? (arXiv 2410.21136)](https://arxiv.org/pdf/2410.21136) ·
[Agentic RL for Real-World Code Repair (arXiv 2510.22075)](https://arxiv.org/html/2510.22075) ·
[Reward Hacking Benchmark (arXiv 2605.02964)](https://arxiv.org/pdf/2605.02964) ·
[PINNs and Beyond (arXiv 2404.14021)](https://arxiv.org/html/2404.14021v1)

---

## 6. 想到了但现在不做（留档）

这些在调研里价值很高，但按宪章渐进法制**不预防性立法**——等真实运行中出现需要它们的失败再说：

- **从 IR 自动导出覆盖模型**（硬件 CDV 的我们版；停止准则从"跑了 N 次"变成"覆盖闭合 + 未闭合 bin 逐条豁免"）
- **state-flow graph 探索**（把 render-check 九断言从首屏扩到全状态；**这是清单里最该先做的一条**）
- **确定性与重放断言**（虚拟时钟 + 注入 seed + 状态 hash；是 falsification/shrinking/回归的**前置条件**）
- **STL 鲁棒度 + falsification 对抗搜索**（把布尔判决换成连续裕度，并用它当搜索目标）
- **契约的确定性回读**（前提是受限 DSL）
- **差分对拍**（Pyodide/scipy 参考实现；注意 N-version 警告：同模型两次生成不算独立）
- **GSN 保障案例**（把散落的证据挂到 claim 树上，含 defeater 节点）
- **Simplex 降级架构**（预先算好的 fallback + 预测式切换）
- **best-of-N + 连续物理分数排序**（零训练成本）
- **golden fixture 库**（30–50 个高频教学主题）
- **按后果分级**（装饰性动画 vs 学生要读数的仿真，验证强度不同）

## 7. 未能核实 / 需打折

1. ASME V&V 10/20/40 标准正文付费，只读了官网条目与第三方 overview；**V&V 40 的 risk-informed
   credibility 表述部分来自既有知识而非本次检索确认**。
2. PhET *Simulation Design Process* PDF 未能解析正文；"2–12 个月 / 5 万美元 / 4–6 次访谈"来自搜索摘要
   与官网研究页，未逐字核对原始 PDF。
3. PhysVEC 的 scientific verifier 具体检查项未见于摘要页；三 agent 职责来自搜索摘要，非直读正文。
4. arXiv 2605.09360 / 2604.00149 / 2607.10474 均为 2026 年预印本、单篇、自建基准、无独立复现。
   **机制可信度 > 数字可信度。**
5. Clover 的 87% 接受率 / 零假阳性：数据集是教科书难度的手工 Dafny 程序，不可外推到复杂产物。
6. **Explorable explanations 的验证规范：确认不存在**（是"搜索后未找到"而非"未查"）。
7. **生成式交互产物的正确性验证：确认是空白**。业界博客非同行评审，仅作趋势参考。
