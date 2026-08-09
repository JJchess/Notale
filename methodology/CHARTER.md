# LectureAgent 迭代宪章 v3（2026-08-08）

> 继任 `legacy/LOOP_PROMPT.md`（宪章 v2, 2026-07-11）。v2 及其 82 轮日志原地冻结、只读，族谱见
> [`LINEAGE.md`](./LINEAGE.md)。本文件是活的宪章：规则的增删改只能走
> `lecture-agent/docs/harness/rubrics/design-review-rubric.md`（LOCKED 六维规约）+
> `lecture-agent/docs/harness/decisions.md`（append-only ADR）。

---

## 0. 两条元原则（宪法级，对两次真实翻车的永久回应）

本仓库已付过两次学费，方法论把它们写成宪法：

- **教训 A**（iter1–54，见 `legacy/LOOP_PROMPT.md` 开篇）：指令奖励"看不见的正确性"，50 轮里 ~90% 是修 bug + 加断言，讲义外观毫无变化。
- **教训 B**（2026-08-07 run）：QA 机器造了一屋子，但默认路径 `absolute_frames=True`
  （`lecture-agent/lecture_agent/engine/pipeline.py:167`）把语义质量门、Layout Director、构图编译器、
  层级规划器（`domain/planning.py:994`）、视觉修复**全部旁路**，成品带 8 个硬错误照样提交。

由此立两条元原则：

> **M1 默认路径条款**：评测只认**用户敲默认命令拿到的产物**。任何"只在评测 flag /
> 特殊配置下才生效的质量机制"，计分上视为不存在。默认路径绕开自己的质量门，不是 bug，是违宪。
>
> **M2 Fail-closed**：每个质量门必须留下**执行回执**（stage log）。没有回执 = 该门红，
> 而非"跳过"。裁判（LLM/VLM judge）没跑、或没通过掺沙抽查，其出具的一切分数作废。

一句话合并：**Evaluate the artifact a user would actually get, and never let a gate silently not run.**

---

## 1. 北极星（可证伪、防 gaming 的目标函数）

> 在冻结基准题集 B-CORE 上，用默认命令端到端生成，产物必须同时满足：
> 1. **硬门零红**（G0–G6，见 [`EVAL.md`](./EVAL.md)）；
> 2. 盲测成对比较中，以 **≥60% 的页面级胜率**击败上一个 accepted baseline；
> 3. 对金样本（`eval/gold/`）的败率**逐里程碑收窄**。
>
> 三条同时成立，才允许宣称"harness 变好了"。

防 gaming 设计（缺一不可）：
- **相对制**：主指标是对上一版基线的成对胜率，不是绝对分。绝对分会饱和、会被 judge 通胀；成对比较永远有输赢。
- **默认路径条款**（M1）直接封死"评测特供路径"。
- **冻结 + 轮换双题集**：B-CORE 冻结画趋势线；B-HOLD 每里程碑换新题防过拟合。B-HOLD 胜率显著低于 B-CORE → 判过拟合，里程碑不通过。
- **裁判先过抽查**（SABOTAGE 掺沙样本，见 [`PREP.md`](./PREP.md) §4）。

北极星刻意**不是**"学生学习效果"——那不可日测。教学有效性作为 T5 慢趋势挂在里程碑（永不做门，防 Goodhart）。

第一优先级排序（用户 2026-08-08 拍板）：**正确性（T-TRUTH）> 页面厚度（T-VIS）≈ 长程（T-LONG）≈ 多样性（T-STYLE）**。
正确性的中枢制度是**备课资料**（先查资料再生成页面），见 [`PREP.md`](./PREP.md)。

---

## 2. 轮次制度

| 轮型 | 触发/频率 | 内容 |
|---|---|---|
| **BUILD** | 默认 | 在一条轨道上做一个**可见**改进 |
| **FIX** | 任一硬门红，抢占一切 | 修到门绿为止 |
| **BORROW 取经** | 每 ~5 轮 ≥1（继承 v2 制度） | 从开源项目移植一个具体机制（v2 已调研富矿见 `legacy/LOOP_PROMPT.md` §取经）；**新增对象：逆向金样本**——挑 `eval/gold/` 一页，说出让它成立的那个机制，按 `legacy/NAMING.md` 本地化后编码进系统 |
| **CONSOLIDATE 做薄** | 每 ~6 轮 ≥1 | 删并规则/版式/提示词/死代码；全部趋势指标不得回退（继承 v2"哲学 B·做厚再做薄"） |
| **CALIBRATE 校准** | 每 ~8 轮，或裁判失准时 | 换掺沙样本、拿人当尺子盲测（judge-human 一致率 <75% → judge 分数标"未校准"，不得用于 SHIP）、审计 stage log |
| **MILESTONE 里程碑** | 每 ~10 轮 | 全量 B-CORE + 新抽 B-HOLD + **Q1 六十分钟题端到端** + 人工评审 + 趋势线汇报。**只有里程碑有资格宣称北极星进展** |

## 3. 四条轨道（= 四大问题）

