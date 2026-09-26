# AI 编辑（候选式）

> 历史记录：本文描述的命令式实现已于 2026-09-24 删除，现行实现见 [AI-AGENT-V2.md](AI-AGENT-V2.md)。

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
请求 { slideId, intent: 'edit-page' | 'edit-selection', instruction, targets?: string[], baseVersion?: number,
      history?: {role:'user'|'assistant', content}[]（最多 40 条，见「多轮对话」） }

响应（每行一个 JSON 对象）：
{ type:'step', label, status:'active'|'done' }   — 真实发生的五个节点各一行，见下
{ type:'result', mutationId, baseVersion, commands, preview, model }   — 成功收尾
{ type:'assistant', text }                                             — 模型没提命令、只回了话（问清楚 / 拒绝），也是收尾
{ type:'error', error, message }                                       — 失败收尾
```

`step` 对应的是链路里真实存在的节点，不是编出来的进度条：读取页面对象 → 请求模型 →
解析与校验 → 服务端试跑；被拒后模型再来一轮，就多出一行「请求模型（第 2 次尝试）」，其 detail
第一行是上一次被拒的原因。

## 内核：pi-agent-core

2026-09-22 起，模型调用不再是自己写的一次 fetch，而是 [pi](https://github.com/earendil-works/pi) 的
`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`（v0.87.0，MIT，npm 依赖，不 copy 源码）。
形态是**讲义级的 code agent**：先读再改，门在写工具里。

模型有四个 tool，名字按 code agent 的习惯取（`Read / List / Look / Patch`——模型对这些名字的
先验远强于自造名，说明就能少写）；配了密钥再加 `ImageSearch / ImageGen`（见「配图」）。

| tool | 做什么 | 复用 |
| --- | --- | --- |
| `List()` | 讲义大纲（工作副本）：每页序号、id、名称、对象数 | `doc.slides` + `describeSlide().length` |
| `Read(slideId)` | 一页的对象清单 + 页面样式（工作副本） | `describeSlide` + `pageCss` |
| `Look(slideId)` | 工作副本一页的渲染截图，**1600 宽 WebP，和画布坐标一比一**；每轮 8 次 | `render` 依赖：内存文档经 `/content/draft/<token>/…` 进截图 Chromium |
| `Patch({commands})` | 一批命令落到**工作副本**；可以多次调用，改动累积。`execute` 就是整条闸门 | 过了推一行 `draft`，结果附版面警告；没过 throw，原因回给模型 |

**2026-09-23 起是 code agent 的收尾方式**（参照 Codex CLI 的 agent loop）：一条回复里不调用任何工具，
这一轮就结束；那段话就是给作者的说明（`result.text`）。工作副本有改动 → 一个累积候选；没有 → 普通回话。
- **一次运行一个 mutationId，每次 Patch 从 base 整体重放**：`withStableIds` 每次调用计数器归零，
  所以只有「同一 seed、同一次调用、完整命令列表」才能让模型在副本里见到的新 id 等于最终提交铸出的 id。
  一轮多次插入交互时，临时页 id 带序号（`ai-<seed>-s<n>`），新建页 `ai-<seed>-p<n>`。
- 上限：30 轮 / 墙钟 3 分钟（等配图服务的时间不算）/ Look 8 次。超限把副本已有的改动交出，`status: incomplete` + `note`。
- 作者按停止：服务端随连接断开 `abort()`；前端拿最后一份 `draft` 直接生成「已中断」候选，照常审阅、应用。
- 选中对象（`edit-selection`）：读工具全开，写只能落在选中子树（含本轮插进去的子节点）；页级、讲义级命令一律拒。
- 讲义级命令只在没选中时可用：`slide.insert/duplicate/delete/move/update`（update 只许 name/notes/hidden/section/transition/theme）、
  `deck.update` 只许 `theme`。画布尺寸、`layout.*` 不开放——一次重排所有页，审阅清单看不出全部后果。
  `slide.insert` 模型只写 `{after, slide:{name, html}}`，id 与路径服务端补，Patch 结果告诉它新页 id。
- **版面警告**：Patch 通过后，对它碰过的页（最多 3 页）跑一次带探针的渲染，与 Look 共用缓存键。探针在
  `poster-worker.ts#layoutProbe`：超出画布、被裁切／溢出自己的框、文字互相重叠，按 `data-notale-id` 点名。
  没有复用 notale-ts 的 `selfcheck-probe.json`：它开头先查 notale-ts 自己的 `base.css/base.js/Deck`，在编辑器页上每页都直接报错返回。
