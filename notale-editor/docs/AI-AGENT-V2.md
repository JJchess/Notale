# AI 编辑 v2：文件形态的编码 agent（设计定案）

2026-09-23 与用户逐条对齐；2026-09-24 按测试报告整改后切换上线，命令式实现已删除（`AI-EDITS.md` 只作历史记录）。
整改后的制度见文末「整改与切换」，与前面条目冲突时以它为准。

## 为什么改

命令式实现让模型说编辑器的内部命令语言（`element.patch` 等几十种命令、对象 id、按 id 划作用域）。
后来加的命令词表与校验、`slide.insert` 补 id、插交互的临时页三步事务、图片路径改写、整体重放保 id，
全是「模型意图 → 内核命令」的翻译。模型最擅长改文件，却被逼着学私有 API；每多一种形态就多一个专用工具。
产品形态是无限的，编辑应当是自由形态。

## 已定

1. **形态**：编码 agent，自由读写文件、带 Bash。不再有命令词表。
2. **代码来源**：把 pi（earendil-works/pi，MIT）的源码 fork 进仓库裁剪改造，**不依赖它的 npm 包**。
   - 拷进 `src/server/agent/pi/` 并改造：工具 `read / write / edit / bash`（pi 默认启用的就是这四个；grep/find 依赖它下载 ripgrep/fd，改由 bash 在沙箱里跑；含输出截断、路径处理、同文件写入排队、edit 的 diff）；
     `pi-agent-core` 的 agent 循环；上下文压缩（模型写摘要、保留最近约 2 万 token）；`pi-ai` 只留 Google provider、消息类型、溢出识别；
     `AGENTS.md` 加载改成只读工作目录里的一个文件。
   - 不要：终端界面、ssh、jsonl 会话持久化、扩展加载器（esbuild/jiti）、其他 provider、设置与登录、包管理、遥测、photon（用已有的 sharp）。
   - 拷完后移除 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 两个 npm 依赖。保留 pi 的 MIT 许可声明。
3. **范围**：第一版只做幻灯片。
4. **真相**：编辑器的 DeckDocument 仍是真相。每次运行导出工作目录（`src/server/agent/workspace.ts`）：每页写在自己的 `sourcePath`、
   素材写在自己的路径，页面里的相对引用原样成立；页面旁的 `*.notale.json` 是这一页 html 以外的全部字段（名称、备注、组件、动画……，
   备注放这里而不是 `aside.notes`：渲染时 `aside.notes` 的文字本就被 `notes` 覆盖）；`deck.json` 列出哪些 html 是页面及其顺序、主题。
   一轮结束读回，和基线比较生成 `slide.replace / insert / delete / move`、`deck.update`、`asset.put / remove`；新页的名称、分步数按 `.notale` 导入同样的规则取。
5. **宪法不新增机制**：
   - 现有的文档校验与资源检查（悬空引用、缺资源、尺寸上限等），报错原样回给 agent；
   - Look（截图 + 版面警告 + 控制台报错）是「效果对不对」的唯一判据——固定尺寸 `#stage`、不依赖 CDN 都由它暴露
     （渲染器本就把 `#stage` 设成画布尺寸，截图 Chromium 本就拦外链）；
   - `AGENTS.md` 写明约定，其中一句：没动过的对象保留原 `data-notale-id`（id 变了，组件/动画/批注/连线会断，校验会报悬空；审阅清单会显示成删一个加一个）。
   - 第一版不开放母版（layout），所以「母版必须静态」不涉及。
6. **沙箱**（`sandbox/`、`src/server/agent/sandbox.ts`）：第一版就带 Bash。每次运行一个 docker 容器，只挂载工作目录；模型与图片服务的密钥不进容器；限 CPU / 内存 / 时间；
   网络只放行 npm 与几个固定 CDN 域名（用于把库下载下来放进本地）。read/write/edit 在宿主机上直接操作同一个挂载目录，只有 bash 走 `docker exec`。
   实现：容器以宿主机用户运行、`--init`、去掉全部 capabilities、根文件系统只读；接 `--internal` 网络 `notale-agent-net`（本机默认地址池已满，
   手工指定 10.237.0.0/24），唯一出口是 tinyproxy 放行名单代理 `notale-agent-proxy`；命令超时由容器内 `timeout` 连进程组一起杀，默认 120 s、上限 300 s。
