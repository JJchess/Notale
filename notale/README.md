# Notale

Notale 使用一套面向本项目的精简 AgentLoop，生成离线 HTML-native 互动讲义。

```text
topic → one-shot Style → Planner → parallel Builders → per-page visual inspection → deck.html
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

独立 Style 阶段先按主题与受众生成一个本次 run 专用的具体设计 Skill。它没有工具，只进行一次逻辑上的
严格 JSON Schema 输出；传输层遇到限流或短暂上游错误时会按统一策略重试。程序随后校验、计算 hash 并原子落盘。Root Planner 在全新上下文中
接收已固化 Style 的描述与构图目录，再负责全书叙事、章节和页面能力分配：

```text
plan · block
```

Style 与 Planner 是两个独立阶段，不共享消息历史。设计 Skill 不是预设主题名，而是一份完整的 Builder 指令，包含视觉论点、空间语法、
语义编码、贯穿母题、媒体/交互处理、连续性边界及一组安全 CSS tokens。
原始 topic 完整交给 Style；在进入 Planner 前，仅移除明确标注的视觉风格段落与指令，学科主题、受众、页数和代码/CSS 示例保持不变，清理结果写入事件流。

Style 还会从项目内置的 20 家族离线字体目录中分别选择 `font-display`、`font-body` 与
`font-mono`。目录覆盖中文黑体、宋体、楷体、仿宋、书写/展示体以及拉丁正文、展示和代码字体；
模型只能选择真实 ID，不能编造系统字体。每个 run 只复制实际选中的字体与必要的 CJK fallback，
普通页面、Inspector、托管组件和最终 deck 因而使用同一套本地 WOFF2，不依赖 CDN 或宿主系统字体。

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
read_page · edit_page · inspect_page · submit_page · block
```

Planner 可为整本或单页增加：

```text
run_js · find_image · make_image · make_backplate · create_widget · create_code_runtime
```

`sim-explorable` 与 `code-runnable` 的组件工具由系统在 Planner 提交后确定性补齐，因此漏选不会触发
Planner 重试。`create_widget` 把 GenerativeUI 的方向、模块与示例适配到固定画布和当前 Style，正常使用
一次结构规划和一次组件构建调用；`create_code_runtime` 只用一次模型调用生成练习规格，编辑器、Web Worker、
Run/Reset 与 fixtures 全由确定性模板编译。两者失败时至多追加一次定向修复。

生成的设计 Skill 先注入所有 Group Planner，再作为唯一 Skill 注入每个 Builder；页面局部能力全部通过
工具提供，没有模型可调用的运行时 Skill loader。组件源码独立写入 run，不进入 Builder 消息历史；Builder
只拿到一个短的 sandbox iframe 占位符。Builder 可通过 revision 化的 `edit_page` 多次修改同一页。

`inspect_page` 是同一个 Builder 会话中的普通工具，不是终止工具；它会在工具内部启动一次隔离的 Inspector 模型调用。
它先执行离线资源、HTML 边界和 JavaScript 语法检查，再用最终 slide shell 在 Chromium 中以精确的
1280×720 视口渲染。随后工具内部只进行一次隔离、无工具的多模态模型调用，输入严格限定为完整 Style、
当前 composition 与 tokens、当前 HTML 和当前截图；不继承 Builder profile、任务、历史或旧截图，也不执行
几何、溢出或控制台机械诊断。模型返回 `success` 或完整修订 HTML；修订通过内容保全与交付检查后由工具
原子落盘，并要求 Builder 用新 revision 再次检查。每页最多由 Inspector 代写四次修订，最终版本仍须得到
一次 `success`，之后 Builder 才能在下一轮用 `submit_page` 提交。浏览器或审查失败时不覆盖当前合法页面，
控制权返回 Builder；Builder 最终无法完成时才生成安全降级页。

StylePack 的 `mascot_policy` 不再只是交换字段：materialize 时，装饰图片会按内容哈希复制到
`style_refs/decorations/`，按页面角色启用，同一家族随页码稳定轮换，chrome icon 始终随行。runtime 将其
注入真实页面根节点，因此和普通视觉元素一样接受 overlap/overflow 测量，而不进入页面媒体 manifest。

`make_backplate` 生成无字、无面板的背景底板，HTML 文字仍由页面排版。负面约束会合并进 Seedream 的单一
prompt，而供应商请求体仍严格只有 `model` 与 `prompt`。可用相同合同比较后端：

```bash
notale style backplate-bench swiss-modern \
  --composition argument-split --backends seedream --repeats 2
```

命令在 Style build gallery 下写图片、`bench.json` 与 `report.md`；成本只在供应商明确返回数值型
`usage.cost` 时报告，不依据模型名或图片大小估算。

## Artifact

Planner 落一个 `plan.json` 和一个运行时设计 Skill。页码由 `pages` 数组位置推导；全书 `design` 只保存
该 Skill 的 `name + sha256` 引用，页面 `tools` 只增加局部能力。

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
style_refs/image_channel.json
style_refs/decorations.json
style_refs/decorations/<content-hash>.*
pages/pN.json
assets/manifest.json   # 仅使用媒体时创建
components/manifest.json   # 仅使用托管组件时创建
components/pN-*.html
inspections/pN.json
inspections/pN-round-N.html
inspections/pN-round-N.png
deck.html
slides/pN.html
runtime/
runtime/fonts.css
runtime/fonts/*.woff2   # 仅包含本次 Style 选中的字体与必要 fallback
llm-requests/<agent>/turn-N.json
llm-responses/inspection-pN/turn-N.json
llm-responses/style/turn-0001.json
events.jsonl
summary.json
```

## 日志

`events.jsonl` 是权威事件流，记录独立的 `style.*` 阶段、root/group Planner、组件 plan/build/repair/validation、模型调用、工具调用、revision、Skill/Tool 分配、并发时序、
fallback、耗时、tokens、artifact hash 和脱敏环境快照。`llm-requests/` 保存每轮实际发送的完整请求
body（不含密钥或 HTTP header）。每条事件都有递增 `seq`，并发写入仍可还原顺序。

`summary.json` 完全由事件流派生，分别汇总 Style、Planner、Build、组件与 Builder 内截图检查的阶段耗时、模型延迟、tokens、每页 turn/tool、渲染/提交次数、峰值并发和错误。
`run.json` 只承担恢复状态，不重复存储 trace。

## 配置与测试

`config.yaml` 只包含模型、Planner/Builder、并发、页面工具、托管组件、媒体、页面检查和预览配置。容器安装
Chromium 与 CJK 字体；本机可用 `NOTALE_BROWSER_PATH` 明确指定浏览器。代码中没有 Research agent、
证据协议、Blueprint/Expansion 双 Planner、checkpoint 或 run 迁移器；字体运行时仅保留读取已有
`font`/`mono` token 的窄兼容路径。

本地离线验证：

```bash
pytest -q tests
python scripts/vendor_fonts.py --verify
```

字体清单锁定上游 revision、源文件 SHA-256、产物 SHA-256 和许可证。只有明确升级字体时才运行
`python scripts/vendor_fonts.py --refresh-lock`；普通生成与预览不会访问字体网络源。
