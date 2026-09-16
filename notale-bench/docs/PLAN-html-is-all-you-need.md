# 《HTML is all you need》升级方案

活文档。dev 收敛完即按此开分支动手。

## 1. 主张

给任意 query，同一个锁定模型（gemini-3.8-flash / low）套上这套 harness，产出的 HTML 在单页与多页两类场景上都优于裸模型；每个组件的贡献可消融分离。

## 2. 场景与榜

| 形态 | 榜 | 备注 |
|---|---|---|
| 单页 | ArtifactsBench，1,825 题九类（含 Education/Learning 166 题） | checklist × 三张渐进截图，Gemini-2.5-Pro 判 |
| 多页 | PresentBench education 子集；SlidesGen course_preparation | 已接线，跑过一题 67.1 |

两个榜都不限算力（ArtifactsBench 题目字段只有 index/question/checklist/class/difficulty；PresentBench 只收 slides.pdf）。token 只作为主表的一列成本，不设对照臂。

## 3. 架构：一处改动

**Builder 底盘 profile 化。**

- `deck` profile = 现有 chassis：1600×900、base.css/base.js、lib 目录、分步、讲稿区。
- `single` profile = 单文件自包含 HTML：样式与脚本内联，库走 CDN；不带 chassis 资产。
- 两个 profile 共用同一套循环与工具（Read → Write → Check → Patch），只换首轮预读的契约文本与产物约束。
- mode 由 runner 显式指定（榜自己知道是单页还是多页）。意图路由是产品功能，不进这一版。
- Planner 只在 deck 模式跑。single 模式直接进 Builder，brief 里带 3–5 条可验证预期。

其余不动：Director、材料通道、三目标 judge、模型与 effort。

**一条原则**：Check 的断言只来自我们自己的 brief 预期，不引入榜的 checklist。

## 4. 消融

| 行 | 配置 |
|---|---|
| A | 裸模型一次生成（多页：给同一页表，每页一次调用、无 Check） |
| B | + Builder 循环 |
| C | B + Director |
| D | C + Check 预期断言与振荡终止 |
| E | D + Planner（仅多页） |
| F | E + 材料通道（仅多页有材料题） |

每行报：ArtifactsBench 分、PresentBench 分、token/页、调用数/页、失败页数。

消融在**分层抽样的 200 题子集**上跑（九类每类 ≥15，题号入库可复现）；最终配置再跑 ArtifactsBench 全量一次对榜。

## 5. 顺序

| 周 | 做 | 信号 |
|---|---|---|
| 1 | single profile；A、B 两行 | 单页上 harness 有没有差值 |
| 2 | Check 裁判化 + 开关化；C、D 行 | 消融能跑 |
| 3 | PresentBench education 全子集；E、F 行 | 多页的数 |
| 4 | 全量对榜，写表 | 论文主表 |

## 6. 待决

- [ ] single profile 不带 chassis（倾向：是。chassis 降级为 deck profile 的预置资产，两模式仍共用同一循环）

## 7. 变更

- 2026-09-16 v0：从会议结论整理。
- 2026-09-16 v0.1：自我 critic 8 条。
- 2026-09-16 v1：按用户"砍"的要求收敛——删等预算对照臂（两榜不限算力，降为成本列）、删意图路由、删 judge 偏置/人测/多页基线定义等论文脚注；架构收到"一处改动"。保留 Check 与榜 checklist 隔离、子集抽样两条，因为不留会返工。
