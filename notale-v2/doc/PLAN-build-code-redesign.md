# Build-code 整改方案：纯算法、外部观察、固定播放

状态：设计候选，尚未实施。2026-09-11 按当前工作树核对。本文不是现行作者契约。

三份作者提示的实际逐行补丁见 [PLAN-build-code-prompts.diff](PLAN-build-code-prompts.diff)。已用 `git apply --check` 确认对应当前原文，未应用。**不能单独应用该补丁：它依赖本文的平台接口、scaffold 和 core.skills 路由一起完成。**

## 1. 目标与不变量

- 左侧只显示可编辑的算法 Python、必要输入与调用；不出现 snapshot/emit、绘图或通信调用。
- 右侧展示当前源码的真实执行过程。框架在执行中分批传送帧，代码高亮和画面始终消费同一帧。播放速度控制展示，不控制 Python 的执行速度；不是断点调试器。
- 保持当前工作台布局、按钮、Monaco、Pyodide、NumPy、本地依赖与独立视觉基础。Planner 与 Director 并行及视觉 Builder 不动。
- 一页仍只有原来的一个 Builder 会话，不新增分析/适配/修复模型阶段，不改变模型、重试、调用上限，不恢复工具顺序门禁。
- 本次属于明确的代码页行为升级，不借整理改动其他链路。旧 runs 不回写。
- 降低认知成本的目标是减少独立接口、重复状态和机制选择；不把少文件、少字符等同于少 token 或更快。

## 2. 当前证据与撤回的建议

当前 `core/builder.py` 对代码页加载专属 tech 与 workflow，不输入 Director 主题。`core/skills.py` 还复制了三调用加载段并按 samples 模式替换，改 SKILL 时必须同步处理，不能仅修改文档。

`tools/code_scaffold/tool.py` 返回七个可编辑文件，包括 lesson.js；复制插入排序课程。与此同时，首轮 Read 又读取完整编辑距离样例。模型收到两套需理解/替换的作者实现。

`vendor/code-workbench/runtime/python-worker.js` 已持有 settrace、行号、序号、序列化、限制；并非这些机制以前全由模型重写。真正需要简化的是每页 raw frame 适配、初始状态与运行状态重复、作者协议字段、重复样例。

执行器目前只在结果消息返回完整 frames；`core/runtime-client.js` 会把任何匹配 id 的消息当作结束，因此不能只给 Worker 加一个 postMessage 就声称流式播放完成。

撤回：在左侧加 snapshot；只改 trace 文件名就声称减负；只观察函数返回而丢掉排序/图遍历的循环过程；以合并 view 文件数量为主要优化。

## 3. 唯一的作者接口

### 3.1 文件所有权

Gemini 编写六个文件：`lesson/starter.py`、`lesson/observe.py`、`lesson/tests.py`、`lesson/view/index.html`、`style.css`、`render.js`。前三个与整个 view 目录属于本页。

lesson.js 改为框架生成、不可编辑。标题/id 来自现有 scaffold 参数；单一入口固定 starter.py，Python 与依赖固定，限制沿用当前默认值。去掉需作者填写的 visualTitle/visualKicker/learningTarget：固定栏只用现有页标题，具体图示标题由 view 表达。不是再增加配置文件。

工作台、共享资源、外层 page HTML、check.py 保持平台所有。CodeScaffold 无参且幂等；第一次创建空作者文件（tests.py 可为空），返回路径与当前内容；重复调用不覆盖已有实现。空产物不会被误判为有效课程。

### 3.2 外部观察器

唯一函数 `observe(context) -> dict | None`。None 表示本次不生成教学帧；dict 就是本页 state，不包第二层协议。不要求 schema、注册表或每课跟踪配置。

context 是宿主提供的固定对象，字段为 function、event（line/return/exception）、locals、globals、return_value。return_value 只在 return 有意义。locals/globals 是当前作用域的只读映射视图，内部值仍是实时 Python 对象；作者不得修改它们或调用会改变算法状态的方法。映射只读不是恶意 Python 安全沙箱。

观察器可按 function/event 选择稳定时机，也可在循环状态可用时返回；不能按固定行号匹配。变量缺失用成员判断，NumPy 数组不用于布尔 or/if。不提供 previous_state：无需在 Python 和 JS 两边都计算变化。

