# 调研：长时程生成任务的 Agent Harness / 编排架构（2024–2026）

> 调研日期：2026-08-08。用途：`methodology/HARNESS.md` 终局图景的证据库之一。
> 注意：标注 [检索摘要] 的条目来自搜索结果聚合、未逐篇核实原文，做硬决策前需核原文。

---

## 主题 1：Deep Research Agent 架构 —— plan → search → synthesize

### 1.1 Anthropic 多智能体研究系统（最详实的一手工程披露）

**机制：orchestrator-worker（编排者-工作者）**

- LeadResearcher 先用 extended thinking 想清楚策略，**把 plan 写入 Memory 持久化**（因为上下文超过 200K 会被截断），然后并行 spawn 3–5 个 subagent，每个 subagent 有独立 context window 和工具。
- Subagent 内部再并行调用 3+ 个工具。两级并行化（lead→subagent、subagent→tools）是关键：**复杂查询研究时间下降最多 90%**。
- Subagent 只把**蒸馏后的结论**（1,000–2,000 tokens）返回给 lead，而它自己可能烧掉数万 tokens。
- **CitationAgent 是独立的后置 pass**：研究完成后，专门有一个 agent 把 claim 和 source 位置对齐。把引用工作从研究过程里剥离出来，避免污染研究上下文。

**证据**

- Opus 4 lead + Sonnet 4 subagents 的多智能体系统，在内部 research eval 上**比单体 Opus 4 高 90.2%**。
- 消融发现：**token 使用量单独解释 80% 的性能方差**，工具调用次数和模型选择是次要因素。
- 代价：agent ≈ 4× chat 的 token；multi-agent ≈ **15× chat**。

**工程细节**

- **委派必须写详细任务契约**：短指令导致多个 subagent 重复搜索、留下 gap。必须给：objective / output format / tool & source guidance / task boundaries。
- **把"投入规模"写死成规则**：简单事实 1 agent、3–10 次调用；对比类 2–4 agents、每个 10–15 次；复杂研究 10+ agents 并分工。
- **有状态的错误处理**：agent 跑很久、不能从头重启，必须支持从失败点 resume；checkpoint + retry + 让模型知道"工具挂了"从而优雅降级。
- **rainbow deployment**：更新时不能打断正在跑的 agent。
- **当前瓶颈**：lead 同步等待 subagent、无法中途 steer、subagent 之间不能协调。
- **搜索策略**：先短而宽的 query 再逐步收窄；加 source quality 启发式（早期 agent 系统性偏好 SEO 内容农场）。

