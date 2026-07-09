# lecture-agent 自迭代日志

`/loop` 驱动的持续增强记录。目标：① 持续增强内容规划 + lecture-gen；② 修每轮暴露的 bug。一轮一 commit。

## Iter 1 — 题材感知规划 + LLM 客户端加固（commit 470f0bd）
- **自测**：生成「宋词的意境与表现手法」(人文题材) → 暴露 bug：规划器硬塞了一个 sim，把"格律严格度→情感"套成假方程 `emotion + 0.3*(1-emotion)*sin(PI*xi) - strictness*...`（伪科学 AI 味）。
- **修复①（内容规划）**：`src/plan.mjs` 改为**题材感知**——只有可量化/可模拟题材才用 sim；人文/艺术/历史/思辨类绝不硬塞。验证：宋词重生成 → 无 sim（改用 compare/flow/table/quiz）；单摆(STEM) → 仍有 sim（无回归）。
- **修复②（robustness，本轮暴露）**：并发生成偶发全量 "JSON 解析失败" 实为 API 限流被误标。`src/llm.mjs` 退避加固（4 次指数退避，429/5xx/网络更长等待）；`src/delegate.mjs` 区分"LLM 调用失败"与"JSON 解析失败"。验证：单摆重试 → 10/10 block 通过。

## Iter 2 — 规划器单点故障加固（robustness）
- **自测**：生成「二分查找算法」→ 暴露 bug：骨架(plan 阶段二)是**单点**，一次 `fetch failed` 直接整轮崩、抛栈。
- **修复（本轮暴露，goal②）**：`src/plan.mjs` 骨架生成加外层 3 次退避重试 + 清晰错误信息（不再裸抛栈）。验证：二分查找重跑 → 7 页/10 block 通过，eval 4/5；且算法题材未被硬塞 sim（iter1 题材感知泛化正常）。
- 注：iter1/2 都因本机→SiliconFlow 网络间歇性抖动而落在"韧性"上；韧性有价值，但下一轮优先推进能力（goal①）。

## Iter 3 — 内容"具体优先"规则（capability，goal①）
- **依据**：iter1/2/3 的 eval topFix 反复是"加个具体例子/错误示例/作品"——内容连贯但偏抽象，是可复用的质量杠杆。
- **增强**：`src/skills.mjs` 的 AUTHORING_RULES 加"**具体优先**"硬规则（真实例子/数据/名称/引文，落到可感具体物），传导到每个 block 生成 + 规划。
- **验证**：生成「光合作用」(初中生) → eval 明确点出内容含具体例子（向日葵光照需求/叶绿体数量/金鱼藻模拟），topFix 从"缺例子"转为"某标题太诗意"（说明具体性已补上）；8 页/11 block 全过，无回归；可量化题材仍正确用 sim。
- 顺手修：iter3 编辑 AUTHORING_RULES 时误加一个反引号会截断模板字符串——已 `node --check` 拦下并修正（教训：改模板字面量后必 --check）。

## Iter 4 — 激活 widget canvas 动画引擎（capability，goal①）
- **自测**：生成「冒泡排序」→ 暴露 gap：排序被硬塞进 `dynamics1d`（又一个题材错配；排序不是一维动力系统）。根因：`create-sim/contracts.json` 只教了 dynamics1d/searchCompare，从没教 `widget`——内置的 canvas 动画引擎被 agent 完全闲置（evolve 里 widget 计数=0）。
- **增强**：给 sim 契约加 `widget` 引擎 + 选型指南（可动画的算法/几何/运动→widget）+ 硬规则（零依赖 vanilla、canvas、读主题 token、控件内置、过反 slop lint）。
- **验证**：冒泡排序重生成 → `engine=widget`，1032 字自包含 canvas 片段、读 getComputedStyle token、过 validateBlock(含 lint+片段契约)；8 页/11 block 全过。首次让 agent 真正用上 canvas 动画引擎。

