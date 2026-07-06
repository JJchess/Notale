# lecture-agent —— 自演化讲义生成 agent（建在 Hermes harness 上）

把课题变成一份合法的 **LectureDoc**（新一代互动"讲义/PPT"，由 `demo/doc-to-deck.js` 渲染成 reveal.js deck）。
主流程 = **input query → clarification → output 讲义**。不 fork Hermes，而是**复用它的 harness**（agent loop、`delegate_task` 并行、`clarify`、cron、技能自创建、batch_runner），只在其上装我们的技能套件 + 确定性管道 + loop 路由 + 自演化机制。

## 目录
```
lecture-agent/
├─ skills/
│  ├─ generate-lecture/       编排器（harness）：clarify→plan→fan-out→assemble→validate→repair→verify
│  ├─ create-content/         静态块家族（hero/statement/list/agenda/callout/formula/flow/table/code/compare/grid）
│  ├─ create-quiz/            quiz（客观/主观）
│  ├─ create-sim/             sim 4 引擎（dynamics1d/searchCompare/custom/widget）
│  ├─ create-code-runtime/    runnable（Pyodide/JS，全 deck 至多一个）
│  ├─ create-freeform/        逃生舱
│  ├─ lecture-doc-schema/     共享契约：references/{schema,SPEC} + scripts/{validate,assemble,render-verify}
│  └─ evolve-schema/          自演化：scripts/aggregate.mjs 汇总信号 → 提案（人类 review）
├─ hermes/{config.sample.yaml, topics.sample.jsonl}
├─ sync.mjs                   从 demo/schema/ 同步契约+脚本进 lecture-doc-schema 技能（单一事实源=demo/schema/）
└─ out/                       生成产物（<id>/skeleton.json, frags/, course.lecture.json）
```

## 单一事实源
契约与管道脚本的**真相在 `demo/schema/`**（`lecture-doc.schema.json` / `SPEC.md` / `validate.mjs` / `assemble.mjs` / `render-verify.mjs`）。技能里的 `references/`+`scripts/` 是同步副本：
```
node lecture-agent/sync.mjs      # 改了 demo/schema/ 后重跑
```

## 接入 Hermes（一次）
1. 装 Hermes（`refs/hermes-agent`，Windows 原生支持；见其 README）。
2. 配一个 LLM provider（本地 LM Studio/Ollama，或 OpenRouter/Anthropic 等——provider 无关；key 放 `.env`）。
3. 把 `hermes/config.sample.yaml` 里的 `skills.external_dirs` 指向你机器上的 `lecture-agent/skills` 绝对路径，合并进 Hermes 配置。Hermes 会原地读到 8 个技能，各自获得 `/generate-lecture`、`/create-sim` … 斜杠命令。

## 生成一节课
在 Hermes 里：
```
/generate-lecture 为「梯度下降」生成一节面向本科生的互动讲义，约十几页，含一个 sim
```
编排器会先 `clarify` 追问（受众/篇幅/要不要 sim·runnable·quiz/主题气质），再 plan→fan-out（每个 block 一个子代理，加载对应 `create-*` 技能）→ assemble → validate → 自修 → verify，产出 `lecture-agent/out/<id>/course.lecture.json`。
把它拷成 `demo/course.lecture.json`（或让运行时指向它），`python demo/serve.py` 打开即看。

单独调某个块家族也行：`/create-sim ...`、`/create-quiz ...`（都是普通技能）。

## 端到端冒烟（真实 LLM，无需 Hermes）
已接**硅基流动 (SiliconFlow)** 作 LLM（OpenAI 兼容；key 在仓库根 `.env`，已 gitignore）。用一个轻量冒烟证明「LLM 生成 → validateBlock → 自修环」真能闭合：
```
node lecture-agent/smoke-generate.mjs <type> "<intent>"
#   type ∈ list | callout | formula | quiz | sim
#   例: node lecture-agent/smoke-generate.mjs sim "学习率 alpha 决定收敛还是发散"
```
它按 create-* 契约向硅基流动要一个 block，跑 validateBlock；不合格则把带路径的错误喂回自修一次。**已实测**：quiz 与 dynamics1d sim（含受限表达式）均首轮通过。默认模型 `deepseek-ai/DeepSeek-V3`（`SF_MODEL=... node ...` 可换）。
> 这是冒烟测试，不是 Hermes 的替代——真正的编排/并行 fan-out/loop 仍走 Hermes。

## 独立生成一整节课（mini 编排器，无需 Hermes）——路径 B
`run-lecture.mjs` 复刻 generate-lecture 技能的完整流程但独立跑：**plan(骨架) → 逐 block 并行生成(自校验+自修) → 组装 → 整档校验+自修 → render-verify → 写出**。
```
node lecture-agent/run-lecture.mjs "<课题>" [--pages N] [--theme cartesian|cobalt-grid|lab] [--audience "..."] [--id kebab]
#   例: node lecture-agent/run-lecture.mjs "梯度下降与学习率" --pages 8 --audience 本科生
```
产物在 `lecture-agent/out/<id>/`（`skeleton.json` / `frags/*.json` / `course.lecture.json`）。**已实测**："梯度下降与学习率"8 页 / 9 block 全部首轮合法、整档校验通过、render-verify 结构断言通过，共 ~12 次 LLM 调用；生成的 dynamics1d sim 是真正的 $f(x)=x^2$ 梯度下降（`update: x - alpha*2*x`）+ 正确的 α 分档 regime，主题自动选了 lab。
预览：把 `out/<id>/course.lecture.json` 拷成 `demo/course.lecture.json`（会覆盖手写的自演化智能体基线，注意备份），`python demo/serve.py` 打开。
> 路径 B 用来立刻验证「契约足以驱动全流程」。路径 A（把编排/并行/loop/自演化落到 Hermes）见下方 config/cron。

## 确定性管道（不依赖 LLM，随时可离线跑/测）
```
node demo/schema/validate.mjs <doc.json>            # 整份校验
node demo/schema/validate.mjs --block <block.json>  # 单块校验（逐块自检）
node demo/schema/assemble.mjs <skeleton> <frags> <out>   # 骨架+片段→整份+校验
node demo/schema/render-verify.mjs <doc.json>       # 结构断言+溢出启发式（真渲染需无头浏览器/人工）
```

## loop（standing）与自演化
- **loop**：`hermes/config.sample.yaml` 里的 cron 路由——周期性从 `topics.sample.jsonl` 取题→生成→验收→聚合。
- **batch 评测**：`refs/hermes-agent/batch_runner.py --dataset_file=lecture-agent/hermes/topics.sample.jsonl ...` 跑多课题产出轨迹+通过率。
- **自演化**：`node lecture-agent/skills/evolve-schema/scripts/aggregate.mjs lecture-agent/out` 汇总反复出现的 freeform 诉求/主题/引擎 → 提案（新 block 类型/主题/引擎）。**agent 只提案，人类 review 后才并入**（改 `demo/schema/` 再 `sync.mjs`）。

## 现状 / 边界
- **确定性管道 + 8 个技能骨架**：已建、离线测通过（validate 正反例、assemble、render-verify、各技能样例块、evolve 聚合冒烟）。
- **端到端 LLM 生成**：需你装好 Hermes+LLM 后真跑（本仓库开发环境无 LLM）。
- **真实渲染验收**（每页 0 溢出/交互冒烟/光标对齐）需无头浏览器或人工在 `demo/serve.py` 翻一遍——`render-verify.mjs` 目前是结构断言，已在文件里标了接无头浏览器的 TODO。
