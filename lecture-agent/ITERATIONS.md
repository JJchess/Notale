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

## Iter 28 — 加"block 类型事实一致性" meta-test，防 iter26/27 复发（prevent，goal②）
- **动机**：iter26/27 连着两次同一类漂移——加了 block 类型却漏改某处 prompt/文档事实。与其再逐个手修，不如加个守卫从源头挡住复发。
- **修法**：新增 `tools/check-consistency.mjs`（+ `npm run check`）——以 live registry 为权威，两项交叉核对：**Check A** plan.mjs 的"都不存在"禁用清单里不得含任何已注册类型（iter26 类）；**Check B** SPEC/schema/create-freeform 里所有"N 种正式"计数须等于 `BLOCK_TYPES` 非 freeform 数（iter27 类，本轮覆盖 6 处）。
- **验证**：正例通过（registry 17/正式 16，6 处计数对齐）；**两个反例各命中**——把某计数改 14→报"应为 16"、把已注册 `list` 塞进禁用清单→报"列为不存在"，均 exit 1；git 还原后复跑通过。这套检查若早存在会同时抓住 iter26+27。`node --check` + package.json JSON 均过。

## Iter 29 — 收紧 timeline/flow 区分：编年(有时间点) vs 步骤(无时间点)（quality，goal①；iter26 微调）
- **自检（--plan-only 探针）**：探"文艺复兴透视法"发现 p4 把"分步拆解透视**构建过程**"排成了 timeline——iter26 的 nudge 让规划器把"分步/过程"也误当 timeline（timeline 应仅限编年）。
- **修法**：`plan.mjs` 第 34 行再收紧——"**timeline 只用于有明确时间点的编年/历史序列（年代、发展史、里程碑）；无时间点的步骤/流程/推导/构建过程一律用 flow（timeline 不是'分步'的意思）**"。
- **验证（双向，~4 次调用）**：① 复探透视法——过程页改回 `flow`/`list`、**无 timeline 误用**；② 探"青霉素发现史"——p2 正确用 `timeline`(1928→1938→1942→1944 真实年代)、机制页用 `flow`。编年归 timeline、过程归 flow，两向都对。`node --check` + `npm run check`(iter28 一致性) 均过。

## Iter 30 — 合并离线自检为 `npm test`（OSS 硬化，goal②）
- **动机**：前 12 轮的确定性检查一直手跑、零散（node --check / validate / render-verify / consistency 各敲一遍）。开源项目该有一条 `npm test` 一键跑通；本 loop 自身也能用它替代逐轮手拼 sweep。
- **修法**：新增 `tools/test.mjs`（+ `npm test`）——① 全部 .mjs `node --check`（17 个）② 契约一致性(iter28) ③ 基线 doc validate ④ 基线 render-verify 结构断言 ⑤ 技能 contracts.json 合法 JSON 且只声明真实 block 类型。逐项 ✓/✗、任一失败 exit 1。
- **验证**：正例全 5 项过、exit 0；注入漂移(某计数改 13)→步骤②报 ✗ 具体错误、其余续跑、总 "✗ 失败 1 项" exit 1；git 还原后复跑全过。`node --check` + package.json JSON 均过。
- **边界**：不含端到端 LLM 生成与真实浏览器渲染（各需外部资源，另行验）——test.mjs 头注已写明。

## Iter 31 — 补齐真实浏览器渲染验收（verify，goal②③；30 轮最大的验证空白）
- **动机**：iter18 balanceScene、§十三 可插拔主题、逐页 0 溢出等大量渲染/版式代码，历轮都因本机 preview MCP 不可用而**从未在真浏览器里验过**（memory 反复记"浏览器实测留待补"）。这是全项目最大的验证盲区，直接影响 goal③ 的每一步 UX 改动都无法确认。
- **修法**：新增 `tools/render-check.mjs`（+ `npm run render-check`）——**零依赖**（贴合项目零运行时依赖信条）：Node 内置 http 起本地静态服（异步天生不死锁，无需 Python ThreadingHTTPServer）、内置全局 WebSocket 手写极简 CDP 客户端驱动**系统 Edge/Chrome 无头**（新版 headless 已移除 /json/new，改用 `Target.createTarget`+`attachToTarget` flatten 会话）。断言：A 分页数>0、B 全程 0 console error/异常、C 四字体 loaded、D 逐页 0 横向溢出（.pad scrollWidth≤clientWidth，布局像素不受 reveal 缩放影响）、E **iter18 balanceScene 规则真生效**（页内重算内容/可用高度比，<72% 应 justifyContent==='center'，与实际 computed style 交叉核对）。
- **不进 `npm test`**：需外部浏览器（非纯离线），独立脚本；头注写明。
- **验证（真浏览器，本项目史上首次）**：基线 course.lecture.json → **16 页、0 溢出、0 console error、四字体 loaded、balanceScene 3 页判稀疏并居中**——iter18 机制首次得到真浏览器确证。`?theme=lab` 与 `?theme=cobalt-grid` 均 data-theme 正确切换、同样全绿——§十三 可插拔主题层首次真浏览器验收通过。`node --check` 过。
- **意义**：把项目最大的验证盲区补上；此后所有 goal③ 版式/交互改动都可 `npm run render-check` 真机回归，不再"逻辑已核、浏览器留待补"。