函数返回值、循环中的局部状态和模块全局状态都可观察；不强迫算法为展示而拆函数。观察器不得重新跑算法、修正答案、提供替代算法或生成预制帧。输出缺失时如实显示未捕获状态。

### 3.3 捕获与序列化（平台）

继续使用当前 settrace 机制，不引入 AST 改写、编译器或自动变量语义猜测。只跟踪当前 starter.py；观察器、测试、NumPy/Python 库不进入课程帧。

平台在下一次 line 事件报告上一行执行后的状态；首次 line 不伪造已执行事件。call 初始化跟踪信息而不调用作者。return 提供真实返回值及对应行；exception 保留失败位置与可用状态，不把异常退栈的 return 标成成功完成。递归按实际 frame 隔离跟踪位置。生成器/协程暂停语义不属于本轮支持范围，不能宣称通用 Python 调试器。

作者返回 dict 后立即使用平台序列化并复制，不留 live 引用。支持 None/bool/数值/字符串、列表/元组、字符串键字典、NumPy 标量与数组；复用既有大小/深度限制。非有限值、循环与不支持类型必须给出明确字段路径错误，不把截断数据悄悄当完整算法状态。与现有 serializer 差异须定向测试。

内部帧保留 `{sequence, source:{file,line,column}, state}`；删除作者层 kind/focus/changes/metrics/annotation 固定字段。必要指标、标签属于 state。相邻 state 完全相等时不追加帧，不因行号变化重复生成同一画面；这意味着只高亮产生可见状态变化的教学位置，不承诺每行都播放。

观察器错误：记录首个定位错误并停止继续观察，但继续原算法执行和课程测试；不得重跑算法。计算、观察、测试状态分别报告；页面完整验收仍失败。执行超时/内存或轨迹资源超限仍使用现有保护，不靠继续执行掩盖资源风险。

### 3.4 原生视图

保留 `window.renderNotaleView` 名字与现有三文件挂载；新作者签名为 `({state, previousState, playback, environment}) => void`。state 是唯一数据对象，previousState 在首次渲染/reset 时为 null。playback 与 environment 沿用宿主已有值，不由作者构造。

渲染同步完成 DOM/SVG/Canvas 更新；不返回 Promise、不 fetch、不通信、不独立维护播放循环。需要过渡时用当前状态差异和现有 CSS 能力，减少动态环境直接显示目标状态。播放暂停不承诺 Python 暂停。

运行前没有伪造 state。view 静态 markup 可放图名与图例，平台显示加载/等待提示；首次真实帧后调用作者 renderer。空帧时不调用 renderer(null) 逼作者写第二套空态逻辑。

### 3.5 测试

沿用 `run_tests(namespace)` 和现有结果列表格式，不再改一套测试 API。tests.py 空文件表示无课程断言，Check 明确显示无断言，不伪称测试通过。通常提供代表性数值/结构用例；只在 brief 不涉及确定性正确性时允许为空。

测试运行在追踪关闭后，结果调用算法也不进入播放记录。帧已经是独立拷贝，不受测试修改 namespace 影响。测试失败显示 expected/observed，不依据源码字符串认定算法正确。

## 4. 全流程

### 4.1 创作流程

1. Planner 路由与 brief 不改。Builder 的共用 IDENTITY、设计原则、文案约束、deck_outline 不改；代码页只调整专属契约与样例。
2. 首轮集中 Read 一个 code reference，同时 CodeScaffold；默认不再读完整课程样例。参考末尾只保留一段最小跨语言接口示例。
3. 下一响应写完整六文件实现，可同响应多个 Write/Edit，再接 Check。仍是提示词指导，不执行顺序状态机。
4. Check 执行源码、断言、观察、代表帧渲染、重置；返回实际错误，不给模型增加“先规划适配器”步骤。
5. 有具体错误时定点修复，再 Check；无具体违约则结束。保留既有最终独立产物审计，不在本次顺带删掉。

### 4.2 运行中分批播放

默认按用户“运行时同步播放”理解实现，不是仅执行结束后回放。采用 Worker 内 Python→JS 回调发送已序列化帧：首帧立即发送；后续累计 16 帧或在捕获回调中发现距上批已过 50ms 时发送，结束/错误前 flush。无捕获期间不保证每 50ms 心跳，单个 NumPy 调用内部不能凭空产生中间帧。

