# Workflow Skills 测试计划

更新时间：2026-09-01

## 研究对象

测试四个互斥 Builder 路由中 reference 与 sample 是否改善设计和实现决定：

- `[标题页] → build-cover`
- `[内容页] → build-page`
- `[交互页] → build-interaction`
- `[代码页] → build-code`

`build-code` 是交互体系的专用执行分支，但因工具面和宿主运行时不同而独立路由。测试尽量对齐真实 Builder 当前页输入，不复制无关历史上下文。

## 真实输入形状

Builder 的 system 只包含：identity、copy/visual 去 AI 味规则、chassis、theme interface、deck outline、技术契约，以及由 Planner 标签唯一确定的 `SKILL.md`。

首条 user 消息只包含：

```xml
<environment_context>
  <cwd>…/pages</cwd>
  <target>…/pages/page-NN.html</target>
  <target_state>absent</target_state>
  <read_only_skill>…/workflows/build-*</read_only_skill>
</environment_context>
```

加当前 brief 和 `<chapter_context>`。章上下文包含本章其他页的标签与主题，并用 `current="true"` 标记当前页；不携带其他章节逐页内容。Planner 不再生成空 HTML 骨架。

`pNN.md` 保持 Builder 级粒度，例如：

```text
# page-14 [交互页]
交互理解 AdaBoosting 算法
```

Planner 只决定顺序、标签与主题，不提前指定页面变量、控件、数据、公式、布局、renderer 或状态机。

## Workflow 读取协议

`SKILL.md` 随路由直接进入 system。Agent 第一轮依照其中的绝对路径并行使用原生 `Read`：

- 只选一份类别 reference；
- 从一个 sample row 读取唯一的 Main full；
- 默认不注册、不读取任何 Aux 或 mini；
- `build-interaction/3d` 暂无批准 sample，只读 reference；
- `build-code` 固定一次读取 `code.md` 和含四个 author layer 的 `code-core-bundle.full.md`，同时调用 `CodeScaffold`。

mini bundle 和 catalog 元数据继续保留，但只有显式传入 Builder 的 `--aux-samples` 才会把 mini 路径作为独立 `<aux_sample_catalog>` 注入；该开关默认关闭并写入 `builder-manifest.json`。没有 `WorkflowContext` 或 `Skill` 选择工具，也没有字符预算字段。每份生成 bundle 用独立 `<sample>` 包裹，内部以 `<file path="…">` 保留文件身份。运行原件完整保留但不在 Builder 可读面内；进入上下文的 bundle 只移除独立 CSS 文件和 HTML 内联 `<style>`，不改 HTML/JS/算法/状态逻辑。

## Harness 边界

### Planner

- 一次模型调用，同一响应写 `theme.css` 与 `pages.md`；
- 只校验确切写入目标、四种标签、连续页号、page-01 标题页，以及 theme 的真实结构契约；
- 不设最少四页、最少字符或 CSS 规则数量；
- 不缓存旧产物，不重试三次；失败保存一份 rejected 诊断后结束；
- 不创建 `page-NN.html`。

Planner 质量评估与 workflow skill 对照分开。四路 Builder smoke 不调用 Planner，固定使用
`fixtures/adaboost-cold-gray/`：页表逐字沿用 2026-08-31 四路实验的 16 页 AdaBoost 输出，
`theme.css` 继续使用同轮冷灰实验台版本（SHA-256 `52c2e8df…40ab`）。唯一 schema 迁移是
page-14 从旧的 `[交互页]` 改标为当前 `[代码页]`，正文仍为“代码实操AdaBoosting算法”。
每个新 run 只机械复制该 fixture；因此 workflow 变化不会同时改变页面 query、章节上下文或主题。

### Builder

- 普通页始终使用同一组 `Read/Write/Patch/Check/Look/Bash`；`Patch` 同时覆盖单处与多处局部修正，不再提供会诱导逐项往返的同义 `Edit`；代码页始终使用 `CodeScaffold/Read/Write/Edit/Check/Look`；
- `low` 从第一轮到最后一轮始终是 `low`，不按施工阶段切 effort；
- 不使用读取顺序、首次 Write、再次 Write、Check clean 或停止前确认等状态闸门；
- 模型不再调用工具就立即停止，不补催、不重启；
- 重复整页 `Write` 是普通模型选择，不屏蔽第二次；
- Agent 产物与 harness 独立审计分开记录；停止后只自动执行一次审计，不把结果反馈给 Agent；
- 目标缺失就是没有交付；有目标但审计失败仍分别记录 artifact 与 fatal audit。

## 典型测试内容

首先用完整课程范围而非过细页面指令验证 Planner。机器学习用例至少应自然包含：

- `[标题页] AdaBoosting 算法`
- `[内容页] AdaBoosting 算法的历史`
- `[内容页] AdaBoosting 算法讲解`
- `[交互页] 交互理解 AdaBoosting 算法`
- `[代码页] 代码实操 AdaBoosting 算法`

