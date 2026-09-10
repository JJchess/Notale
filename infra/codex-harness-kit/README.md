# Codex 轨迹采集 kit

与 `../harness-kit/`（Claude Code）并列，领域无关。方法沿用
[`../harness-kit/METHOD.md`](../harness-kit/METHOD.md)：**先量轨迹，再从观测里搭 harness**。
这套 kit 负责采集、归档和测量，不预先给 Astra 安排规划器、worker 或收敛流程。

默认被试 **`gpt-6-astra` / high**，保留内置 `openai` provider；默认完整 TUI，
将任务书作为第一条消息传入。`--exec` 是显式的无人值守 JSONL 模式，记录在 manifest 中。

## 开始采集

```bash
cd ~/ws2/Notale/infra/codex-harness-kit
./setup.sh                       # 首次安装本目录依赖；已安装可跳过
./go.sh astra-template-01 --pptx /absolute/template.pptx --dry-run
./go.sh astra-template-01 --pptx /absolute/template.pptx
```

默认实验为 [PPTX template2html](../experiments/template2html/README.md)，需要显式传入 `--pptx`。每轮创建
`~/ws2/Notale/exp/codex-template2html/<label>/`，已有目录直接拒绝，**不会 reset 任何旧实验**。
在 Codex 中正常对话，完成后退出 TUI；随后自动关闭采集、归档、脱敏、测量。

```bash
./go.sh astra-template-02 --pptx /absolute/template.pptx # 同模板第二轮
./go.sh astra-custom-01 --pptx /absolute/template.pptx --task /absolute/task.md
./go.sh astra-batch-01 --exec --pptx /absolute/template.pptx
./go.sh astra-medium-01 --effort medium --pptx /absolute/template.pptx
python3 watch.py runs/astra-template-01           # 另一个终端，只读实时计数
```

`--dry-run` 不创建 run、不调用模型。支持 `--runs`、`--work-base`、`--preset`、
`--resource`（只读材料）、`--runtime`（额外运行时）。默认依赖 Linux 用户命名空间，
优先使用系统 bubblewrap，否则使用 npm Codex 自带版本。隔离失败就停止。
Python ≥ 3.11；依赖只装在 `.deps/`，也兼容本机迁移过路径、无法正常创建 venv 的 Conda。

旧 gallery-deck 可通过 `--exp gallery-deck` 选择；它不要求 PPTX。

## 两层原始证据

| 文件 | 内容与用途 |
|---|---|
| `manifest.json` | 请求的模型、effort、运行方式、版本、任务 hash、资源白名单、退出码、质量标记 |
| `inputs/template.pptx`、`input-pptx.json` | 原始模板副本、hash、页数/母版/布局计数；被试看只读 `input/template.pptx` |
| `capabilities.json` | 从请求实际工具声明审计能力，支持 Responses Lite 的 additional_tools；skill 文本不算可调用工具 |
| `generated-assets/`、`generated-assets.index.json` | 本轮 Codex home 的 generated_images 副本；不根据文件存在就推断已被采用 |
| `task.md`、`config.toml` | 本轮任务与干净配置；实际 CLI 覆盖项另存 `manifest.argv` |
| `wire/calls/<uuid>.json` | 每次 HTTP 尝试的完整解码请求、响应/SSE、状态、首字节与结束时间 |
| `wire/ws/<uuid>.jsonl` | WS 连接、双向 JSON 消息、关闭/异常；同一连接可有多次生成 |
| `wire/capture-status.json` | 写盘失败、队列溢出等采集错误；缺失表示未正常收尾 |
| `sessions/*.jsonl` | Codex 原生 rollout 的脱敏副本，包含主/子会话；字段名不改 |
| `sessions.index.json` | session ID、父会话、原路径、源/归档 SHA256、坏行、快照边界 |
| `events.jsonl`、`stderr.log` | `--exec` 的 CLI 事件与 stderr；TUI 以 rollout 为准 |
| `initial-files.json`、`final-files.json` | 工作目录开始/结束文件 hash；用于量净变化 |
| `deliverable/`、`deliverable-files.json` | 交付副本及其 hash；文本副本脱敏，链接不跟随 |
| `actions.jsonl` | 工具调用、call_id、结果、模型、turn 和原始文件行号 |
| `summary.json`、`trajectory.md` | 每个会话的动作序列、工具分布、用量、时间、完整性问题 |
| `fields.json` | **请求**与 **rollout** 两张字段表，供后续做 schema 减法 |
| `reasoning.md` | API/Codex 实际可见的推理摘要与明文内容；不是隐藏思考全文 |

`.private-home/` 是本轮 Codex 的运行状态，权限受 umask 077 约束，包含原始未脱敏记录，
不作为分享包。仅复制登录凭据和模型 catalog，退出时删除该轮 `auth.json` 副本，
不改用户的登录文件。`runs/` 整体 gitignore；归档副本另做结构化字段、已知凭据及模式脱敏。
这不是任意二进制/分片编码内容的公开发布认证。

## 为什么不直接复制 Claude 的 proxy

Codex 会用 Responses HTTP/SSE 或 WebSocket。采集器两种都转发，
不关闭 WebSocket、不修改请求的 model/input/tools、不自己重试，也不缓冲到生成结束再转发。
gzip/zstd 请求原字节转发，解码副本用于测量；WS 保留应用消息和 session affinity headers，
不是 TCP 帧级抓包。用 `openai_base_url` 将内置 provider 接到 loopback proxy，
ChatGPT 登录默认上游 `https://chatgpt.com/backend-api/codex`，API 登录默认 `/v1`。
特殊部署可显式传 `--upstream`，实际目标写入 manifest。

