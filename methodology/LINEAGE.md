# 方法论族谱（LINEAGE）

> 本仓库的方法论遗产散落三代目录。**legacy 原地冻结、只读，绝不搬移改写**——本索引是唯一的活入口。
> 新人阅读顺序：[`CHARTER.md`](./CHARTER.md) → [`PREP.md`](./PREP.md) →
> [`EVAL.md`](./EVAL.md) → [`ROADMAP.md`](./ROADMAP.md) → 本文按需回溯。

## 第一代：Node 原型宪章时期（legacy/，冻结）

| 文件 | 是什么 | 对 v3 的贡献 |
|---|---|---|
| `legacy/LOOP_PROMPT.md` | 宪章 v2（2026-07-11）。开篇自我指控 iter1–54 教训 | CHARTER v3 的直接母本：北极星形态、红旗清单（§7 原文继承）、红线（§6）、取经轮、渐进法制、做厚做薄 |
| `legacy/ITERATIONS.md` | 82 轮迭代日志（128K） | `eval/LEDGER.md` 的前身；R-001 回链于此 |
| `legacy/DESIGN_RESEARCH.md` | 24 条可编码设计机制（T1–T24，博物馆展陈/Swiss 编辑排版/信息设计） | T-VIS 词表扩容与 BORROW 轮的机制货架 |
| `legacy/NAMING.md` | 外来概念本地化五步命名法 | CHARTER §8 原样继承 |
| `legacy/BACKLOG.md` | §C 已否决（防止重新翻案）、§D 已知取舍（非债务勿修） | `rejected.md` 纪律的先声；翻旧账前先查此处 |
| `legacy/README.md` | 原 Node 管线全貌（STORM/PPTEval 来源） | 考据用 |
| `legacy/hermes-shell/README.md` | 1200 行 ReAct 壳因"零真实使用"被冻结的诚实验尸报告 | "能用 workflow 就别上 agent"的本仓判例 |

## 第二代：制度化时期（lecture-agent/docs/harness/，**活的，升格为全仓库法院**）

| 文件 | 是什么 | v3 中的地位 |
|---|---|---|
| `rubrics/design-review-rubric.md` | LOCKED 六维规约（可执行性/可证伪性/最小性/边界清晰/防 gaming/偏好简化），六维全过才收，永不合成总分 | **一切规则增删改的唯一评审面**（CHARTER §5）。管辖范围自 v3 起从 lecture-agent harness 扩到整个评测宪法 |
| `decisions.md` | append-only ADR（D-001…） | 唯一定案通道；主干决策（ROADMAP §5）将在此定案 |
| `scenarios/`（S-001…S-014） | 失败场景档案 | checklist 第 7 步的落点：新失败模式 → 新 S-0xx |
| `mechanisms/`、`rejected.md`、`ontology/` | 机制记录 / 否决档案 / 概念表 | 照常使用 |

注：本次刻意**不** `git mv` 该目录——法院原地办公，methodology/ 只建立引用。

## 第三代：复盘时期（docs/）

| 文件 | 是什么 | 用途 |
|---|---|---|
| `docs/deck-workflow-diagnosis-2026-07-30.md` | 全仓最强复盘：三层归因、当场纠正自己初版误诊、"谁在回路里"审计法 | 教训 B 的原始出处；G1 门的立法理由书 |
| `docs/deck-visual-review-2026-07-30.md` | 40 页 deck 的症状面拆解 | 与 `resultforanalysis/` 40 张截图互证 |
| `docs/CONTENT_TAXONOMY.md` | 10 轴内容分类 + 缺口图 + 借鉴地图 | T-VIS 词表扩容的缺口清单 |
| `docs/knowledge-base/` | 工程避坑图鉴（仅 2 条，待续） | 照常追加 |

## 第四代：终局图景时期（methodology/，2026-08-08）

| 文件 | 是什么 |
|---|---|
| [`HARNESS.md`](./HARNESS.md) | **Notale 当前内循环**：单 Planner、并发 Builder、页面 revision 事务、fallback、恢复和统一日志 |
| [`harness-architecture.html`](./harness-architecture.html) | Harness 数据流图；应与 `HARNESS.md` 的 Planner → parallel Builders 主链同步维护 |
| [`pipeline-schema.html`](./pipeline-schema.html) | 字段图；当前权威 schema 只有 `plan.json`、`run.json` 与 `{html, notes}` 页面产物 |
| [`VERIFY-EXEC.md`](./VERIFY-EXEC.md) | **可执行物怎么验**：一个原则（正确=与外生参照物一致）+ 参照物来源表 + 三条被数据证伪的红线 + 三处修正。仿真/动画/代码/交互的验证归它管；事实类归 PREP §2.1 |
| `research/survey-interactive-correctness.md` | 前沿+经典调研：形式化与运行时验证 / 工业无限空间 QA / 科学计算 V&V / 教育仿真 / LLM 生成物（约 120 条来源） |
| `research/survey-agent-orchestration.md` | 前沿调研：编排架构/长程技术/多智能体成败/Skill 库（2024–2026，一手来源） |
| `research/survey-verified-generation.md` | 前沿调研：验证优先生成/judge 可靠性/引证/视觉验证/仿真接地/叙事一致性 |
| `research/survey-presentation-generation.md` | 前沿调研：演示与教育内容生成/image-first/多样性/交互生成/时长课程 |

