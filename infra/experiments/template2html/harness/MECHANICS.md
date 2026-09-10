# 扩展 harness 的历史机制与来源

> 2026-09-10：本文保留旧扩展方案的机制与证据，不再描述默认 v1。
> 当前采用 [README.md](README.md) 的最小方案：单模型、直接工具循环、一个 HTML 存在性 gate。
> 原来的控制器存档为 `legacy_run.py`；以下历史“已实现”不表示这些机制仍在默认链路中。

本版把首轮轨迹提炼到模型请求、上下文、工具执行、文件、检查反馈和恢复的粒度，
并提供独立运行时。它是**有完整执行路径的候选实现**，尚未证明较弱模型达到教师质量。
旧 v0 只做报告/审阅的范围已扩展；原始任务书保持不变。

后续执行模型指定为 `gemini3.8flash`；GPT6 Astra / Codex 负责提供教师轨迹。
CLI 已采用该执行模型默认值，但下面的 Responses 请求格式描述的是当前适配器，
不是 Gemini 已验证的原生协议。供应商接入与真实执行仍待验证；图片工具后端独立配置。

## 角色分工与调用边界

目标是 `.pptx → HTML`；运行全程唯一模型为 `gemini3.8flash`，Astra 仅为离线教师轨迹来源。
旧实现保留的其他模型选择与独立图片模型入口不符合这一目标，必须在实际执行前收紧；
不能因为图片能力被包装为 tool 就例外调用其他模型。Gemini 图片生成能力未验证时使用原素材或代码绘制。

| 类别 | 谁决定下一步 | 职责 | 当前源码 |
|---|---|---|---|
| **唯一 code agent** | Gemini 3.8 Flash，根据观察自主决定 | 理解 PPTX、追踪继承、选择素材表示、编写 HTML/CSS/JS、查看截图、定位问题与修正 | `model.py` 的模型调用 + `loop.py` 的持续循环；领域规则在 `policy.md` |
| **外部固定 workflow** | 宿主预先编写的触发条件 | 开始前准备输入与参照、装配任务规则；agent 声称完成后独立验收；失败反馈给同一 agent，通过后记录待审阅交付 | `environment.py`、`audit.py`、`run.py` 与 `loop.py` 中的验收分支 |
| **通用运行时与工具** | 宿主按协议运行；具体工具调用由 agent 选择 | 历史与调用配对、JS/RPC、shell 续接、图像回传、文件快照、预算、checkpoint 与恢复 | `protocol.py`、`tools.py`、`code_worker.mjs`、`artifacts.py` 与 `loop.py` |
| **人工审阅** | 人 | 自动检查尚不能裁决的视觉保真与已披露限制 | `delivered_needs_manual_review` 是边界状态；当前没有自动人工审批流程 |

分析、实现和视觉自检是同一 agent 的工作内容，不是三个角色，也没有单独的 planner、renderer 或 reviewer agent。
Chromium 渲染、读图工具本身不调用模型；截图的语义判断由同一个 Gemini agent 完成。
独立验收只运行宿主预先编写的规则，不替 agent 判断应该怎样改代码。
agent 临时编写的 Python/JS 即使执行是确定性的，也仍属于 agent 的动作，不能因此列为固定领域 workflow。

上述是明确的职责边界，**尚非已经完成的模块拆分**：`loop.py` 当前仍混合通用 agent 循环与领域验收反馈，
`tools.py` 仍包含旧的图片供应商桥。不能把通用调度、领域 workflow 和智能角色混为一类。

## 1. 教师真正收到什么

原始首请求是 7 个 items：`additional_tools` 一项；4 条 developer 消息；
环境上下文与任务书各一条 user 消息。不是一个简短的“转换 PPT”prompt。

| 原始组成 | 精确存放处（相对 `.review/mechanics/`） | v1 处置 |
|---|---|---|
| 命名空间、exec 描述及嵌套工具声明 | `initial-context/00-additional_tools.json` | 保留实际使用的 shell、进程续接、看图；条件暴露 imagegen；删除未用的协作、联网查询等接口 |
| Codex 基础行为，21,261 字符 | `initial-context/01-developer.md` | 原文归档；执行版本使用持久实施、工具与反馈规则，未复制 UI、PR、插件管理等无关内容 |
| 技能/权限/模式说明，7,915 字符 | `initial-context/02-developer.md` | 真实能力由运行配置决定；不注入不存在的技能路径或审批流程 |
| 协作说明与禁用主动委派，2,429 + 271 字符 | `initial-context/03-developer.md`、`04-developer.md` | 教师无子任务，因此只保留单模型运行时 |
| 环境，1,131 字符 | `initial-context/05-user.md` | 替换为本轮隔离工作区、环境清单和只读输入 |
| 任务，627 字符 | `initial-context/06-user.md` | 原 `task.md` 原样作为 user 任务；领域经验单独放 developer policy |

