# lecture-agent（Python）

把一个课题生成一份 **LectureDoc**（可交互讲义的结构化 JSON），由 `../viewer/` 的 reveal.js 运行时渲染。

六边形分层、配置驱动、确定性可复现。架构规范见 [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md)。

## 安装

```bash
uv sync --all-extras
```

## 生成一份讲义

需要一个 OpenAI 兼容端点的 key（默认硅基流动）。设环境变量后：

```bash
export SILICONFLOW_API_KEY=sk-...          # 或 OPENAI_API_KEY
uv run python scripts/generate.py topic=梯度下降 llm=deepseek_v3
# 产物写入 data/corpus/<id>.lecture.json；LLM 响应录进 fixtures/（供离线复现）
```

CLI 亦可：`uv run lecture-agent generate --topic "二分查找" --llm deepseek_v3`

## 复现（零 API）

录制过 fixtures 后，用 `replay` 完全离线、确定性重放：

```bash
uv run python scripts/generate.py topic=梯度下降 llm=replay
uv run python scripts/run_experiment.py +experiment=main_result   # 固定题集×seed，出 metrics
```

## 门禁

```bash
make all     # ruff + mypy + import-linter(解耦契约) + pytest
```

## 目录

- `lecture_agent/` — 库代码（`schema` `ports` `domain` `adapters` `agent` `app`，见 PROJECT_STRUCTURE §1 五层）
- `configs/` — Hydra 旋钮（`llm/` `generator/` `experiment/`）
- `skills/` — block 家族契约（`contracts.json`，运行时读取）
- `scripts/` — 薄入口；`tests/` — 传 fake，不碰真 LLM/浏览器
- `legacy/` — 旧 Node 原型（冻结快照，仅供对照，不再运行）
