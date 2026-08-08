# Spike: openharness-ai 0.1.9 作为 Notale agent 运行时底座

日期：2026-08-08
状态：一次性验证脚本已在底座选型完成后移除；本文件保留当时的运行证据与架构决策。
包：`openharness-ai 0.1.9`（MIT），源码在 `notale/.venv/lib/python3.12/site-packages/openharness/`

## 结论：GO（有保留）

四项验证全部 PASS。QueryEngine 是干净的程序化入口，权限可全自动不阻塞，OpenAI 兼容端点（SiliconFlow）真实连通，自定义工具/skill 接缝清晰，离线 fake client 零网络跑通完整 agent 回合。主要保留项：硬依赖里拖了一堆 channel/TUI 重包（见"坑"一节），且 skill 不自动进 system prompt，需要走 SkillTool 或手工拼接。

最近一次运行结果（7 项子检查）：

```
[PASS] 1a headless round (FULL_AUTO, permission_prompt=None)
[PASS] 1b FULL_AUTO auto-approves mutating tool
[PASS] 1c DEFAULT mode + prompt=None denies without blocking
[PASS] 2 SiliconFlow round-trip: reply='pong' usage(in/out)=96/25
[PASS] 3a custom tool end-to-end: schema='calc' tool_out='5.0' api_calls=2
[PASS] 3b SKILL.md load + content into context: loader_ok=True
[PASS] 4 offline fake client full round: api_calls=2 history_len=4 final='42'
```

以下行号均相对 `notale/.venv/lib/python3.12/site-packages/openharness/`。

## 1. 无头嵌入 — PASS

- 入口：`engine/query_engine.py:22-39`（QueryEngine 构造参数全为程序化对象），`submit_message()` 在 `engine/query_engine.py:147`，async iterator 产 StreamEvent。整个 spike 未触 TUI。
- 自动批准：`permissions/checker.py:129-130` — `PermissionSettings(mode=PermissionMode.FULL_AUTO)` 直接 `allowed=True`。实测 mutating 工具（calc、bash 判定）无 prompt 直接放行。
- `permission_prompt=None` 时的行为：`engine/query.py:928` — 只有 `requires_confirmation and permission_prompt is not None` 才会调用交互回调；否则走 `engine/query.py:948-954`，把拒绝原因作为 error ToolResultBlock 返回给模型，**循环继续，不阻塞**。实测 DEFAULT 模式 + None prompt 下 calc 被拒且引擎正常结束。
- 注意：无头场景必须显式用 FULL_AUTO（或 `allowed_tools` 白名单），否则 mutating 工具会被静默拒绝、模型只能拿到错误结果。

## 2. SiliconFlow 端点 — PASS

- client：`api/openai_client.py:235-245`（`OpenAICompatibleClient(api_key, base_url=..., timeout=...)`），与 Anthropic client 同实现 `stream_message`（`api/openai_client.py:247`），可直接喂给 QueryEngine。
- registry 里已有现成的 siliconflow spec：`api/registry.py:99-112`（`default_base_url="https://api.siliconflow.cn/v1"`）。注意其 `env_key` 写的是 `OPENAI_API_KEY`，与我们的 `SILICONFLOW_API_KEY` 约定不同——spike 里是显式传 key，不依赖 registry 检测。
- 实测：`POST https://api.siliconflow.cn/v1/chat/completions`，模型 `deepseek-ai/DeepSeek-V4-Flash`，回复 `pong`，usage 96 in / 25 out。key 仅从环境变量读取，未打印。
- 细节：模型名带 `/` 时 token 上限参数按后缀判定（`api/openai_client.py:45-56`），`DeepSeek-V4-Flash` 走 `max_tokens`，正常。

## 3. 自定义工具 + skill — PASS