现有 request id + Worker generation 继续隔离运行。新增内部 `frames` 消息（id、frames），不结束 run Promise、不清超时；只有 result/error 结束。最终消息报告 tests/errors/stdout/frameCount，不重复带已发送全量帧。客户端主线程保存本轮已接收帧，供回放与 Check 使用。

Python 端批次发送后释放批次内容，只保留去重所需上一状态与计数；主线程保存有上限的完整回放。沿用现有 maxFrames/maxPayloadBytes，不能以不丢帧为理由无限缓存。

首帧可立即显示；后续按现有速度播放。暂时耗尽队列时显示等待并保持最后有效画面；新帧到达仅在用户未暂停时继续。执行结束但尚有缓存时继续播放。减少动态效果时不自动逐帧播放，结束显示末帧。

Runtime error 保留已接收帧和源码错误位置，停止自动播放并定位最后有效帧；观察/渲染错误单独标明。超时/Worker 错误也保留主线程收到的帧；旧 generation 的迟到消息永不更新新运行。

暂停/单步只操作已接收帧，后台计算继续；运行中到队尾的单步不伪造新帧。Run 保留现有忙碌限制；Reset 可取消当前执行并重建 Worker。源代码编辑时取消旧运行、清理旧帧并移除高亮，避免高亮映射到改过的源码；输入可继续编辑。

### 4.3 初态、重置与缓存

运行时与 view 就绪后，对未被用户编辑的默认源码执行一次初始化运行；只显示真实首帧，不自动播放，记录默认执行结果。初始化失败就显示失败，不恢复手写 initialStep。

若加载中用户已编辑，不自动执行或覆盖编辑内容，等待手动 Run。Reset 恢复默认源码；有成功的默认记录则恢复其首帧与默认结果，并清理用户运行状态。没有成功缓存则重新进行初始化运行。不得把某次编辑后运行结果当默认记录。

缓存只在本页内存，绑定默认源码和本次作者资源；重新加载页面重新执行，不增加跨页/磁盘缓存系统。CodeLab.getState 和 Check 的 reset 预期同步更新：等待默认初始化终态再取基准。

## 5. 提示词逐项 diff（仅计划，不修改当前输入）

### 5.1 明确保留，diff = 0

`core/builder.py::IDENTITY` 全文、philosophy、anti_slop_copy、deck_outline、环境路径块、Planner/Director 提示词、模型设置、通用 Check 提示不变。此前恢复的“首轮集中 Read → 尽早实现”句子不再擅改。

IDENTITY 中仍有“违反顺序会停止”历史措辞，与已删门禁不完全一致；本轮按用户此前要求原样保留，不把更改共用提示作为代码重构的隐含步骤。

### 5.2 prompts/tech-code.md：整段替换为下文

```text
# 代码页技术契约

用 CodeScaffold 创建固定 Python 工作台，只编辑它返回的作者文件。
首轮集中读取后，直接完成本页算法、观察器、视图和必要测试；可在同一响应写多个文件，再 Check。局部修改用 Edit。
左侧代码只含算法、输入和调用；不得加入绘图、snapshot/emit 或通信代码。
工作台、资源、配置、播放与运行保护由宿主维护，不巡读或修改共享实现，不读取其他页面。
作者接口只看 references/code.md。代码页沿用工作台独立风格，不套用讲义主题；只用本地 Python 标准库与 NumPy。
```

删除原 tech 中重复的 trace/初态/字体规则；真实执行、种子与字号只在下面 reference 保留一次，并非取消这些约束。

### 5.3 skills/build-code/SKILL.md：保留 frontmatter，正文整段替换

```text
# Build Code

Build an editable Python algorithm on the left and a visualization of its actual execution on the right. The workbench is already implemented.

In your first response, call Read(<skill-dir>/references/code.md) and CodeScaffold(). Read them together; then implement the complete author files returned by the scaffold.

The reference contains the only author API and a minimal example. Do not read another course sample or inspect the fixed runtime. After implementation, use targeted reads for concrete errors.

CodeScaffold is idempotent and returns editable paths with current contents. Edit only those files. Complete the algorithm, observer, view, and necessary tests, then Check.
```