分工：CHARTER+EVAL = 外循环；HARNESS = 当前运行时；PREP/VERIFY-EXEC/research = 方法论与实验参考，不进入当前 Agent 或 schema。

## 第五代：v3/ 独立新线（2026-08-08）

| 文件 | 是什么 |
|---|---|
| `v3/` | **独立新线的家**：按 HARNESS/PREP/VERIFY-EXEC 从零搭建内循环，与 lecture-agent 无代码依赖（用户 2026-08-08 拍板：完全忘记 lecture-agent，单独立文件夹）。仅移植了其 LLM 调用基础设施（`v3/llm.py`：HttpxClient/FakeClient，行为原样；默认模型换成 DeepSeek-V4-Flash，deepseek-v3/GLM/kimi 等旧模型档案不随迁）。注意：目录名 `v3/` 与"宪章 v3"是两回事，前者是代码线，后者是文档版本。进展（2026-08-08）：内循环七阶段主干已建成并离线测试 25 绿——artifact schema 全量落地、出处确定性绑定、页状态机+断点续跑、反例制导返工与降级安全页、L0 规则层真实现；L1–L6 验证层、lectureLib 组件库、真联网搜索为下一批交付物。进展（2026-08-08，二）：agent base 采用 OpenHarness 0.1.9（spike GO，见 `v3/docs/openharness-spike.md`），research 四路已迁 AgentBase 工具循环（模型自调 fetch_web，harness 从工具 `.records` 绑出处），出处绑定纪律不变且更彻底，builder 仍为单次调用+skill 注入；离线测试 31 绿 |

## 术语对照（说人话表，2026-08-08）

Owner 指出方法论里自造词太多（"课题真值底座——那不就是真实的数据吗，增加了我一吨的认知成本"）。
按 `legacy/NAMING.md` 的**朴素词判据**（一个通用开发者一眼就认得的词才可直接用）全面替换。
**登记在此是为了不丢思路、也防止将来有人再造回去**——旧词只在本表和 LEDGER 历史条目里出现。

| 旧（自造） | 新（说人话） | 为什么改 |
|---|---|---|
| 课题真值底座 / 真值底座 / 底座 ← Grounded Subject Substrate（旧文件名 `SUBJECT-MODEL.md`） | **备课资料**（新文件名 [`PREP.md`](./PREP.md)） | "底座"是自造隐喻；老师熟悉"备课资料"，且天然含"上课前先查好"之意。文件名也是 id，内容改了名不改就是漂移 |
| 投影（动/名） | **生成** | 数学隐喻当日常词用 |
| 机械投影器 / 投影器 | **固定的生成程序** | 同上；"固定"= 确定性、不是模型现写 |
| 构造式派生 / 派生 | **由资料生成** | 硬造 |
| 缝隙监视器 / 监视器 | **运行时自检** | 中文"监视器"还跟显示器撞名 |
| 不变量契约 | **自检条件** | 首次出现注一句"跑的时候必须一直成立的条件" |
| 教学依据库 | **教法笔记** | 硬造 |
| 承重 / 密封条 / 冗余红利 / 义务派生 / 仲裁全序 / 底座总线 / 知识形态 / 棘轮 | 一律改写为白话（主要靠… / 补最后一道缝 / 多一条查法是好事 / 按知识类型定查法 / 冲突时谁说了算 / 资料线 / 知识类型 / 只进不退） | 硬造隐喻 |
| 存在量词 / 全称量词 | "只保证抽查过的那几种情况" vs "保证所有情况" | 论证保留，术语外壳去掉 |
| 测谎 / 金丝雀 | 抽查 / 掺沙样本（canary） | 保留英文原词但配白话 |

**保留的英文技术词**（首次出现须配一句白话注解）：`fan-out`（一次派出多个 agent 并行）、
`fail-closed`（没跑就算没过）、`canary`（掺进去的坏样本，用来抽查判官）、Goodhart（指标一旦成为目标就会被刷）、
`Vendi`（多样性度量工具名）。

**继承旧宪章、不动**（grandfather）：渐进法制 / 做厚做薄 / 取经轮 / 红旗清单 / 北极星。

## 关键代码证物（立法引用，非改动对象）

- `lecture-agent/lecture_agent/engine/pipeline.py:167` — `absolute_frames: bool = True`，教训 B 的根（M1/G1 的立法依据）
- `lecture-agent/lecture_agent/domain/planning.py:994` — 层级规划器被默认路径短路的证据
- `tools/render-check.mjs` — G0 门与截图证据协议的现成执行器（A–I 断言、`--shot`、`--json`）
- `viewer/telemetry/coverage.json` — block 分布熵趋势的数据源（flow 632 / table 26 偏斜病灶）