## Iter 5 — 用 evolve 信号治 dynamics1d 误用（quality，goal①②）
- **信号来源**：`evolve out/`（自演化机制，~0 API）→ sim 引擎分布 dynamics1d=5/7 过载；抽查发现傅里叶用 dynamics1d "合成信号/傅里叶级数"、单摆用 `x+v`（未耦合）——貌似有数学其实错的伪仿真。只有梯度下降 `x-alpha*2*x` 是真递推。
- **修复**：`create-sim` 契约加"防误用"选型指南——dynamics1d 只用于**真一维递推**(x(t+1) 由 x(t) 演化)；合成信号/傅里叶/多变量运动一律走 widget(canvas 动画)或不放 sim。
- **验证**：傅里叶重生成 → 从 2 个伪 dynamics1d 变成 1 个 `widget`(813 字 canvas 动画)，10 页/11 block 全过。
- **又踩同类坑**：编辑 contracts.json 时在 JSON 字符串里写了裸双引号 → 破坏 JSON（同 iter3 模板反引号）。教训固化：改"字符串里嵌的内容"(模板字面量/JSON 串)后必立即校验，且提示语别用会与外层冲突的引号。已沉淀 lessons GEN-28。

## Iter 6 — 页数保真（bug，goal②）
- **自测**：`--pages 3` → 实际出 6 页（2× 超）。根因：规划器硬凑"封面+内容+测验+回顾+收尾"模板，把页数下限抬到 ~6，忽略小页数请求。
- **修复**：`src/plan.mjs` 改为"页数严格 ±1、别为凑模板堆页；≤4 页时省回顾/收尾页，封面后直接进内容"。
- **验证**：`--pages 3` → 5 页(6→5，改善但模型对极小 N 仍偏松)；`--pages 8` → 正好 8 页(无回归)。未加确定性裁剪(风险>收益,极小页数是边缘场景)。

## Iter 7 — 充实 AI 助教知识库（capability，goal①）
- **自测**（0 API，抽查现有 doc 的 tutor）：suggestions/kb 本身质量好（贴知识点、准确），但 **kb 恒为 2 条**——知识库偏薄。
- **增强**：`src/plan.mjs` 加规则——suggestions 3-4 条（含误区）、kb 覆盖主要术语/易混概念 **4-6 条**。
- **验证**：生成「DNA 的结构与复制」→ kb 2→**6** 条（碱基配对/半保留复制/查伽夫法则/解旋酶/磷酸二酯键/沃森-克里克）、suggestions 4 条；7 页/10 block 全过，无回归。

## Iter 8 — 覆盖度审查：完成 STORM 闭环（capability，goal①，最 substantive）
- **动机**：STORM planner 多视角提炼出 mustCover 必讲点，但从没核对它们是否真落进成品。规划保真度不可见。
- **增强**：新 `src/coverage.mjs`——`checkCoverage(doc, perspectives)` 一次 LLM 调用核对 mustCover 是否被充分覆盖 → {total, covered, missing, ratio}。agent 返回 coverage；CLI `--coverage` 打印+存 `out/<id>/coverage.json`（opt-in，避免每次加调用）。
- **验证**：`熵与热力学第二定律 --coverage` → **规划保真度 67%(8/12)**，精确列出 4 个缺失点（能量品质退化/克劳修斯不等式/㶲/实际热机差距）+ 原因。7 页/10 block 全过。
- **意义**：把"计划覆盖 vs 实际内容"对上，得到可度量的规划质量指标；后续可像 eval 一样喂进 evolve 自演化轴。

## Iter 9 — 覆盖度接进 evolve 自演化轴（capability，goal①）
- **增强**：`aggregate.mjs` 识别 `coverage.json` → 聚合平均规划保真度 + 常见缺失点；<70% 时提示"加页/覆盖驱动 revise"。至此 evolve 有**两条质量轴**：内容质量(PPTEval) + 规划保真度(coverage)。
- **验证**：`evolve out` → 📐 规划保真度 平均 79%(2 份) + 列出常见缺失（克劳修斯不等式/㶲/边界证明…）；机器可读 @@EVOLVE_JSON@@ 带 coverage 字段。（顺带观察：widget 引擎使用已从 0→3，iter4/5 生效。）