7. **服务端工具**：Look（用编辑器现有渲染器与截图 Chromium，1600 宽与画布一比一）、ImageSearch / ImageGen（沿用已复制进 `src/server/media/` 的实现，结果写进工作目录）。
8. **写回与审阅**：新增 domain 命令 `slide.replace {slideId, slide}`——整页替换（html 与全部页级字段），id 与 sourcePath 不可变，html 过 `normalizeHtml`
   保留作者 id，其余交给 `validateDocument`（`tests/slide-replace.test.ts`）。现有 `element.content` 改不了 `<head>` 样式，也不许替换含脚本的部分，所以要新命令；
   页面增删、调页序沿用 `slide.*`。审阅清单比较改动前后每页的对象列表生成，仍是清单形式。
9. ~~运行上限~~：已删（见文末），只留每条指令 500 万输入 token 的成本兜底。
10. **过渡**：新版在同样 8 条真实用例上达到不差于旧版之前，4312 继续用命令式实现；达到后切换，并删掉旧翻译层
    （命令词表、临时页三步事务、`linkMedia`、整体重放、`pruneContext`、自写系统提示）。

## 已按推荐执行

- 检查只在模型准备收尾时跑（fork 的 `beforeSettle`）：读回校验失败、选中对象时改到选区外 → 当作测试失败让它继续改（最多 3 次）；
  版面警告和页面报错只提一次，有意为之的由模型决定不管。
- 第一版不加 skill，只有 `AGENTS.md`（`src/server/agent/workspace.ts` 的 `RULES`）。

## 实现位置

`src/server/agent/`：`pi/`（fork，6.3k 行，含 MIT LICENSE）、`workspace.ts`（导出与读回）、`sandbox.ts`（docker）、`run.ts`（运行主体）。
路由 `POST /api/documents/:id/ai-edits` 走 `runTurn`（`EDITOR_AI_AGENT` 开关与命令式实现已删除）。
宿主机上的 read/write/edit 限定在工作目录内（按真实路径判断，沙箱里建的软链接也拦得住）。图片工具下载的候选图只有被页面引用的才进候选。

## 验收

离线：`tests/slide-replace.test.ts`（5）、`agent-workspace.test.ts`（6）、`agent-sandbox.test.ts`（3，需要 docker）、`agent-pi.test.ts`（5）、`agent-run.test.ts`（6）。

真实模型（`gemini-3.8-flash`，`lecture-ensemble`，2026-09-23，只出候选不提交；v1 为同日命令式版本）：

| 用例 | v1 | v2 | v2 轮 / Look / 改写 / bash | v2 结果 |
| --- | --- | --- | --- | --- |
| 选中标题改深蓝、加大字号 | 14 s | 11 s | 4 / 1 / 2 / 0 | 一条 `slide.replace`，过选区检查 |
| 「这页太挤了，重新排版」 | 39 s | 71 s | 13 / 3 / 3 / 0 | 三栏卡片，保留原 id |
| 加「看答案」展开互动 | 28 s | 85 s | 27 / 5 / 6 / 4 | 在 `.notale.json` 里写组件，过校验 |
| 第 2–5 页标题统一 | 19 s | 49 s | 15 / 4 / 0 / 4 | 用 grep 核实后回话：已一致 |
| Boosting 后加一页 | 40 s | 18 s | 6 / 1 / 3 / 0 | `slide.insert`，同步 `deck.json` |
| 配一张「群体智慧」实拍 | 78 s | 95 s | 15 / 3 / 3 / 4 | 说明写了 Commons 来源与公有领域；当时带出 8 张未用候选图，已修 |
| 画一张森林示意插画 | 39 s | 64 s | 17 / 7 / 7 / 0 | 生图 1 张，相对路径引用 |
| 「改一下那个」 | 3 s | 18 s | 5 / 1 / 0 / 0 | 先读再追问 |

**逐项计时后的修正**（同日）：给一条慢用例的每行进度打时间戳，35 s 里 31.7 s 在等模型，读写工具与我们的读回、draft、Look 合计不到 3 s——
时间 = 轮数 × 每轮 1–2 s。轮数多有两个原因：fork 时丢了 pi 系统提示里按工具生成的规则段（「同一文件多处改动放一个 edit」「read 代替 cat」等），
以及首条消息只给文件名，模型要先花几轮读当前页、deck.json、边车。修正：原样补回 pi 的工具说明与规则；首条消息附上当前页 html、边车与页面列表；
规则里加一句「多个文件在同一次回复里一起 read」；沙箱镜像补装 ripgrep（pi 的规则让它用 rg）。