- **配图**：`ImageSearch / ImageGen` 的名字、描述、参数 schema 原样取自 notale-ts（`src/server/media/`），
  密钥只读环境变量 `GEMINI_API_KEY` / `PARATERA_API_KEY`，缺哪个就不注册哪个（`/api/ai/status.tools` 说明原因）。
  生成结果的下载也走 SSRF 防护与解码校验。图片当场 `store.upload` 进素材库（内容寻址，候选被取消只留下无人引用的 blob），
  以 `media/ai-…` 路径给模型；模型在 `<img src>` 里原样写，`linkMedia` 按页面目录改成相对路径并补 `asset.put`。
  每轮生图 4 张、搜图 3 次。用了搜图，收尾说明要写来源和授权；讲义里不自动加致谢。
- **上下文预算与自动裁剪**：`budget = min(EDITOR_AI_CONTEXT_BUDGET ?? 200_000, contextWindow − maxTokens − 8_000)`
  （模型窗口这项下限 16K，免得 catalog 缺项把每次运行都变成溢出）。pi 的 `transformContext` 钩子在
  **每次**向 provider 发请求前跑 `pruneContext()`：超预算就从最旧的 `Read/Look` 结果开始折叠成一行
  「第 N 页已读过，需要再看请重新 Read/Look」，图先删、整条后删，最近 3 条读取结果原样保留，
  user / assistant / Patch 结果一律不动。裁到只剩那 3 条仍超 → `AI_TOO_LONG`。**不做**模型写摘要那种
  compact：我们上下文里 90% 的体积是自己产的、可复得的 tool 结果，折叠成 stub 就够，零额外模型调用、
  不丢任何不可复得的信息。折叠发生时「请求模型」那步的 detail 写一句给作者看。
  量级：`lecture-ensemble` 每页对象 700～4000 token、截图 ≈ 258 token（pi 估 1200，偏保守只会早裁），
  读满 10 页 + 看满 10 页 + 16 轮往返 ≈ 5 万～15 万；1M 窗口下松，换 128K 窗口的模型预算自动降到约 10 万。
- 模型不调 tool、直接说话 → 一行 `assistant` 流给前端，显示为模型的回话，不当失败。
  `ToolChoice` 只有 auto/none、不能强制调 tool，所以这不是妥协——是我们以前没有的能力。
- tool 的参数是真正的 JSON Schema（typebox，`patch` 的嵌套结构写全）。Gemini 的 function calling
  对没有 schema 的嵌套对象会拍平成 `patchStyle` / `patchText` 这类兄弟键——第一版用 `Type.Unknown`
  时真的拍平了、连拒三轮。现在 schema 写全，另加 `prepareArguments` 把拍平的键折回 `patch` 兜底。
  Gemini 还经常省略 `slideId`：展开前先 `slideId ??= 请求页`。
- 溢出由 pi-ai 识别：`isContextOverflow()`（十几家 provider 的报错）→ `AI_TOO_LONG`，不再是 400 原文。
- provider 走 pi-ai 的原生 Google 适配（`@google/genai`）；`gemini-3.8-flash` 不在 pi 检入的 catalog
  里时用我们自己的 `Model` 字面量（1,048,576 / 65,536，`input:['text','image']`）。
- 运行时：两个包的 `engines` 写 Node ≥ 22.19，但同一份 dist 在系统 Node 20.20.2 上启动、全部测试通过，
  `package.json` 的 `engines` 保持 `>=20.19`。不全局升级，别替别的会话换运行时。

`preview` 是 `AuthorChangeSet`，由 `store.prepareSync` 试跑得到——和 `/prepare` 同一条路径。
前端拿它做**候选实时预览**：`projectPrepared(kernel.confirmed, preview, htmlBasesFor(...))`
（`notale-editor-frontend/src/author-projection.ts`）投影出一份不提交的 `Snapshot`，画到
`AuthorCanvasController.previewExternal()`（`notale-editor-frontend/src/canvas/author-controller.ts`）
——真实文档和撤销栈完全不碰，取消/重新生成/应用完成时调 `clearExternalPreview()` 复原。
**这个预览的对象 id 未必和候选 `commands` 里的一致**：`elements.transfer` 会在服务端重新分配
稳定 id（防止粘贴/搬运碰撞），`preview` 反映的是这次试跑分配到的 id；真正点「应用」时会用一个
新的 mutationId 重新走一遍，届时再分配一批 id——语义等价，只是底层 id 不同，纯 UI 不可见。

