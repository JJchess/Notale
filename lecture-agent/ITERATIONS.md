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
