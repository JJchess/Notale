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
