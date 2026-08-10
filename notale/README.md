# Notale

Notale 按 `methodology/` 的 harness architecture 与 pipeline schema 生成 Reveal.js
HTML-native 讲义。每页保持完整 HTML 产物，通过 sandbox iframe 嵌入 Reveal 外壳；
页面 CSS、脚本和 ID 相互隔离。

## 目录

- `agents/`：Agent worker 与 OpenHarness 运行适配层。
- `cli/`：统一命令行入口。
- `core/`：artifact schema、状态、时长模型与确定性工作流。
- `docker/`：可运行的隔离环境；不承担逐 agent 的容器调度。
- `roles/`：四份 Markdown 角色契约；正文是常驻职责，frontmatter 声明工具白名单与可选 skill 权限。
- `skills/`：按任务显式分配的可选能力，不承载角色常驻流程。
- `tools/`：Agent 可调用工具及其测试替身。
- `utils/`：严格配置、解析等公共基础设施。
- `web/`：Reveal.js 组装、包内离线 runtime 与预览服务。
- `tests/`：全离线测试。

## 统一配置

所有可调运行参数集中在 [`config.yaml`](config.yaml)，代码中不再分别维护角色预算或
页型常量。主要分区如下：

- `model`、`model_capabilities`：模型连接参数，以及 context/output 的技术能力边界；
- `governance`：进展判定、重复错误与 prose-only 停滞检测，以及只用于异常失控的
  run/query/worker 高位熔断；
- `agents`：各角色 compact 阈值；agent protocol 版本由 `versions` 唯一声明，
  不再按页型设置日常 token/turn/time 预算；
- `runtime`、`pipeline`：compact 安全余量、页面并发、默认课时和日志截断参数；
- `research`、`tools`：Research 总开关与分支、搜索/抓取额度、chunk 大小、JS 检查与网页读取限制；
- `media`：真实/生成素材 provider 与单页、单次运行的素材预算；
- `duration_model`、`deck`、`preview`：页数/章节/页型时长模型、跨页去重和预览地址。

配置由 `utils/config.py` 以严格 Pydantic schema 加载。未知字段（包括拼错的
`max_ouput_tokens`）、缺字段和非法范围会在启动时直接报错。每次实验还会把完整 resolved
configuration、resolved role 与 effective governance policy 写进 `logs/sessions.jsonl`，便于
复现实验。API key 是唯一例外：YAML 只保存
环境变量名，密钥仍只能放在进程环境、`.env.local` 或 `.env` 中。

修改参数不改变固定运行命令；保存 `config.yaml` 后，下一次 `notale generate` 或
`notale serve` 启动时生效。

## Agent 内循环

确定性 workflow 负责阶段编排、artifact 共享写入、并发与失败降级；
Intake、配置中启用的每路 Research、Planner 以及每页 Builder 都是独立 OpenHarness agent loop。
每个 worker 拥有：

- 独立 QueryEngine 会话，context window 及 compact 阈值由 `config.yaml` 控制；compact
  会预留 system prompt 与 tool schema；
- 每个角色从 `roles/intake.md`、`research.md`、`planner.md` 或 `builder.md` 加载完整常驻契约；
  frontmatter 是 tool 白名单与可选 skill 授权的唯一来源，正文是静态 system prompt。文档路径、哈希和
  实际分配的 skills 写入日志；角色文档变化会使未完成 worker 的旧 checkpoint 失效，但保留累计预算；
- Intake 与 Planner 没有常驻或可选 skill，也没有 `skill_read`。课程需求分析、课程规划、证据路由和
  Builder 能力编排已经写入各自角色正文，不再通过 resident skill 重复注入；
- Planner 只从 Builder 角色授权的 catalog 选择可选能力，结果以 BuilderPlan v2 单独落盘为
  `builder-plan.json`。`narrative-keynote` 是可选的全书表达 skill；`create-sim` 与
  `create-code-runtime` 是显式分配的逐页能力。Builder 的页面构建、出版编辑和真实计算交互规范
  已常驻 `builder.md`，不出现在 BuilderPlan；`pageType` 不触发自动装配；
- style profile 属于定义它的 skill。Planner 只能选择 catalog 中的 profile；Builder 只读取
  被选中的 `profile-*.md`，不会加载同一 skill 的其他 profile。profile token 是对固定
  `global.css` 默认值的安全覆盖，不进入 PageContext 的课程字段；