## Iter 32 — render-check 批量模式 + 用它抓出并修两个真 bug（robustness，goal②；iter31 立即兑现）
- **动机**：iter31 的 render-check 每份都重启浏览器(~30s/份)，19 份生成 doc 跑不完(5min 超时)。且只验了手写基线；**真正的版式/崩溃 bug 藏在 LLM 生成的多样内容里**，从没真机验过。
- **A 批量模式**（`tools/render-check.mjs` 重构）：抽出 `verifyScene(cdp,url,label)`——每份开一个 Target 标签页、跑 A-E 断言、收尾 `Target.closeTarget`；`main` **只启一次浏览器**迭代所有场景。新增 `--all-generated`（扫 `demo/generated/*.lecture.json` 全验）；单份/`?theme=`/`--doc` 行为保留。CDP 类加 `off()` 摘监听防串台。19 份一次浏览器跑完（vs 逐份重启）。
- **抓到 2 个真 bug（首次真机全量扫生成物）**：
  - **① 渲染器崩溃（高危）**：`simple-pendulum` 的 `dynamics1d` sim **无 regimes** → `doc-to-deck.js:447` `regimes.find()||regimes[len-1]` 双双 undefined → `reg.tone` 抛 `TypeError`，**整页渲染中断**。根因是校验器 `(b.regimes||[])` 放行了 0 regime。
  - **② 横向溢出**：`matrix-eigenvalues-eigenvectors` 第 2 页溢出 266px（内容级版式，留待 iter33）。
- **双向修 ①**：① **校验器**(`validate.mjs`)dynamics1d 分支加"至少 1 个 regime"硬校验——生成侧自修环从此拦住(治本，防再生成)；② **渲染器**(`doc-to-deck.js`)`reg` 兜底 `|| {tone:'ink',desc:'',label:''}`——任何漏网/旧/手改 doc 都不再崩(纵深防御)。
- **验证**：`node --check` 两文件过；`sync.mjs` 刷新技能镜像；`npm test` 基线仍全绿(基线 dynamics1d 本就带 regimes)；负例(regime-less dynamics1d)→ 精确报 `$block.regimes — 至少需 1 个 regime`；`simple-pendulum`(仍是旧 0-regime 产物)真机重验 → **0 console error**，崩溃根治。
- **意义**：iter31 的验收能力立刻兑现成 2 个真 bug 的定位+修复；`npm run render-check --all-generated` 成为生成物的真机回归网。**下一步 iter33**：修 matrix #2 的 266px 溢出（查是渲染器普适问题还是该 doc 内容过宽）。

## Iter 33 — 长公式/宽内容永不撑破页面（红线：逐页 0 横向溢出，goal②③）
- **动机**：iter32 抓到 `matrix-eigenvalues-eigenvectors` 第 2 页横向溢出 266px，留待本轮查根因。真机复现：该页一个超长特征多项式 `\det(A-\lambda I)=(-1)^n\lambda^n+\cdots` + 一个 `compare` 双矩阵并排。
- **定性（普适 vs 内容级）**：查渲染器 `doc-to-deck.js` + `index.html` CSS——`.mblock`（KaTeX display）**无横向溢出兜底**，`.cols`（compare 两列）**缺 `min-width:0` 护栏**（而 `.grid-block` 早已有 line 112）。故**任何 doc 的长公式都会撑破页面**——是渲染器普适问题，不是该 doc 内容特例。据 loop 哲学 A，"逐页 0 横向溢出"是 harness 断言 D 钉死的**红线**，应在渲染器治本，而非改单份 doc 内容。
- **修法（2 处极小 CSS，治本、惠及全部 doc）**：① `.mblock{ max-width:100%; overflow-x:auto; }`——超长公式横向自滚动，绝不撑破页；② `.cols > *{ min-width:0; }`——列内宽内容不再撑破 1fr 网格，与既有 `.grid-block > *` 护栏对齐。
- **验证（真浏览器）**：matrix doc → 从 `D: 1 页横向溢出 #2(266px)` 转为**全绿（0 溢出）**；基线 course（16 页）、`fourier-transform`（公式密集，10 页）真机复验均全绿无回归；`npm test` 全 5 项离线自检过。
- **类型**：红线（横向溢出属 harness D 钉死的不变量）· 加法（补渲染器缺失的溢出兜底护栏，非堆功能）。