| 用例 | v1 | v2 修正前 | v2 修正后 | 轮 / Look |
| --- | --- | --- | --- | --- |
| 选中标题改色改字号 | 14 s | 11 s | 10 s | 3 / 1 |
| 重新排版 | 39 s | 71 s | 25 s | 7 / 2 |
| 加「看答案」交互 | 28 s | 85 s | 30 s、30 s | 11 / 4；10 / 3 |
| 第 2–5 页标题统一 | 19 s | 49 s | 12 s | 6 / 4（回话：已一致） |
| Boosting 后加一页 | 40 s | 18 s | 36 s | 9 / 2 |
| 配实拍图 | 78 s | 95 s | 73 s | 10 / 3，只登记了用到的 1 张图 |
| 画示意插画 | 39 s | 64 s | 19 s | 4 / 1 |
| 「改一下那个」 | 3 s | 18 s | 8 s | 4 / 1（先看再追问） |

插交互第二次跑遇到模型服务 429（额度用尽），交出的候选标了「未完成」并带原因，行为正确。同一条用例前后两次能差一倍，单次对比只作参考。
已知未修：一次运行内 Google SDK 请求会在运行的中止信号上累积监听器（Node 在超过 10 个时打警告），运行结束即释放。

### 多轮与长上下文（同日）

- 多轮：同一页连续 3 轮（改深蓝 →「再大一点」→「刚才那个颜色换成砖红色，别的别动」），每轮带上前面的对话和待审候选。
  指代全部解析正确，每轮都在前一轮候选之上改，第 3 轮保留了第 2 轮的字号。每轮 8–16 s、上下文 4–5K token。
- 长上下文：32 页讲义（html 共 49 万字符）+ 40 条填满的历史，要求逐页读完再改一页：峰值 86K token、7 轮、28 s，结果正确，未压缩。
- 强制压缩（`EDITOR_AI_CONTEXT_BUDGET=40000`）：压缩 5 次，峰值 109K，164 s、18 轮，结果正确、32 页标题列表完整。慢在一轮并行读就加进四五万
  token，压完又超线。据此默认预算定为 20 万（与 v1 一致）：10 万级不压缩，远超时压缩兜底。
- 发现并修正：收尾前检查把模型送回去之后，第二次的回复（回应检查）会覆盖第一次写给作者的说明——现在检查触发的每次收尾说明都保留、按序拼接。
  上下文大小写进每轮「请求模型」步骤的 detail。

### 压缩与 pi 的差异（同日核对源码）

算法本体与 pi 相同（用量估算、`窗口 − 16384` 触发、保留约 2 万 token、切点与半轮规则、摘要提示词与格式、增量更新旧摘要）。不同处：
- 时机：pi 在一次运行结束后或下一条用户消息前压缩，运行中不主动压；我们每轮作者指令新起一个 agent、没有跨轮会话，所以在每次调用模型前检查。
- 溢出：与 pi 一致——删掉失败的那条回复、强制压缩、从原记录接着跑，只重试一次；重试后仍溢出则以 `AI_TOO_LONG` 收尾，已有改动作为「未完成」候选交出。
- 触发线默认 20 万（`EDITOR_AI_CONTEXT_BUDGET`），pi 是模型窗口减 16384。
- 跨轮记忆：pi 压缩整段会话；我们前几轮只以文本历史带入（最多 40 条），工具细节不保留——等接入主系统的会话存储再说。
- 未搬：会话持久化、压缩钩子、分支摘要、跨多次压缩累计的读/改文件列表。

### 沙箱开销与后续（同日）

实测（各 5 次中位数）：起容器约 430 ms、删容器约 420 ms、每条 bash 经 `docker exec` 约 105 ms（本机直接执行 6 ms）。
删容器改为结果发出之后在后台进行（`run.ts` 的 `finally`），每轮省下约 0.4 s；剩下每轮约 0.43 s + 每条 bash 0.1 s，占一轮 10–35 s 的几个百分点。
「一段对话共用一个容器」（pi 的 Gondolin 扩展是一次会话一个 VM）暂不做：单论速度只省起容器那 0.43 s，要等出现「每轮重复安装」或接入主系统有了会话存储再做。
Gondolin 本身（可编程放行名单、密钥占位符、VM 级隔离）更合适，但需要 Node ≥ 23.6（现为 20.20.2）和 KVM（本机没有 `/dev/kvm`），记为接入主系统时的候选。

## 整改与切换（2026-09-24，已上线）

依据 `AI-AGENT-V2-TEST-REPORT.md` 的 10 个问题。原则：讲义就是一堆文件，唯一限制是 notale editor 能解析；其余照 pi，pi 没有照 Codex。

