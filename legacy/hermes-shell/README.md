# hermes-shell —— 归档的对话式 agent 外壳（曾经的 Pipeline B）

> **冻结存档，不再联编运行**（同本目录旁的旧 Node 原型）。这里保存的是 `lecture-agent` 曾经的
> "对话式 Hermes 外壳"——一个建在确定性 workflow 之上的 ReAct agent。它已从 live 包整体移出。

## 1. 这是什么

`lecture-agent` 的核心是一条**确定性 workflow**（`lecture_agent/engine/pipeline.py::generate_lecture`：
plan → 逐块生成 → 组装 → 校验自修 → 备注 → 覆盖度）。

本外壳（Pipeline B）在其之上套了一个**有界 ReAct agent**：LLM 在循环里自主决定调哪个工具、迭代几轮。
工具集（`shell/tools/`）：
- `make_lecture` —— 把整条 workflow 当**一个工具**调（造一份 deck）
- `revise_block` / `revise_scene` —— 复用引擎级块/组件生成做定点重写
- `view_scene` / `view_block` / `skill_view` · `evaluate` / `render` · `remember` / `recall` ·
  `propose_skill` + 会话末 `review`（自演化）· `execute_code`（沙箱）· `delegate`（子 agent 并行）· `clarify`

即:**workflow 是引擎;本外壳是把引擎当工具的 agent**,外加改/验/记/演化一整套能力。

## 2. 为何归档（删繁就简）

一次产物审计显示,这层 agent **从没在测试之外真跑过**:
- `results/ledger.jsonl` 68 条记录全是 workflow（`generate`/`backfill`），**shell 0 条**；
- 无 `memory/` 目录（`remember`/`recall` 从没落盘）；
- 无 `results/proposals/`（`propose_skill` + 会话末自演化从没触发）；
- `run_shell` 仅被 `scripts/chat.py|cron.py` 引用,且未留下任何产物。

它却背着约 1200 行复杂度。Anthropic 的准则是"能用 workflow 就别上 agent"——做讲义是良定义任务,
workflow 已够。这层 agency 未被证明带来增益,故整体冻结存档,而非删除:保留考据与将来复活的可能。

## 3. 共享内核边界（复活时的 reach-back 清单）

本存档**只搬了 B 专属代码**;它当年从 `lecture_agent` 共享内核 import 的东西**仍留在 live 包**:
- `schema.*`、`utils.{env,logging,seed,concurrency}`、`app.build`（`build_llm`/`build_options`）
- `engine`（`generate_lecture`/`GeneratorOptions`）
- 共享 `domain`:`skills`、`tool_loop`、`generation`、`evaluation`、`telemetry`
- 共享 `ports`:`llm`、`tool`、`renderer`、`store`、`media`
- 共享 `adapters`:`render`（StructuralVerifier）、`store.filesystem`、`store.ledger`

本目录内自带的 B 专属层:`shell/`、`domain/{context,memory,cron}`、
`ports/{interaction,memory,proposals,sandbox}`、`adapters/{io,memory,sandbox,cron,store_proposals}`、
`app_chat.py`（原 `app/chat.py`）、`scripts/{chat,cron}`、`tests/`（9 个 B-only 测试）。

## 4. 复活配方

文件按**原包层级镜像**存放,便于对位。要让它重新联编:
1. 找回历史:`git log --follow -- lecture-agent/lecture_agent/shell/shell.py`（迁移前在 `lecture_agent/` 内）。
2. 决定落点:或作为 `lecture_agent` 的子包放回,或做成独立包依赖 `lecture-agent`。
3. **改 import**:本存档**未改** import——文件内的相对 import（`from ..domain.context`、`from ...engine` 等）
   以它们**当年在包内的位置**为准,现位置下不可解析。放回原位即恢复;若做独立包,把对共享内核的引用
   改成 `lecture_agent.*` 绝对 import（清单见 §3）。
4. 恢复接线:`app_chat.py` → `app/chat.py`;`.importlinter` 重新加 shell 层 + pipelines-independent 契约
   （见迁移那次提交的 diff）;`ports/__init__.py`、`adapters/store/__init__.py` 重新导出 B 专属符号。
5. 验证:`pytest`（把本目录 9 个测试放回 `tests/`）、`lint-imports`、`scripts/chat.py +request=... llm=replay +sandbox=fake`。
