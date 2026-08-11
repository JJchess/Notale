# Notale Harness 架构

> 本文描述当前代码中的内循环。`CHARTER.md` 与 `EVAL.md` 负责外循环；`PREP.md`、
> `VERIFY-EXEC.md` 和 `research/` 是方法论与实验参考，不是运行时 Agent 或 schema。

## 1. 系统边界

Notale 的精简 AgentLoop 外只保留四类东西：

1. 一个确定性工作流；
2. Planner/Builder profiles；
3. Planner 元 Skill、运行时设计 Skill 与页面能力 Skills；
4. Planner/Builder Tools。

```text
topic
  → Planner agent loop
      style → plan
  → plan.json
  → Builder agent loops × N（并发）
  → deterministic fallback / assembly
  → deck.html
```

没有 Intake、Researcher、Blueprint/Expansion 双 Planner、Verifier Agent、自动经验沉淀或迁移层。

## 2. Planner

Root Planner 是单一持续上下文，负责全书级决策：

- 先生成一个本次 run 专用的统一视觉 Skill；
- throughline 与章节目标；
- 页面之间的远距离联系；
- 每页唯一命题、学习动作与叙事角色；
- 为页面分配真正需要的 Skill/Tool。

Root 工具只有：

```text
style → plan
        ↘ block
```

`style` 写入并校验 `SKILL.md + tokens.json`，但不终止 Planner；模型收到成功结果后，必须在下一
回合调用 `plan`。约二十页的讲义可一次提交完整 `chapter_pages`；明显更大的讲义将其留空，由尽量少的
完整章节组并行调用 `pages`。最终验证 link 范围、跨章联系和能力授权后保存 `plan.json`。

Planner 不写页面文案、布局坐标或 HTML。视觉一致性通过生成的 design Skill 形成；具体页面布局由
拿到完整 Skill 的 Builder 决定。`plan.json.design` 只保留该运行时 Skill 的名称与内容哈希。

## 3. Builder fan-out

Planner 终态提交后，Workflow 才按页面顺序将 Builder 放入 semaphore。每个 Builder 是一个独立
Notale AgentLoop，只看到：

- 本页 claim、learning action、page type；
- 全书 throughline、本章 goal、本页 narrative role 和 links；
- 与本页文字相关的 notation；
- 本次 run 的完整设计 Skill，以及 Planner 分配的页面能力 Skills 与 Tools。

固定工具：

```text
read_page · edit_page · submit_page · block
```

可选工具：

```text
run_js · find_image · make_image
```

完整 Skill 在第一次模型调用前注入 system context。没有 `skill` loader、Bash、通用文件工具、
grep/glob、todo 或 artifact search。

## 4. 页面事务

Builder 可在同一 agent loop 中多次操作唯一工作文档：

```text
read_page(revision)
      ↓
edit_page(mode, revision, ...)
      ↓
submit_page(revision, notes)
```

每次编辑都检查并增加 revision，过期写入不能覆盖当前页面。`edit_page` 支持整页 replace 和唯一
字符串 patch。`submit_page` 读取当前 revision，并在同一次工具执行中完成：

- document shell 清理；
- 唯一 `data-notale-page` 根节点检查；
- 离线依赖与本地素材检查；
- placeholder 和运行时值泄漏检查；
- inline JavaScript `node --check`；
- 页面 artifact 原子写入和冻结。

失败只把具体诊断返回当前 Builder。成功页面 schema 只有：

```json
{"html": "string", "notes": "string"}
```

如果 Builder 报告 blocker、超时或退出而未提交，Workflow 写入同 schema 的确定性 fallback；单页失败
不会取消其他 Builder。

## 5. 交互正确性的边界

交互不是靠界面“演得像”，而是靠真实构造关系：

```text
input/action → algorithm/equation/rule/state machine → state/trace/result → renderer
```

例如冒泡排序页面的状态必须来自实际运行的冒泡排序算法；按钮只提交输入或移动 trace 游标，DOM
只投影结果。Builder 可自己生成这个小型后端，也可以使用已有 runtime/package。

`submit_page` 能证明代码在交付边界上可解析、离线资源存在、页面结构有效；它不冒充学科真值证明。
更强的事实核对、视觉评估和教学效果判断属于之后由用户监督的实验，不在生成 workflow 中复制一套
Verifier 状态机。

## 6. 状态与恢复

`run.json` 是唯一状态源。页面状态只有：

```text
pending → running → completed | degraded
```

恢复只接受当前严格 schema 和相同 contract hash：

- `completed/degraded` artifact 直接复用；
- 运行时设计 Skill 的两个文件与 `plan.json.design.sha256` 必须一致；
- `running` 重置为 `pending`，工作目录清理后重新启动 Builder；
- 缺失 artifact、旧 run、旧字段或 hash 变化直接拒绝，不迁移。

AgentLoop 管理对话、工具结果反馈和 turn limit。它不自动压缩上下文；超出供应商上下文会明确失败。
Notale 不另存 conversation checkpoint，不发 recovery query，也不维护第二套 retry/stall governor。

## 7. 日志

`events.jsonl` 是权威事件索引，所有并发写入经过同一锁并获得递增 `seq`。它记录：

- run/stage/agent 生命周期和耗时；
- provider/model call、首事件延迟与 tokens；
- 每轮完整模型请求的独立 JSON、hash、大小与本地写入耗时；
- 有效 prompt、Skill/Tool 注入；
- Planner 写入、Builder revision、工具结果和校验错误；
- Builder 实际并发顺序、fallback 与 artifact hash；
- Git commit/dirty 状态、脱敏配置和契约 hash。

大 HTML、base64 和二进制只记大小、hash 和短预览；密钥永不落盘。`summary.json` 完全从事件流派生，
汇总模型成本、阶段耗时、每页 turn/tool、能力分配、峰值并发和错误。`run.json` 不重复 trace。

## 8. Artifact 清单

```text
run.json
plan.json
skills/<generated-name>/SKILL.md
skills/<generated-name>/tokens.json
pages/pN.json
assets/manifest.json   # 仅媒体工具实际使用时创建
deck.html
slides/pN.html
runtime/
llm-requests/<agent>/turn-N.json
events.jsonl
summary.json
```

这份清单之外的中间计划、Agent task ledger、质量报告和兼容 artifact 都不属于当前 Harness。