## 多轮对话与候选堆叠

发送即清空输入框：这一轮的原话移到 `sent`，由气泡显示；**停止**会把它交还输入框（作者多半想改一改再发），
失败则留在气泡里，和一般聊天一致。

候选**按轮堆叠**。作者在候选 A 待审时接着说下一句，A 不会被静默取消：

- 请求带上 `pending: [{mutationId, commands}]`（最多 8 轮）。服务端 `overlayPending()` 依次
  `withStableIds(mutationId, () => applyCommands(doc, commands))` 把它们叠回快照，之后大纲、对象清单、
  作用域闸门、试跑**全部对着叠加后的讲义**。所以第二轮能直接引用第一轮新建、尚未应用的对象。
  **为什么 id 对得上**：服务端的元素 id 是按 mutationId 播种的（`store.ts` 的 `withStableIds`），
  试跑和最终提交用同一个 id，就铸出同一批 id；应用时前端把候选的 mutationId 透传给内核
  （`editor-kernel.ts` 的 `execute/executeAfter/executePending` 各多一个可选参数），真实提交因此复现预览里的 id。
  已用真实模型验证：第一轮插入提示框（未应用）→ 第二轮「往下挪 100px」目标是第一轮铸出的 `…-16`，
  提交后该 id 确实在页面里。
- 叠不上（作者自己改了讲义、A 的目标没了）→ `AI_PENDING_STALE` 409。整叠作废：后面的候选是建立在前面
  之上的，留一半不安全。前端把它们全标失败、清预览、说一句「讲义已经变化，待应用的候选失效了」。
- `Patch` 的试跑走 `store.prepareOn(ctx, id, commit, 叠加后的文档)`，变更集仍相对**已保存**的快照，
  所以最新候选的 `preview` 是**累计**的——前端投影它就是作者应该看到的整体效果，画一次就够。
- 页面截图渲的是已保存的讲义，不含这些改动；提示词和 `Look` 的返回都写明了这一点。
- **应用**：按生成顺序逐个提交，每个候选一次内核提交 = 一个撤销步（两轮就撤两次）。中途失败时，
  已落地的记为已应用，其余的丢弃并说明「前 N 轮已应用」——它们是相对旧基线算的，继续显示会撒谎。
  一个都没落地时整叠保留在审阅区，因为讲义没变。**取消**整叠一起取消。
- 待审的轮次**不是历史**：它带着自己的步骤清单显示在对话里，但不写进 `messages`，直到应用或取消才
  定稿。回放给模型时它们以「已生成候选，作者还没应用：…」出现。
- **审阅是一种独立的状态**（借 Cursor / Codex 的做法）：只有应用、取消、切换讲义，或真实的文档冲突
  （`AI_PENDING_STALE`、应用时服务端报错）能结束它。点选对象、切页、滚动一律不会作废候选——
  2026-09-22 曾有一个 bug：作废判断对着实时选区算作用域，作者点一下画布整叠就被静默取消，已连同
  整个「作用域作废」机制一起删掉。引用（`edit-selection`）在发请求那一刻就定死：`targets` 随请求送出，
  候选的命令指向具体 id，之后与实时选区无关。
- **审阅卡是清单，不是 diff**（照 Codex 的 Changes 面板）：一行一个被触及的对象——种类图标 · 作者会叫的名字 ·
  页（多页时）· 徽章（`新增 / 删除 / 交互 / 换内容 / N 处`），头部一句总账「2 轮 · 4 个对象」。不摊属性表、
  不做悬停浮层：画布预览就是 diff。点一行在画布上切页并选中该对象（插入的对象 id 是应用时才铸的，不可点）。
  命名：`objectLabel()` 对 `style` 这类非可视元素按类型给名（「页面样式」），text 像 CSS 时不拿它当名字；
  插入按内容首段文字命名（`insertLabel()`），带组件的按组件名，每处插入各占一行。多轮时组头是灰色单行
  「指令」，不再加粗整句。属性级的 `rows` 仍算出来给徽章计数和结束轮次的 chip 浮层用。