字符数不是 token 数。完整行为原文仍在档案，删减对质量的影响需要干预实验验证。
[policy.md](policy.md) 是从教师动作/纠错提炼的可执行工作规则，不是原始系统 prompt 的逐字副本。
新增固定契约/准备/宿主闸都是明确的干预，不能称为原生 Codex 本来就有的实现。

## 2. 每个模型边界

[38 个边界表](../distillation/astra-xiuzhong-01-boundaries.md)逐次列出上下文、输出类型、原生调用行和嵌套动作。
`extract.py` 将每次原始请求与响应落盘，并从 `response.output_item.done` 重建完整 output。
本轮 lite 流的 `response.completed.output` 为空，单读 completed 会漏掉 33 段 exec、4 次 wait、7 条消息和 26 个 reasoning items。

```bash
python3 extract.py extract ../../../codex-harness-kit/runs/astra-xiuzhong-01.review /tmp/teacher-mechanics
python3 extract.py context /tmp/teacher-mechanics 18 /tmp/teacher-context-18.json
python3 probe_trace.py /tmp/teacher-mechanics /tmp/teacher-probe.json
```

上下文通过 `previous_response_id` 关联上一步的 input + output；连接重建后无 prev 的请求按其完整 input 重新起链。
本轮 38 个边界均能配对，末次可见上下文有 117 个 items、13 个工具图像块。
源文件、源行与 SHA256 保留；不声称重建未知服务端状态。

v1 公共接口使用 `store=false`、完整有序 `input` 和 `reasoning.encrypted_content`。
工具调用、结果、reasoning 和消息均保留原类型与顺序，未把整段历史压成纯文本。
缓存 key 在 run 内稳定；未使用私有 `additional_tools`、`client_metadata`、`reasoning.context` 或 WS 增量接口。
原始字段与公共接口映射分开保存，不直接重放 ChatGPT 私有请求到其他服务。

## 3. Code mode 并非一个 shell 别名

实际嵌套动作是 **51 个 exec_command、9 个 write_stdin、13 个 view_image**。
由原始 JavaScript 在无副作用工具上执行得到，不是正则猜测。
50 个 CommandExecution completed 不等于 50 次命令启动：预览服务器有启动但没有在快照中完成。

`code_worker.mjs` 为每个 exec 创建一个 JavaScript compartment。宿主经 JSONL RPC 处理 `tools.*`。
它支持 `text/image/generatedImage`，以及跨 cell 的 JSON `store/load`；普通 JS 局部变量不会延续。
独立工具可 `Promise.allSettled`，同一段 JS 里的依赖由 `await` 保证。
实际33段教师 exec 全部通过语法/调度探针；占位结果不证明执行输出或视觉一致。

| 状态 | 所有者 | 创建/使用 | 结束 |
|---|---|---|---|
| JavaScript cell | `Host.cells[cell_id]` | outer exec / outer wait | JS 完成、终止或 cell 超时 |
| shell 进程 | `Host.sessions[session_id]` | exec_command / write_stdin | 子进程退出；宿主结束时清理仍运行的进程组 |
| JSON memory | `Host.memory` + checkpoint | store / load | 当前 run；可随 checkpoint 恢复 |
| 文件 | 隔离工作区 | shell 读写 | 持续存在；input 与宿主 context 只读 |

cell yield 返回 cell_id；shell yield 返回 session_id，两者不能混用。
等待只返回尚未消费的新输出。长命令结束后 reader 排空再返回 exit_code。
大图帧必须在 worker 退出前写完；完整链路测试发现并修复了直接 `process.exit` 截断图像的问题。

差异如实暴露：v1 支持 pipes，不支持 PTY；默认非 login shell；临时文件用工作区 TMPDIR；
不模拟 TUI 审批，不声称 Node vm 自身是安全沙箱，CLI 使用采集 kit 的 bwrap 隔离整个工具子进程。
工具文本截断采用字符近似预算，完整结果保存在日志；这不是 Codex 的精确 tokenizer。

## 4. 工具结果如何回到模型

```text
model output: {type: custom_tool_call, name: exec, call_id: c, input: JavaScript}
host dispatch: tool.started {id, parent_call_id: c, name, arguments}
host outcome:  tool.completed {id, result} 或 tool.failed {id, error}
next input:   {type: custom_tool_call_output, call_id: c,
               output: [{type: input_text, text: ...},
                        {type: input_image, image_url: data:..., detail: original}]}
```