## Iter 34 — 补上 block 类型漂移的最后缺口：schema enum ≡ BLOCK_TYPES（一致性硬校验，goal①）
- **全局扫描**：本轮先真机全量跑 `render-check --all-generated`——**19 份生成 doc 全绿**（分页/字体/0 溢出/balanceScene/0 console error），iter33 的溢出修复对全语料无回归、红线健康。`out/`、`demo/generated/` 均已 gitignore 且未入库，无死产物可清。故转向 goal① 的一致性。
- **发现的真缺口**：项目有两份独立的权威 block 类型清单——`validate.mjs` 的 `BLOCK_TYPES`（手写校验器，零依赖，不读 schema）与 `lecture-doc.schema.json` 的 `$defs/block/properties/type.enum`。而 iter28 的 `check-consistency` 只核对 plan.mjs 禁用清单(Check A)与文档"N 种正式"**计数文本**(Check B)，**从不比对 schema enum 本体**。即：加了新 block 类型却漏同步 schema enum，现有测试抓不到——正是 iter26/27 反复出现的"加类型漏改某处"漂移类的最后缺口。
- **修法（Check C，加法）**：`check-consistency.mjs` 增 Check C——JSON.parse schema、递归定位含 `freeform` 的那一处 block 类型 enum（断言恰好 1 处，防结构漂移），与 `BLOCK_TYPES` 做**双向集合比对**，任一方多/缺都精确报出是"校验器漏加"还是"schema 漏同步"。
- **归类**：红线（block 类型事实一致性属"钉死不变量"）· 加法。收紧理由**有据**：该漂移类已在 iter26、iter27 两次真实发生（≥2 次），非提前上镣铐。
- **验证**：正例全过 exit 0；负例（临时从 schema enum 删 `grid`）→ 精确报 `BLOCK_TYPES 有而 schema enum 无: grid（schema 漏同步？）` exit 1；还原后复跑 OK；`npm test` 全 5 项过（Check C 已并入步骤② check-consistency）。

## Iter 35 — sync 加 --check 新鲜度校验并入 npm test：堵住"改契约漏跑 sync"漂移（一致性，goal①）
- **全局扫描**：先查 src/ 全部 export 均被引用（无死代码）、基础 helper(escapeHtml/inlineMd) 无重复实现——代码本已精简，无可硬砍。转而审 `demo/schema/`(权威) 与 `skills/lecture-doc-schema/`(镜像) 的一致性：当前全一致（仅差 sync 注入的 banner），但**发现真缺口**。
- **缺口**：`sync.mjs` 是单向生成器，**无任何新鲜度守卫**。改了 `demo/schema/*`(如 iter32 改 validate.mjs) 却忘跑 `node lecture-agent/sync.mjs`，技能镜像就静默过期，没有测试会发现——正是 iter27/32 每次改契约都要手动 sync 的漂移类，靠人肉记忆兜底。
- **修法（做薄式加法：复用 sync 自身逻辑，零重复）**：① `sync.mjs` 重构——把「镜像应有内容」算成一张 `targets` 表，写入(默认)与校验(`--check`)共用同一张表（banner/路径/shebang 处理只写一遍）；`--check` 逐个比对磁盘现状 vs 应有内容、报出过期项、exit 1；用 `\r\n→\n` 归一化抹平 git autocrlf 假阳性。② `test.mjs` 加步骤⑥跑 `sync.mjs --check`，并入 `npm test`。
- **归类**：红线（契约镜像一致性属"钉死不变量"）· 加法（补守卫）。收紧**有据**：改契约漏 sync 的风险在 iter27、iter32 两次真实出现（≥2 次）。
- **验证**：`sync --check` 正例过 exit 0（5 文件一致）；负例（篡改镜像 validate.mjs）→ 精确报 `scripts/validate.mjs（与 demo/schema 源不一致）` exit 1；还原后过；`npm test` 6 步全绿。

