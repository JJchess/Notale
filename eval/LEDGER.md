# 轮次日志（LEDGER）

> `legacy/ITERATIONS.md`（82 轮，2026-07 时期）的继任者。**append-only**，从 R-001 起编。
> 每轮闭环（`methodology/CHARTER.md` §4）第 6 步判决后立即记录。

## 条目格式

```markdown
## R-### <一句话标题>
- 日期 / git hash：
- 轮型：BUILD | FIX | BORROW | CONSOLIDATE | CALIBRATE | MILESTONE
- 轨道：T-TRUTH | T-VIS | T-LONG | T-STYLE（FIX/CALIBRATE 可空）
- 改了什么（一件事）：
- 法制动作：无 | 收紧(ADR D-###) | 放松(ADR D-###) | 新场景 S-###
- 证据：run 目录路径；门表 diff；关键趋势 delta；before/after contact-sheet 结论一句话
- 金丝雀：n 掺 / m 漏（漏 >0 → 本轮 judge 分数作废，已降级人工）
- 判决：SHIP | REVERT | PARK（+一句话理由）
```

---

## R-000 立宪（2026-08-08）

- 轮型：MILESTONE（零号）
- 内容：方法论宪章 v3 落成——`methodology/`（CHARTER / SUBJECT-MODEL / EVAL / ROADMAP / LINEAGE）+ `eval/` 骨架（B-CORE 十题、GOLD/SABOTAGE 规范、BASELINE/LEDGER）。前史见 `legacy/ITERATIONS.md`（iter1–82）与 `docs/deck-workflow-diagnosis-2026-07-30.md`。
- 待办移交：① owner 导入数据结构 60min 金样本；② 主干 ADR 判决数据（`methodology/ROADMAP.md` §5）；③ 首次全量基准跑，填 `eval/BASELINE.md`。
- 判决：SHIP（文档轮，无代码改动）

## R-001 首批金样本入库（2026-08-08）

- 轮型：BUILD（评测资产）
- 轨道：T-LONG / T-VIS（金样本是两轨的参照系）
- 改了什么：owner 提供的 3 份传统 PPT 参考（refs/）入库 `eval/gold/`——清华数据结构·二叉树（114 页）、
  排序（113 页）两份**内容金标准** + Dateline v0.9 模板**设计参考**；三张 CARD.md 注解卡完成
  （含逐页采样分析：字数分布、图文比、有效画面比、可模仿机制各三条、诚实缺点清单）。
- 关键发现：① 两份清华讲义是 150–200 min 整章合并讲义，不是 60 min 单课——时长模型拟合出
  **60 min ≈ 35–45 页**的初值（配速表见 `eval/gold/README.md`）；② 该系列的"丰满"不靠动画灌页
  （有效画面比 0.73–0.97），靠**语义色码、示例树像素级复用、diff 页、四拍自证伪节拍**等可编码机制——
  已按 BORROW 轮粒度写进卡片；③ 金样本自身练习密度不足（每 ~48 页一次），以缺点入卡，生成器应高于金样本。
