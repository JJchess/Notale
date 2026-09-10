# 请求字段减法：候选清单，尚未 replay 验证

来源：首轮 `.review/fields.json` 的 `request` 表，以及完整 wire。
计数是包含该路径的请求数，不是出现值的总次数。请求层与 native rollout 分开保存。
本轮 38 个 Responses 请求包含如下字段；保留其实际拼写。

| 字段 | 观察数 | 当前处置 |
|---|---:|---|
| `model`, `reasoning.effort`, `reasoning.context` | 38 | 保留原始值；不假定第三方接口接受同值 |
| `input` | 38 | 保留有序 item；不能改为丢失工具结果的纯聊天文本 |
| `input[].type`, `input[].id` | 38 | 保留类型与关联身份 |
| `input[].call_id`, `input[].output` | 37 | 保留工具调用结果配对 |
| `input[].name`, `input[].input`, `input[].arguments` | 各 1 | outer custom/function tool call 的真实格式；不是只有一次执行 |
| `input[].tools` | 2 | Code mode 的 `additional_tools` 声明，包含原生生图工具；不能只看顶层 tools |
| `previous_response_id` | 36 | 保留增量上下文链，删除前必须重建完整上下文并验证 |
| `prompt_cache_key` | 38 | 原样保留测量；不声称它等同 Claude 的 cache_control |
| `include`, `store`, `stream`, `type` | 38 | 保留协议语义，不能凭字段名字删除 |
| `parallel_tool_calls`, `tool_choice`, `text.verbosity` | 38 | 保留执行与输出行为 |
| `input[].encrypted_content`, `input[].summary` | 各 1 | 保留原始记录；密文不能当可读思考或训练 rationale |
| `client_metadata.*` | 38 | CLI/UI/观测字段的删减候选；先在授权兼容接口做 ablation |
| `input[].internal_chat_message_metadata_passthrough` | 38 | 原始档案保留；运行上下文删减候选，尚未证明可删 |

“38 次输入累计 331 万 token”不是 38 次完整上下文上传的证明：36 个请求带
`previous_response_id`，用量来自服务端的各 `response_id` usage。
`input[].name` 只在请求表中出现一次，也不能推导模型只用了一次工具。

当前不把 ChatGPT/Codex 私有请求结构直接包装为一个通用 API 客户端。
这份清单只记录可实验的减法，未证明可删除的字段不会从采集档案中移除。