## Iter 36 — render-check 补纵向溢出断言 F：抓出内容被裁的红线盲区（verify，goal②）
- **全局扫描**：先审生成提示词（plan.mjs 骨架规则 vs skills.mjs AUTHORING_RULES）——二者作用域不同（骨架结构 vs 块内容创作），重叠极少，强行合并会伤质量，不做。转查 render-check 的断言覆盖，**发现真盲区**。
- **盲区**：`.pad{height:100%}` + body `overflow:hidden` → 内容比页高就被**静默裁掉**，学生看不到底部。而 render-check 只测 `overflowX`(断言 D 横向)，**从不测纵向**——与"内容不可被截断"这条红线之间是缺口。
- **修法（加法，几乎零成本对称补齐）**：perSlide 走查里在 `overflowX` 旁加 `overflowY = pad.scrollHeight - pad.clientHeight`；新增断言 F——纵向溢出 >4px（放宽避亚像素假阳性）即失败、逐页报 px。头注同步补 F。
- **立刻兑现：抓到 3 个真 bug（3 份不同 doc，≥2 次 → 坐实红线级）**：`computer-history` #2(59px)、`dna-replication-mechanism` #3(97px)、`simple-pendulum` #1(16px)——内容超页高被裁。基线 course 16 页仍全绿（F 通过）。
- **归类**：红线（内容被裁不可见，与横向溢出同级）· 加法（补验证维度）。收紧**有据**：一次普查即 3 份命中。
- **验证**：`node --check` 过；基线 render-check 全绿（含新 F）；`npm test` 6 步不受影响（F 仅在需浏览器的 render-check，未进离线 test）。3 份命中的是 gitignore 的可再生成样例产物(demo/generated/)，**非提交源**，故提交源零破坏。
- **下一步 iter37 候选**：修纵向裁切。两条路——(a) 渲染器加"过高页等比缩小到放下"的对称机制（balanceScene 现只处理偏稀疏页，需用 zoom 等**影响布局**的缩放，非 transform 视觉缩放，且要避开 lab/sim/CodeMirror 子树，属需独立验证的较大改动）；(b) 重新生成这 3 份样例（需 LLM）。优先评估 (a) 的普适性与风险。

## Iter 37 — balanceScene 对称补齐：过高页 zoom 自适应缩放，根治纵向裁切（红线修复，goal②③）
- **动机**：iter36 断言 F 抓出 3 份 doc 内容超页高被 `overflow:hidden` 裁掉（computer-history/dna-replication-mechanism/simple-pendulum）。本轮治本。
- **定性（普适 vs 内容级）**：iter18 的 `balanceScene` 只处理**偏稀疏**页（内容 <72% 高 → 垂直居中），对**偏满溢出**页无对策——是渲染器的对称缺口，任何超高页都会被裁，普适问题。据哲学 A，"内容不可被截断"是断言 F 钉死的红线，在渲染器治本。
- **修法（对称加法，一处 balanceScene）**：测出 `contentH > avail` 时，`body.style.zoom = max(0.8, avail/contentH)` 等比缩到刚好放下。关键取舍：用 **zoom 而非 transform**——zoom 影响布局(Chromium/Edge/新版 FF)，`scrollHeight` 随之收缩、真正不裁；transform 只做视觉缩放救不了 `scrollHeight`。下限 0.8 防过度缩小伤可读；lab/runlab/widlab(sim/代码/CodeMirror)已提前 return 不受 zoom 影响（避 FE-48）。测量前同时复位 `zoom` 与 `justifyContent`，防测到上次态。
- **经验性验证优先**（zoom×flex 跨引擎行为有歧义，不空想）：先在 3 份命中 doc 上实测 → F 全清。
- **归类**：红线（防内容裁切）· 加法（补对称缩放）。收紧**有据**：iter36 一次普查 3 份命中（≥2）。
- **验证**：3 份命中 doc 复验 F 全清；**全量 19 份 + 基线 16 页全绿**（分页/字体/0 横纵溢出/balanceScene/0 console error）；`centered` 计数与 iter34 逐份一致 → 居中路径(E)未被扰动（zoom 与居中互斥：仅 contentH>avail 触发 zoom、<0.72 触发居中）；`npm test` 6 步全绿。

