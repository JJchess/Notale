# v3 —— 独立新线

按 `methodology/` 的设计（HARNESS.md / PREP.md / VERIFY-EXEC.md）从零搭建的内循环。
与 `lecture-agent/` 无代码依赖——仅移植了它的 LLM 调用基础设施（`llm.py`），其余从零长出。

## 结构

- `llm.py` —— 自包含 LLM 模块：`HttpxClient`（OpenAI 兼容异步客户端，退避重试，temperature=0 + seed 确定性优先）+ `FakeClient`（测试替身）+ 工具调用类型。默认端点 SiliconFlow，默认模型 `deepseek-ai/DeepSeek-V4-Flash`（reasoning 模型，默认 timeout 600s）；换模型/端点/key 环境变量全部显式传参。
- `artifacts.py` —— 内循环全部 artifact 的 schema（`methodology/pipeline-schema.html` 逐字段落地）。
- `evidence.py` —— 出处确定性绑定：URL+抓取时间由工具调用自动落，引文做字面子串机器校验（伪造/张冠李戴整条作废）。
- `manifest.py` —— run manifest + 页状态机（pending→drafted→verified/returned-for-repair→degraded）+ 事件日志（append-only）+ 断点续跑。
- `duration.py` —— 时长→页数→密度模型 v0（手工先验，待金样本拟合）。
- `tools/retriever.py` —— FetchTool（真）+ FakeRetriever（测试替身）；当前 research 只抓取模型明确给出的 URL，不提供搜索 adapter。
- `agents/` —— agent 运行时薄封装（OpenHarness 底座，spike GO 见 `docs/openharness-spike.md`）：`base.py`（AgentProfile/AgentBase/AgentResult + skill 块渲染）、`fetch_web.py`（FetchWebTool，抓取即落 FetchRecord 到 `.records`）、`profiles.py`（RESEARCH / BUILDER 画像）。只用 spike 验证过的窄路径：QueryEngine + ToolRegistry + FULL_AUTO + OpenAICompatibleClient；测试注入 ScriptedClient 全离线。
- `skills/` —— agent 技能数据（SKILL.md + 正文直接引用的小文件）：web-access 等 10 个拷自 `~/.claude/skills/`，create-sim / create-code-runtime 拷自 `lecture-agent/skills/`。注入方式：清单+全文拼进 system prompt，不走 SkillTool。
- `stages/` —— 七阶段：`intake` → `research`（4 路 fan-out，每路一个 AgentBase(RESEARCH)，模型自调 fetch_web，harness 从工具 `.records` 绑定出处）→ `contract`（单线程锁定+人在环 hook）→ `build_page`（一页一 agent，最小上下文编译，prompt 追加 BUILDER skill 块）→ `verify`（L0 真实现；L1–L6 接口预留、如实标注未实现；反例台账；降级安全页）→ `assemble`（把每个 PageArtifact.html 隔离为 sandbox iframe，拼装成离线 Reveal.js deck）→ `reflect`（坑沉淀+质量报告）。
- `runtime/` —— v3 自己的 Reveal 薄外壳：页面生命周期/键盘桥接与克制的投影 chrome。Reveal vendor 从仓库 `viewer/vendor/reveal/` 复制，页面内容不转换成 LectureDoc schema。
- `orchestrator.py` —— 确定性主干：两处 fan-out、返工/降级回路、WIP 门禁、单写者、断点续跑。
- `cli.py` —— 生成入口（见下）。
- `docs/openharness-spike.md` —— OpenHarness 底座选型 spike（GO）与坑清单。
- `tests/` —— 全离线测试，零网络（socket guard）。

## 生成讲义

```bash
set -a; source .env.local; set +a
python cli.py generate --topic "60 分钟《数据结构》讲义，大二，要代码演示和课堂练习"
python cli.py generate --topic "..." --yes                    # 跳过契约人工确认
python cli.py generate --topic "..." --resume runs/<dir>      # 断点续跑
```

产物落在 `runs/<date>-<id>/`：各阶段 artifact JSON、`deck.html`、`slides/*.html`、
离线 `runtime/` 与 `quality-report.json`
（未实现的验证层与降级页都如实列出，不冒充已核实）。

`deck.html` 是 1280×720 的 Reveal.js HTML-native 讲义。每个页面保持 v3 的整页 HTML
产物，作为独立文件嵌入 sandbox iframe，页面之间的 CSS、脚本和 ID 不会互相污染。

## API key 注入

key 从环境变量读，永不入配置、永不入 git（`.env.local` 已 gitignore）：

```bash
cp .env.example .env.local   # 填入真实 key
set -a; source .env.local; set +a
```

支持的环境变量：`SILICONFLOW_API_KEY`（默认端点）或 `OPENAI_API_KEY`（兜底）。

## 跑测试

```bash
cd v3
python -m pytest tests/ -q   # 全绿，零网络
```
