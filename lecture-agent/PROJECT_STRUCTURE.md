# lecture-agent · Python 重写项目结构规范（解耦优先）

> 全量 Python 重写的**文件结构 / 目录层级规范**，以**解耦**为第一组织原则。
> 设计语言（codebase-design）：**深模块** = 小接口 + 大实现；**接缝（seam）** = 能换实现而不改调用方之处；**规则：一个 adapter 是假想接缝，两个才是真接缝——只在真正会变的轴上开接缝，不为解耦而过度分层。**
> 复现理念：一切皆实验 · 配置驱动零魔法常数 · schema 即接口（pydantic）· 确定性录制盒。
>
> **文件管理纪律（防无序新建）**：加文件前先问"它属于哪个既有文件夹的既有模式"——放得进就按那个模式放，放不进是危险信号（先改设计或讨论，别硬塞）。**加完立刻回来更新本文档的目录树**，让这张地图始终和代码对得上。临时探针/冒烟脚本一律走临时目录，不进仓库。

---

## 1 · 解耦的骨架：五层单向依赖

**核心规则：依赖只能向下，永不向上，永不成环。** 上层可依赖下层，下层对上层一无所知。这是整份规范的地基。

```
L0  kernel      schema/ · utils/           ← 依赖：无（最稳定，人人可依赖）
        ▲
L1  ports       ports/                      ← 依赖：schema        （纯抽象 Protocol，无实现）
        ▲
L2  domain      domain/*                    ← 依赖：schema+ports+utils  （纯逻辑，禁碰 adapters）
        ▲
L3  adapters    adapters/*                  ← 依赖：schema+ports+utils  （实现 ports，碰 I/O/网络/浏览器）
        ▲
L4  application engine/                      ← 依赖：schema+ports+domain （确定性建 deck 引擎，只认接口）
        ▲
L5  composition app/ · scripts/             ← 依赖：一切；唯一把 adapter 接到 port 的地方
```

> **只有一条 workflow**：`engine/generate_lecture` 是确定性建 deck 引擎，`app/generate.py::run_generation` 是它的批量/实验前端(A)，`app/build.py` 收拢共享装配。
> **对话式 agent 外壳(曾经的 Pipeline B)已整体归档至 `legacy/hermes-shell/`**（零生产里程 + 删繁就简，见其 README）；live 树只保留 workflow。

- **domain 与 adapters 是兄弟**：都只依赖 `ports`，互不 import。domain 写"做什么"，adapter 写"用什么做"。
- **只有 L5（composition root）知道具体类**：在这里用 Hydra `_target_` 把 `adapters/llm/CassetteClient` 注入成 `ports.LLMClient`。换实现 = 改一行配置，domain/agent 一字不动。
- **可测性即免费获得**：agent/domain 接受的是 port，测试传 in-memory fake 即可，不需真 LLM/真浏览器。

---

## 2 · 目录树（按层解耦）