## Iter 38 — renderBlock 全局崩溃兜底：任一坏块降级占位，不拖垮整份讲义（红线治本，goal②）
- **全局扫描**：先查内容质量证据——语料填充语仅 1 份命中(<2 不收紧)、疑似原始 HTML 全是 widget/custom sim 的合法源码(非违规)，故 goal① 无可据收紧项。转查渲染器安全：`compileExpr`(受限表达式)白名单扎实（字符类+标识符双白名单，`constructor`/`[]`/字符串/成员访问均被拒），但**发现真红线缺口**。
- **缺口（iter32 同类，但这次治本）**：`renderBlock` 直接 `blockRenderers[b.type](b, ctx)`，**无 try/catch**。任一块渲染抛错——坏 sim 表达式(compileExpr 抛)、未知类型(renderer undefined)、任一渲染器缺字段——都会向上冒泡**崩掉整份讲义**。iter32 只点修了 dynamics1d regimes 一处；普适防线一直缺失。违反红线"渲染器对任何输入都不许崩"。
- **修法（治本，纵深防御）**：`renderBlock` 包 try/catch——渲染器不存在或抛错时，就地降级成可见 `.block-error` 占位（类型+错误信息，已转义），其余块与页照常渲染。校验器在生成侧拦(治本第一层)，此为渲染侧兜底(第二层)——延续 iter32"两side"信条。配套 index.html 加 `.block-error` 极简降级样式（虚线框，不喧宾夺主）。
- **归类**：红线（渲染器不许崩）· 加法（补普适兜底）。收紧**有据**：该崩溃类已在 iter32 真实发生（simple-pendulum），本轮从点修升级为普适防线。
- **验证**：造崩溃测试 doc（含未知类型块 + 无 items 的 list 块，两种抛错）→ 渲染 **0 console error/异常**、坏块降级、前后正常块照常渲染、出 2 页（修前必崩）；**基线 16 页 + 全量 19 份全绿**（无正常块误降级）；`npm test` 6 步全绿。测试 doc 用后即删，未入库。

## Iter 39 — 做薄：BLOCK_TYPES 从"正则刮源码"改为直接 import（单一事实源，goal①）
- **全局扫描**：语料内容与渲染红线近轮已扎实，转做一次代码层"回头看"。发现真重复：权威类型清单 `BLOCK_TYPES` 定义在 `validate.mjs`，却在 **两处**被正则从源码文本里刮出来——`check-consistency.mjs`(Check A/B/C 的基准) 与 `test.mjs`(步骤⑤)，正则 `/BLOCK_TYPES\s*=\s*\[([^\]]*)\]/` 脆（数组一旦换行/重排就断），且与真值脱节。
- **修法（纯做薄，减法）**：`validate.mjs` 把 `BLOCK_TYPES` 由 `const` 改 `export const`（已有 isMain 守卫 + pipeline.mjs 早已安全 import 该模块，无副作用）；两处工具改为 `import { BLOCK_TYPES }`，删掉两段正则刮取 + readFileSync。Check C 从此比对**真数组**而非文本刮取物，更诚实。validate.mjs 变了→`node sync.mjs` 刷新技能镜像。
- **净变化**：删 2 段脆正则解析、2 处 readFileSync 源码文本；加 2 行 import + 1 个 export。行数与脆度双降，单一事实源真正被 import 而非重复再解析。
- **归类**：成长（非红线，属代码整洁/健壮）· 减法（做薄）。
- **验证**：`node sync.mjs` 刷新镜像；`check-consistency` 正例全过；负例（schema enum 删 `compare`）→ Check C 精确报 `BLOCK_TYPES 有而 schema enum 无: compare` 并 exit 1；还原后过；`npm test` 6 步全绿（步骤⑤用 import 的 BT、⑥镜像新鲜）。

## Iter 40 — README 补「验证」章 + 修一处失真陈述（文档/可信度，goal①）
- **全局扫描**：红线/一致性/做薄近轮已覆盖，转看项目"可被认可"的短板——文档。README(81 行)结构完整、内容准确，但**发现两处真缺口**：① 全无验证/测试说明——iter30 的 `npm test`(6 步离线自检) 与 iter31/36 的 `npm run render-check`(真机无头渲染验收) 只字未提；② 第 64 行工作流「⑥ Verify」写"真实浏览器渲染仍需人工/无头浏览器"，是 **iter31 前的失真陈述**（真机验收早已由 render-check 补齐）。对一个靠"可复现"立信的项目，验证故事缺席直接削弱可信度（呼应用户两次问的学术认可）。
- **修法（文档，减法式澄清 + 精准加法）**：① 快速开始后加「## 验证（离线自检 + 真机渲染）」——列 `npm test` / `npm run render-check` / `-- --all-generated` 三条命令及各自断言项，注明 render-check 零依赖(内置 http + 内置 WebSocket 手写 CDP)、找不到浏览器则跳过非致命；② 第 64 行改为"结构断言(离线)；真机渲染验收由 `npm run render-check` 补齐"，消除失真。
- **归类**：成长（文档，非红线）· 净加一节 + 修一处失真。不涉代码逻辑。
- **验证**：文档所述命令实跑核对——`npm test` 6 步全绿；`npm run render-check -- --doc generated/binary-search.lecture.json` 正常（**佐证 `--` arg 透传可用**，即文档里 `-- --all-generated` 写法成立）。README 描述与实际行为一致、无过度承诺。

