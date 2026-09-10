# 首轮 38 个模型边界

由 `.review/mechanics/index.json`、`probe.json` 和原生 call_id 关联生成。完整请求、模型输出、初始上下文分别在 mechanics 下的 requests、responses、initial-context。

表中“上下文”是可重建的客户端 item 数；“图片”是该上下文内工具结果的图像块数。不是 token 数，也不包含未知服务端隐藏状态。嵌套次数来自实际执行原始 JavaScript 的无副作用探针，工具全部替换为占位返回。

| 步 | 上下文 items / 图片 | 本次输出 | 原生调用行 | 嵌套调用 |
|---:|---:|---|---|---|
| 1 | 7 / 0 | message×1, custom_tool_call×1 | L13 | exec_command×2 |
| 2 | 10 / 0 | custom_tool_call×1 | L19 | exec_command×2 |
| 3 | 12 / 0 | custom_tool_call×1 | L25 | exec_command×2 |
| 4 | 14 / 0 | reasoning×1, custom_tool_call×1 | L33 | exec_command×3 |
| 5 | 17 / 0 | reasoning×1, custom_tool_call×1 | L42 | exec_command×2 |
| 6 | 21 / 0 | function_call×1 | L51 |  |
| 7 | 23 / 0 | reasoning×1, message×1, custom_tool_call×1 | L59 | write_stdin×1, exec_command×1 |
| 8 | 27 / 0 | custom_tool_call×1 | L64 | view_image×1, exec_command×1 |
| 9 | 29 / 1 | reasoning×1, custom_tool_call×1 | L72 | exec_command×2, write_stdin×1 |
| 10 | 32 / 1 | custom_tool_call×1 | L78 | exec_command×1, view_image×1 |
| 11 | 34 / 2 | reasoning×1, custom_tool_call×1 | L86 | exec_command×1 |
| 12 | 37 / 2 | reasoning×1, message×1, custom_tool_call×1 | L95 | exec_command×1 |
| 13 | 41 / 2 | reasoning×1, custom_tool_call×1 | L102 | exec_command×1 |
| 14 | 44 / 2 | reasoning×1, message×1, custom_tool_call×1 | L111 | exec_command×2 |
| 15 | 48 / 2 | custom_tool_call×1 | L117 | exec_command×2 |
| 16 | 51 / 2 | function_call×1 | L124 |  |
| 17 | 54 / 2 | function_call×1 | L130 |  |
| 18 | 56 / 2 | reasoning×1, custom_tool_call×1 | L136 | exec_command×2, write_stdin×1 |
| 19 | 59 / 2 | reasoning×1, custom_tool_call×1 | L144 | exec_command×1, write_stdin×1 |
| 20 | 62 / 2 | custom_tool_call×1 | L149 | view_image×3 |
| 21 | 64 / 5 | reasoning×1, custom_tool_call×1 | L158 | exec_command×1 |
| 22 | 67 / 5 | reasoning×1, custom_tool_call×1 | L165 | exec_command×3 |
| 23 | 70 / 5 | reasoning×1, message×1, custom_tool_call×1 | L176 | exec_command×1, write_stdin×1, view_image×1 |
| 24 | 74 / 6 | reasoning×1, custom_tool_call×1 | L184 | exec_command×3 |
| 25 | 78 / 6 | function_call×1 | L193 |  |
| 26 | 80 / 6 | reasoning×1, custom_tool_call×1 | L199 | exec_command×2, write_stdin×1 |
| 27 | 83 / 6 | reasoning×1, custom_tool_call×1 | L207 | exec_command×1, view_image×1 |
| 28 | 86 / 7 | reasoning×1, custom_tool_call×1 | L215 | exec_command×2, view_image×1 |
| 29 | 89 / 8 | reasoning×1, custom_tool_call×1 | L224 | exec_command×1 |
| 30 | 92 / 8 | reasoning×1, custom_tool_call×1 | L231 | exec_command×2 |
| 31 | 95 / 8 | reasoning×1, custom_tool_call×1 | L239 | write_stdin×1, view_image×3 |
| 32 | 98 / 11 | reasoning×1, message×1, custom_tool_call×1 | L250 | exec_command×3 |
| 33 | 102 / 11 | reasoning×1, custom_tool_call×1 | L259 | write_stdin×1, view_image×1, exec_command×1 |
| 34 | 105 / 12 | reasoning×2, custom_tool_call×1 | L269 | exec_command×2 |
| 35 | 109 / 12 | custom_tool_call×1 | L275 | view_image×1 |
| 36 | 111 / 13 | reasoning×1, custom_tool_call×1 | L282 | exec_command×2 |
| 37 | 114 / 13 | reasoning×1, custom_tool_call×1 | L290 | write_stdin×1, exec_command×1 |
| 38 | 117 / 13 | message×1 |  |  |

第 1 个请求含 7 个初始 items；第 38 个请求重建出 117 个上下文 items，其中有 13 个工具图像块。38 个边界均无无法配对的 tool output。

嵌套累计：exec_command 51、write_stdin 9、view_image 13。原生只有 50 条 CommandExecution completed；多出的命令是持续运行的 `python3 -m http.server 8765 --bind 127.0.0.1 --directory output`，不能把 completed 事件计数当启动总数。

原始 return 值未在探针中模拟为真实执行结果，因此此表只证明调度/语法覆盖，不证明重放渲染一致。