```
lecture-agent/
├── pyproject.toml + uv.lock + .python-version
├── Makefile · .gitignore · .env.example
├── docker/Dockerfile · .github/workflows/ci.yml
├── README.md · REPRODUCE.md
│
├── configs/                      # 旋钮唯一真相源（Hydra）；_target_ 在此把 adapter 绑到 port
│   ├── config.yaml               #   defaults + seed + 全局
│   ├── llm/                      #   端点/模型/温度/seed/mode + 5 被测模型 + judge_gemini（境外走 proxy）
│   │                             #     每模型自带 fast_extra_body（关思考参数）；client 支持 extra_body/proxy 透传
│   ├── generator/                #   ★消融轴：full / single_pass / tools / fast（关思考+高并发+无章节，≤5min）
│   ├── media/                     #   default.yaml：配图 finder(Pixabay)+generator(Gemini nano-banana pro)，
│   │                             #     只在 generator.media=true 时才 instantiate，默认零成本
│   ├── planner/  eval/  theme/
│   └── experiment/               #   ★一份=一个可复现实验
│
├── lecture_agent/                # flat layout（包直接在项目根，无 src/ 包装层）
│   │
│   ├── schema/                   # L0 kernel · 依赖：无内部  ── 共享内核，最稳定
│   │   ├── document.py           #   LectureDoc/Scene/Block（pydantic）——数据契约
│   │   ├── enums.py              #   block.type/scene.kind/layout.kind/theme（枚举单一真相源；
│   │                             #     Theme 共 15 个：4 原生 + 11 个移植自 refs/frontend-slides/
│   │                             #     bold-template-pack，token 化进 viewer/index.html，与
│   │                             #     viewer/schema/enums.mjs 的 THEMES 保持双侧一致）
│   │   ├── validate.py           #   跨字段语义校验（纯函数，不做 I/O；hero.image/离线红线在此拦远程 URL）
│   │   │                         #   BlockType 新增 chart/stats/diagram（CONTENT_TAXONOMY 路线图 1/3 项）；
│   │   │                         #   LayoutKind 新增 full；_Block.fragment 拓宽 bool|str（reveal fragment 类型名）
│   │   └── experiment.py         #   ExperimentRecord/CapabilityProfile/CodeMarker/Cost —— 实验账本一行的契约
│   │                             #     （experiments/results/ledger.jsonl，见 §实验记录员）
│   │
│   ├── utils/                    # L0 kernel · 依赖：无内部  ── 横切机制
│   │   ├── seed.py  logging.py  provenance.py  registry.py
│   │
│   ├── ports/                    # L1 · 依赖：schema  ── 纯抽象接缝（Protocol，零实现）
│   │   ├── llm.py                #   LLMClient + ToolCallingLLM —— 真接缝（httpx-live/cassette/fake）
│   │   ├── tool.py               #   Tool —— function-calling 工具接缝（纯工具/IO 工具/fake）
│   │   ├── renderer.py           #   RenderVerifier —— 接缝（当前仅 structural；真机 verifier 已归档）
│   │   ├── store.py              #   CorpusStore —— 真接缝（filesystem / in-memory）
│   │   └── media.py              #   ImageFinder + ImageGenerator —— 真接缝（Pixabay live / Gemini live / fake）
│   │
│   ├── domain/                   # L2 · 依赖：schema+ports+utils  ── 纯逻辑，深模块，禁碰 adapters
│   │   ├── planning.py           #   多视角 STORM 规划（单文件，拍平）  接口: plan_lecture->PlanResult
│   │   ├── themes.py             #   主题描述注册表(纯视觉/零学科,取自 frontend-slides 源头) 接口: theme_menu()；喂规划器选主题决策面
│   │   ├── assemble.py           #   ★纯函数：骨架+生成结果->整份 doc（回填，可纯测）
│   │   ├── evolve.py             #   语料挖掘 n-gram 未满足需求->提案（human-in-loop gate）
│   │   ├── tool_loop.py          #   有界 think→call→observe 循环（节点内用，只认 ports）
│   │   ├── tools/                #   纯工具：calc（AST 安全求值，验 sim 表达式）实现 ports.Tool
│   │   ├── generation/           #   blocks + material + notes + widget（多文件包）  接口: generate_block
│   │   │                         #     widget.py: sim.widget 生成子配方(plan→build→repair,借鉴 GenUI,SPEC §7.1)
│   │   ├── evaluation/           #   ppteval/coverage/diversity + completeness(确定性门,纯函数) + pairwise(去偏成对,judge 经 port)
│   │   ├── skills/               #   registry + authoring（契约注册表；家族契约文件在仓库根 skills/，
│   │   │                         #     如 skills/create-sim/、skills/create-chart/、skills/create-infographic/
│   │   │                         #     (stats+7种diagram，CONTENT_TAXONOMY §三-1/3)）
│   │   ├── media/                #   icons.py：图标关键词匹配(纯函数) + attach_icons(list 项自动配图标收尾)
│   │   └── telemetry/            #   profile.py：profile_deck(doc)->CapabilityProfile（纯函数，遍历
│   │                             #     scenes/blocks 数能力画像；记录 hook 与回填脚本共用同一口径）
│   │
│   ├── adapters/                 # L3 · 依赖：schema+ports+utils  ── 实现 port，独担 I/O 副作用
│   │   ├── llm/                  #   httpx OpenAI 客户端 + cassette（live/replay） → LLMClient
│   │   │   └── prompts/          #     Jinja2 模板（提示词属 LLM adapter 的私有资产，不泄进 domain）
│   │   ├── render/               #   structural.py：无浏览器结构校验 → RenderVerifier
│   │   ├── store/                #   文件系统 corpus/results 读写 → CorpusStore
│   │   │   └── ledger.py         #     LedgerStore：append-only 写/读 experiments/results/ledger.jsonl（实验账本）
│   │   └── media/                #   pixabay.py(图库) + gemini_image.py(nano-banana pro 文生图) + fake.py
│   │
│   ├── engine/                   # L4 · 依赖：schema+ports+domain  ── 确定性建 deck 引擎
│   │   ├── __init__.py           #   导出 generate_lecture / GeneratorOptions / GenerateResult
│   │   └── pipeline.py           #   plan→generate→assemble→validate→render→eval（全走 port）
│   │
│   └── app/                      # L5 · 依赖：一切  ── 组合根：唯一 new 具体 adapter 之处
│       ├── build.py              #   共享装配：build_llm / build_options / model_of / usage_of
│       ├── generate.py           #   run_generation（注入 port → 跑 engine → 存 deck → 记账本）
│       ├── cli.py                #   `lecture-agent generate` 薄入口 → app.generate
│       └── codeprint.py          #   git_rev/git_dirty/agent_fingerprint —— 给账本行盖"哪版代码产出"的戳
│                                 #   （对话式 agent 外壳 shell/ + app/chat.py 已归档 legacy/hermes-shell/）
│
├── scripts/                      # L5 薄入口：只 import app/ + 读配置
│   ├── generate.py  evaluate.py  evolve.py  render_check.py  run_experiment.py
│   ├── run_matrix.py             #   多模型×多样本横评机楼（build_llm/计时/日志，被下面两个复用）
│   ├── eval_matrix.py            #   可信标尺：确定性门 + Gemini 去偏成对排名 → eval_v2
│   ├── bench_latency.py          #   延迟 benchmark：slow vs fast(关思考) 时间×质量对照表
│   └── backfill_ledger.py        #   一次性：把 experiments/results/matrix_*/**/deck.json + experiments/corpus/*.lecture.json
│                                 #     历史产物回填进 experiments/results/ledger.jsonl（幂等，历史行 code.label="historical"）
│
├── assets/runtime/               # reveal.js 主题/CSS/JS 静态资源（离线，随包分发）
├── experiments/                  # 实验相关一处收拢（输入入库 / 生成物 gitignore）
│   ├── fixtures/                 #   [入库] LLM 录制盒（离线 replay；配置里 fixtures_dir 指向它）
│   ├── topics/                   #   [入库] 输入题集（topics.jsonl + benchmark_topics.md）
│   ├── corpus/                   #   [gitignore] 生成的 deck 产品（out_dir 默认）
│   └── results/                  #   [gitignore] 每 run 一目录 + ledger.jsonl（append-only 实验账本）
├── docs/harness/                 # 工程纪律档案：decisions.md + mechanisms/M-*（"为什么这么设计"）
└── tests/                        # 传 fake adapter，不碰真 LLM/浏览器
    ├── test_schema.py  test_assemble.py  test_pipeline_smoke.py  test_experiment.py
```