## Iter 10 — 覆盖驱动 revise + 关键认知：覆盖是"广度诊断"非目标（capability，goal①）
- **做了**：`generate --coverage --revise` 覆盖度<85% 时注入遗漏点重规划取更高者。实测熵 42%→47%（取更优版）。
- **暴露的深层认知**：熵这类富主题，4 视角发散出 15 个 mustCover，7 页**根本装不下**——追全覆盖是跟容量对着干。好课应**少而深**，覆盖<100% 是正常取舍。
- **据此修正**：① `plan.mjs` 加"少而深>面面俱到，覆盖清单只是候选、挑核心讲透"规则；② 把指标从"规划保真度(隐含达标)"**改口径为"覆盖广度(诊断，非越高越好)"**（coverage.mjs + aggregate.mjs 措辞）；③ 覆盖驱动 revise 改为"补最核心的几个遗漏点，不必全覆盖"。
- **观察**：evolve 里 widget 用量 0→4、dynamics1d 5→4，引擎选型修复持续见效。

## Iter 11 — widget 内嵌 JS 语法校验（robustness，goal②）
- **gap**：widget 只查了片段结构 + 反 slop lint，从没校验它 `<script>` 里的 canvas JS 是否语法合法——坏代码能过校验、到浏览器才崩。
- **修复**：`demo/schema/validate.mjs` 的 `checkWidgetHtml` 抽出所有 `<script>` 内容 `new Function(js)` 只查语法（浏览器全局不求值），SyntaxError 即报错。sync 到技能副本。
- **验证**：真 widget 过；坏 widget(`let x = ;`)被抓"Unexpected token ';'"；course.lecture.json 0 错(无回归)。至此 widget 管道 iter4 激活→iter5 路由→iter11 校验，闭环加固。

## Iter 12 — 讲者备注增强（capability，goal①）
- **自测**（0 API，抽查 notes）：notes 全是"总结核心要点""鼓励动手实践"式**一句话占位(6-29 字)**，违背 SPEC"正文克制、细节沉 notes"——讲者拿不到有料的讲稿。
- **先试 prompt 无效**：给 planner 加"notes 要有料"规则，重生成 notes 仍 ~11 字（单次大 JSON 里 notes 被当标签，模型不肯写深）。
- **改用专门增强 pass**：新 `src/notes.mjs` `enrichNotes(doc)` 一次 LLM 调用为每页写 2-4 句讲稿（展开/推导/直觉+误区+数据诚实说明+衔接），agent 在校验后调用（+1 call/次，失败保留原 notes）。
- **验证**：二分查找 notes 11→**116 字**均值，p2 变成"用 [2,5,8,…] 演示+为何链表不能高效二分+重复元素索引不确定性"——真讲稿。教训：大 JSON 里的次要字段靠 prompt 催不动，要独立 pass。

## Iter 13 — 素材接地（material grounding，capability，goal①，最高实用价值）
- **动机**：此前 agent 全凭自身知识生成，易泛化/编造；真实备课要基于**源素材**（教材段落/讲义）。接地=准确、不编、贴合老师的材料。
- **增强**：`--material <file>` → 读文本(截断 4000 字防 token 爆) → 贯穿 plan(多视角提炼从素材来) + 每个 block 生成(内容/例子/数据据素材) + repair。CLI/plan.mjs/delegate.mjs/agent.mjs 全线穿 material。
- **验证**：给一份 KMP 素材(含 next=[0,0,1,2,0] 例、O(n+m)、"next 全 0 退化"误区) → 生成的讲义**全部命中**这些素材特有事实（ABABC/0,0,1,2,0/O(n+m)/退化/最长相等前后缀），证明真接地而非泛讲。