## Iter 41 — 修 AI 助教上下文回显的转义漏洞（红线：所有内容必须转义，goal②）
- **全局扫描**：本轮专审"转义"红线。逐一核查所有 `innerHTML`/`insertAdjacentHTML` 注入点——`inlineMd` 先转义再套 md(安全)、`sanitizeFreeformHtml` 是真白名单净化器(strip 危险标签/去 on* 处理器/过滤 src·href·style，安全)、`notesHtml` 回读已转义 DOM(安全)。**发现一处真漏洞**。
- **漏洞（红线级）**：`curInfo()` 取当前页 `.headline` 的 `.textContent`(解码后原文)，而 `updateCtx()`(第 813 行) 与 `ask()`(第 815 行) 把它**未转义拼进 innerHTML**。含 HTML 的标题(如 `<img src=x onerror=...>`)正常渲染时被转义显示为文本，但经助教上下文栏回显时被**重新解析为活动 HTML → 注入执行**。反页面导航(slidechanged→updateCtx)即触发。违反红线"所有用户/LLM 内容做转义"。
- **修法（转义在 sink，遵本文件既有惯例）**：两处 `curInfo()` 外包 `escapeHtml(...)`。
- **归类**：红线（转义）· 加法（补两处 sink 转义）。
- **验证（严格双向，真机）**：造注入 doc（headline 含 `<img onerror="console.error('XSS-FIRED')">`）——**修复后** render-check `0 console error` 全绿；**临时撤回一处修复** → render-check 精确捕获 `B: 1 条 console error → XSS-FIRED`（证明漏洞真实、测试非空转）；还原修复（2 处 escapeHtml(curInfo()) 复位）。基线 + 全量 19 份全绿、`npm test` 全绿；测试 doc 用后即删未入库。

## Iter 42 — render-check 加 --shot 截图模式：项目首次能"看见"自己的渲染（可视验证，goal②③）
- **全局扫描**：本轮把没验过的红线逐一核实为"扎实"——widget iframe 用 `sandbox="allow-scripts"` 无 `allow-same-origin`(null origin 真隔离)；生成管道失败块诚实丢弃/降级为"待补"占位不编造(no-mock)；LLM 客户端缺 key 报清晰错、退避重试稳；`table` 行列数不一致校验器未卡但语料 0 例(据哲学 A 不提前收紧)；BLOCK_TYPES 17 类渲染器全覆盖。红线无缺口。
- **转 goal③ UX（从未直接看过渲染）**：写零依赖 CDP 截图脚本截基线若干页。**过程本身踩到并厘清两个真陷阱**：① 截图早于 reveal 过渡结束 → 截到横向滑动中途，页面"错位/标题截断"是动画帧假象(非 bug)，须先 `Reveal.configure({transition:'none'})`；② 整页 block 全 `fragment:true` 时加载即空白是**设计内**行为(演讲者逐步揭示)，非缺内容。核实结论：**渲染质量好**（代码对照页版式、层次、间距俱佳），无 UX bug；生成语料 0 fragment（全空白页只存在于手调基线且有意为之）。
- **落成可交付**：把"项目此前无法自视"这一历史空白补上——`render-check` 加 `--shot[=1,2,8]` 截图模式，复用既有 http 服 + 无头浏览器 + CDP（零重复），内建关过渡避开陷阱①，PNG 写临时目录 `la-shots`。验收断言路径完全不动。
- **归类**：成长（工具/可视验证，非红线）· 加法（做厚：补一种验证能力）。
- **验证**：`--shot=8` 截出有效 PNG（65KB、magic `89504e47`）；验收路径未受影响（baseline 仍全绿）；`node --check` + `npm test` 6 步全绿。

