# ws2 — LectureDoc 自演化讲义系统（monorepo）

把一个课题变成一份可交互的讲义（reveal.js deck：公式、浏览器内仿真、可编辑代码、测验、AI 助教）。
产品分两半:**生成器**产出 LectureDoc JSON，**查看器**渲染它。

## 子项目地图

| 顶层 | 是什么 |
|---|---|
| **`lecture-agent/`** | **生成器 / 核心交付**：把课题生成 LectureDoc 的 agent（Python，六边形分层，可复现）。发行名 `lecture-agent`、import 包 `lecture_agent`。 |
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