---

## 3 · 接缝清单（每个 port 都用"≥2 实现"证明它该存在）

| Port（L1） | 实现（adapters） | 为何是真接缝 | 谁依赖它 |
|---|---|---|---|
| `LLMClient` | httpx-live · cassette-replay · in-memory-fake | 生成/评测都要调 LLM；live/replay 是确定性命根子；测试要 fake | domain.generation / planning / evaluation |
| `RenderVerifier` | structural（结构校验，不起浏览器） | run 产物结构校验要可换、单测要隔离 | run_matrix（真机 verifier 已随外壳归档） |
| `CorpusStore` | filesystem | run 产物读写要可换 | app.generate / run_matrix |

**不开的接缝（避免过度设计）**：
- `assemble`（JSON→HTML）是**纯函数**，不开 port——只有一种实现，直接调，天然可测。
- 评测**不单开 `Evaluator` port**：它是 domain 逻辑，调用已抽象的 `LLMClient` 即可被 fake 测试。除非将来要整体替换评测策略（第 2 个实现出现）再抽。
- block 生成器多变 → 用 `utils/registry` 而非一堆 port：同一接口、配置选名字，是"内部接缝"，不上升为跨层 port。

---

## 4 · 深模块规范（每个包对外只露窄接口）

- **每个包用 `__init__.py` 导出最小公共面**；实现细节放 `_private.py` 或子模块，跨包只 import 公共面。
- **深度自查（deletion test）**：删掉这个包，复杂度是消失（说明是穿透壳，该合并）还是在 N 个调用方重现（说明它在挣钱，保留）。
- 典型深接口（大实现藏在后面）：
  - `domain.generation`：对外仅 `generate(outline, llm) -> LectureDoc`；fan-out、逐块、self-repair 全藏内部。
  - `adapters.render`：对外仅 `verify(html) -> RenderReport`；Playwright/CDP/等待/截图全藏内部。
  - `adapters.llm`：对外仅 `LLMClient.complete(msgs, params) -> str`；录制盒 hash/命中/落盘全藏内部。