## Iter 14 — 全面回归 sweep + 修"幻觉 block 类型"（robustness，goal②）
- **sweep（0 API）**：node --check 全绿、contracts.json 全合法、baseline 16页过；13 份生成 doc 里 **12 过 1 挂**——`gradient-descent-learning-rate`(iter1 老件)因 $-包裹 formula 被现校验器拒（正是用户当初截图的 bug，那件生成在修复之前）。→ 非回归，是校验器如期抓旧疾。
- **重生成老件**：--id 覆盖重生 → 无 $-包裹 formula、整份合法，**确认 formula-$ 修复在 e2e 生成中根治**。
- **新 bug（重生成时暴露）**：规划器造了个不存在的 type `timeline` → 该块被丢、内容损失。修：① plan.mjs 明令"type 只能从清单选、禁新造(timeline/map/chart 不存在)、要时间轴用 flow/agenda"；② agent.mjs 兜底——未注册 type 回退为 list，内容不丢。
- **信号**：`timeline` 是反复被"想要"的类型（evolve 里也见过"时间轴"）——记为未来可正式收编的 block 候选。

## Iter 15 — 新增 timeline block 类型（capability，goal①；自演化闭环落地）
- **顺着 iter14 信号**：把反复被"想要"的 timeline 从"幻觉类型"收编为**第 17 种正式 block**——这正是自演化机制的兑现（真实反复需求 → 加法式长出新 block）。
- **加法式接入**（一处类型碰 6 处，按扩展点）：validate.mjs(BLOCK_TYPES+校验分支 2-8 事件) + doc-to-deck.js(blockRenderers.timeline 竖向渲染) + index.html(.timeline CSS 走 token，191/191 平衡) + lecture-doc.schema.json(enum+timelineBlock def) + create-content/contracts.json(契约) + sync。
- **验证**：good/bad block 校验正确；timeline 路由到 create-content 且进 autoTypes；e2e「计算机发展简史」**主动用了 2 个 timeline**(各 4 事件，如 1936 图灵机/1941 Z3)、8 页/10 block 全过、无回退。schema 图(docs/…architecture.html)未同步(published 件，留作单独文档任务)。

## Iter 16 — 全管道集成测试 + SPEC 补 timeline（验证/文档，goal②）
- **集成测试**：`--material --eval --coverage` 三特性首次**合并**跑（此前各自单测）——KMP 材料 → eval 4/5(coherence 5)、coverage 56%(措辞正确为"广度诊断")、notes 增强、material 接地(eval 点名 next 数组)、7页/8block 全过，**无集成冲突**。13 calls。
- **文档同步**：SPEC.md §3.1 block 表补上 `timeline`（iter15 新增但漏文档）；sync 刷新技能副本。
- 结论：跨 15 轮改动的各能力可叠加共存，管道稳。schema 架构图仍待单独更新（published 件）。

## Iter 17 — 质量快照(收敛证据) + statement 具体触点微调（measure + capability，goal①）
- **质量快照**（eval 3 个跨领域 doc：history/algorithm/biology）：**全部 overall 4/5、coherence 恒 5/5**、content/pedagogy 4/5。16 轮迭代后系统在多题材上质量稳定良好 = **已收敛**。
- **唯一一致信号**：topFix 反复指向 `statement`(大字收束页)偏抽象。据此给 create-content 的 statement 契约加"可点一个具体触点(例子/数字/意象)锚住，但仍简短"——针对性、不破坏"克制"。（本次重生成该 topic 恰好没排 statement 页，未当场验证，属低风险文案微调。）
- **收敛判断**：已审计 tutor/notes/sim/quiz/coverage/material/页数 均达良好；余下多为 4→5 的边际打磨，再堆 prompt 有过度填充风险。loop 进入 fine-tuning 区间。

