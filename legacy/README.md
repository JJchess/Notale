# lecture-agent

> 统一归档入口：当前 Notale v2 的旧代码、方案、实验脚本和样例见 [notale-v2/](notale-v2/README.md)；旧模板工具见 [native-template-tools/](native-template-tools/README.md)，旧库缓存见 [vendor/](vendor/README.md)。以下正文为早期 lecture-agent 的历史说明，不代表现行 harness。

自演化的**讲义生成 agent**：给一个课题，产出一份合法、可交互的 **LectureDoc**——由 reveal.js 运行时渲染成的网页讲义（富文本、KaTeX 公式、浏览器内仿真、可编辑代码、测验、AI 助教）。

- **纯 Node、零运行时依赖、离线优先**（只用内置 `fetch` 调一个 OpenAI 兼容的 LLM 端点）。
- **它是自己的 harness**——[Nous Research Hermes](https://github.com/NousResearch/hermes-agent) 是架构蓝图，不是依赖。我们只取其思想（agent 编排 / 并行 fan-out / 技能加载 / clarify / loop / 自演化），用最小实现落成，不搬它的代码。
- **schema 即接口**：agent 只产 JSON（LectureDoc），从不写 HTML/CSS/渲染器；渲染质量由运行时统一保证。

## 快速开始

```bash
# 1. 配一个 OpenAI 兼容 LLM（如硅基流动 SiliconFlow）——仓库根 .env（已 gitignore）
#    SILICONFLOW_API_KEY=sk-...
#    SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
#    （或用环境变量 OPENAI_API_KEY / OPENAI_BASE_URL）

# 2. 生成一节课（交互式会先澄清受众/篇幅/交互/主题；--no-clarify 跳过）
node bin/lecture-agent.mjs generate "梯度下降与学习率" --pages 8 --audience 本科生

# 3. 预览：把产物拷进 demo/ 并起服务
python demo/serve.py
#    浏览器打开 http://127.0.0.1:8778/index.html?doc=generated/<id>.lecture.json
```

默认模型 `deepseek-ai/DeepSeek-V3`（`LA_MODEL=<id>` 可换）。产物写到 `out/<id>/` 与 `demo/generated/<id>.lecture.json`（后者供 `?doc=` 预览）。

## 验证（离线自检 + 真机渲染）

```bash
npm test              # 离线自检（无需 LLM/浏览器，确定性、适合 CI）：语法 / 契约一致性 /
                      #   基线合法 / 渲染结构断言 / 技能契约自洽 / 技能镜像新鲜度 —— 任一失败退出码 1
npm run render-check  # 真机渲染验收：系统 Edge/Chrome 无头（零依赖 CDP）逐页断言——
                      #   分页数 / 0 console 错误 / 字体加载 / 0 横纵向溢出 / 稀疏页居中规则
npm run render-check -- --all-generated   # 扫全部 demo/generated/*.lecture.json
```

`render-check` 需本机装有 Edge/Chrome（找不到则跳过、非致命），零第三方依赖（内置 `http` 起静态服 + 内置 `WebSocket` 手写 CDP 客户端驱动无头浏览器）。

## CLI

```
lecture-agent generate "<课题>" [--pages N] [--theme cartesian|cobalt-grid|lab]
                                [--audience "..."] [--wants sim,quiz] [--material file] [--id kebab]
                                [--no-clarify] [--eval] [--revise] [--coverage]
    --material <file>  用源素材做 grounding（内容据素材、防编造，贯穿规划+逐块生成）
lecture-agent batch  [topics.jsonl]           批量跑一轮（缺省 examples/topics.jsonl）
lecture-agent loop   [topics.jsonl] [--every 1h]   常驻循环（loop 能力）
lecture-agent evolve [dir...]                 聚合信号 → 提案（缺省 out/）
lecture-agent skills                          列出已加载技能与 block 路由
```

## 它怎么工作（Hermes 蓝图的最小落地）

主流程 = **input → clarify → output**，编排是**确定性骨架 + 每节点 LLM 智能 + 自修环**（比自由 tool-loop 更稳、可调试）：

```
① Clarify   交互澄清受众/篇幅/要哪些交互/主题气质（可跳过）
② Plan      多视角规划(src/plan.mjs，移植自 STORM)：先发现 3-4 个互补教学视角→各自给"必讲点+常见疑问"
            (覆盖清单)→综合成骨架 JSON（scenes[]，每 block 是 {id,type,intent} 占位）。覆盖比单次出大纲更广更深。
③ Fan-out   每个 block 一个"子任务"并行生成：按 block 类型路由到对应家族技能的契约
            → 一次聚焦 LLM 调用 → validateBlock 自校验 → 不合格把带路径的错误喂回自修（≤3 轮）
④ Assemble  占位 → 生成块（失败块诚实丢弃/降级并报告，不编造内容）
⑤ Validate  整档 validateDoc；block 级错误按路径回炉重生成（≤2 轮）
⑥ Verify    render-verify 结构断言 + 溢出启发式（离线）；真机渲染验收由 `npm run render-check` 补齐（无头 Edge/Chrome，见「验证」）
⑦ Eval      (可选 --eval/--revise) 质量评审(src/evaluate.mjs，移植自 PPTAgent 的 PPTEval)：
            content/coherence/pedagogy 三维各 1-5 + 理由 + topFix；--revise 分低则按 topFix 重生成一版取优。
⑧ Output    合法 course.lecture.json = 讲义
```

### 借鉴来源（取思想/移植算法，非搬码；均为 Node 重写）
- **内容规划** ← [Stanford STORM](https://github.com/stanford-oval/storm)（多视角提问 → 大纲）：`src/plan.mjs`。
- **质量评估** ← [PPTAgent / PPTEval](https://github.com/icip-cas/PPTAgent)（Content/Design/Coherence 三维评分）：`src/evaluate.mjs`（改造为 content/coherence/pedagogy）。

模块（`src/`）：`agent.mjs`（编排）· `plan.mjs`（STORM 式多视角规划）· `delegate.mjs`（fan-out 子任务）· `skills.mjs`（技能加载器）· `clarify.mjs` · `evaluate.mjs`（PPTEval 式质量评估）· `llm.mjs`（OpenAI 兼容客户端）· `pipeline.mjs`（校验/验收）· `loop.mjs` · `evolve.mjs`。

## 扩展：加一个技能 = 加一个文件夹

`skills/<name>/` 里放 `SKILL.md`（frontmatter: name/description + 人读的创作指南）+ 可选 `contracts.json`（`{ "<blockType>": "<紧凑契约模板>" }`）。带 `contracts.json` 的即 **block 家族生成器**，agent 自动发现并按 block 类型路由（`lecture-agent skills` 可查）。**一个 block 类型只能归一个家族**（冲突会报错）。逃生舱类型（`runnable`/`freeform`）注册但不进自动规划菜单。

现有家族：`create-content`（hero/statement/list/agenda/callout/formula/flow/table/code/compare）· `create-quiz` · `create-sim`（dynamics1d/searchCompare/custom/widget）· `create-code-runtime` · `create-freeform`。元/文档技能：`lecture-doc-schema`（契约总纲）· `generate-lecture`（编排说明）· `evolve-schema`（自演化）。

## 自演化（学习/积累）

`evolve` 扫描已生成的讲义，用重叠 n-gram 统计**跨多篇反复出现**的 freeform 诉求 / 主题 / 引擎 → 输出"该长什么"的**提案**（新 block 类型 / 新主题 / 新 sim 引擎）。若用 `--eval` 生成/批量（会存 `out/<id>/eval.json`），`evolve` 还会聚合**质量轴**：三维平均分 + 最弱维度 + 各篇 `topFix`，指出 agent 该系统改进的方向。护栏：**agent 只提案，人类 review 后才并入**（改 `demo/schema/` 再落新契约）——结构层强约束、内容形态层由真实缺口驱动生长。配合 `loop --eval` + 题材队列即成"生成→评分→聚合→提案"的自改进环。

## 契约与渲染（单一事实源）

LectureDoc 的 schema、校验器、组装/验收脚本权威在 `../demo/schema/`（`lecture-doc.schema.json` / `SPEC.md` / `validate.mjs` / `assemble.mjs` / `render-verify.mjs`）；本 agent 的 `src/pipeline.mjs` 相对 import 它们。渲染运行时是 `../demo/`（reveal.js + KaTeX + Observable Plot + Pyodide/CodeMirror，全离线 vendor）。
> 独立发布本 agent 时，把 `demo/schema/` 连同一个最小渲染器 vendored 进来即可自包含（后续项）。`sync.mjs` 会把契约/脚本同步进 `skills/lecture-doc-schema/` 作为文档副本。

## 许可

MIT（见 LICENSE）。