来源：[Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

### 1.2 OpenAI Deep Research

单体 agent + 端到端 RL（基于 o3，把"多跳研究"内化进模型策略）。第三方 benchmark 显示**引用准确率约 78%**——即引用正确性不能靠模型自觉，必须外挂验证 pass。

来源：[OpenAI Deep Research](https://openai.com/index/introducing-deep-research/)；[Deep Research Agents: A Systematic Examination and Roadmap (arXiv 2506.18096)](https://arxiv.org/abs/2506.18096)；[DeepResearch Bench II (arXiv 2601.08536)](https://arxiv.org/html/2601.08536v2)

### 1.3 Google Gemini Deep Research

- **交互式研究计划**：先产出 plan 给用户 review/修改，确认后才执行。
- **异步任务管理器**：在 planner model 与 task model 之间维护 shared state，能优雅错误恢复而不必重启整个任务。
- 每一步都在"到目前为止收集的全部信息"上 ground 自己；API 层强制 background + 可轮询任务状态。

来源：[Google Blog — Try Deep Research](https://blog.google/products/gemini/google-gemini-deep-research/)；[Gemini Deep Research API](https://ai.google.dev/gemini-api/docs/deep-research)

### 1.4 学术侧对照：STORM

pre-writing（多视角提问 + 检索 → outline）→ writing（按 outline 分节生成 + citation）。核心创新是 **perspective-guided question asking**。

来源：[STORM (arXiv 2402.14207)](https://arxiv.org/pdf/2402.14207)

### 对 lectureAgent 的启示

- 三阶段主干 `plan → fan-out → synthesize` 是三家共同骨架，不要发明新的。
- **plan 必须落盘成可寻址 artifact**（outline.json / slides/NNN.spec.json），不是只存在于 context。
- **抄 Gemini 的"计划先给用户确认"**——60 分钟讲座走错方向的返工成本极高。
- **抄 CitationAgent 模式**：独立 FactCheck/CitePass，干净上下文逐条核对。
- 把"努力规模"写成显式规则（60 分钟 ≈ N 页 ≈ M worker × 调用数）。
- 搜索"宽→窄" + source quality 启发式（教材/课程主页/论文 > 博客农场）。

---

## 主题 2：Anthropic "Building Effective Agents" 教义及演进

### 2.1 原始教义（2024-12）

**核心二分**：Workflow（预定义代码路径编排，可预测/可测/便宜）vs Agent（LLM 动态决定流程，灵活/贵/不可预测）。

五种 workflow 模式 + agent：Prompt chaining（固定子步骤，原文举例就是"先写 outline 再写正文"）/ Routing / Parallelization（sectioning/voting）/ Orchestrator-workers（子任务结构不可预测）/ Evaluator-optimizer（有清晰评价标准且迭代确实改进）/ Autonomous agent（开放式、步数不可预测）。

三原则：simplicity、transparency、精心设计 ACI（工具文档像给人写的 API 文档，poka-yoke 防错）。

加自主性的顺序：单次调用+检索 → workflow → 只有当复杂度**可验证地改善结果**才上 agent。

来源：[Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)

### 2.2 2025–2026 更新

**Agent 循环标准化：Gather Context → Take Action → Verify Work → repeat**。Verify Work 三种手段（可靠性递减）：①规则型反馈（最好）②视觉反馈（截图，明确点名适用于 HTML content/interactive elements）③LLM as judge（模糊标准，延迟高鲁棒性差）。"take action 优先写代码"。

**Harness 三条设计模式（2026）**：①Lean on model capabilities（通用工具优先）②Strip down harness（让模型自己 orchestrate/管 context/持久化 memory；skills 的 progressive disclosure）③Set careful boundaries（prompt cache 命中最大化；安全敏感动作用声明式工具）。

来源：[Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk)；[Agent Harness Design: 3 Patterns](https://claude.com/blog/harnessing-claudes-intelligence)

**Claude Agent SDK 原语**：subagent 的 context 完全干净（只拿到委派 prompt + 自己的 system prompt），**所有需要的路径/决策/约束必须显式写进委派 prompt**；父只拿 final message；部分失败可救；默认可嵌套 3 层。

**Dynamic Workflows**：编排从对话搬进脚本（`agent(prompt, {schema})` + `pipeline`），JSON Schema 约束子 agent 返回；≤16 并发、1000 agent 上限；**resume 语义：缓存在第一个未完成 agent 处截断**——"fan-out 成很多小 agent"比"一个长 agent"保住的进度多得多。内置 /deep-research 示范：fan-out → 交叉核对 → 逐 claim 投票 → 未通过的标 unverified 而非静默删除。

来源：[Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents)；[Dynamic workflows](https://code.claude.com/docs/en/workflows)

### 对 lectureAgent 的启示

- **主干是 workflow 不是 agent**：宏观结构已知，只在页内局部放开自主性。
- Verify Work 一等阶段，优先规则型+视觉型（deck 恰是被点名的场景）。
- fan-out 用 schema 约束返回；worker prompt 必须自包含（globals+邻页摘要）。
- prompt cache 排序：全局 style guide/骨架/术语表放最前且跨 worker 一致。

---

## 主题 3：长时程生成技术

### 3.1 Outline-then-expand 谱系

| 方法 | 机制 | 证据 |
|---|---|---|
| Re3 (2022) | Plan→Draft（动态重构 prompt，带 plan+已写内容摘要）→Rewrite（多候选重排序）→Edit | 情节连贯 +14%，前提相关 +20% |
| DOC (2022) | detailed outliner（BFS 拆子节，候选→过滤→排序）+ controller | 数千词尺度连贯 |
| AgentWrite/LongWriter (2024) | 先生成写作计划（**每段结构+目标字数**）再逐段生成 | GPT-4o 有效输出 ~2k→~20k 词 |

共同结构：**先定每个单元的规格（含配额），再分单元展开**。防重复：已写内容的摘要（非全文）带入下一单元；多候选+rerank。

来源：[Re3](https://nlp.cs.berkeley.edu/pubs/Yang-Tian-Peng-Klein_2022_Re3_paper.pdf)；[LongWriter (arXiv 2408.07055)](https://arxiv.org/abs/2408.07055)

### 3.2 Context rot 与三种长时程技术

Chroma 实测 18 模型：输入变长时性能不可靠下降（即使任务是复述字符串）。Anthropic 的 attention budget 解释。三种技术：①Compaction（保留架构决策/未解 bug，丢冗余工具输出）②Structured note-taking / 外部记忆（Claude plays Pokémon 跨数千步精确计数）③Sub-agent 架构（探索与综合的 context 分离）。

来源：[Chroma — Context Rot](https://research.trychroma.com/context-rot)；[Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### 3.3 跨 context window 长跑：artifacts > compaction ★

**双 agent 架构**：Initializer（跑一次：init.sh、progress 文件、git init、**200+ 条 feature 清单全标 failing**）+ Coding agent（每 session：读 progress/git log → 跑基线测试 → **一次只做一个 feature** → commit → 更新 progress）。

四类失败模式与对策：想一口气做完→feature 清单+增量指令；过早宣布完工→结构化 pass/fail 状态；留下无文档坏状态→git+progress+重启验证；没测就标完成→**强制 e2e 测试**。

**核心结论：即使前沿模型，compaction 也不够；结构化 artifact（feature list + progress + git + init 脚本）比上下文压缩更鲁棒。**

来源：[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### 3.4 Durable execution

LangGraph checkpointing（superstep 级）；Temporal + LangGraph（每个 node 一个 Activity，node 边界 checkpoint，replay event history 从失败那一步继续）。**前提：幂等性**（写外部状态的工具带 idempotency key）。

来源：[Temporal LangGraph Plugin](https://temporal.io/blog/temporal-langgraph-plugin-durable-execution)

### 3.5 宏观趋势

METR：50%-task-completion time horizon 约每 7 个月翻一番（Claude 3.7 ≈ 50 分钟，o3 ≈ 近 2 小时）→ harness 要留"随模型变强拆脚手架"的空间。

来源：[METR](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/)

### 对 lectureAgent 的启示

- **deck 建模成 feature-list 状态机**（deck.state.json：每页 spec/targetSeconds/targetWords/status/attempts/artifactPath/deps），pending 起步、verified 才算完。一份 JSON 同时解决进度/续跑/打捞/防过早完工/防一口气做完。
- 每 session 固定开场序列；git 做 checkpoint 与回滚介质（每页一 commit）。
- fan-out 粒度要细（一页一 agent）；每页配额 + 邻页摘要 + 已覆盖概念列表；最后 global coherence pass。
- 主编排 context 里不出现任何一页完整 HTML，只有 state 摘要视图；幂等写路径（确定性路径+内容 hash 命名）。

---

## 主题 4：多智能体模式的成与败

### 4.1 有效模式

- Orchestrator-workers（+90.2%）。多智能体的三个正当理由：context protection / parallelization / specialization。反面："设计良好的单 agent + 合适工具能做到的比预期多得多"；多智能体 3–10×（研究 15×）token。
- **唯一被点名"一贯有效"的模式：verification subagent**——独立验证且不需要完整实现上下文。
- Evaluator-optimizer 有效的前提是**外部信号**（Reflexion 的信号=自生成单元测试的执行结果；纯内在自我纠错已被 ICLR 2024 证伪，有时反而更差）。

来源：[When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)；[LLMs Cannot Self-Correct Reasoning Yet (arXiv 2310.01798)](https://arxiv.org/abs/2310.01798)

### 4.2 失败模式

- **MAST**（NeurIPS 2025，1600+ 轨迹）：14 种失败模式聚成三类——系统设计缺陷/智能体间失配/任务验证不足。**失败源自糟糕的编排设计而非模型能力。**
- **Cognition "Don't Build Multi-Agents"**：①共享完整 trace ②动作携带隐含决策，冲突决策产生糟糕结果（Flappy Bird 例子：两个并行 subagent 各自做了风格不兼容的资产）。推荐：短任务单线程；写操作单线程，额外 agent 只贡献只读分析。

来源：[MAST (arXiv 2503.13657)](https://arxiv.org/abs/2503.13657)；[Cognition — Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)

### 4.3 调和判据

**子任务之间是否共享大量隐含设计决策？** 共享 → 单线程+压缩；不共享 → fan-out。研究是 breadth-first（fan-out 大赢）；编码强耦合（fan-out 大输）。

### 对 lectureAgent 的启示

- 调研阶段放心 fan-out；**大纲/风格/术语/符号 = 全局隐含决策，必须单线程决定一次写死成 artifact**；单页生成在锁定规格下 fan-out，worker prompt 携带完整全局契约。
- 写操作单线程：worker 只写自己的 slides/{id}.html，共享文件只有编排者写。
- verification subagent 必上；修复循环必须挂外部信号；成本护栏（预算/并发/单页重试≤3 次后降级静态版继续）。

---

## 主题 5：Skill / Memory 库

### 5.1 Voyager 谱系

每个**验证通过**的例程存成可执行代码，自然语言描述做索引，新任务检索并组合。三要素：生成→执行验证→**通过后才入库**。

### 5.2 Anthropic Agent Skills

SKILL.md（frontmatter + 指令 + 捆绑文件）；**progressive disclosure 三层加载**（发现层 ~80 tokens/skill → 激活层读全文 → 细节层按需）；**捆绑脚本确定性执行且不进 context**（"用 token 生成做排序比直接跑排序算法昂贵得多"）。创作最佳实践：从 eval 的 gap 出发写 skill；**"让 Claude 把成功做法和常犯错误捕获成可复用的 context 和代码"**——生产版 Voyager。

来源：[Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

### 5.3 Code execution 的量化收益

不塞 15 万 token 工具定义，给 ~2k token 发现指令让 agent 写代码去发现 → **token 降 98.7%，执行快 60%**；Tool Search Tool 官方数据 token 最多降 85%。

来源：[Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

### 5.4 ACE：上下文自我进化

Generator→Reflector→Curator 三角色；**incremental delta updates（永不整体重写）+ grow-and-refine** 防 context collapse。AppWorld +10.6%。

来源：[ACE (arXiv 2510.04618)](https://arxiv.org/abs/2510.04618)

### 5.5 领域对照

PPTAgent（编辑式两阶段 + PPTEval 三维）；AutoPresent/SlidesBench（程序化 API 优于端到端；一次性生成整份代码脆弱）；Instructional Agents / EduVisAgent。

### 对 lectureAgent 的启示

- **"讲座页面机制"做成 Skill 库是最重要的复用资产**（机制而非风格）；progressive disclosure 解决 fan-out 的 token 经济学；确定性脚本（打包/截图/校验/冒烟）不进 context 只回传 pass/fail。
- Voyager 式累积：每次跑完由 reflector 把坑与成功模式 **delta append** 进 skill reference（ACE 方式），入库门槛=真浏览器验证通过。
- 建组件级"已验证机制库"（排序可视化、树旋转动画、复杂度曲线…参数化可执行组件）。
- 抄 PPTEval 三维 + 加 pedagogy / correctness 维度。

---

## 综合架构骨架（本报告的合成建议）

```
[0] Intake & Clarify   单线程 → course-brief.json
[1] Research fan-out   多 agent + 独立 fact-check pass（CitationAgent 模式）
[2] Outline & Contract ★单线程（Flappy Bird 教训）：deck.state.json（每页 spec+targetSeconds）
                       + globals（术语表/符号约定/style tokens/组件 API）→ 用户确认一轮
[3] Per-slide fan-out  一页一 agent，schema 约束返回，≤16 并发分批，prompt 自包含
[4] Verify（每页）      规则型（console/KaTeX/溢出/代码执行/链接）→ 视觉型（截图）→
                       LLM judge（教学 rubric）；失败重试≤3 次，超限降级静态版标 failed 继续
[5] Assemble & Global  单线程：拼装 + 术语/符号/风格/难度递进/重复/总时长一致性
[6] Reflect & Accrete  坑与成功模式 delta-append 进 skill 库（ACE/Voyager）
```

贯穿三件事：①deck.state.json + git 是唯一真相源，页面 HTML 不进主上下文；②每阶段可断点续跑（durable execution + 幂等写路径）；③成本护栏。