同步 `core/skills.py`：删除 _CODE_ONE/_CODE_NONE 的正文拷贝与 code 文本锚点替换。code 在 mini/none 模式下均只有本段加载流程，不生成 aux catalog。两种选项对视觉 workflow 的语义不变；在维护文档注明 code 不再有完整样例消融，不能把该实验选项悄悄描述为仍控制 code 样例。

### 5.4 references/code.md：全文替换为以下作者契约

```text
# Code author contract

## Deliverables
Edit only starter.py, observe.py, tests.py and view/{index.html,style.css,render.js} returned by CodeScaffold. The host owns all other files and controls.

starter.py is the exact source shown and executed. Use Python standard library or NumPy, deterministic inputs and a fixed seed when random. Keep algorithm code free of visualization calls. Show the algorithm's essential intermediate process, not a prerecorded animation or only a final answer.

## Observe
Define observe(context) in observe.py. Return a state dict for a meaningful step, or None to skip it. State is your page-specific data; do not wrap it in a packet.
context.function identifies the executing function ("<module>" at top level); context.event is line, return or exception. context.locals/globals expose current variables; context.return_value is available on return. A line observation describes the previous line's executed state. Filter by function/event or available data, never fixed source line numbers.
Observe values without mutating them or re-running the algorithm. Variables can be missing or partially updated: check membership explicitly; never use a NumPy array as a boolean fallback. Prefer stable function returns when sufficient, but retain meaningful loop states when they explain the algorithm.
Return only needed scalars, strings, lists/tuples, string-key dicts or NumPy arrays/scalars. The host copies/serializes them immediately and supplies source positions and frame numbers. Unsupported/cyclic/non-finite values report an observation error. Repeated identical state is skipped.

## Render
view/index.html is body markup only; place styles in style.css and code in render.js. No external scripts, network calls or messaging. Use the host's existing native-view foundation.
Define window.renderNotaleView = ({state, previousState, playback, environment}) => { ... }.
The host calls it only with a real state. previousState is null on first/reset render. Use the same state fields your observer produces; don't invent a separate initial state. Build/update native DOM, SVG or Canvas synchronously. Do not return a Promise, start a playback loop or recompute the algorithm in JavaScript.
playback provides index/count/playing/speed/reason; count may grow during execution. environment.reducedMotion disables decorative transitions. The host handles loading, empty/error states, timing, source highlighting and reset.
Make the algorithm's changing structure the main visual. Avoid irrelevant panels. Use the existing dark workbench foundation, cyan for ordinary state, amber for active operations, violet for established results and red for errors; don't rely on color alone. Body text >=16px, labels/captions >=14px, numeric ticks >=12px; multiline line-height >=1.35.

## Test and finish
tests.py defines run_tests(namespace), returning [{"name":str,"passed":bool,"expected":value,"observed":value,"message":str}]. Use actual executed functions/results and representative correctness cases, not source-string assertions. Empty tests.py means no course assertions, not proof of correctness.
Check verifies current source execution, tests, observed frames, first/representative/final rendered states and reset. Platform editor/Worker/timeout tests are not per-course work. Repair concrete errors at the reported file/line; preserve expected and observed evidence rather than changing answers to match the picture. Once execution and the intended visual process work with no concrete violations, finish.

## Minimal interface example — not a layout template
starter.py:
    def prefix_sums(values):
        totals = []
        total = 0
        for value in values:
            total += value
            totals.append(total)
        return totals
    result = prefix_sums([2, 3, 1])

observe.py:
    def observe(context):
        if context.function != "prefix_sums":
            return None
        if context.event not in ("line", "return") or "totals" not in context.locals:
            return None
        return {"totals": context.locals["totals"]}

view/index.html:
    <div id="totals"></div>
view/render.js:
    window.renderNotaleView = ({state}) => {
      document.getElementById("totals").textContent = state.totals.join(" → ");
    };

This example shows the growing prefix results; identical states are skipped by the host. Use a subject-specific graphic rather than copying this text-only view. When only a completed function result matters, filter event == "return" and use context.return_value.
```

全文替换意味着旧文中的角色边界/五种 trace 策略/完整 packet/initialStep/多种算法分类表/逐项平台验收全部退出作者输入。安全、执行语义与平台回归移到维护文档和测试，不重复灌给 Builder。

### 5.5 CodeScaffold 工具文案与结果 diff