- **一份状态**：AI 一轮直接提交进讲义（一次 `store.sync`，与作者并发编辑走现有合并）。删掉候选堆栈、请求里的 `pending`/`history`、画布预览投影。
- **基线审阅**（Codex 的工作区 vs git 基线）：会话记 `reviewBase` 版本号。
  `GET …/ai-sessions/:sid/review` = `diffDocuments(讲义@基线, 讲义@当前)`，两端对象都由服务端 `inspectSlide` 描述（前端不再拿画布对象比，否则每个属性都显示成改了）；
  `POST …/accept {version}` 挪基线；`POST …/discard` = `store.restore` 回基线（一次可撤销提交，期间所有人的改动一起撤）；`DELETE …/ai-sessions/:sid` 释放沙箱。
- **会话照 pi**：`src/server/agent/session.ts`，jsonl 存完整消息（含工具调用与结果），`.local/ai-sessions/<文档>/<会话>.jsonl`；前端只持会话 id。
  压缩在指令前、运行后按阈值做，溢出压缩并重试一次；429/5xx 2/4/8 s 退避 3 次；停止照 Codex 保留已写改动并记 `<turn_aborted>`。
- **容器跟会话走**：`SandboxPool`，第一次 bash 起、后续复用，闲置 15 分钟 / 会话关闭 / 服务重启（按 label 清扫）回收。
- **唯一规则**：每次 write/edit/bash 后当场读回校验，解析不了就作为这次工具调用的错误返回。删掉收尾检查（`beforeSettle`）、选区锁定、轮数/时间/Look/配图上限。
- **文件 ⇄ 文档**：`src/domain/document-diff.ts`；已有页以边车为准不重算步数；页序按最长递增子序列求最少 `slide.move`。
- **依赖**：`@earendil-works/pi-agent-core`/`pi-ai` 已删，模型连接走 fork 的 `streamGoogle`（`src/server/ai-model.ts`）；`typebox`、`diff`、`@google/genai` 为直接依赖。
  `EDITOR_AI_STUB*` 与 `EDITOR_AI_TIMEOUT_MS` 随命令式实现删除。
- **前端代理**：`scripts/serve.ts` 原来只在请求体未传完时（`aborted`）断开上游，流式响应中途浏览器断开不会传到后端——停止按钮在界面上显示「已停止」，
  模型却继续跑完整轮。改为响应未结束就 `close` 时销毁上游请求。

验证（2026-09-24）：后端单测 219/219；前端状态机 25/25；真实模型 API 链路（一轮一次提交 → 作者提交进审阅 → 接受挪基线 → 同会话第二轮 → 放弃回到基线）；
4312 浏览器链路（审阅条 1 个对象 1 处 → 协作者改第 2 页后变 2 行 → 接受 → 第二轮 → 放弃回到接受时 → 第一次改文件后停止，版本 +1、审阅条列出保留的改动），无页面报错。
未做：`conv.py` 的 C1/C2/C3 长对话场景未按新语义重跑（请求体不再带历史，C1 的 400 与 C2 的 22 条 move 已由结构与单测覆盖）；
`notale-editor-frontend/tests/interactive-ai.spec.ts` 依赖已删的 stub 与候选语义，待重写。

## 收尾（2026-09-24 第二轮，已上线）

照 pi / Codex 源码调研后逐条处理上一节的「未做」：
- **模型请求空闲超时**（Codex `stream_idle_timeout_ms`，pi `httpIdleTimeoutMs`，都是 5 分钟、超时后重试）：fork 的 `google.ts` 每次请求用自己的取消信号，
  流 5 分钟（`EDITOR_AI_HTTP_IDLE_TIMEOUT_MS`）没有数据就中止这次请求，报 `idle timeout`，走现有 2/4/8 s 重试。每次请求自己的信号也消掉了
  `@google/genai` 成功请求不释放监听的 MaxListeners 警告（`tests/agent-google-idle.test.ts`）。
- **停止是单独的请求**（pi RPC `abort`、Codex `turn/interrupt`）：`POST …/ai-sessions/:sid/interrupt`，本轮提交并存好转录后才回复；没有进行中的一轮回 409。
  结果流不断开，照常以 `result`（`status:'interrupted'`）收尾，前端据此拉取与刷新审阅，删掉了 1.5 s 定时补拉。连接断开仍然停止本轮（关标签页兜底）。
  同时修掉：重试退避与压缩原来不能被停止打断（照 pi 的 `abort()` 一并取消）。