## Iter 18 — 稀疏页自动纵向居中（design，goal③：别让页面显得空/只贴一边）
- **动机**（用户本轮新增 goal③）：内容少的普通内容页默认顶对齐（`.body{flex:1}` 撑满高度但内容堆在顶部），底部留一大片空白 = "只向上边缘对齐"，显空。
- **修法（渲染器侧，universal，0 API）**：`doc-to-deck.js` 新增 `balanceScene(section)`，在 `ready`/`slidechanged`/`fonts.ready` 时对**当前页**实测：`body` 子块 `offsetHeight` 之和 + gap vs `body.clientHeight`；内容 < 72% 可用高度即判为稀疏 → `justify-content:center` 纵向居中，不再贴顶。
- **关键正确性**：用 `offsetHeight`（布局像素）比 `clientHeight`，两者同尺度、**不受 reveal 的 CSS 缩放影响**（getBoundingClientRect 会被缩放，故不用）。
- **护栏（防回归）**：① 跳过 `.cover`/`.bigidea`（本就居中）与 `.lab`/`.runlab`/`.widlab`（sim/runnable/widget 按设计填满）；② 尊重作者显式 `layout.centered`（打 `dataset.centered` 标记，只加不覆盖）——基线 6 处 centered 不受影响；③ 近满页（≥72%）保持顶对齐，**不引入溢出风险**。
- **验证**：`node --check` 过；基线 course.lecture.json 仍合法(16 页/23 block)；`getCurrentSlide` API 确认在 vendored reveal 内。**浏览器实测留待补**（本会话无 debug 浏览器/preview 工具）——逻辑与尺度一致性已核，风险低。

## Iter 19 — 长素材保事实浓缩（capability，goal①：内容规划接地增强）
- **动机/bug**：`agent.mjs` 对 `--material` 只做 `.slice(0,4000)` 硬截断——长文档超出部分**静默丢弃**，后半段事实根本不进 grounding。
- **修法**：新增 `src/material.mjs` `condenseMaterial(material,{topic,targetChars,log})`——用一遍 LLM 把长素材压成"保事实摘要"（保留定义/公式/数字/关键例子/术语，删冗余）；**超长(>12000字)分块各自浓缩再合并(map-reduce)**，合并后仍超长则二次浓缩。`agent.mjs` 第 37 行的硬截断替换为 `await condenseMaterial(...)`。
- **不劣于现状护栏**：短素材(≤targetChars)原样返回；任何 LLM 失败/分块失败都**回退到硬截断**——永远不比旧行为差。
- **验证**（1 次真实 LLM 调用）：造 6722 字素材、独特事实放在**第 6638 字**（远超 4000）。结果：→141 字摘要、**非原文前缀**（证明不是截断）、**末段事实（Adam/beta2=0.999）与中段事实（动量/0.9）均保留**、冗余重复段被收敛。直接证明"4000 字后的内容不再被丢弃"。`node --check` 两文件过。

## Iter 20 — e2e 验证 iter19（真管道）+ 修 --id 被静默忽略（verify + bug，goal②）
- **自检（e2e 生成，验证 iter19）**：拼 4 份 DNA 素材=14223 字 → `generate --material --eval`。日志确认 **`[material] 素材 14223 字 → 分 2 块各浓缩再合并`——iter19 的 map-reduce 浓缩在真管道里生效**（不再硬截断）。产物 7 页/10 block 全生成、整档校验过、eval **overall 4/5（coherence 5/5）**、素材接地（前导链/后随链等 DNA 事实入内容）、18 次调用。
- **暴露的 bug**：产物 id 是按 topic slug 的 `dna-replication-mechanism`，而我传了 `--id dna-replication-mat`——**`--id` 被静默忽略**（文档里有此 flag，`opts` 从没读它）。
- **修法**：`bin/lecture-agent.mjs` 在 `persist` 前读 `flag('id')`，规范成 kebab-slug 覆盖 `r.doc.id`（驱动 out/ 目录、预览文件名、doc.id）；放在 revise 块之后 → normal 与 --revise(r2) 两条路都覆盖到；空 slug（如纯中文输入）则保留规划器 slug 不破坏。
- **验证**：`node --check` 过；slug 变换单测 4 例正确（保留合法 kebab / 小写 / 折叠分隔 / 纯中文→空→回退）。

