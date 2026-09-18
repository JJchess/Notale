# AI 编辑（候选式）

编辑器自己接模型服务，产出的是**候选**：一批已经验证过、但尚未提交的命令。
作者在侧栏里看到它会改什么，点「应用」才写入文档。路由本身从不提交，head 不动。

## 路由

`GET /api/ai/status` → `{available, reason, model}`。没配密钥时 `available:false`，
`reason` 是给作者看的原因，前端据此禁用提交而不是静默失败。

`POST /api/documents/:id/ai-edits`，鉴权走既有的 `Integration.context/authorize`（action `edit`）。
响应体是**换行分隔的 JSON**（`content-type: application/x-ndjson`），不是一次性 JSON——鉴权和
请求体 schema 校验仍在第一行写出之前完成，失败照旧是普通 4xx；只有进了 `aiEdit()` 内部之后的
失败才会作为流的最后一行出现。

```
请求 { slideId, intent: 'insert-interactive' | 'edit-selection', instruction, targets?: string[], baseVersion?: number }

响应（每行一个 JSON 对象）：
{ type:'step', label, status:'active'|'done' }   — 真实发生的五个节点各一行，见下
{ type:'result', mutationId, baseVersion, commands, preview, model }   — 成功收尾
{ type:'error', error, message }                                       — 失败收尾
```

`step` 对应的是链路里真实存在的节点，不是编出来的进度条：读取页面对象 → 请求模型 →
解析与校验 → 服务端试跑；失败重试时会多出一行「请求模型（第 2 次尝试）」。

`preview` 是 `AuthorChangeSet`，由 `store.prepareSync` 试跑得到——和 `/prepare` 同一条路径。
前端拿它做**候选实时预览**：`projectPrepared(kernel.confirmed, preview, htmlBasesFor(...))`
（`notale-editor-frontend/src/author-projection.ts`）投影出一份不提交的 `Snapshot`，画到
`AuthorCanvasController.previewExternal()`（`notale-editor-frontend/src/canvas/author-controller.ts`）
——真实文档和撤销栈完全不碰，取消/重新生成/应用完成时调 `clearExternalPreview()` 复原。
**这个预览的对象 id 未必和候选 `commands` 里的一致**：`elements.transfer` 会在服务端重新分配
稳定 id（防止粘贴/搬运碰撞），`preview` 反映的是这次试跑分配到的 id；真正点「应用」时会用一个
新的 mutationId 重新走一遍，届时再分配一批 id——语义等价，只是底层 id 不同，纯 UI 不可见。

## 模型看到什么

只有目标页：`inspectSlide()` 的结果去掉 `html` 字段（每个对象剩 id/tag/parent/kind/text/style/attributes），
加上画布尺寸和主题变量。不给整份文档，不给其它页面，不给文件系统，没有 shell。

## 闸门（跑完模型、给作者之前）

1. `commitSchema.parse` —— zod 严格模式，≤500 条命令。
2. **命令白名单**，按意图区分：
   - `insert-interactive`：`element.insert`、`slide.insert`、`elements.transfer`、`slide.delete`、`component.set`
   - `edit-selection`：`element.patch`、`element.content`、`element.insert`、`element.delete`、`component.set`、`component.remove`
   `deck.update`、`layout.*`、`asset.*`、`codeLesson.*`、`svg.*` 一律不可达。
3. **页面闸门**：命令只能指向请求的那一页，或本批自己新建的临时页（插入事务需要）。
   `slide.delete` 只能删本批新建的页。
4. **作用域闸门**（`edit-selection`）：每条命令的 `target`、`element.insert` 的 `parent`、
   `component.set` 的 `root`，都必须落在「选中对象 + 其后代」集合内。
5. **试跑**：`store.prepareSync` 在服务端应用一遍，让 `EXECUTABLE_INSERT`（禁 `<script>`/`<base>`/`on*`）、
   `component-validation`、`COMPONENT_CONFLICT` 这些既有守卫先失败。

任何一步失败，失败原因会回喂给模型重试一次；仍失败就返回 `AI_REJECTED`，**坏候选不会出现在界面上**。

## 为什么没有沙箱

因为 AI 产不出要执行的代码。编辑器里的"互动"是声明式数据：一个子树 + 一条 `InteractiveComponent`
（状态、click/pointerenter/pointerleave 事件、`text`/`style`/`visible` 补丁）。插入脚本在命令层就被拒绝。
安全边界是上面这套 schema 和守卫，不是容器。

**结构性限制**：场景（scene）无法由 AI 创建——它是从页面内联 `<script>` 反推出来的
（`src/domain/source-scenes.ts`），而我们插不了脚本。需要任意程序逻辑的互动要等「导入代码」那条线，
那条线才需要隔离构建。

## 插入互动的三步事务

`element.insert` 不能携带组件定义，而且会重分配 id，所以插入走和「点击展开解释」预设同一条路
（`notale-editor-frontend/src/reveal-commands.ts`）：

1. `slide.insert` 一个临时页，html 里自带 `data-notale-id`，`slide.components` 给出组件定义；
2. `elements.transfer` 把根对象搬进目标页（服务端负责 id 与引用重映射）；
3. `slide.delete` 删掉临时页。

三条命令在同一个 `mutationId` 里，因此**一次应用 = 一次撤销**。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `EDITOR_AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | Chat Completions 兼容端点 |
| `EDITOR_AI_MODEL` | `gemini-3.8-flash` | 模型 id |
| `EDITOR_AI_API_KEY_ENV` | `GEMINI_API_KEY` | 从哪个环境变量读密钥 |
| `EDITOR_AI_TIMEOUT_MS` | `60000` | 单次请求超时 |
| `EDITOR_AI_STUB` | — | 固定回复，或 `{关键词: 回复}` 映射（按提示词匹配），用于确定性验收 |
| `EDITOR_AI_STUB_DELAY_MS` | `0` | stub 回复前的固定延迟；不设的话流式阶段会在一次事件循环里全部推完，看不出中间态，浏览器验收步骤顺序的断言需要它 |

## 验收

- 闸门、候选流程、流式进度节点（离线）：`notale-editor/tests/ai-edits.test.ts`（14 例）。
- 状态机、ndjson 解析、候选实时预览的投影/清除时机（离线）：
  `notale-editor-frontend/tests/ai-edits-state.test.ts`（17 例）。
- 端到端（stub）：`notale-editor-frontend/tests/interactive-ai.spec.ts`（4 例），后端带
  `EDITOR_AI_STUB` + `EDITOR_AI_STUB_DELAY_MS` 启动，覆盖候选先审后用、**候选一到就在画布上
  实时预览、应用前就能看到**、一次撤销、取消后画布连同预览一起复原、右键入口、进度清单按真实
  阶段依次点亮。
- 真实模型闭环在 2026-09-16 用 `gemini-3.8-flash` 各跑过一次：局部修改产出
  `element.patch`；插入互动产出完整的三步事务并通过全部闸门。