- **中英文**：前端确定性文字全部进翻译目录；两条静态检查兜底——前端 `tests/i18n-coverage.test.ts`（所有 `t('固定文字')`、审阅清单给无名对象起的名字），
  后端 `tests/i18n-agent-coverage.test.ts`（agent 上报的步骤名、说明、收尾 note 的模板）。模型回复与作者文字不翻译。
- **测试**：后端用现有脚本化假模型补了停止（模型请求中 / 重试等待中 / 连接断开）与 12 轮同会话（多次压缩、重载一致）；
  前端 `tests/interactive-ai.spec.ts` 重写为照 Codex app-server 的假模型服务（spec 内起假 Gemini 流式端点 4499，后端以 `EDITOR_AI_BASE_URL` 指过去；
  跑时 4312 临时指向这个后端，跑完指回 4480）：审阅→接受→第二轮→放弃、停止、英文界面，3/3。
- 不做：「只看不改」开关（审阅 + 全部放弃兜底，pi/Codex 默认模式也不猜意图）。

验证：后端 225/225；前端状态机与 i18n 检查 28/28；浏览器 spec 3/3；真模型（4312 → 4480，英文界面）：一轮一次提交、协作者改动进审阅、接受、第二轮、放弃回到接受时、
第一次改文件后停止（版本 +1，审阅栏列出保留改动），无页面报错。
注意：改了后端包再构建前端，要先删 `.next/cache/webpack`——包版本恒为 0.1.0，webpack 缓存不会失效，会悄悄打包旧的翻译目录。

## 侧栏精修：模型选择、附件、@ 引用、流式回复（2026-09-24，已上线）

- **Provider**：照 pi（Codex 只有 Responses 线、只有 OpenAI 模型）。fork 了 pi 的 `openai-completions` 适配器（`agent/pi/ai/openai-completions.ts`，909 行，
  留 compat 探测、reasoning、tool call 增量、图片；带上一轮的每请求信号 + 空闲超时）。`src/server/ai-model.ts` 的 `ModelRegistry` 用 pi `models.json`
  的形状列服务：Google、OpenAI、OpenRouter、DeepSeek、xAI、Moonshot（照 pi 的 base URL 与 key 名）+ SiliconFlow、Paratera；`EDITOR_AI_MODELS_JSON` 可覆盖。
  有 key 的服务现场问它能用哪些模型（缓存 10 分钟，失败不缓存）；OpenRouter 的模型列表是公开的，另查 `/key` 验证密钥。`GET /api/ai/models`。
- **每轮选模型**：请求带 `model:{provider,id}`，会话 jsonl 记 `{type:'model'}`（pi `appendModelChange`），跨 provider 的历史由 `transformMessages` 转换。
- **附件**：请求带 `images`（最多 4 张 PNG/JPEG/WebP，每张 ≤5 MB），作为开场消息的图片（pi `prompt(text, images)`）；模型不看图时 400。
- **流式文字**：ndjson `{type:'text',delta}`，每次模型调用前 `{type:'text',reset:true}`。
- **前端**：输入框重做为一行 `[+][文字][模型][发送]`、换行或放不下占位时控件落到第二行；模型选择器按服务分组、无 key 灰显并说明原因、多于 12 个时带搜索；
  `@` 插入页面文件路径或 `路径#对象 id`（照 pi 的 @file）；回复逐段模糊淡入 + 光标，完成后「复制」「重试」；切换模型时一次彩虹扫光（CSS，无依赖）。
- 验证：后端 234/234；前端 34/34；浏览器 spec 6/6（审阅、停止、英文、流式、选择器灰显、附件到达模型 + @ 插入）；
  真模型：Gemini（默认）与 SiliconFlow DeepSeek-V3.2（新适配器，工具调用 + 40 段流式）各一轮写进讲义。OpenRouter 的 key 已过期，界面显示「密钥无效」。
- 过程中修掉：弹层每次渲染都算位置并写新对象 → 打开菜单即无限重渲染；抽屉隐藏时测宽为 0 导致布局判错（改为 ResizeObserver）；空输入框的占位被挤成三行。
- 收敛冒烟（真模型经 4312，同日）：Gemini 看附图取色改标题（#1F7A3A → #1e7e34）；同一会话切到 SiliconFlow DeepSeek-V3.2 接着改，正确指代上一轮（跨 provider 历史可用）；
  Paratera Claude-Sonnet-5 新会话改色完成。三轮均 `complete`、写进讲义、回复流式到达。