- **审阅条钉在输入区上方**，不在可滚动的对话记录里；清单在卡片内自己滚（限高），再长也顶不掉输入框。
  转录和审阅卡都挂 `data-selectable-text`（编辑器 chrome 默认 `user-select:none`，这是它的允许清单钩子），
  文字可划可复制；全局 `⌘C` 在有选中文字且落在可选区域时让给浏览器，不再截去做画布复制。每条用户消息下
  有一个只带图标的复制按钮（名称走 tooltip / aria-label），剪贴板不可用时退化为选中该气泡。
  按钮：`全部应用` / `全部取消`，两轮以上多一个 **`撤回上一轮`**——弹掉最上面一轮永远安全（没有别的轮建立
  在它之上），弹掉后画布重画到剩余栈的最上层。不做中间抽轮。

侧栏是一个聊天页，对话本身**只存在前端**（`localStorage`，按 documentId 分开，上限 ~200KB，
超了从最旧的一轮整条丢弃），服务端不存会话、不记 token、不做压缩摘要。

前端维护两份东西，职责严格分开：

- `messages: {role,content}[]` —— **回放给模型的**。只进「作者说了什么」和「这一轮的结果」，
  进度步骤、候选明细一概不进。上限 40 条，超了从最旧丢整条。
- `turns: AiTurn[]` —— **只给 UI 的**。每轮的指令、目标、进度清单、结局（applied / discarded /
  failed），用来铺出对话记录。

请求带上 `history` 后，`prompt()` 把它插在「页面对象」和「本轮要求」之间，并写明**已应用的
改动其效果已经体现在页面对象清单里，不要重做**——历史只用于理解指代（「它」「再大一点」）
和避开被拒绝过的方向。回放的作者句子带页标签（`[第 2 页] 把标题变红`，跨页候选是 `[第 2 页、第 7 页] …`），
第 7 页那轮的模型能回指第 2 页发生过什么。

## 模型看到什么

每轮的第一条 user 消息由下面的来料拼成（system 恒定）；之后的轮次是 pi 循环里 tool 结果的往返——
`Read/Look` 拿别的页，`Patch` 被拒的原因回来。

架构图：[`docs/ARCHITECTURE-ai-inputs.html`](./ARCHITECTURE-ai-inputs.html)——按 `notale-ts/ARCHITECTURE-v8.html`
的约定画（内联 SVG、`<g data-node>` 带悬停说明、右上角图例分节点类型）。下面两张表是同一份内容的文字版。

逐段说明：

| 段 | 来源 | 细节 |
| --- | --- | --- |
| 抬头 | `doc.slides` 找下标、`doc.width/height` | 页码**和** `slideId` 都给——只给页码时模型会把 `slideId` 写成 `1`，真跑出来过 |
| 讲义大纲 | `outline(doc)` = `List()` 的结果内联 | 每页一行「序号. id「名」· N 个对象」，十来行；定向方向不花一轮 |
| 主题变量 | `doc.theme` → `layout.theme` → `slide.theme` | 和 `render.ts:105-111` 渲染时同一套合并顺序，后面盖前面；各层先过 `rebaseTheme` 按页面路径重写相对资源，否则深层页面引的图会指错 |
| 当前页对象 | `describeSlide()` = `inspectSlide()` 去掉 `html` | 每个对象剩 `id/tag/parent/kind/text/style/attributes`，`text` 截 120 字。去掉 `html` 是有意的：模型不需要看闭合标签才能说"把 title 变红"，看不见原始串它也没法偷偷重排版面 |
| 页面样式 | 页内 `<style>` 文本 + `<link rel=stylesheet>` 指到的 css 资产 | `<link href>` 按 `slide.sourcePath` 解析相对路径，再去 `store.stylesheets()` 取正文；合计 ≤ 8 KB，超出截断并标注。**不做调色板摘要**——摘要会丢掉 `class → 颜色` 的对应关系，而模型要的正是这个对应 |
| 之前几轮 | 前端 `messages[]`（≤ 40 条） | 措辞写明"已应用的改动其效果已经体现在上面的页面对象里，不要重做"，只用于理解指代和避开被拒方向 |
| 本轮要求 | 作者输入 + 作用域一句 | 引用了对象是"只允许改这些对象及其内部"，没引用是"默认只改这一页；作者点名了其它页或整份讲义才跨页（先 Read 那一页）" |
| **页面截图** | `PosterService`（Playwright 渲 640 宽 WebP） | 和侧栏缩略图**同一个缓存 key**，所以缩略图刷过的页零额外延迟；轮询 300 ms 最多 6 s，拿不到就不带图（截图是增强不是阻塞）。`EDITOR_AI_VISION=off` 关掉。附一句「附图是当前渲染截图，id 与几何以对象清单为准」。**实测**：`lecture-ensemble` 第 2 页「把这页调得更透气一点」——带图 1 轮 3.2 s，把三条要点等距拉开；不带图 2 轮 9.2 s，第一轮 CSS 属性名写错被拒，第二轮改了 6 个对象、更粗 |