这五页只是 90 分钟《集成学习——机器学习概论》中的一个 10–20 分钟片段，不能被扩成一门只讲 AdaBoost 的完整课。公共卫生与空间科学用例继续覆盖 interaction/general、interaction/3d、page/chart 与 page/3d。

## 运行顺序

1. 静态验证：四份 skill quick validation、43 份 bundle 一致性、core regression。
2. 单页 smoke：从冷灰 frozen fixture 取 page-01、08、12、14，分别覆盖
   cover、page、interaction、code，使用 `sonnet5-low` profile；不运行 Planner。
3. 审计第一轮 sample routing、首轮并行 Read、target 边界、真实渲染、调用数与 token。
4. smoke 通过后，Planner 的整套输出质量另开实验验证；不把新生成的 Planner 产物混入
   workflow skill 对照，也不再并行测试已终止的 DeepSeek 对照。
5. 是否恢复 baseline/reference/full 消融，等全量生产链路稳定后单独决定，不把实验 arm 逻辑塞进生产 Builder。

## 评价

- visual attraction；
- hierarchy/composition；
- learning validity；
- task/content correctness；
- motion/interaction quality；
- runtime/layout stability；
- sample routing 是否按可迁移机制而非题目词面；
- interaction 是否由真实算法、仿真、规则或受约束模型派生证据；
- code 是否真实执行并产生 trace/test/native view；
- absolute `accept/revise`。

视觉更好但内容、学习真实性或 runtime 退化时记为 mixed，不算 skill 有效。正式比较使用盲化结果；单题单次只用于筛查，不宣称统计显著。

## 当前验证入口

```bash
python3 -m core.sample_bundles --check
python3 -m unittest discover -s core -p 'test_*.py'
python3 experiments/workflow-skills-next/frozen_four_route.py prepare --label RUN
python3 experiments/workflow-skills-next/frozen_four_route.py run --label RUN \
  --profile sonnet5-low
# 仅做 Aux 对照时在 run 子命令显式追加：--aux-samples
python3 dump_page.py --label RUN --page page-NN --out /tmp/page-NN.md
```

## 2026-09-01 失真预实验（不计入对照）

冻结夹具的首轮 11-response smoke 中，cover、interaction、code 分别以 7、5、5 次
`no_tool_use` 结束；page 因截图后连续 6 次单点 `Edit` 在第 11 次触发 `max_steps`。轨迹显示
它在逐项手算并修正自造数据，而非 Check、网络或 workspace 故障。基于该证据，普通页删除
与 `Patch` 重叠的 `Edit`，并要求首次 Write 前核对确定性数据、公式与预期输出。

复验 run `adaboost-four-route-converge11-v2-sonnet5-low-20260901` 使用了正确冷灰 theme，
但误用了后来生成的 8 页细化页表：cover/page/interaction/code 分别以 4/10/5/6 次
`no_tool_use` 结束，合计 25 次；4/4 留下产物，独立审计无致命错误或视觉警告。实际读取为
`generative + neural-signal-network`、`general + escapement`、`general + lawn-path`、
`code + code-core-bundle`，没有 Aux/mini 或额外 reference。由于 pNN 与 2026-08-31 四路输入
不一致，这两轮只保留为 harness 诊断，不用于 workflow 质量或成本对照。

## 2026-09-01 正确 fixture 复验

run `adaboost-four-route-correct-fixture-sonnet5-low-20260901` 使用原始 16 页 pNN、同一份冷灰
`theme.css` 和默认 main-only routing。cover/page/interaction/code 分别消耗 6/10/11/11 个
model response，合计 38 个；前三路以 `no_tool_use` 结束，代码页在第 11 个 response 完成第三次
`Check` 后仍未主动停止，因此 termination 为 `max_steps`。四页均留下产物，独立审计均无 fatal
error 或 visual warning，代码工作台的 execution、错误处理、timeout recovery、native view sandbox、
固定布局与键盘操作自检全部通过。故本轮产物完成度为 4/4，严格收敛为 3/4，不能记作四路全通过。

首轮读取分别为 `generative + neural-signal-network`、`general + escapement`、
`general + lawn-path`、`code + code-core-bundle`，未读取 Aux/mini 或额外 reference。交互页的按钮
逐轮枚举轴对齐 decision stump，按当前样本权重最小化加权误差，计算 alpha、归一化更新权重并累积
ensemble score；截图中的权重、弱分类器与组合边界均来自该状态，而非预制动画。

本轮同时暴露两个尚未解决的收敛浪费：interaction 在首次 Write 前连续用了 5 个 Bash 做可合并的
数据验算；code 在首次 Check 后以多次零散 Edit 修正测试夹具，虽然最终自检干净，仍吃满 11 个
response。后续收敛改动须以这条正确 fixture 轨迹为依据，不再参考上述 8 页失真预实验的轮数。