## Iter 21 — 素材浓缩分块改为自然边界切分（quality，goal①：打磨 iter19）
- **动机（iter19 遗留质量点）**：map-reduce 分块用 `slice(i, i+CHUNK)` 硬切，会把句子/段落拦腰截断——每块首尾都是残句，喂给浓缩会降质（残句易被误解或丢事实）。
- **修法**：新增导出 `chunkText(src, size)`——每块 ~size 字，但切点回溯到块尾 25% 窗口内最近的边界（优先级 空行 `\n\n` > 换行 `\n` > 句末标点 `。！？.!?`）；窗口内无边界才硬切。map-reduce 路径改用它。
- **验证**（0 API 单测）：120 段文本→6 块，**无损拼回原文**、**非末块全部在边界收尾、0 拦腰截句**、各块 ≤size；无边界纯文本回退硬切且无损。`node --check` 过。

## Iter 22 — render-verify 增偏空页启发式（verify/design，goal②③）
- **动机**：goal③ 一直强调"别让页面显得空"。iter18 在渲染器兜底（纵向居中），但缺一个**管道侧信号**告诉生成/作者"这页内容太少"。render-verify 已有"过密→疑似溢出"启发式，缺对称的"过疏→疑似偏空"。
- **修法**（`demo/schema/render-verify.mjs`）：加偏空启发式——`densityScore < 3` 且 kind∉{hero,statement} 且非 sim/runnable 满幅页 → 非致命提醒。顺手把 quiz 的 densityScore 从 flat +3 改为 `2+选项/角度数`（更贴实，同时服务过密判断）。
- **调阈值防误报**：初版阈值 <4 把基线 3 个页（两 quiz + 一个 3 行 agenda "boundaries"）误报；quiz 计分修正后消除 quiz 误报，阈值收到 <3 后基线归零误报（避免催生 AI slop 过度填充，呼应 FE-5/FE-21）。
- **验证**（0 API）：基线 16 页 **0 偏空误报**；构造 doc——单条 list（分1）**命中**、widget 满幅页**豁免**、4 项 list（分4）**不报**、hero**豁免**。`node --check` 过。

## Iter 23 — 按 evolve 信号增"难点具象锚点"授权规则（capability，goal①；自演化闭环）
- **数据驱动**：`evolve` 子命令跑通并明确报出——6 份评估**最弱维度恒为 content(4/5)**，且**全部 topFix 同一模式**："在最难的那个概念处补一个具象锚点（worked 例子/反例/分步/类比/图示）"。这正是自演化机制该消费的信号。
- **修法**：`src/skills.mjs` AUTHORING_RULES 新增一条**聚焦规则**——"全课最难的那个概念就地补一个到位的具象锚点帮学生跨门槛；一个足矣、别堆砌"。区别于已有的逐点"具体优先"，专打"crux 深度"。规则同时进**规划器**(plan.mjs skeletonSpec)与**每个 block 生成器**(delegate.mjs SYS)——注入路径已核。
- **验证**：`node --check` 过；注入路径 grep 确认双通道。**证据性生成**（1 次，"反向传播算法" 概念重、易空泛）：content **4/5 不回归**、coherence 5/5、eval 明确夸"例子公式到位、**没有空泛或堆砌**"（"别堆砌"护栏生效）、topFix 从核心概念下移到次要细节（mini-batch 代码示例）。用了 code+compare+quiz+statement 多样块。**注**：单样本+judge 方差 → 是趋势证据非严格证明；严格 A/B 留后。顺带再次确认 iter20 --id 修复(产物目录 backprop-intuition)。