- 证据：eval/gold/*/CARD.md；source/ 不入 git（.gitignore）
- 金丝雀：不适用（无 judge 参与）
- 判决：SHIP（R-000 待办 ① 完成）

## R-002 Harness 终局图景落成（2026-08-08）

- 轮型：MILESTONE 级文档轮
- 轨道：全轨道（架构总图）
- 改了什么：`methodology/HARNESS.md`——lectureAgent 终局架构图景（纯终局设想，哲学+架构草图粒度）：
  必答十八问骨架（A 本体层级/B 权威追踪/C 单元契约上下文/D 闭环证明 + 讲义特有 E 真值教学）、
  十条设计哲学（每条带前沿证据锚点）、内循环七阶段架构草图 + Verifier 栈 L0–L6、
  组件↔十八问映射表、关键取舍表、诚实薄弱清单。三份前沿调研全文落盘 `methodology/research/`。
- 关键依据（调研收敛点）：oracle 前移到 spec 层（AlphaProof）；fan-out 判据=是否共享隐含设计决策
  （Anthropic +90.2% vs Cognition）；artifacts>compaction（长跑）；同族判官投票证伪（九判官两票）；
  规则布局校验 F1 2–7× VLM（AeSlides）；外部 critic +67%（DeepPresenter）；风格离散采样+Vendi 区间
  （分布塌缩 RCT）；canonical content layer（Learn Your Way RCT +11pp）；39–40% runnable-but-wrong
  （sim 双层验证）。
- 证据：methodology/HARNESS.md；methodology/research/*.md（约 40+ 条一手来源）
- 金丝雀：不适用（文档轮）
- 判决：SHIP。主干 ADR（ROADMAP §5）保持 OPEN，HARNESS 为候选 C 的具象化参照。

## R-003 底座正确性两节补全（2026-08-08）

- 轮型：BUILD（文档精化）
- 轨道：T-TRUTH
- 改了什么：`SUBJECT-MODEL.md` 补 §2.1（verificationCases 生成纪律：C1 性质断言 > C2 oracle 计算值 >
  C3 证据锚定值 > C4 模型裸造值仅烟测；生成分离/不一致仲裁/case 测谎三纪律；错误去相关理论根据）
  与 §2.2（sim/交互组件正确性 = 模型选择×动力学×交互绑定×渲染忠实四层合取；"画面由状态单向驱动、
  动画是真实执行的回放"构造原则；回溯终止于学科真值/成熟引擎/组件库三地基；长尾缺口验证升档+降级）。
- 缘起：owner 质询"verificationCases 靠模型直接给输出是不是不成立""后端写好是不是就一切正确/怎么
  回溯"——两处均为原文档真实缺口。
- 判决：SHIP（§2.1 于 R-004 被否决替换，见下）

## R-004 否决 verificationCases，替换为"构造优先、契约兜底"（2026-08-08）

- 轮型：BUILD（设计否决与替换）
- 轨道：T-TRUTH
- 改了什么：**否决** R-003 引入的 verificationCases 设计（每个 runnable/sim 携带输入→期望输出测试集），
  否决由 owner 发起、经对抗审计确认六缺陷：①覆盖率幻觉（采样≠证明，"verified"图章造虚假信心）
  ②问题搬家（case 正确性=原问题，教科书外无地基）③可测性偏差（奖励可验证性→课程漂向可写 case 的
  内容，iter1–54 教训新形态）④验的是机器不是课 ⑤静态采样与开放交互错配 ⑥机器过重。
  **替换为三层承重**：构造式派生（组件由底座记录编译：方程→引擎接线、算法→trace 回放，验证对象
  上移为单条记录）> 运行时不变量监视器（design-by-contract，随组件出厂、探索期全程在线、监视所有
  实际状态而非采样点，不变量只准来自治理过的库/oracle/证据）> 组件库回归锚（一次性重度验证沉淀
  回归套件，新造测试收缩为胶水层抽查）。附两条红线：可验证性不得作为选题输入（防 Goodhart）；
  行为验证不得冒领教学验证。
- 波及文件：SUBJECT-MODEL.md（§2 表 L2/L5 行、§2.1 重写、§2.2、§3 T1）、HARNESS.md（底座图、
  Verifier 栈 L1/L3）、EVAL.md（G2）、ROADMAP.md（问题3 落地序）、B-CORE.md（Q2 主考注记——
  题面未动，仅机制名更新）。
- 判决：SHIP。否决理由记录在案（SUBJECT-MODEL §2.1 引言块），防止翻案。

## R-005 架构图可视化（2026-08-08）

- 轮型：BUILD
- 轨道：T-VIS（本轮对象是方法论文档自身的可读性）
- 缘起：owner「现在的 Harness 图不像是给人看的」——原 §2 是 ASCII 框图，看不出并联、回路与底座枢纽。
- 改了什么：新增 `methodology/harness-architecture.html`（单文件离线 SVG 数据流图，沿用 `docs/*.html` 惯例）：
  input→agent→artifact 逐级流动；两处 fan-out 画成并联 agent 分支；三个回路成环（页内定向修复 /
  组件库跨次学习 / 外循环 CHARTER+EVAL 虚线框）；真值底座画成醒目枢纽带（五层 JSON 文件卡）并引出
  "供给／比对"总线；worker 输入画成 `{}` 叠起来的文件堆。HARNESS.md §2 加图链接，ASCII 降为速查版。
- **本轮自身按方法论验收**（render-observe-fix，dogfooding）：栅格化后目视检查发现三处真缺陷并修复——
  ① CSS 类在 SVG 中不被部分渲染器应用（方框全黑、箭头全丢）→ 全部改内联 presentation 属性；
  ② `rotate(cx,cy)` 旋转文字被错位到左上角压住图例 → 去掉全部旋转文字改横排；
  ③ `<tspan>` 内联样式渲染错位 → 去掉全部 tspan。另补 Noto/Source Han CJK 字体回退。
  最终件：0 处 rotate、0 处 tspan、全内联属性，跨渲染器健壮。
- 证据：scratchpad 三轮栅格化截图（黑框版 → 结构正确版 → 中文版）
- 判决：SHIP

## R-006 SUBJECT-MODEL 做薄 + 补教学依据通道（2026-08-08）

- 轮型：CONSOLIDATE（做薄轮）+ 补一个真缺口
- 轨道：T-TRUTH
- 缘起：owner「感觉设计的有点复杂了，不够直观」+「教学序列 agent 的结果没有任何 subject-model 类别承接」。
  自我审计确认三宗罪：①粒度越界（owner 选的是"哲学+架构草图"，我推到了规格级）；②对**尚未发生的失败**
  预防性立法（违反渐进法制"复现 ≥2 次才收紧"）；③加法应答（每个好问题都用"加一个机制"回答，
  堆成六维规约点名要杀的 principle piling）。
- **做薄**：SUBJECT-MODEL 重构为——§0 三句核心（先建模再投影 / 每条知识带着怎么查我出生 /
  谁也不许自己给自己打分）置顶 → §1 三件套（纲：先建模再投影 + 前提：机械投影器，把 LLM 赶出投影路径
  + 密封条：缝隙监视器；含"测试是存在量词、构造是全称量词"的量词论证与 KaTeX 类比）→ §2 五层**降级为
  视图而非本体论**（重叠是冗余红利不是缺陷）→ §3–5 验证金字塔/五锁/边界（保留）→ §6 否决记录 →
  §7 **实现期备忘（未立法）**：记录归一化、义务派生、仲裁全序、防震荡三则、组件四层、回溯三地基
  全部降级，明确标注"等真实运行复现 ≥2 次再走六维规约收紧"。思想不丢，不冒充宪法。
- **补缺口**：新增**教学依据库**（底座的姊妹通道）。对称原则：**页面是真值的投影，大纲是教学知识的投影**。
  它不进底座（不出现在页面上、无 oracle 可判），但必须有家——否则大纲的结构性决策就是 planner 临场偏好。
  配套红线"大纲上任何结构性决策回溯不到依据 = 临场偏好"，与总原则"fan-out 每份产出要么落进有声明消费者
  的记录、要么显式丢弃并记录原因——禁止静默蒸发"。
- 波及：SUBJECT-MODEL.md（重写）、HARNESS.md（P2 改述 + 组件表加"教学依据库"行）、
  harness-architecture.html（新增左侧教学依据库通道 + 图例第 5 项，已栅格化验证）、
  EVAL.md / ROADMAP.md（§2.1 → §1 的引用修正；R-004 条目内的旧章节号属历史记录，按 append-only 不改）。
- 判决：SHIP

## R-007 说人话轮：术语去黑话（2026-08-08）

- 轮型：CONSOLIDATE（做薄轮，本轮做的是"词"的薄）
- 轨道：全轨道（文档可读性）
- 缘起：owner「你总爱起一些意义不明的词汇，比如『课题真值底座』——那不就是真实的数据吗，
  你增加了我一吨的认知成本」。这条批评在仓库里有明文依据：`legacy/NAMING.md` 的**朴素词判据**
  （一个通用开发者一眼就认得的词才可直接用），我自造的词没一个能过。
- 统计：底座类 71 处 / 投影类 52 / 监视器类 22 / 派生类 28 / 教学依据库 8，另有承重、密封条、
  冗余红利、义务派生、仲裁全序、底座总线、知识形态、棘轮等。
- owner 拍板：核心三词 →「**备课资料 / 生成 / 自检**」（最白话档）；力度 → **全面说人话**
  （保留 fan-out / fail-closed / canary 等开发者熟词，但首次出现配白话注解）。
- 改了什么：①`SUBJECT-MODEL.md` → **`PREP.md`**（文件名也是 id，内容改名不改就是漂移），
  全文按对照表重写；②CHARTER / HARNESS / EVAL / ROADMAP / LINEAGE / B-CORE / sabotage README /
  BASELINE / 根 README 的术语与链接同步；③架构图 `harness-architecture.html` 图上的词同步
  （备课资料 / 资料线·取料·比对 / 教法笔记 / 运行时自检 / 定向返工），**已栅格化目视验收**；
  ④LINEAGE 新增**术语对照表**（旧词 → 新词 → 为什么改 + provenance），思路不丢、防止有人造回去；
  ⑤CHARTER §8 补一句：NAMING.md 的朴素词判据**同样管方法论散文，不只管代码 id**；保留的技术词
  首次出现须配白话注解。
- 纪律：**只换说法，不换主张**。LEDGER 历史条目里的旧词按 append-only 不改；`legacy/` 冻结不动；
  继承旧宪章的词汇（渐进法制/做厚做薄/取经轮/红旗清单/北极星）grandfather 保留。
- 验收：自造词残留 grep = 0（术语表与历史条目除外）；`SUBJECT-MODEL` 死链 = 0；SVG 重渲通过。
- 判决：SHIP


## R-008 框架收敛：三分叉 + 删掉 CitationPass（2026-08-08）

- 轮型：CONSOLIDATE（这轮做的是"结构"的薄）
- 轨道：T-TRUTH
- 缘起：owner 连续三问——「PREP 存在的必要性是什么」「CitationPass 存在的意义是什么」
  「忘掉你的 B-CORE 吧，我们在 reasoning 架构，必须厘清框架」。第三问点破了我的坏习惯：
  连续两轮拿"之后测一测"当挡箭牌，那是回避，架构问题得用架构推理回答。

### 推出来的框架（本轮真正的产出）

一切由**两条约束**推出：①模型输出不可靠且流利可信（必须有地方把"看着对"和"是对的"分开）；
②产物多单元且长于一次上下文（必须有地方放单页无法知道的决定）。

由此得**五个原语**（其余全是推论）：契约 / 规格+构造器 / 独立核对 / 状态 / 外部信号。

**正确性的组织方式是一个分叉，不是一串组件**——每条内容先问"有没有机械构造器"：
① 可构造 → 造（保证所有情况，便宜）；② 不可构造但可核 → 生成+独立核（抽查级，贵）；
③ 两者皆无 → 生成+如实标注未核实（无保证，不许伪装成有）。
**全系统唯一战略命题：把内容尽量从右往左推**——每造一个构造器，就把一整类内容搬进"不可能错"。
组件库因此不是"复用省事"，是扩大①的覆盖面，杠杆最高的投资。

### 由框架带出的两处修正

1. **我一直切错接缝**：PREP 的五类知识横跨分叉两侧（可跑的/数量/交互属①，事实属②，故事横跨），
   难怪怎么切都不正交——**真正的接缝是"可不可构造"，不是知识类型**。且 PREP 内部躺着两种生命周期
   不同的东西：**规格**（排大纲的人写、构造器消费、①）与**已核事实**（研究阶段查回、散文消费、②），
   接口层面应当分开。本轮先在文档里标注，未改数据结构。
2. **CitationPass 删除**（owner 提出）：改为**提取时确定性绑定**——出处不是模型填的字段，是工具调用
   记录自动带出来的（URL+抓取时间），并强制带**原文片段**且机器校验它是抓回文档的**字面子串**。
   我为 CitationPass 辩护的唯一理由是防"事后补出处"；这个设计让事后补出处**在结构上不可能发生**，
   理由消失。残差（引文真但概括错）退化为**无状态的两串文本蕴含判断**——不用重抓原文、不用研究
   上下文、天然干净，且断言是引文字面子集时零成本跳过。**检测一个失败模式，不如让它无法发生。**
   删了之后**变得更重要**的一条：页面层机器检查"绑定有没有在传递中走样"（引文→记录→页面句子两三跳）。
   另立一根轴：**来源质量**（一手史料/教材 > 博客）——确定性绑定只保证忠实转述，不保证来源本身对。

### 波及

PREP.md（§1 重写为分叉框架 + §2 加分支列与规格/事实提醒 + 新增 §2.1 确定性绑定含 CitationPass 删除记录 +
T3 改写）、HARNESS.md（新增 §0.7 五原语与分叉 + 组件表加"出处的确定性绑定"行 + 架构 ASCII）、
EVAL.md（G4 → "出处绑定未走样"）、ROADMAP.md（问题3 落地序）、harness-architecture.html
（CitationPass 框 → "提取即绑定出处（确定性）"，已栅格化验收框宽）。

- 判决：SHIP

## R-009 可执行物的验证：参照物原则（2026-08-08）

- 轮型：BUILD（调研落地）+ CONSOLIDATE（第一版被否后重做）
- 轨道：T-TRUTH
- 缘起：owner「事实溯源已有广泛研究认证，不是我们的重点；**HTML 上的可交互元素、动画、游戏、仿真、
  代码全都是正确的**才是相对新的研究——向上抽象做更广泛的跨领域调研」。
- 调研：三路并行（形式化与运行时验证 / 工业界无限行为空间 QA / 科学计算 V&V + 教育仿真 + LLM 生成物），
  约 120 条一手来源，全文落 `methodology/research/survey-interactive-correctness.md`。
- **第一版规划被否**：我把调研整理成 0–8 级共九级的验证阶梯 → owner「很乱很复杂还不一定有效果，
  浪费时间；设计应该尽量优雅」。这与 R-006 是同一条批评（用"加机制"回答问题）。
- **重想后的结论**：九级是同一件事的七个实例。**正确 = 与一个外生参照物一致；验证的全部工作是找参照物。**
  制造解、收敛阶、蜕变测试、差分对拍、契约回读、确定性重放——区别只在参照物从哪来。
  于是只剩：**一张参照物来源表**（按可信度排序：闭式解 > 独立参考实现 > 声明的规格 > 学科定律 >
  变换不变性 > 自身更细步长 > 自身上次运行 > 通用页面性质）+ **一条规则**（每个可执行物至少绑一个
  外生参照物，绑不到就降级）。**不新增任何硬门**——G2 改述为这条规则，表是菜单不是门。
- **三条红线**（被数据证伪的做法，非新规则）：①"跑通"不算验收（实测 39–40% 能跑但解错物理）
  ②同一 agent 不许既写产物又写它的检查（LLM 写的是"实际行为"断言）③返工必须累积反例且有上限
  （现在是重试不是反例制导，会震荡；无上限会触发 in-context reward hacking）。
  底层理由：**凡从产物自身导出的检查都可被绕过**（生成器会每帧重整化能量：裕度完美、物理错误）。
- **三处修正**（改错不是加新机制）：①**缺绝对参照物**——不变量与蜕变关系全是必要不充分，g 写成 98 的
  单摆能通过全部；②**"能量守恒"当通用自检是外行做法**——辛积分器有界振荡/耗散系统本应下降/RK4 本就漂移，
  一刀切会产生假警报致 checker 被禁用，主检查改为"更细步长"；③当初否决 verificationCases 时 overcorrect
  了——反例制导的反例是"约束合成空间"不是"采样行为空间"，原否决理由仍成立但性质不同。
- 架构结论（三路一致指向，写进 HARNESS P7）：**受限组件让正确性从"不可判定"降到"读 AST"**——
  自由 JS 无法确定性回读它实际实现了什么方程，受限组件可以。
- 波及：新增 `methodology/VERIFY-EXEC.md`（短文档）与 `research/survey-interactive-correctness.md`；
  PREP（三处修正 + 指向）、HARNESS（P7 深化 + L1 + 组件表加"参照物绑定"行）、EVAL（G2 改述）、
  ROADMAP（落地序按参照物强度）、架构图 L1、LINEAGE 第四代条目。
- 明确不做：九级阶梯、新增硬门；差分对拍/契约回读/STL 对抗搜索/覆盖模型自动导出/GSN/Simplex
  只留在调研文档，按渐进法制不预防性立法。
- 判决：SHIP

## R-010 分类接口从枚举改为结构问题（2026-08-08）

- 轮型：BUILD（设计精化）
- 轨道：T-TRUTH
- 缘起：owner 连问两轮——「PREP 的分类是调研 agent 自动分好的还是怎样，这一步有信息丢失吗」
  「PREP 如果要分类，必须足够抽象以便扩展，因为 HTML 可嵌入元素无边界，我们现在想到的只是一部分」。
- 发现的真实缺口：①从没指定"谁来把研究结果分类到五种知识类型"，这是文档空白；②按内容域枚举
  分类（事实/可跑的/数量/故事/交互）本质是给无界集合（HTML 能嵌入的一切）枚举有限桶，新内容类型
  出现时永远追不上。
- 修法（重新定位，非重新设计）：**分类不是挑标签，是回答两个跟内容域无关的结构问题**——
  ①这条内容有没有机械构造器（§1 分叉）②它的可信度来自哪个参照物（VERIFY-EXEC 参照物表）。
  两个问题对任何未来内容类型都能问，不需要为新类型开新桶——接口封闭、内容域开放。
  原五行表降级为**"示例，非穷举"**，明确标注"遇到新内容去问两个问题，不要来表里加行"。
  副产品：分类的一大半可以做成结构检查（"记录里有没有符号形式字段"）而非创建者自由裁量，
  部分回应了"谁来分类"的自我评分风险；"有没有构造器"这个判断本身仍是未解决的残余风险，如实记录不假装堵上。
- 波及：PREP.md §2 重写（结构问题框架 + 示例表降级）；HARNESS.md 与 harness-architecture.html
  的"五类"表述同步改为"示例(非穷举)"，已重渲验收。
- 判决：SHIP

## R-011 全流程数据 Schema：字段级形式化（2026-08-08）

- 轮型：BUILD（形式化，非新设计）
- 轨道：T-TRUTH / T-LONG（贯穿全部七阶段）
- 缘起：owner「确定一下整个 workflow 的数据传输情况——每个阶段输入输出的 schema，按照'字段名'：
  '中文描述'，各阶段横向排列做一个 html」。HARNESS.md §2 的七阶段职责此前只有散文描述，没有落到字段。
- 改了什么：新建 `methodology/pipeline-schema.html`——纯 HTML/CSS（非 SVG，文字自然换行，不重蹈架构图
  早期的文字溢出坑）横向看板布局，七阶段每列上/下分别是输入/输出 artifact 卡片，格式
  `字段名: 中文描述`。字段全部从 HARNESS/PREP/VERIFY-EXEC 已写定的散文里抽取，不引入新机制：
  - `prep-record` 按 R-010 设计成**通用信封**（`branch`+`referenceSource` 是字段不是分表），
    不是按"五种知识类型"分别开 schema——避免重犯 R-010 刚刚纠正过的枚举陷阱。
  - artifact 名沿用 `harness-architecture.html` 已经画出来的（`course-brief`/`outline`/`globals`/
    `page-spec`），不重新命名。
  - `evidence` 子字段 `{url, quotedSpan, fetchedAt}` 对齐 PREP §2.1；`referenceSource` 枚举值
    对齐 VERIFY-EXEC 参照物表全部 8 项（含"自身·更细步长"与"自身·上次运行"的区分，未合并简化）；
    `gates` 对齐 EVAL.md G0–G6。
- 验收方式的诚实记录：这台机器没有 headless browser（`tools/lib/browser.mjs` 的 `findBrowser()`
  只认 Windows 路径），无法像架构图那样真机截图。改用 HTML tag 平衡校验 + CSS 花括号平衡校验 +
  扫描窄列内有无不含空格的长 `<code>` token（零命中）+ 防御性补 `overflow-wrap: break-word`。
  **纯 HTML/CSS table 布局本身比 SVG 绝对定位文字更抗溢出**（表格单元格默认自动换行），这是选择
  普通网页布局而非 SVG 的直接原因。
- 波及：HARNESS.md §2 图注加指向链接；LINEAGE.md 第四代表加一行。
- 判决：SHIP（真机渲染验收待后续在有浏览器环境的机器上补做）

## R-012 修 pipeline-schema.html 的冗余字段 + 补 CEGIS 反例台账（2026-08-08）

- 轮型：CONSOLIDATE（删冗余）+ BUILD（补缺口）
- 轨道：T-TRUTH
- 缘起：owner「我感觉有很多冗余字段，但是说不上来，你好好 reason 一下」。逐字段核对 R-011 产出的
  schema，找到的问题分三类：纯冗余（同信息存两份/写重复）、范围错位（页级 artifact 里塞了全书/跨
  run 级事实）、以及一处真实设计缺口（`repair-feedback` 没有实现 `VERIFY-EXEC.md` 红线③要求的
  反例累积，等于两轮前立的规矩在字段级又漏掉了）。
- owner 拍板两条：①范围错位的根子在 EVAL.md 的 G 编号与 HARNESS.md 的 L 编号本身没对齐，这轮**只改
  schema 页**，记一条待办不动那两份文档；②CEGIS 缺口**这轮顺便补上**。
- 改了什么（九处）：
  1. 删 `outline` 顶层重复的 `rationale`（已嵌套在 `chapters` 形状里）。
  2. `outline.durationBudget` 收窄为只存 `totalMin`，"每页分配"不再重复存（已在各 page-spec.timeBudgetSec）。
  3. 删 `course-brief.depth`——本轮自造、未见于 HARNESS/PREP，与已有出处的 `intensity`（P9 三档）
     实为同一旋钮，违反 schema 页自己声明的"形式化不新设计"。
  4. `verification-report` 删 `gates` 字段——G0/G2/G4/G5 与 `layers` 的 L0/L1/L2 大面积重复，`layers`
     定为唯一真相源。
  5. G3（长程结构/plan-coverage）搬到 [5] `consistency-report.planCoverage`（全书级事实，等全页拼完
     才查得出，硬塞进单页 verification-report 是范围错误）；G1/G6 标注为属于外循环 EVAL 记分卡，
     不进本 schema。
  6. `verification-report` 删页级 `canaryLeakage`——掺沙抽查是批次级事实，唯一落点收拢到
     `quality-report.canaryLeakageSummary`。
  7. 删 `page-artifact.selfCheckDeclared`——无下游消费者的死字段，且诱导 worker 自定验收标准
     （犯 PREP 第三句核心）。
  8. `page-artifact.interactionFSM` 改为 `interactionParams`——原设计让 worker 重新声明 prep-record
     已经定死的状态机，等于自证自己；改为只存该页对模板的具体参数取值，状态机以 boundReferences
     指回 prep-record。
  9. **新增 `counterexample-ledger`**（页状态机的一部分，[3]↔[4] 回路上只增不减的台账：entries/
     activeConstraints/attemptCount）；`repair-feedback` 相应改写为引用它（`newFailure`+`ledgerRef`），
     不再自己重复罗列失败信息。返工回路从"报错→重生成"的重试，变成"报错→追加台账→带全部历史
     反例重生成"的真 CEGIS。
  - 另加三处"确认保留"标注（boundPrepRecords→relevantPrepRecords→boundReferences 的计划/解析/实际
    链条；durationBudget vs totalDurationEstimate 的计划/实际；pitfallEntries vs misconceptionEntries
    的消费者区分），防止同样的疑问被再问一次。
  - 页脚补"已知待办"：EVAL.md 的 G 编号与 HARNESS.md 的 L 编号尚未对齐，留后续一轮专门处理。
- 验收：HTML 标签配对、CSS 花括号平衡通过；九处改动逐条 grep 确认生效。
- 判决：SHIP

## R-013 精简 pipeline-schema.html：id 命名规则 + 描述瘦身 + 合并过细 artifact（2026-08-08）

- 轮型：CONSOLIDATE（做薄）
- 轨道：T-TRUTH
- 缘起：owner 两问——「noteId/pageId/recordId 是不是都该叫 id」「感觉字段和 artifact 太复杂，
  中文描述太冗长，说不上来哪里」。
- **问题一的答案不是"统一改 id"，是分两类**：字段名会不会被别的 artifact 按同名当外键引用——
  会（`pageId` 被 page-artifact/verification-report/counterexample-ledger 共用作贯穿全流程的联结键；
  `recordId` 被 boundPrepRecords/boundReferences/referenceComparison 引用）→ 类型前缀是联结键，必须留；
  不会（`noteId` 全篇没有第二处按此名引用）→ 前缀是纯装饰，改成 `id`。
- **问题二找到两个真实来源**：①描述行里塞了太多"见 P9/见 §2.1/见 VERIFY-EXEC 修正①/原 G3"这类出处
  引用，schema 的职责是说清楚"装什么"不是重新论证"为什么"——后者已经写在 PREP/HARNESS/VERIFY-EXEC
  里，逐行重复引用就是冗长的来源；②部分 artifact 拆得比信息本身需要的更碎。
- 改了什么：
  1. `research-note.noteId`、`pedagogy-note.noteId` → `id`；`pageId`/`recordId` 保留不动。
  2. 全篇字段描述按"只说装什么"规则重写，砍掉所有出处引用（页头统一声明一次即可，不逐行重复）。
  3. **合并 `human-confirmation` 进 `outline`**（confirmedAt/revisionNotes 变成 outline 的字段，
     它本来就是 outline 被确认这件事的附属元数据）。
  4. **合并 `repair-feedback` + `degraded-fallback` 进 `verification-report`**，用 `status` 字段 +
     "仅当 status=X"分组区分附带字段——三张卡本来就是"一次验证事件的三种可能结果"。
     `counterexample-ledger` 不合并（跨轮次持久台账 vs 单次验证结果，生命周期不同，合并会搅混）。
  - 具名 artifact 从 19 个降到 16 个。
- 验收：HTML 标签配对、CSS 花括号平衡通过；`noteId` 清零；三张被合并卡片的独立 artifact-title 清零；
  出处引用（见 P9/见 §/原 G3/R-010/VERIFY-EXEC 修正/PREP §2.2）清零；`pageId`(4处)/`recordId`(1处+
  引用链)确认保留且引用完整。
- 判决：SHIP