图片不是描述字符串或仅有路径。看图后获得的像素进入后续模型请求，支持“参照→实现→截图→修正”。
JSONL 事件保留嵌套调用与父调用关系；工具异常作为对应结果回给模型，允许模型检查和修复。
API/协议异常则 checkpoint 为 error/incomplete，不偷偷换模型或伪造成功；可检查后 resume。

## 5. 环境与文件产物

`prepare` 复制显式输入，计算真实展示顺序/关系/特性/哈希，生成环境信息，
可在独立 LibreOffice profile 中渲染 PDF/PNG/contact sheet。
模型可以读这些本轮事实，没有教师最终 HTML 注入。对应教师 L13–94 的环境/参照工作。
这些是候选提前封装点，不是已证明两轮稳定的阶段。

工具运行沿用并行采集 kit 的新根目录、私有 home、运行时只读白名单和独立 PID 视图。
工作区可写，input 与 `_harness` 只读；嵌套工具不继承 API 密钥。
失败时不静默退回无隔离模式；共享网络这一点与原采集 kit 一致。

每个 outer 工具返回后，将 input/output 文件内容按 SHA256 存入宿主 `state/artifacts/blobs`，
快照清单记录文件版本与删除。不同快照共享相同 blob。
这是后续对齐“哪次调用修改了哪个文件”的基础，不只剩最终成品。
有运行中进程时快照可能跨写入，标记 `observed-nonatomic`，不能当完整可恢复 VM。
旧教师记录没有这些中间文件版本，不能用最终 HTML 冒充早期上下文或宣称可从任意旧步分叉。

## 6. 检查、反馈与结束

模型可以自主写检查程序/启动浏览器/查看图片；调用顺序和修正次数由模型选择。
其非 commentary 最终消息触发宿主独立检查，尚有 live cell 时要求先处理。
闸检查实际输入哈希、资源链接、页/布局/源 ID/画布比例，以及原生替换和 DOM 交互。

失败时写只读 `_harness/checks/<attempt>/audit.json` 与截图，返回**失败项**而非重发完整 input inventory；
有失败页截图时直接附为 `input_image`。原会话继续，最终再次触发闸。
只有自动检查无失败才写 `final.md`，状态仍为 `delivered_needs_manual_review`。
人工视觉保真、未支持 OOXML、任意长文本、全页栅格替代与素材采用关系未被这些闸完全覆盖。

操作预算由调用者提供 `max-turns/max-context-bytes`，到达时状态是 budget_exhausted/context_limit，
不是完成。没有凭一轮轨迹固定“最多修正三次”。不自动压缩上下文；本轮没有可观察的压缩轨迹，
因此不发明有损摘要策略。以上宿主闸是干预，而非教师原有的外部验收。

## 7. 生图接线与证据边界

保留教师声明的 `image_gen__imagegen(prompt, referenced_image_paths?, num_last_images_to_include?)` 机制：
互斥参考方式、最近看图/生成图历史、生成与编辑、图片回传和本地资产路径。
`ImagesProvider` 在模型实际调用时才请求配置的公共 Images API；没有配置时工具不声明，状态记录 unavailable。
请求前保存 prompt/参考副本与 hash；结果保存真实图片、provider usage、generation_id。
generation_id 经 nested result 可追到 parent_call_id；`used_by` 不能靠生成成功自动推断，由产物来源清单/审阅补充。

这一后端**不是** Codex 原生私有生图服务。此轮教师没有调用图片生成，
因此实现可测试生成/编辑的接口接线，却不能声称已蒸馏真实生成决策或质量。
官方接口依据：[Function calling](https://developers.openai.com/api/docs/guides/function-calling)、
[Image generation](https://developers.openai.com/api/docs/guides/image-generation)。实际供应商兼容性需用相应账号验证。

## 8. 恢复和测量

checkpoint 包含有序 history、pending、已执行 call_id/签名/输出、memory、图像历史、模型配置和每 response 的 usage。
工具执行前记录 pending，得到结果后原子更新 checkpoint。
中断时未落盘的调用标记“效果未知”，不重执行；重复 call_id 返回已记录结果，签名冲突报错。
恢复不重建进程内存/PTY/JS cell，明确告诉模型旧 session 已失效，让模型检查已有文件再决定后续动作。
CLI 文件锁阻止两个 controller 同时推进一个 run。模型、effort、工具和 transport 配置在 resume 时必须一致。

每次实际请求/响应单独存盘；`measure_run.py` 按 response_id 计量文本 token，cache/reasoning 保持子集关系。
图片用量单列在生成记录，费用未知保持 null。无副作用探针、fixture smoke、真实模型 run 在 manifest 中区分。
当前尚未进行真实模型的 end-to-end 转换，也没有成本或质量优于原始教师的结论。