```diff
- It is idempotent and returns every page-owned editable file with its current content.
+ It is idempotent and returns only the editable algorithm, observer, tests and native-view files with their current contents. The workbench and configuration are host-owned.
- editable: lesson/lesson.js, lesson/starter.py, lesson/trace.py, ...
+ editable: lesson/starter.py, lesson/observe.py, lesson/tests.py, lesson/view/index.html, lesson/view/style.css, lesson/view/render.js
- 初次返回完整插入排序课程
+ 初次返回空作者文件；重复返回已有内容，不覆写
```

工具 schema 仍为无参数，返回路径字段沿用现有名称；不引入第二份接口说明或“生成计划”字段。

### 5.6 Check 代码页反馈 diff

不增加模型解释步骤；在既有代码检查输出内定位失败阶段与作者路径。保留 stdout、实际断言结果及需要的截图，不以更短反馈掩盖失败。

```diff
- trace.py 捕获失败：KeyError: 'db2'
+ observe.py:18 [observation] KeyError: 'db2'
+ 当前函数 backward；事件 line；可用局部变量：dW2, ...；相关源码：...
- 可视化错误：Cannot read properties of undefined
+ lesson/view/render.js:42 [render] Cannot read properties of undefined
+ 当前 state 字段：inputs, prediction；帧：7；相关源码：...
```

仅列字段名和相关短源码，不倾倒全部矩阵/locals；浏览器桥保留 filename/line/column/stack，经工具映射到作者路径。捕捉不到列号就省略，不伪造精确位置。通过时简述实际运行/断言/观察/渲染/reset 状态，不泛泛要求继续优化。

## 6. 实施顺序与文件落点

1. 保存当前基线与固定代码页 brief、模型配置、实际 system/tool 输入、源码哈希。先不提交整个脏工作树，不动其他用户改动。
2. 平台观察接口：python-worker 的 capture/finalize 改 observe；单测固定 context、after-line、return、exception、递归、NumPy 与资源限制。旧适配方式不在新运行时保留双轨。
3. 运行中播放：Worker 分批消息 → runtime-client 非终态处理 → workbench 队列/初始化/reset → native-view bridge 新数据入口。只改平台，先用手工夹具证明数据真实与交互正确。
4. 作者交付：scaffold 六文件和宿主配置、写权限精确列表、skill/reference/tech/core.skills 路由同时切换。去掉初态依赖与旧示例读取。工具边界要用 resolved path 校验，阻止通过 symlink/.. 写宿主配置，不扩大到其他 workflow。
5. Check 与最终审计消费新结果；脚手架自带 check.py、工作台测试、样例与相关离线 prompt 测试一并同步。旧完整 edit-distance 样例及旧 bundle 先确认无活引用后归档到外层 legacy，不散留另一套可供 Read 的活契约。
6. 更新维护架构说明及 doc 索引；新实验用新 run。禁止对已含旧 code-runtime 的 run 原地重新 scaffold 混装；明确报版本不匹配并要求新 run，不自动迁移旧产物。新模板标记版本，用于产物格式识别，不作为模型审美门禁。

## 7. 验证与对照实验

### 离线/手工夹具

- 纯算法源码不含展示调用，左侧执行内容与编辑器一致；修改输入改变真实帧与结果。
- 循环累积、函数返回/递归、NumPy MLP 三类小夹具；不把整套真实课程当平台测试。
- 序列化即拷贝、相同 state 去重、缺变量/部分赋值、异常退栈、观察器失败不改计算结果、测试不入轨迹。
- 帧先于 result 到达；中间消息不清超时；终态不重复帧；暂停时计算继续、队尾等待、reset/编辑取消、旧 generation 忽略、超时保留已收帧。
- 默认初始化/用户加载中编辑/无缓存 reset/有缓存 reset/无帧/渲染错误均有明确状态；高亮与右侧同帧。
- 本轮锁定 layout/buttons 无改版；普通页 prompt 与工具 schema 离线等价。code samples mini/none/aux 路由不再触发旧锚点错误。

开发小循环按 AGENTS 的 60 秒默认预算做定向验证；超过预算报告而非静默扩全量。共享运行协议合并时提前说明一次必要组合回归，失败后只重跑受影响项。本设计阶段只核对文档，不运行模型或浏览器。

### 付费验证（实施完成后才执行）