## Iter 43 — 宽公式自适应缩放 fitFormulas：修 compare/窄列里公式被滚动裁切（UX，goal③）
- **全局扫描 + 用 iter42 的 --shot 真看生成产物**：截 matrix doc 第 2 页，**肉眼发现真 UX bug**——`compare` 两列里的矩阵公式**右侧被裁**、带横向滚动条（左列 `…D` 后截断、右列 `…1<2` 后截断）。根因：iter33 给 `.mblock` 加 `overflow-x:auto` 挡住了页面级溢出（红线），但代价是窄列里的宽公式变成"横向可滚动"——而幻灯片不可滚，等于右半截公式看不见。render-check D(0 页面横向溢出) 因此仍绿（溢出被收进滚动盒），但观众看不全。
- **定性**：这是 iter37 纵向 zoom-fit 的**横向对应缺口**——渲染器只处理了"页太满(纵向)"，没处理"公式太宽(横向)"。普适问题（任何窄容器放宽公式都中招），在渲染器治本。
- **修法（对称加法）**：新增 `fitFormulas(section)`——display 公式天然宽 > 容器时，对 `.katex` 设 `zoom = max(0.55, avail/natural)` 等比缩到放下（zoom 影响布局，缩完不再触发滚动条；transform 只视觉缩放救不了滚动条，同 iter37 取舍）。下限 0.55 防不可读；触底仍超宽由 `overflow-x:auto` 兜底。新增 `layoutScene = fitFormulas + balanceScene`（先缩公式再按新高度做纵向平衡），三处 Reveal 钩子(ready/fonts.ready/slidechanged)改调 layoutScene。
- **归类**：成长（版式，非红线）· 加法（补横向对称缩放）。收紧**有据**：--shot 真机可见的裁切（matrix compare 两列均中招）。
- **验证（真机可视 + 断言）**：`--shot=2` 重截 matrix 第 2 页 → 两列公式**完整可见、无滚动条**（`A=…,P=…,D=(2 0;0 3)`、`J=…,几何重数=1<2=代数重数`）；基线 + 全量 19 份 render-check 全绿（0 横纵溢出/balanceScene/0 console error 无回归）；`npm test` 6 步全绿。

## Iter 44 — render-check 加断言 G：公式被裁回归守卫（钉死 iter43，verify，goal②③）
- **动机**：iter43 修了 compare 窄列宽公式被滚动裁切，但**没有自动守卫**——该 bug 恰恰绕过了断言 D(页面级横向溢出全绿，因溢出被收进 .mblock 的 overflow-x 滚动盒)。若日后 CSS/fitFormulas 被改坏，公式重新被裁不会被任何测试发现。延续 iter36(F) 的"修完立刻补断言"节奏。
- **修法（加法，几乎零成本，复用 perSlide 走查）**：逐页取所有 `.mblock` 的 `scrollWidth - clientWidth` 最大值 `mblockClip`；新增断言 G——>4px(避亚像素) 即"公式被裁(横向可滚，右侧看不见)"、逐页报 px。头注补 G。
- **归类**：红线邻近（公式右侧内容不可见，视觉级内容裁切）· 加法（补验证维度）。收紧**有据**：iter43 真机 --shot 可见的裁切。
- **验证（严格双向）**：正例 matrix doc → G 过全绿；负例（临时 `fitFormulas` 直接 return 禁用）→ 精确报 `G: 1 页公式被裁 → #2(161px)` exit 1；还原后过。**基线 + 全量 19 份**含新 G 全绿（fitFormulas 对全语料生效、无残留裁切）；`npm test` 6 步全绿。
- **现断言全景**：A 分页 · B 0 console error · C 字体 · D 0 横向页溢出 · E balanceScene 居中 · F 0 纵向裁切 · G 0 公式裁切。渲染红线的"看不见的内容"三面（页宽/页高/公式宽）now 全被钉死。

## Iter 45 — 修客观题题干全语料不显示：字段名四方不一致（stem vs context）（内容红线邻近，goal①②）
- **--shot 继续揪 bug**：截 song-ci 第 4 页发现 quiz 只有 A/B/C 选项、**没有问题**。查数据：quiz 有 `stem:"以下哪个意象常象征'离别愁绪'？"`，但**渲染器读的是 `b.context`**，题干被静默丢弃。
- **受影响面（普查）**：**19/19 生成 doc 的客观题都用 `stem`**，全部题干不显示——观众看到"三个选项没有题"。这是 FE-53 教训的又一实例：**手调基线用 `context`（渲染正常）掩盖了泛化 bug**。
- **根因：字段名四方不一致**——create-quiz 契约（喂 LLM，产 `stem`）↔ schema/SPEC/渲染器/基线（`context`）↔ 校验器（stem/context 都不要求，且 `noExtra` 白名单函数定义了却从未调用→额外字段不拦，stem 静默通过）。契约才是生成源头，故以 `stem` 为准。
- **修法（对齐到 stem，向后兼容）**：① 渲染器读 `b.stem || b.context`（stem 优先，context 作基线旧别名，一行修好全部 19 份 + 基线不变）；② SPEC.md 客观题文档改述 `stem` 为题干字段、context 为兼容别名；③ schema quizBlock 加 `stem` 属性、context 标注为别名；④ `node sync.mjs` 刷新技能镜像。
- **归类**：红线邻近（应显示的内容被静默丢弃，同 F/G"看不见的内容"类）· 加法（渲染器补字段 + 文档对齐）。收紧**有据**：19/19 真实产出命中。
- **验证（真机可视 + 断言）**：`--shot=4` 重截 song-ci → 题干"以下哪个意象常象征'离别愁绪'？"**显示在选项上方**（修前不可见）；基线 + 全量 19 份 render-check 全绿；`npm test` 6 步全绿（含镜像新鲜度⑥）。