**没有进 prompt 的**（都是有意的，或是已知缺口）：

| 没给 | 情况 |
| --- | --- |
| 预置风格 / 模板库 | **已知缺口**。`theme-panel.tsx` 的主题预设、`template-library.ts` 的模板库模型都看不到；它只能从合并后的主题变量和页面 CSS 反推，不知道"这是哪一套预设"、"同一套预设的其它页长什么样" |
| 其它页面的内容 | 不再是缺口：大纲内联，正文按需 `Read`，截图按需 `Look`；不主动灌整份讲义 |
| 资产文件内容 | 有意。图片、字体只以路径出现在 `attributes.src` 里 |
| 讲者备注、动画、母版定义、native chart 数据 | 有意。都在 slide 上，都没进 prompt |
| 文件系统、shell | 从来没有 |

## 闸门（跑完模型、给作者之前）

这几道都在 `Patch` 这个 tool 的 `execute` 里；被拒的原因回到模型手里，由它下一轮修正。

1. `commitSchema.parse` —— zod 严格模式，≤500 条命令。
2. **命令白名单**（`AI_COMMANDS`，两种意图同一张）：`element.patch`、`element.content`、`element.insert`、
   `element.delete`、`component.set`、`component.remove`。`deck.update`、`layout.*`、`asset.*`、`codeLesson.*`、
   `svg.*`、以及 `slide.insert / elements.transfer / slide.delete` 一律不可达——最后三条由服务端替模型拼
   （见「插入互动」），模型自己写会被拒。词表检查在 `expandAiCommands` 里、展开之前做。
3. **页面闸门**，按页回答 `scopeFor(slideId)`：`edit-deck` 下任何**已存在**的页都给出该页全部 id，
   不存在的页 → `AI_SLIDE_OUT_OF_SCOPE`；`edit-selection` 下只有请求页有作用域（选中子树），别的页一律拒。
   本批新建的临时页（插入事务需要）免检；`slide.delete` 只能删本批新建的页；`elements.transfer` 的
   `sourceSlideId` 必须是临时页——这三条命令都不在词表里、只有服务端会拼，所以不存在「真实页搬到真实页」的路。
4. **作用域闸门**，同一条规则两种意图共用：命令的 `target`、`element.insert` 的 `parent`、`component.set`
   的 `root` 必须落在其所指页的作用域集合内。所以整份讲义可写**不等于没有闸门**：模型编出来的 id 照样被拒。
   跨页的 `element.insert + components` 按每条命令自己的 `slideId` 展开，临时页与搬运目标都落在那一页。
5. **试跑**：`store.prepareSync` 在服务端应用一遍，让 `EXECUTABLE_INSERT`（禁 `<script>`/`<base>`/`on*`）、
   `component-validation`、`COMPONENT_CONFLICT` 这些既有守卫先失败。

任何一步失败，失败原因回喂给模型、下一轮它改；到轮数上限仍没过就返回 `AI_REJECTED`，**坏候选不会出现在界面上**。

## 为什么没有沙箱

因为 AI 产不出要执行的代码。编辑器里的"互动"是声明式数据：一个子树 + 一条 `InteractiveComponent`
（状态、click/pointerenter/pointerleave 事件、`text`/`style`/`visible` 补丁）。插入脚本在命令层就被拒绝。
安全边界是上面这套 schema 和守卫，不是容器。