写盘在独立线程，排队失败会留下采集错误，模型流量继续走。HTTP 记录用 UUID，
开始先记 `in_progress`，正常结束才改为 `complete`；网络断流、缺终止事件、解码失败都单独记。
单次 HTTP 捕获上限 128 MiB，超过的响应仍转发、但标记截断；超大请求超过入口上限会失败，
不应将这类轮次作为无干扰基线。WS 二进制消息转发但不解析，会被标为证据缺口。
proxy 进程死亡时启动器停止本轮 Codex，防止留下长时间连接重试污染实验。

**rollout 不是请求的替代品。** 它有工具动作和会话时序，但不能凭它还原完整工具 schema、
实际每次 input、压缩/裁剪、缓存前缀。WS 的 `previous_response_id` 和增量 input 原样保留，
不伪造成完整上下文。服务器内部状态也不在可观测范围内。

`--native-only` 可关闭 proxy，用于排障或对照传输影响；这时能分析动作，
不能宣称已获得 API schema 的完整证据。manifest 中 `schema_evidence_ready` 必然为 false。

## 隔离与复现

每轮构建新的 bwrap 根目录、HOME、`/tmp`、PID namespace；只读挂载系统运行时、
显式材料，另挂载本轮可写工作目录。个人 `.codex`、`.agents`、`.claude`、
研究仓库与其他实验工作目录不在视图中；不移动、不修改它们。
系统 `/etc` 保留（包含机器管理策略），网络共享，和 Claude 实验一样不是网络封锁。

用户级 config、skills、plugins、rules、memory、历史会话不复制。模型/effort 用 CLI 钉死；
每个 turn 实际模型从 rollout 读取，发生切换就报告。Codex 自带能力以实际请求 tools 为准。
本轮使用 workspace-write 沙箱；TUI 保留 on-request 审批，exec 的审批行为由 CLI 决定。
它与 Claude 的 bypassPermissions 不相同，manifest 会标注，不能忽略这项差异直接比较质量。

实验在 `experiments/<name>.toml`，或 `--exp /absolute/experiment.toml`：

```toml
task = "/absolute/task.md"
preset = "/absolute/preset"       # 可省；显式实验预置件可含 AGENTS.md
work_base = "/absolute/work"
resources = ["/absolute/reference"]
```

`{infra}` 展开为 kit 父目录，`~`/环境变量可以展开。preset 中 `.claude` 不复制，
普通软链接在开始时实化为本轮副本；材料挂载只读。其他运行时用 `--runtime` 明确加入。
操作系统、运行时和材料版本变化仍会影响实验；文件清单为已复制的起点提供字节级证据。

## 回看与测量

```bash
python3 measure/trace.py runs/astra-template-01
python3 measure/trace.py runs/astra-template-01 --compare runs/astra-template-02
```

计数只采用原生 `response_item` 的 function/custom/local-shell call，
不把 UI 的 item_completed 再算一遍。通过 call_id 关联输出；嵌在 `functions.exec`
程序内的调用保留原文，不靠正则猜展开后的工具数。`item_timings` 留供针对实际类型继续分析。

新版 `token_usage_record` 按 response_id 去重；旧版 `token_count` 只取最后累计快照，
不能将每次累计相加，也不能把两个来源再相加。缓存输入属于 input，reasoning 属于 output。
未记录的值是 unknown；观测到的调用到结果间隔不是 API 推理时长，不据此捏造并行度。
fork 会带入旧轨迹，必须单独处理；正式基线每轮从新会话开始。

默认金额是 null。可用自行核实的带来源/日期的价格表估计 **API 等价模型成本**：

```bash
python3 measure/price.py runs/astra-template-01 --rates /absolute/rates.json --tier default
```

价格表格式：`{"source":"出处","as_of":"日期","models":{"模型ID":{"tier":
{"input_per_million":数值,"cached_input_per_million":数值,"output_per_million":数值,
"max_input_tokens":该档适用上限}}}}`。未知模型、未知档位、超上下文档位都不报成 0 美元；
这不是 ChatGPT 订阅账单，不包含没有记录在模型 usage 中的外部工具收费。

## 已有会话的追溯采集

```bash
python3 capture/collect.py --home ~/.codex --session-id <精确ID> --out /tmp/astra-import-01
python3 measure/trace.py /tmp/astra-import-01
```

从 metadata 递归选择子会话，不按 mtime 取最新文件、不复制无关会话。
运行期间导出只是快照，不代表会话完成。历史会话没有当时的网络抓包，只能得到 native 证据。
不支持将 paginated-only 存储伪装为 JSONL rollout；未找到日志会明确报错。

## 验证与下一步

```bash
PYTHONPATH=.deps CODEX_KIT_TEST_JAIL=1 python3 -m unittest discover -s tests -v
```

测试只连接本地模拟服务：原生会话图、重复 usage、旧累计快照、坏行、缺工具结果、脱敏、
价格子集、SSE 即时转发/断流、HTTP 429、不重试、gzip/zstd、WS 连续响应与 affinity、
并发文件唯一性、写盘失败、bwrap 隔离，以及真实 Codex CLI 的完整启动→采集→归档流程。
template2html 额外检查 PPTX 身份与输入保护、生成素材归档及生图工具声明证据。
2026-09-07 验证目标为本机 `codex-cli 0.153.4`；真实 ChatGPT 上游和交互 TUI 长任务
需在首轮采集后审计，离线 mock 通过不代表真实任务成功。

后续先同模板跑两轮，检查 manifest/summary 的完整性，再对比动作和字段：
重复的行为才考虑固化，不一致的段落保留模型决策；没有轨迹证据就不添加 harness 结构。

接口依据：[OpenAI Docs 非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)、
[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)，以及本机 CLI help、
实际 rollout 字段和本地模拟服务验证。rollout 是版本相关内部格式，遇到新字段保留原始记录。