## Iter 46 — 修 inlineMd 占位符与正文数字撞车 → 文本渲染出 "undefined"（内容红线，goal②）
- **--shot 第三次揪出"断言绿但内容错"的 bug**：截 computer-history 第 2 页 timeline，正文多处渲染成字面 **"undefined"**——"重undefined吨"、"IBMundefined实现"、"摩尔undefined年预测"。
- **根因（inlineMd 占位符碰撞）**：`inlineMd` 把 `$公式$`/\`代码\` 抽走存 stash、原地留 " <下标> "（**空格包数字**）占位，最后 `/ (\d+) /g` 回填。但该正则**会命中正文里带空格的整数**——数据 "重 27 吨" 里的 " 27 " 被当成占位下标，`stash[27]` 不存在 → 输出 "undefined"（若 stash[n] 存在还会**误插入别处的公式/代码**，更糟）。**CJK 排版规定数字两侧留空格**（连 AUTHORING_RULES 都要求"2026 年"这样加空格），命中面极广；带逗号的数字（17,468）因无干净 `\d+ ` 边界侥幸幸存。又一例真机可视才暴露（结构断言/0 console error 全绿）。
- **修法（治本，换不可能碰撞的占位符）**：占位符从 " <idx> " 改为私有区哨兵 `<idx>`（U+E000/E001 绝不出现在正文），回填正则相应改 `/(\d+)/g`。正文数字再不会被误当占位。私有区自带定界，顺带修掉相邻占位符共享空格的老隐患。
- **归类**：红线（正文被渲染器篡改成 "undefined"/错内容，违"内容有据、不编造"）· 加法（换健壮占位符）。收笃**有据**：真机可见、且 CJK 数字空格是普遍写法。
- **验证（真机可视 + 断言）**：`--shot=2` 重截 computer-history → 所有数字正确显示（"重 27 吨"/"IBM 7090"/"Intel 4004"/"92 TOPS"/callout "1965 年…4004…2300 个…2020 年…160 亿个"），无一 "undefined"；基线 + 全量 19 份 render-check 全绿；`npm test` 6 步全绿。

## Iter 47 — render-check 加断言 H：非代码正文出现 undefined/NaN/[object Object] 即报（插值 bug 自动网，verify，goal②）
- **--shot 探查确认渲染质量**：本轮截 widget(bubble-sort)、dynamics1d(dna)、searchCompare(基线)、table(binary-search) 等此前没肉眼看过的块——**全部渲染优良**（sim 图表/滑块/图例、iframe 沙箱、表格对齐俱佳），无新 bug。
- **动机（沉淀近三轮教训成自动网）**：iter43/45/46 三个"结构断言全绿、0 console error，只有肉眼可见"的内容 bug 里，iter46（占位符碰撞→正文渲染出字面 "undefined"）是**可被自动检测的一类**——插值 bug 常在正文留下 `undefined`/`NaN`/`[object Object]`。加断言把这类"看不见的内容损坏"钉死，不再只靠人眼。
- **修法（加法，复用 perSlide 走查）**：逐页克隆 slide、**剔除 code/pre/.mi/代码卡/iframe/notes**（这些地方 undefined/NaN 是合法讲授内容，如 JS 课），对剩余正文匹配 `[object Object]|\bundefined\b|\bNaN\b`；断言 H 命中即报页号+损坏词。头注补 H。
- **关键坑（已修）**：该正则在 `evalJs` 模板字符串里，反斜杠须**双写**（`\[`/`\b`）才能作为正则元字符送进浏览器——单写被模板字面量吃掉，`\[object Object\]` 退化成**字符类** `[object Object]`（匹配任意 o/b/j/e/c/t/空格/O），导致每页误报。双写后正确。
- **归类**：红线邻近（正文内容完整性，同 iter46）· 加法（补验证维度）。收紧**有据**：iter46 真实发生。
- **验证（严格双向 + 全语料无误报）**：正例造 doc（list 含 `[object Object]`）→ H 精确报 `#1("[object Object]")` exit 1；**同 doc 的 code 块里 `undefined` 不误报**（豁免生效）；基线 + 全量 19 份（含 binary-search/kmp/bubble-sort 等 CS/数学 deck）含 H **全绿无一误报**；`npm test` 6 步全绿。
- **断言全景**：A 分页 · B console · C 字体 · D 横溢 · E 居中 · F 纵裁 · G 公式裁 · **H 文本损坏**。
