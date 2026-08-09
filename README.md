# ws2 — LectureDoc 自演化讲义系统（monorepo）

把一个课题变成一份可交互的讲义（reveal.js deck：公式、浏览器内仿真、可编辑代码、测验、AI 助教）。
产品分两半:**生成器**产出 LectureDoc JSON，**查看器**渲染它。

## 子项目地图

| 顶层 | 是什么 |
|---|---|
| **`methodology/`** | **迭代宪章 v3（先读这里）**：北极星、备课资料（正确性中枢，`PREP.md`）、评测体系、四大问题路线图、**终局架构图景（HARNESS.md，含三份前沿调研）**、方法论族谱。 |
| **`eval/`** | 评测资产：B-CORE 冻结基准题集、GOLD 金样本、SABOTAGE 掺沙样本（抽查判官用）、BASELINE 指针、轮次 LEDGER。 |
| **`lecture-agent/`** | **生成器 / 核心交付**：把课题生成 LectureDoc 的 agent（Python，六边形分层，可复现）。发行名 `lecture-agent`、import 包 `lecture_agent`。规则法院在 `docs/harness/`。 |
| **`v2/`** | 并行重写线（Node，图像先行→原生 HTML，长文档规划）：主干归属待决，见 `methodology/ROADMAP.md` §5。 |
| **`viewer/`** | **查看器**：reveal.js 运行时，消费 LectureDoc JSON 在浏览器渲染（`app.html`、`doc-to-deck.js`）。 |
| **`samples/`** | 示例讲义一处收拢：`decks/`（curated 单文件 deck）+ `cases/`（富端到端案例包：course + materials + 报告）。 |
| **`docs/`** | 人读文档：内容分类法、workflow 架构图、前端渲染知识库。 |
| **`legacy/`** | 冻结存档：旧 Node 原型、归档的 viewer 纯查看器分支/旧进度原型、早期规划与调研快照（均不再运行/引用，仅供考据）。 |
| **`refs/`** | 外部参考克隆（hermes / quarto 等），各自带 `.git`，是调研输入而非本项目代码（gitignore，不入库）。 |

## 快速上手

```bash
# 生成 + 查看（端到端 App：query 输入 → 实时进度 → 成片预览）
cd lecture-agent && uv sync --extra app
uv run python scripts/serve_app.py       # 浏览器打开 http://127.0.0.1:8778/app.html
```