- **接受依赖，不自造依赖**：domain/agent 的函数签名收 `LLMClient`/`RenderVerifier`，内部**绝不** `new CassetteClient()`。
- **返回结果，不留副作用**：`assemble`、`validate`、`evaluate` 返回值，不就地改全局/写盘（写盘归 `CorpusStore` adapter）。

---

## 5 · 依赖规则的机器强制（否则规范会腐烂）

- 用 **import-linter** 写契约，进 CI：声明层序 `schema < ports < {domain, adapters} < engine < app`，任何逆向/跨层/环 import 直接 fail。
- `domain/` 禁止出现 `import ...adapters...`（linter forbidden contract）。
- `engine/` 禁止 import `adapters/`（只能 import `ports/` 与 `domain/`）。
- `mypy` 开严格模式：port 是 `Protocol`，adapter 结构化满足即可，连显式继承都不需要——解耦到类型层。

---

## 6 · 旧 Node → 新层的落位（重写对照）

| 旧 `.mjs` | 新落点（层） | 要点 |
|---|---|---|
| `demo/schema/enums.mjs` | `schema/enums.py` (L0) | `StrEnum`，单一真相源 |
| `demo/schema/validate.mjs` | `schema/{document,validate}.py` (L0) | pydantic 声明式，缺字段默认兜底 |
| `demo/schema/assemble.mjs` | `domain/assemble/` (L2，纯函数) | Jinja2；reveal.js 资源进 `assets/runtime/` |
| `src/llm.mjs` | `ports/llm.py`（接口） + `adapters/llm/`（实现） | **拆接口与实现**；录制盒是 adapter 内部 |
| `src/plan.mjs` | `domain/planning/` (L2) | 调 `ports.LLMClient` |
| `src/pipeline.mjs` | `domain/generation/pipeline.py`+`blocks/` (L2) | block 注册化 |
| `src/material.mjs` `notes.mjs` | `domain/generation/material.py` (L2) | 素材锚定 |
| `src/skills.mjs`+`skills/` | `domain/skills/` (L2) | registry+loader |
| `src/evolve.mjs` | （已删：运行时无引用的死代码，见瘦身记录） | 提案 gate 概念仍在 skills/evolve-schema 与 propose 工具 |
| `src/evaluate.mjs` `coverage.mjs` `tools/diversity.mjs` | `domain/evaluation/` (L2) | judge 经 port |
| `tools/render-check.mjs` `tools/lib/browser.mjs` | `adapters/render/` (L3) | 改 Playwright |
| `src/agent.mjs` `pipeline.mjs` | `engine/pipeline.py` (L4 共享) | 建 deck 引擎，只认 port |
| `src/loop.mjs` `clarify.mjs` `delegate.mjs` | `legacy/hermes-shell/`（已归档） | ReAct 外壳；曾是 Pipeline B，零生产里程后冻结 |
| `bin/lecture-agent.mjs` | `app/{build,generate,cli}.py` + `scripts/*` (L5) | 组合根 + 薄入口 |
| `tools/check-consistency.mjs` | `tests/` + `mypy` + import-linter | 一致性靠类型+契约 |

---

## 7 · 验收清单

- [ ] import-linter 契约在 CI 绿：无逆向/跨层/环依赖；`domain/` grep 不到 `adapters`。
- [ ] 换 LLM 实现（live↔replay↔fake）= 只改 `configs/llm/*`，domain/agent 零改动。
- [ ] 全套单测只传 fake adapter 即可跑，不需真 key、不启浏览器。
- [ ] `assemble`/`validate`/`evaluate` 均为返回值、无副作用，可纯测。
- [ ] 任取一包做 deletion test，都能说清它挣的是什么钱（非穿透壳）。
- [ ] 每个 port 都能点名 ≥2 个真实实现；点不出的接缝已降级为 registry 或直接调用。
