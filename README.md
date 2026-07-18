# ws2 — LectureDoc 自演化讲义系统（monorepo）

把一个课题变成一份可交互的讲义（reveal.js deck：公式、浏览器内仿真、可编辑代码、测验、AI 助教）。
产品分两半:**生成器**产出 LectureDoc JSON，**查看器**渲染它。

## 子项目地图

| 顶层 | 是什么 |
|---|---|
| **`lecture-agent/`** | **生成器 / 核心交付**：把课题生成 LectureDoc 的 agent（Python，六边形分层，可复现）。发行名 `lecture-agent`、import 包 `lecture_agent`。 |
| **`viewer/`** | **查看器**：reveal.js 运行时，消费 LectureDoc JSON 在浏览器渲染（`index.html`、`doc-to-deck.js`、`serve.py`）。自带默认 demo deck。 |
| **`samples/`** | 示例讲义一处收拢：`decks/`（curated 单文件 deck）+ `cases/`（富端到端案例包：course + materials + 报告）。 |
| **`docs/`** | 人读文档：项目计划、深度调研报告、schema 架构、前端渲染知识库。 |
| **`legacy/`** | 旧 Node 原型（已被 Python 重写取代，冻结存档、不再运行）。 |
| **`refs/`** | 外部参考克隆（hermes / quarto 等），各自带 `.git`，是调研输入而非本项目代码（gitignore，不入库）。 |

## 快速上手

```bash
# 生成（详见 lecture-agent/README.md）
cd lecture-agent && uv sync && uv run python scripts/generate.py topic=梯度下降 llm=deepseek_v3

# 渲染产物
python viewer/serve.py          # 起本地服务，浏览器打开渲染 deck
```