**结构性限制**：场景（scene）无法由 AI 创建——它是从页面内联 `<script>` 反推出来的
（`src/domain/source-scenes.ts`），而我们插不了脚本。需要任意程序逻辑的互动要等「导入代码」那条线，
那条线才需要隔离构建。

## 插入互动

模型只写一条 **`element.insert {slideId, html, components}`**：html 是恰好一个顶层元素、自带绝对定位的
片段，被 component 引用的元素自己写 `data-notale-id`。服务端 `expandAiCommands` 在词表检查之后、
`commitSchema.parse` 之前，把它交给 `interactionInsertCommands`（`src/domain/interaction-insert.ts`，
也从 `@notale/editor/browser` 导出，前端的 `reveal-commands.ts` 同样用它）展开成三条真命令：

1. `slide.insert` 一个临时页（`ai-<mutationId>`，`sourcePath` 与目标页**同级**），保留作者 id 并携带 `components`；
2. `elements.transfer` 把顶层元素搬进目标页（`mode:'copy'`、`offset:{0,0}`、不传 `rectangles`）；
3. `slide.delete` 删掉临时页。

三条在同一个 `mutationId` 里，**一次应用 = 一次撤销**。为什么必须三步：`element.insert` 会重铸所有 id
且 schema 不带 `components`；`slide.insert` 是唯一保留作者 id 的入口；`elements.transfer` 是唯一在搬运时
重映射 id 并同步改写 component 引用的路径。这个「怎么拼」只存在 `interactionInsertCommands` 一处。

模型面的 `element.insert` 用**不加 `.strict()`** 的 schema 解析：多写一个字段（真实模型出过 `parent`）
是忽略，不是打回。构造器自己把关：`assertStatic`（script/base/iframe/on*/javascript:——`slide.insert`
路径原本没有这层）、片段恰好一个顶层元素、id 互不重复、每个 component 的 root 都在片段里（`transferObjects`
对 root 不在搬运子树里的组件是**静默丢弃**）。

顺手修掉的旧缺陷：临时页 `sourcePath` 写死在根目录会让 `rebaseElements` 改坏深层页的相对资源；
`offset` 不传默认 `{20,20}`，之前 AI 插的东西都偏 20px；`rectangles` 是把片段自己的几何再写一遍。

## 侧栏的审阅界面

设计语言参照 beautifului.dev（Beautiful UI，MIT）的 AI 原语，但**不引它的代码**——它每个组件都依赖
一个以 `@import "tailwindcss"` 开头的 foundation.css，而本仓库没有 Tailwind、PostCSS、clsx、motion。
照着做、用 `src/editor.css` 现有的 token 实现，0 新依赖，因此也不产生 MIT 署名义务。

- **进度**（ToolChips）：一行一个节点——图标 | 标签 | **参数 chip**，可展开看这一步实际做了什么。
  参数和细节由后端在各节点 `done` 时一起推上来（`AiStep.chip` / `AiStep.detail`）：
  读取页面对象带对象数与页码画布，请求模型带模型名与作用域，解析与校验带命令数与类型计数，
  **重试那一行第一句就是上次被拒的原因**——以前只看得到「第 2 次尝试」，不知道为什么。
  结束的轮次末尾另有一条改动 chip（每个被改的对象一枚，`+N` 是属性数），悬停弹出它的 `旧 → 新`。
  结构移植自 Beautiful UI 的 ToolChips，署名见 `notale-editor-frontend/docs/release/PORTED-CODE-NOTICES.md`。
- **审批卡**（Approval Card）：`#ai-candidate` 抬成浮层，标题行 + 差异表 + 动作行。
- **差异表 / 改动 chip 的分工**：**表格用来决定，chip 用来回看**——待审的候选卡里是对齐的三列表格，
  已结束轮次的记录里是 chip + 悬停浮层，同一份数据两种密度。
- **差异表**（Diff Table）：`diffRows()`（`notale-editor-frontend/src/state/ai-edits.ts`）把候选命令
  翻成「对象 · 改什么 · 旧 → 新」。旧值取自页面对象，颜色统一normalise成 hex 并带色块——画布预览
  只给得出结果，这张表才说得清「要求的是什么」。超过 6 行折叠。