## Iter 24 — 生成流程中透出偏空/偏高页提醒（bug/verify，goal②③）
- **自检**：全套离线 sweep 绿（src 全 `node --check`、基线+19 份生成 doc validate、render-verify 结构断言过）。
- **暴露的 gap**：`persist()` 打印 render-verify 输出时只取**前 2 行**（`slice(0,2)`）——iter22 新增的"偏空/偏高页"提醒排在结构断言行之后，**被截断、生成时作者根本看不到**，等于 iter22 的信号在真实流程里哑火。
- **修法**（`bin/lecture-agent.mjs` persist）：改为打印结构断言头+通过态，并**逐条透出**所有 `· scene# … (偏空|偏高)` 提醒行（`⚠ scene#…`）。
- **验证**（0 API，离线复现 persist 解析）：对稀疏构造 doc 跑 render-verify 再套用相同解析——`[verify]` 头正确、`⚠ scene#thin1 …偏空` 如实透出；基线 0 提醒 → 不打噪声。`node --check` 过。

## Iter 25 — 新增 --plan-only 规划专检模式（capability，goal①）
- **动机**：审"内容规划"质量此前必须跑全量生成(~14 次调用/几分钟)；本 loop 屡次为验证规划改动被迫全量生成，成本高。需要一个只出骨架、不 fan-out 的低成本入口。
- **修法**：`generateLecture` 加 `planOnly` 选项——plan 完成后（骨架+多视角就绪）即返回，不进 fan-out/组装/eval。CLI 加 `--plan-only`：打印规划大纲（逐页 kind/headline/块类型+intent）+ 多视角列表后退出。help 文本同步。
- **验证**（真实跑，2 次调用）："快速排序的分区与递归" → 6 页大纲(hero→flow 分区→agenda 递归树→formula 复杂度→quiz→hero)、4 视角、**LLM 仅 2 次**（vs 全量 ~14）。`node --check` 过。副作用：后续规划类迭代的验证成本降到 ~1/7。

## Iter 26 — 修规划器仍称 timeline "不存在"的陈旧指令（bug，goal①②；iter15 遗留）
- **自检（用 iter25 --plan-only 低成本探针）**：宋词/简谐两题材探规划——发现宋词把"时间轴展示历史事件"排成了 **flow**，而 iter15 已加了专门的 **timeline** 块。
- **根因**：`plan.mjs` 骨架规则第 34 行是 iter15 之前的陈旧文案——仍写"禁止新造类型名（如 **timeline**/map/chart/diagram 都不存在）——想要时间轴就用 flow/agenda/table/list"。但 timeline 现已注册并在 autoTypes 里 → 规划器收到**自相矛盾**指令（清单含 timeline，却又被告知它不存在、时间轴要用 flow），于是时好时坏地退回 flow。
- **修法**：改第 34 行——从"不存在"清单移除 timeline，加正向指引"**编年/历史事件序列用 timeline，别用 flow 凑；flow 留给逻辑/流程/推导链条**"；map/chart/diagram 仍属不存在。
- **验证**（~2 次调用，--plan-only 复探宋词）：现 p2=**timeline**(词人生平轨迹与历史事件)、p3=**flow**(政治经济→功能演变→分化的因果链)——编年归 timeline、因果归 flow，区分到位。`node --check` 过。

## Iter 27 — 修 freeform 文案陈旧计数"15 种正式类型"→16（bug/doc，goal②；同 iter26 一类）
- **自检（顺 iter26 的"陈旧 block 事实"线索做审计）**：grep 全仓 block 类型计数/存在性声明，对齐 live registry（BLOCK_TYPES=17，非 freeform 正式类型=**16**）。
- **发现**：freeform 的说明多处仍写"**15 种**正式类型都不适用"——iter15 加 timeline 后就该是 16，漏改（与 iter26 同源：加类型漏改文案）。散落在 `demo/schema/SPEC.md`(×3)、`lecture-doc.schema.json`(freeform description + rationale desc ×2)、`create-freeform/contracts.json`(×1)。
- **修法**：canonical 三文件 `15 种正式`→`16 种正式`，跑 sync.mjs 刷新 `lecture-doc-schema/references/` 镜像。
- **验证**：两 JSON 仍合法、baseline 仍过(16 页/23 block)、canonical 与镜像均 0 处残留"15 种正式"。（`docs/…architecture.html` 的计数亦可能陈旧，但那是 published artifact，另作文档任务。）