- Planner 优先路由 Research 的 `PrepRecord`；缺少稳定教材知识时，可提交 harness 标记为
  `planner-generated` 且无外部 evidence 的补充记录。补充记录单独落盘，逐页绑定后才会进入
  Builder 的最小 PageContext。Context 只含当前页 brief、章节/全书叙事切片、选择性跨页关系、
  绑定资料的事实与 guardrails 投影，以及精确的 `SkillAssignment[]`；不会累积此前所有页面命题，
  完整 evidence 与 provenance 仍留在独立审计 artifact；
- 每个 Research worker 从 `config.yaml` 独立获得研究方向、skills 和 Research 安全工具；
  当前安全工具表包含 `web_search` 与 `fetch_web`。搜索/抓取失败同样消耗次数预算，避免
  模型猜 URL 或无限重试；
- Harness 根据真实工具事件维护 objective / acceptance criteria / steps 任务台账；
- 只读 run artifacts 和私有 workspace，不能读取其他 worker 的状态；
- Builder 完成整页后用一次原子 `submit_page` 传入 HTML 与小型元数据；Harness 在同一工具执行中
  写入页面、规范化 document shell、检查并直接提交，不再用多轮工具握手；
- 教学性交互必须由真实的算法、方程、状态机、规则判定器或数据变换产生状态：控件只提交
  输入/动作或移动 trace 游标，DOM/SVG/Canvas 只投影计算结果，不能用手写帧伪造状态变化；
- Builder 自主决定标题、视觉对象和交互表达，可用 `acquire_media` 获取 Wikimedia Commons
  真实素材，或用 `generate_media` 调用 ParaTera Doubao Seedream 4.0 生成非纪实编辑插图；工具自动
  下载到 `assets/` 并维护 `asset-manifest.json`；
- 结构化 submit tool 完成门；提交一经接受，harness 立即终止该 loop，不再额外请求一轮
  “完成确认”，自然语言终稿不算 artifact；
- 正常路径由结构化提交结束；连续无进展、prose-only、重复工具/验证错误会明确标记 stalled；
- query continuation、单次 provider 超时以及 worker/run 的 turn/时间/token 高位熔断、
  首事件前受控重试、原子 checkpoint、断点恢复和同会话页面返工。

`submit_page` 内部只负责 schema、离线依赖、本地素材、引用绑定和 inline JavaScript 语法等
可交付性检查。它不启动浏览器点击控件，也不把“DOM 发生变化”冒充交互语义正确。检查失败会
保留 `workspace/page.html` 和提交元数据；当前 Builder 用 `page_patch` 修复后，Harness 自动复检
并直接提交。提交之后没有第二套 verifier 或 counterexample ledger。成功页记为 `completed`，
Builder stalled/failed 时生成静态 `degraded` 页。

Builder 的正式产物固定为 `workspace/page.html`。`submit_page` 负责首次写入、检查和提交；
`page_read`、`page_search`、`page_patch` 只供失败后的定点恢复。私有 scratch 目录只供 harness 做
inline JavaScript 语法检查，不作为 agent 工具暴露。每个 iframe
由 runtime 注入 `global.css`，页面仍保留自己的 HTML、CSS 与 JavaScript。

Research 分支不是四个固定槽位。`research.branches` 可以声明任意数量的专能；`id` 是日志和
断点目录使用的稳定身份，`focus` 是交给该 worker 的研究方向，`enabled` 控制是否启动：

```yaml
research:
  enabled: true
  branches:
    - id: r1
      enabled: true
      focus: 教学序列
      skills: [web-access]
      tools: [web_search, fetch_web]
    - id: case-library
      enabled: false
      focus: 寻找可用于课堂推演的真实案例
      skills: []
      tools: [web_search, fetch_web]
```

顶层 `enabled: false` 会真正跳过整个 Research stage：不启动 agent，不调用模型或联网工具，
并为下游落盘空的 `notes / records / pedagogy` artifact。当总开关为 `true` 时，Research agent
数量等于 `enabled: true` 的分支数；若为 0，同样跳过整个 stage。此时 Planner 必须用
`planner-*` 补充记录建立页面事实基础，章节 `pedagogyNoteIds` 留空，并在 `rationale` 中自洽说明排序理由。
修改分支配置只对新实验生效；恢复
已有实验时继续使用已落盘产物。分支 skill 必须同时位于 `skills/` 且获得 `research.md` 的
`skills.assignable` 授权；其所需工具必须包含在该分支的 `tools` 中。

每个 worker 的持久状态位于：

```text
runs/<run-id>/agents/<stage>/<worker-id>/
├── workspace/
│   ├── page.html          # Builder 的唯一正式页面源
│   └── scratch/           # Harness 临时检查目录，不暴露给 agent
├── session.json
├── task.json
├── tool-state.json
└── submission.json
```

## 固定运行方式

以下命令是 Notale 短期内唯一的官方运行入口。先进入仓库并激活虚拟环境：