冻结 `original-prompt-neural-0911-162519` 的 page-16 brief，直接测 Builder，不重跑 Planner/Director。第二个样本用循环/二维状态的编辑距离代码页，验证不是对 MLP 特化。两次均使用该轮明确确认的同一个 provider/model/effort；不因文字中提到 Gemini 而暗自把历史代码模型从 DeepSeek 换掉。若用户明确改用 Gemini，则旧架构也用同一个 Gemini 配置补一个对照，不能跨模型归因。

每页记录：首次模型输入和首轮工具返回的字符数及真实 token、首个 Write 时间、首个 Check 时间/是否通过、模型响应累计耗时、工具耗时、修复轮次、输出 token 与实付/按价估算费用。截图只验证代表帧，不全页盲评。两样本不足以证明稳定统计收益；报告单次结果与首版错误是否消失，不保证六分钟。

不新增强制调用次数/字数/帧数下限。成功标准：纯代码与真实同步可视化成立，原先重复状态与 raw frame 协议从作者输入消失，平台回归通过，代码页可完整交付；降本提速必须以同配置观测为据，未改善就继续定位而非宣称重构成功。

## 8. 自我审计与产品取舍

- 仍需观察器：跨领域语义不能凭平台自动知道。简化不等于万能自动可视化。
- context 不会消灭半初始化变量；最小样例和接口必须诚实说明，不能用默认空数组掩盖缺失。
- streaming 增加的是平台复杂度，默认采用以贴合“运行时播放”；不进入作者提示中的通信细节。
- 不引入按函数名配置的 DSL；一个普通观察函数已足够，不再添第二种 selector 接口。
- 原“默认完整逐行语义回放”收敛为有意义的执行状态，但循环过程不得退化为仅最终值。源码高亮是所显示状态的来源，不假称 CPU 正执行该行。
- 初始化后才有真实算法画面，取消独立伪造初态；加载期间静态结构/说明保留。这是明确体验取舍，不是无成本删除。
- 当前计划只设计，不实现。下一步实施前需明确实验模型配置；不影响平台代码设计本身。

### 文档完成核对

| 要求 | 方案位置与核对结果 |
|---|---|
| 左侧纯算法、右侧真实过程 | §1/§3；无显式展示调用；保留循环观察 |
| Gemini 与外部框架边界 | §3 六个作者文件，其余框架持有 |
| 每个环节与生命周期 | §4 创作、流式传输、播放、编辑取消、失败、初始化、重置 |
| 每段提示词 diff | §5 变动清单、完整替换稿、独立可核对 diff；共用块明确为零变动 |
| 降低认知成本 | 单一 observe 接口、唯一 state、删除双样例与手写初态、宿主配置移出作者 |
| 实施顺序与迁移 | §6；先平台后作者契约、旧 run 不混装、不回写 |
| 快速验证与控制变量 | §7；手工夹具先行、固定 brief、同模型配置，不增加模型阶段 |

文本测量：现有 reference 为 16,024 字符、完整 sample 为 13,243 字符；新 reference（含最小示例）为 4,546 字符。默认首轮这两项由 29,267 降到 4,546，减少 24,721 字符（约 84.5%）。这不包含 system、工具 schema、scaffold 返回，也不是 token 或耗时降幅；实际 token 必须在冻结输入后测量。

本轮仅做来源核对、文档文本与补丁可应用性检查。尚未证明拟议运行器正确或实验提速，实施验收不得引用这张表冒充运行测试。

## 9. 原理依据

仓库 pyodide-lock.json 当前标明 Python 3.14.2、ABI 2026_0。Python 的 line 事件发生在将执行一行之前，return/exception 是不同事件，因此 after-line 与异常退出必须由平台处理，不能让每课猜时机：[Python sys.settrace 官方文档](https://docs.python.org/3.14/library/sys.html#sys.settrace)。

Pyodide 支持注册 JS 模块并从 Python 调用，Worker 隔离 UI；这支持拟议的批次桥接方向，但不等于本地版本已经验证流式链路：[JS API](https://pyodide.org/en/0.27.6/usage/api/js-api.html#pyodide.registerJsModule)、[Worker 指南](https://pyodide.org/en/stable/usage/webworker.html)。实施以仓库自带 Pyodide 版本为准，不升级依赖来迁就方案。
