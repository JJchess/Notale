# 《HTML is all you need》升级方案 —— 活文档

用途：dev 收敛期间用来对齐思想的方案稿。每轮 critic 记入 §7，改动记入 §8。开分支动手的条件：§6 待决点全部关闭，§7 没有未回应的结构性问题。

## 1. 主张（论文要证明的一句话）

给任意 query，同一个锁定模型（gemini-3.8-flash / low）套上这套 harness 后产出的 HTML，在单页与多页两类场景上都显著优于裸模型，且每个组件的贡献可被消融分离。

不主张：比 NotebookLM / Gamma 等商用系统排前（那是产品线的事，且要对齐它们的输入输出格式）。

## 2. 场景与榜

| 形态 | 场景 | 主榜 | 补充 |
|---|---|---|---|
| 单页 | ArtifactsBench 九类（游戏、Web 应用、管理系统、SVG、仿真、数据科学、多媒体编辑、小工具、其他） | ArtifactsBench 1,825 题，checklist × 三张渐进截图，Gemini-2.5-Pro 判 | InteractScience（仿真类交叉验证） |
| 多页 | 教学讲义（第十类） | PresentBench education 子集；SlidesGen course_preparation | TeachQuiz 协议量"教会没有"；三目标 judge |

## 3. 架构（五处改动，其余不动）

1. **模式与 brief**：runner 显式指定 mode ∈ {single, deck}（意图路由是产品功能，不在论文分支）；两模式共用 brief（目标、受众、可验证预期 3–5 条）。
2. **Planner 可选**：deck 模式走页表 + sources_by_page；single 模式跳过页表，只出 brief。
3. **Builder 底盘 profile 化**：deck profile = 现有 chassis（1600×900 + base.css/js + lib）；single profile = 单文件自包含 HTML。循环（Read→Write→Check→Patch）不变，契约文本按 profile 切换。
4. **Check 升级为裁判**：按 brief 预期跑 Playwright 断言；同一 Patch 目标 ≥3 次即终止（oscillation）。
5. **评测与开关**：`benchmark/` 接线 + 台账已有；新增 config 级开关：no-harness / no-director / no-check-loop / no-materials / no-planner。

不动：Director（风格自适应两模式共用）、材料通道、三目标 judge、模型与 effort。

## 4. 消融表（论文主表的骨架）

| 行 | 配置 | 预期回答的问题 |
|---|---|---|
| A | 裸模型一次生成（多页：给同一页表，每页一次调用） | 下限 |
| A′ | 裸模型等 token 预算 best-of-N | 算力对照，主差值以此为基 |
| B | + Builder 循环（Check/Patch，无预期断言） | 自修复值多少 |
| C | B + Director | 风格层值多少 |
| D | C + 预期断言与振荡终止 | 裁判化值多少，token 省多少 |
| E | D + Planner（仅多页） | 规划值多少 |
| F | E + 材料通道（仅多页有材料题） | 忠实分从 0 起来多少 |

每行两列：ArtifactsBench 分（单页）、PresentBench 分（多页）；外加 token/页、调用数/页、失败页数。

## 5. 顺序（收敛完开始，按最早拿信号排）

| 周 | 做 | 信号 |
|---|---|---|
| 1 | A 行（裸模型跑 ArtifactsBench）；single profile + 路由最小版 → B 行 | 单页上 harness 有没有差值 |
| 2 | Check 裁判化 + 开关化 → C、D 行 | 消融能跑 |
| 3 | PresentBench education 全子集 → E、F 行 | 多页的数 |
| 4 | 补榜、补人测校准、写表 | 论文主表 |

## 6. 待决点（关闭前不开分支）

- [ ] 单页 profile 是否允许不用 chassis（若必须用，ArtifactsBench 的单文件约束怎么满足）
- [ ] 主张定为"优于裸模型"（本稿默认）还是"两榜排前"
- [ ] 单页模式要不要 Director（风格对 ArtifactsBench 的 checklist 有多少权重，需先看它 10 条里视觉 5 条的措辞）
- [ ] 裸模型 A 行的公平性：给不给它同样的 brief 与库清单

## 7. Critic 记录

（每条：日期 · 提出人 · 问题 · 回应/改动）

- 2026-09-16 · Claude · **算力对照缺失**：harness 多花 5–10 倍 token，"优于裸模型"可能只是"多算了"。→ A 行加一个等预算对照 A′：同 token 预算下裸模型 best-of-N（judge 选最好）。差值以 D − A′ 报，不只报 D − A。
- 2026-09-16 · Claude · **裁判进环 = Goodhart**：Check 若照 ArtifactsBench 的 10 条清单去判，等于把评测 judge 搬进生成回路，审稿人会说是对榜过拟合。→ Check 的断言只来自 brief 里我们自己写的预期，与榜的 checklist 隔离；论文里明写两者独立，并报一次"用榜 checklist 进环"的上界作对照。
- 2026-09-16 · Claude · **同族 judge 偏置**：ArtifactsBench 主 judge 是 Gemini-2.5-Pro，我们生成器是 gemini-3.8-flash。→ 主表同时报 Qwen2.5-VL-72B 复判（榜自带的第二 judge），两 judge 排序一致才算数。
- 2026-09-16 · Claude · **意图路由不属于论文**：榜自己告诉你单页还是多页，路由是产品功能。→ 论文分支里 runner 显式传 mode，路由移出 §3，进产品 backlog；§6 相关待决点撤销。
- 2026-09-16 · Claude · **多页的裸模型 A 行没定义**：一次调用生成 25 页 deck 不可靠，A 行会塌成 0。→ 多页 A 行定义为"给同一份页表，每页一次调用、无 Check"，即 A 与 B 的差只在循环，规划的贡献单独在 E 行量。
- 2026-09-16 · Claude · **ArtifactsBench 全量跑不起**：1,825 题 × 6 行 × 每题约 25 万 token ≈ 27 亿 token。→ 按九类分层抽 200 题（每类 ≥15），六行都在同一子集上跑；全量只跑最终 D 行一次对榜。子集抽样脚本与题号入库，保证可复现。
- 2026-09-16 · Claude · **单页 profile 若不用 chassis，论文 harness ≠ 产品 harness**，就是陈说的分叉成两坨。→ 原则改写：核心 = 循环 + 工具 + Check + Director；chassis 只是 deck profile 的"预置资产"。single profile 不带资产但走同一循环。以此为 §6 第一条待决点的默认答案，待用户确认。
- 2026-09-16 · Claude · **缺人测**：两榜都是模型判。→ 第 4 周最少做一次 PresentBench 式 24 题 × 配置的人排序，报 Spearman；不做则论文只能声称"judge 分"。

## 8. 变更记录

- 2026-09-16 v0：从会议结论与前两周 benchmark 调研整理。
- 2026-09-16 v0.1：第一轮自我 critic 8 条，改 §3.1、§4（加 A′）、§6。