- **对话轮次**（Task Rows）：结束的轮收敛成一行（状态点 + 结果），点开才展开步骤与差异表。
- **引用**：选中对象后，输入框上方出现一枚引用 chip（对象自己的名字，不是属性面板的标题），
  带 ✕ 可取消引用、把这一轮交回整页。**没选中就什么都不显示**——整页是默认，不需要一句公告。
- **发送**：回车发送，Shift+回车换行（两个平台一致，不用 ⌘/Ctrl 那套只对一边成立的记法）。
  输入法合成期间的回车一律不发送——中文候选词就是靠回车确认的，`isComposingKey` 在最前面拦住。
- 右键工具条上多了一枚 ✨「AI 修改」，一键把选区交给侧栏。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `EDITOR_AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Google 原生端点（尾部 `/openai` 会被去掉） |
| `EDITOR_AI_MODEL` | `gemini-3.8-flash` | 模型 id |
| `EDITOR_AI_API_KEY_ENV` | `GEMINI_API_KEY` | 从哪个环境变量读密钥 |
| `EDITOR_AI_TIMEOUT_MS` | `60000` | 单次请求超时 |
| `EDITOR_AI_STUB` | — | 固定回复，或 `{关键词: 回复}` 映射（按提示词匹配），用于确定性验收 |
| `EDITOR_AI_STUB_DELAY_MS` | `0` | stub 回复前的固定延迟；不设的话流式阶段会在一次事件循环里全部推完，看不出中间态，浏览器验收步骤顺序的断言需要它 |
| `EDITOR_AI_VISION` | 开 | `off` 时不附页面截图、`Look` 返回文字（换成文本模型时用） |
| `EDITOR_AI_CONTEXT_BUDGET` | `200000` | 上下文 token 预算，超了折叠旧的读取结果；实际取它与模型窗口余量的较小者 |

## 验收

- 离线：`notale-editor/tests/ai-edits.test.ts`（47 例）、`tests/image-tools.test.ts`（6 例）、
  `notale-editor-frontend/tests/ai-edits-state.test.ts`（53 例），`npx tsx --test`。新增覆盖：多次 Patch 累积、
  前一次插入的对象下一次能改且最终提交铸出同一 id、超限 → `incomplete`、Look 上限、选中时读得到别页写不了、
  页级命令与 `deck.update` 的字段闸门、`linkMedia` 路径改写与 `asset.put`、生图额度、停止 → 「已中断」候选可应用、
  收尾说明进历史。
- stub 冒烟（2026-09-23）：插入一段超宽文字 → `draft` 行 → 第 2 轮收尾 `complete`；工作副本真实渲染 1600×900，
  探针报「超出画布右 60」「溢出自己的框 160×220 / 160×40」，整轮 1.7 s。
- 真实模型（`gemini-3.8-flash`，`lecture-ensemble`，2026-09-23，只出候选不提交）：

  | 用例 | 耗时 | 轮 | Look | Patch（被拒） | 结果 |
  | --- | --- | --- | --- | --- | --- |
  | 选中标题改深蓝、加大字号 | 14 s | 3 | 1 | 1（0） | 1 条 patch，46→54px |
  | 「这页太挤了，重新排版」 | 39 s | 7 | 2 | 2（1） | 三列卡片，被拒一次后自己修正 |
  | 加「看答案」展开互动 | 28 s | 5 | 1 | 1（0） | 插入交互事务 |
  | 第 2–5 页标题统一颜色字号 | 19 s | 5 | 0 | 0 | 回话：四页标题同一 class、已一致，不改 |
  | Boosting 后加一页讲 AdaBoost | 40 s | 7 | 2 | 2（1） | `slide.insert` + 改新页内容 |
  | 配一张「群体智慧」实拍 | 78 s | 7 | 1 | 1（0） | 搜图 3 次用满额度；说明写了作者、Commons 来源、公有领域 |
  | 画一张森林示意插画 | 39 s | 8 | 2 | 2（1） | 生图 1 张，`src` 改成 `../media/…` 并补 `asset.put` |
  | 「改一下那个」 | 3 s | 1 | 0 | 0 | 回话追问改哪部分，不出候选 |

  整页生成那条第一次跑时命令里出现过 `slide.delete`（当时没留命令），重跑干净；删页在审阅清单里是单独一行「删除页面」。
- 旧的 stub 端到端（`interactive-ai.spec.ts`）这批没重跑。