- 工具：`tools/base.py:66-68`（`ToolRegistry.register`）+ 继承 `BaseTool`（pydantic `input_model` + async `execute`）。schema 由 `tools/base.py:51-57` 自动生成。实测 fake 模型调 `calc(2,3)` → 工具返回 `5.0` → 结果回喂模型 → 第二轮产出最终文本，api_calls=2。
- skill 加载：`skills/loader.py:63-112`，布局为 `<root>/<skill-dir>/SKILL.md`，YAML frontmatter 解析 name/description。实测从指定目录加载成功。
- **skill 如何进上下文**：不会自动进 system prompt——`prompts/system_prompt.py` 全文无任何 skill 引用。官方路径是 `tools/skill_tool.py:29-43`：模型调用只读 `skill` 工具，SKILL.md 全文作为 tool result 进入消息流。要把自定义目录接进去，需注册 `SkillTool` 并经 `QueryEngine(tool_metadata={"extra_skill_dirs": [...]})` 传入——引擎把 `tool_metadata` 合并进 `ToolExecutionContext.metadata`（`engine/query.py:960-966`），SkillTool 在 `tools/skill_tool.py:31` 读取。实测此链路 PASS。另一个可行做法是自己把 skill 文本拼进 `system_prompt`（QueryEngine 有 `set_system_prompt`，`engine/query_engine.py:97`），完全绕开 SkillTool。

## 4. 离线接缝 — PASS

- 协议：`api/client.py:79-83`，`SupportsStreamingMessages` 只有一个方法 `stream_message(request) -> AsyncIterator[ApiStreamEvent]`，事件类型就三种（`ApiTextDeltaEvent` / `ApiMessageCompleteEvent` / `ApiRetryEvent`）。自写 fake 只需按脚本产事件。
- 实测：fake client + QueryEngine 跑完"用户提问 → 工具调用 → 工具结果回喂 → 最终回答"完整回合，history 4 条消息，全程在 socket guard（patch `connect`/`create_connection`/`getaddrinfo`）下无网络。测试纪律的零网络路径成立。
- 注意：该 Protocol 未加 `@runtime_checkable`，`isinstance` 检查不可用，只能靠鸭子类型（spike 里检查 `stream_message` 方法面）。

## 坑清单

1. **双 HTTP 栈**：`httpx2 2.9.1` / `httpcore2 2.9.1` 是 `mcp 2.0.0` 的依赖（`pip show httpx2` → Required-by: mcp；httpcore2 → Required-by: httpx2）。同时 anthropic/openai SDK 用 `httpx 0.28.1` + `httpcore 1.0.9`。两代 HTTP 栈并存，且 import QueryEngine 就会连带加载 `mcp` + `httpx2`（实测 sys.modules）。不是错误，但体积和心智负担都 +1。
2. **channel/TUI 重依赖是硬依赖**：`discord-py`、`slack-sdk`、`lark-oapi`、`python-telegram-bot`、`textual`、`questionary`、`prompt-toolkit`、`pyperclip` 全部在 openharness-ai 的 install_requires 里，无 extras 划分，pip 层面裁不掉。好消息：实测 `from openharness.engine.query_engine import QueryEngine` 不会 import discord/slack/lark/telegram（只连带 mcp+httpx2），纯磁盘死重。真要裁只能 fork/本地打包，或在测试里加 meta_path import 拦截器防误引。
3. **skill 不进 system prompt**（见第 3 项）：要么走 SkillTool（每次调用都重新扫描 bundled + `~/.openharness/skills` + plugins，有建 `~/.openharness` 目录的副作用和重复 IO），要么自己拼接 system prompt。Notale 的做法建议后者，可控且零宿主状态。
4. **`permission_prompt=None` + DEFAULT 模式 = 静默拒绝**：mutating 工具调用会以错误结果返回给模型而不是阻塞。无头场景必须显式 FULL_AUTO 或白名单，否则 agent 行为会很迷惑（模型看到"被拒绝"但没人拒绝过）。
5. **工具在场时 usage 可能缺失**：`api/openai_client.py:291-297` 为规避 Kimi 的 reasoning_content 问题，带 tools 时会 pop 掉 `stream_options`，依赖该字段回传 usage 的 provider 会拿不到 token 统计。做成本核算时要注意。
6. **敏感路径硬编码拒绝**：`permissions/checker.py:18-37` 内置 `.ssh`/`.aws`/`.openharness/credentials.json` 等 fnmatch 黑名单，FULL_AUTO 也拦不住。这是好事，但意味着 Notale 若有读写 `~/.config` 的合法需求需绕开。

## 落地建议

- 走 `agents/runtime.py` 薄封装：QueryEngine + FULL_AUTO PermissionChecker + 自家 ToolRegistry（只注册 Notale 需要的工具）+ ScriptedClient 风格的 fake 进测试。
- LLM 端用 `OpenAICompatibleClient` 直连（SiliconFlow 已验证），不必接 registry/profile 那套检测逻辑。
- skill/knowledge 文本由 Notale 自己拼 system prompt，不用 SkillTool。