```bash
cd /data1/home/zhuyifan/ws2/Notale
source notale/.venv/bin/activate
```

运行实验：

```bash
notale generate --topic "你的讲义需求" --yes
```

产物写入 `notale/runs/<date>-<id>/`，包括阶段 artifacts（含独立的
`planner-prep-records.json` 与 `builder-plan.json`）、`deck.html`、
`slides/*.html`、`assets/`、`asset-manifest.json`、`media-budget.json`、离线 Reveal runtime、
只陈述 completed/degraded 状态的质量报告，以及完整实验日志。Harness 不生成
`verification/`、`ledger/` 或自动 `library-delta.json`。

断点续跑会复用已落盘的 `builder-plan.json`。BuilderPlan v1 会在内存中确定性移除旧的
`page-builder-core` 项并升级为 v2，原 artifact 不重写且迁移写入日志。旧 run 的成品
`deck.html` 不受影响；未完成的旧 run 若没有该控制面 artifact，会明确拒绝续跑，需新开实验。

### 实验日志

每个新实验会在 run 的 `logs/` 中保存完整审计记录：

- `sessions.jsonl`：每次运行或断点续跑的配置、模型、起止时间和终态；
- `llm-calls.jsonl`：provider 请求开始、首个流事件、成功/超时/异常，以及每回合的模型、
  延迟、token、context hash/峰值和消息序号；不重复完整历史；
- `agent-traces.jsonl`：逐轮回复、Builder plan 与 catalog hash、skill assignment/profile/hash、
  task 更新、工具输入输出、submit、checkpoint、compact/error 事件；
- `runtime.log`：与终端一致的实时阶段摘要；
- `summary.json`：按 role/agent/pageType 汇总调用量、token、延迟、context peak、provider
  超时、工具错误、progress/stalled 与 compact。

run 根目录还会生成：

- `profile-snapshot.json`：本次实验实际使用的角色文档路径与哈希、prompt、可选 skill policy、
  实际 tools、schema、pipeline 和治理配置。

Harness 不会自动生成经验报告或经验候选，也不会自行修改 role contract、loop、context policy、
pipeline、schema、skill 或 tool。实验完成后，由开发协作者在用户监督下读取上述日志和 artifacts、
提出诊断与沉淀候选；只有得到用户明确确认后，才修改正式代码或配置。

增量 trace 与 worker checkpoint 可以重建会话。日志不会保存 API key 或 Authorization header，
但会保存用户材料、模型回复和网页工具输出。
因此 `runs/` 必须保持在 gitignore 中。日志写入失败不会阻断生成，终端会显示
`LOG WARNING`，且最终汇总的 `auditComplete` 会标为 `false`。

常用扩展参数：

```bash
# 保留课程契约的人工确认
notale generate --topic "你的讲义需求"

# 从已有 run 断点续跑
notale generate --topic "你的讲义需求" --resume notale/runs/<run-id>

# 附带本地材料
notale generate --topic "你的讲义需求" --material path/to/material.md --yes
```

CLI 自动读取包根目录的 `.env.local`，无需 `source`：

```bash
cp notale/.env.example notale/.env.local  # 仅首次配置
# 编辑 notale/.env.local，填入 PARATERA_API_KEY；以后无需 source 此文件
```

优先级为：进程环境变量 > `.env.local` > `.env`。
`PARATERA_API_KEY` 同时供 Sonnet 讲义生成和 Seedream 图片生成使用。

## 预览

```bash
notale serve
```

当前 `config.yaml` 将 `notale serve` 默认监听设为服务器 `0.0.0.0:3002`。本地转发后访问
`http://localhost:3001`：

```bash
ssh -L 3001:localhost:3002 zhuyifan@188.239.60.251
```

## 测试与 Docker

```bash
python -m pytest notale/tests -q
docker compose -f notale/docker/compose.yaml build
docker compose -f notale/docker/compose.yaml up preview
```

## 命令稳定性约束

上述官方命令短期内保持稳定。未经项目所有者明确确认，不得修改：

- `notale` CLI 名称以及 `generate`、`serve` 子命令；
- 实验命令的参数含义与默认输出位置 `notale/runs/`；
- `config.yaml` 中当前预览默认监听地址 `0.0.0.0`、服务器端口 `3002`；
- 虚拟环境位置 `notale/.venv/`；
- 本 README 中列出的官方运行命令。

如确需变更，必须先说明变更原因、兼容影响和迁移方式，向项目所有者请示并获得明确同意，
再修改代码与文档。

OpenHarness 的具体集成边界与已知限制见 `docs/openharness-spike.md`。