| 轨道 | 问题 | 当前最欠的交付物 |
|---|---|---|
| **T-TRUTH** 正确性（第一优先） | 内容与交互设计都必须对、必须合理 | 备课资料（[`PREP.md`](./PREP.md)）逐层落地，T0/T1 先行 |
| **T-VIS** 页面厚度 | 页面单薄如茅草屋 | 见 [`ROADMAP.md`](./ROADMAP.md) §问题1 |
| **T-LONG** 长程 | 60 分钟讲义 | 时长→页数→密度模型（全仓库缺失） |
| **T-STYLE** 多样性 | Claude 味、只会换色 | 版本化 authoring profile + 人工盲评 + 风格指纹度量 |

纪律（继承 v2）：任一轨道在 10 轮窗口内 ≤50%；纯不可见加固 ≤ 每 3 轮 1 次。

## 4. 每轮闭环（强制 checklist）

```
□ 0 读态：eval/BASELINE.md（当前基线 hash + 记分卡）、open scenarios、上轮 eval/LEDGER.md
□ 1 看现状：基线 run 的 contact-sheet + 记分卡——先看成品再看代码（继承 v2"先看"铁律）
□ 2 定轮型与目标：门红→FIX；否则按轮换选轨道，从记分卡挑最差项
□ 3 改一件事；若改的是 harness 规则本身 → 过六维规约 + 对抗测试，追加 ADR
□ 4 跑评测：微轮跑 3 题烟测子集；里程碑跑全量。默认命令（M1），产物落 eval/runs/<date>-<hash>/
□ 5 比对：门表 diff + 趋势 delta + before/after/gold 三联 contact-sheet + 掺沙样本的成对盲测
□ 6 判决：SHIP（门零回红 且 有可见改进证据）/ REVERT / PARK；记 eval/LEDGER.md
□ 7 法制动作：收紧或放松规则 → 追加 decisions.md ADR；新发现的失败模式 → 新 S-0xx scenario
□ 8 归档：run 目录按保留策略落盘（截图必须留——2026-07 只留下一个快照的教训不许重演）
```

## 5. 渐进法制（继承 v2"哲学 A"，锐化）

- **趋势 → 门**：同一缺陷在 ≥2 个不同基准 deck 复现、且存在确定性检测器时，冻结当前值为地板、晋升为硬门；ADR 记"因何收紧"。
- **门 → 软化/退休**：一条规则连续拦下 ≥2 个"金样本级"的正当设计时，降级并记入 `lecture-agent/docs/harness/rejected.md`。
- **写作问题的治理条款**：反复出现的文风问题先进入版本化 authoring profile 和人工回归集；只有
  能客观定义、不会误伤正当表达的结构问题才可升级为机器门。文案短语不建立运行时黑名单。
- 规则的生杀**只能**走六维规约 + ADR，任何人（包括 agent）不得就地改。`lecture-agent/docs/harness/`
  的规约/ADR/scenario 机制自此**升格为全仓库规则修改的唯一法院**（管辖范围从 lecture-agent harness 扩到整个评测宪法）。

## 6. 红线（继承 v2 原文，第一天就硬、永不放松）

绝不 mock 任何数据/交互；渲染器对任何输入不许崩（缺字段兜底不抛）；所有用户/LLM 内容转义、widget 走 iframe 沙箱；离线零运行时依赖；**一切内容有据可依、不编造**。去 AI 味/加版式/换主题时同样守。

## 7. 模板化迹象（T-STYLE 人工评测清单）

以下迹象用于 profile 迭代、成对比较和人工审查，不逐词写入运行时正则：

- **视觉**：紫/靛蓝渐变；Inter 独大、无字体配对；全大写小标签+圆点+细线 eyebrow；什么都居中；"大标题+三条对称要点"；emoji 当小标题；清一色圆角卡片+单边彩条；feature pills；孤立 stat 横条；正文用 mono；单词 serif 斜体救场；无主色的平均调色板。
- **文案**：空泛万能标题（赋能/释放潜力/未来）；凑三条；"不是X而是Y"；破折号满天飞；buzzword；对冲含糊；"本文将探讨/综上"。

去 AI 味正向做法：一套有观点的配色（一个主色 + 一个尖锐强调色，次要色 color-mix 派生）；两款拉开重量的字体配对；默认左对齐（居中只留封面/金句）；模数化间距与克制层级；真实具体文案（点名主题/给数字/给 before-after）。

其中真正属于结构事实的项目可以按 §5 晋升为机器门；纯文风判断继续由 profile 与人工基线治理。

## 8. 命名与吸收（继承 v2）

任何外来机制并入系统前，按 `legacy/NAMING.md` 走本地化五步；禁把外来学术黑话或研究编号当暴露名。数据承载 id（block.type/scene.kind/layout.kind/theme）grandfather 不改。

**NAMING.md 的「朴素词判据」同样管方法论散文，不只管代码 id**（2026-08-08 补，缘起见 `eval/LEDGER.md` R-007）：
造一个词之前先问"一个通用开发者一眼认得吗"，认不得就别用；确实要保留的技术词（`fan-out`、`fail-closed`、
`canary`、Goodhart 等）在每份文档首次出现时配一句白话注解。**读者不该为了读懂方法论先学一套私有词汇表。**
已换掉的自造词与替换理由登记在 [`LINEAGE.md`](./LINEAGE.md) 的术语对照表，防止有人再造回去。
