# Notale

Notale 使用一套面向本项目的精简 AgentLoop，生成离线 HTML-native 互动讲义。

```text
topic → one-shot Style → Planner → parallel Builders → deck.html
```

## 运行

```bash
cd notale
python -m notale generate --topic "20 页路径规划讲义" --out runs
python -m notale serve --port 3002
```

当前格式的未完成运行可以恢复：

```bash
python -m notale generate --topic "原 topic" --resume runs/<run-id>
```

旧 run、旧字段和不同 contract hash 不会迁移，需开启新 run。

## Agent 与工具

独立 Style 阶段先按主题与受众生成一个本次 run 专用的具体设计 Skill。它没有工具或对话重试，
只进行一次严格 JSON Schema 输出；程序随后校验、计算 hash 并原子落盘。Root Planner 在全新上下文中
接收已固化 Style 的描述与构图目录，再负责全书叙事、章节和页面能力分配：

```text
plan · block
```

Style 与 Planner 是两个独立阶段，不共享消息历史。设计 Skill 不是预设主题名，而是一份完整的 Builder 指令，包含视觉论点、空间语法、
语义编码、贯穿母题、媒体/交互处理、连续性边界及一组安全 CSS tokens。

适合一次表达的讲义由 `plan` 直接提交完整 `chapter_pages`。明显更大的讲义将
`chapter_pages` 留空，系统保持完整章节、按软性的 `pages` 估计尽量少分组，再并行启动 Group Planners：

```text
pages · block
```

用户要求的页数只是范围提示，不是验收条件，也没有全局页数上限。Group Planner 可按内容增减
页面；各组用章节 entry/exit 符号锚点建立叙事链接，系统在确定性合并后才生成最终页码和章节区间。
除第一章外，每章至少有一页直接链接到更早章节。

Planner 成功提交后，每页启动一个独立 Builder，并由 semaphore 控制并发。Builder 的固定工具是：

```text
read_page · edit_page · submit_page · block
```

Planner 可为整本或单页增加：

```text
run_js · find_image · make_image
```

生成的设计 Skill 先注入所有 Group Planner，再作为第一份 Skill 注入每个 Builder；单页能力 Skill 随后
追加。没有模型可调用的运行时 Skill loader。Builder 可通过 revision 化的
`edit_page` 多次修改同一页；`submit_page` 负责 shell 清理、离线资源检查、HTML 边界和 JavaScript 语法检查。
失败页面会生成确定性的安全降级页，不阻断其余页面与最终组装。

## Artifact

Planner 落一个 `plan.json` 和一个运行时设计 Skill。页码由 `pages` 数组位置推导；全书 `design` 只保存
该 Skill 的 `name + sha256` 引用，页面 `skills/tools` 只增加局部能力。

每页产物只有：

```json
{"html": "<section data-notale-page>…</section>", "notes": ""}
```

run 目录的权威文件是：

```text
run.json
plan.json
skills/<generated-name>/SKILL.md
skills/<generated-name>/tokens.json
skills/<generated-name>/compositions.json
pages/pN.json
assets/manifest.json   # 仅使用媒体时创建
deck.html
slides/pN.html
runtime/
llm-requests/<agent>/turn-N.json
llm-responses/style/turn-0001.json
events.jsonl
summary.json
```

## 日志

`events.jsonl` 是权威事件流，记录独立的 `style.*` 阶段、root/group Planner、模型调用、工具调用、revision、Skill/Tool 分配、并发时序、
fallback、耗时、tokens、artifact hash 和脱敏环境快照。`llm-requests/` 保存每轮实际发送的完整请求
body（不含密钥或 HTTP header）。每条事件都有递增 `seq`，并发写入仍可还原顺序。

`summary.json` 完全由事件流派生，分别汇总 Style、Planner、Build 的阶段耗时、模型延迟、tokens、每页 turn/tool、峰值并发和错误。
`run.json` 只承担恢复状态，不重复存储 trace。

## 配置与测试

`config.yaml` 只包含模型、Planner/Builder、并发、页面工具、媒体和预览配置。代码中没有 Research agent、
证据协议、Blueprint/Expansion 双 Planner、checkpoint、迁移器或旧 schema 兼容层。

本地离线验证：

```bash
pytest -q tests
```
