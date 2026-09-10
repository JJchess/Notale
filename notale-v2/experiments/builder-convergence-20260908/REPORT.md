# Builder 工具序列收敛审计

2026-09-08。只读分析最近五次已完成的 Builder 实验，没有运行模型、重跑页面或修改生产代码。每页每次模型响应的工具序列、参数摘要、usage 及已有模型文本见 [SEQUENCES.md](SEQUENCES.md)；结构化数据见 [results.json](results.json)，可用 [analyze.py](analyze.py) 从原始日志重新生成。

## 范围与口径

共 106 页、1,255 次模型响应。逐页验证 trace 响应数与 builder-results 的 calls 一致，工具总数与 steps 一致。响应次数包含最后不调用工具的结束响应；一个响应可以带多个工具。Check 内部浏览器检查、停止后的独立审计不另算模型响应。

五次实验均为所有页型 `gemini38-google-low`，开启 `samples=mini`、辅助样本与 `notes`；sampleShots/refShots/frameCap 关闭。首轮多读一个辅助样本符合这组实验设置，不应按默认“只读一个 Main”判成违规。它们发生在最近 Planner-only 修改之前，不能当作刚提交 baseline 的新一轮全量验证。

| 实验 | 页数 | 响应总数 | 单页中位数 | 最多 | 超过 11 次的页 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 神经网络＋Style Director（0241-r2） | 32 | 419 | 10.5 | 47 | 13 |
| 光合作用＋Style Director（0232） | 16 | 189 | 8 | 30 | 7 |
| 史记＋Style Director（0232） | 15 | 225 | 11 | 40 | 6 |
| 光合作用（0212） | 25 | 271 | 7 | 51 | 7 |
| 史记（0212） | 18 | 151 | 8 | 12 | 3 |

不同实验的页表、页数、素材、主题均不同；不能用这张表单独推导 Style Director 导致变慢。

## 实际如何收敛

### 1. 起步通常很快，长尾在第一次 Check 之后

94/106 页不晚于第 2 次响应开始 Write，95/106 页不晚于第 3 次响应开始 Check。首次 Check 之后还有 935 次响应（含各页结束响应），占总数 74.5%。全部页面的响应中位数为 8，36/106 页超过 11 次，说明提示词中的轮数目标不是实际收敛保证。

### 2. 顺畅的页面：同轮写入与检查

`shiji-style-media-0908-0232/page-02` 的完整轨迹只有 4 次：

1. Read reference + Read Main + Read 辅助样本。
2. Write + Check。
3. Write + Check。
4. END。

`photosynthesis-media-0908-0212/page-23` 同样为这一序列。它们不是没有修正，而是把写入和验证合在同一次响应中。

### 3. 常见页面：整页重写与检查交替，再结束

`neural-networks-style-media-0908-0241-r2/page-07`：Read×2 → Write → Check → Write → Check → Write → Check → END，共 8 次。

全体有 210 对相邻的“仅 Write 响应 → 仅 Check 响应”、170 对“仅 Patch 响应 → 仅 Check 响应”；包含修改与 Check 的同轮响应仅 76 次。这些是可以进一步研究的调用组织空间，不是直接承诺能减掉 380 次调用：修改结果可能失败，下一次判断也可能需要工具返回值。

### 4. 长尾页面：整体重写后转成细粒度 Patch/Check 循环

`neural-networks-style-media-0908-0241-r2/page-06`，交互页，共 47 次：

- 1：Read×3；2–7：三轮 Write/Check。
- 8–19：Patch/Check，夹着两次 Read；前几次 Check 带 after 状态。
- 20–46：继续单项 Patch、Read、Check，末段多为 `Patch ×1 → Check`。
- 47：END。总计 Write 3、Patch 17、Check 17、Read 11；最终审计无 fatal/visual 项。

`photosynthesis-media-0908-0212/page-12`，内容页，共 51 次：第 24 次之后基本进入 Patch/Check 交替，第 33–50 次是连续九组 `Patch ×1 → Check`，第 51 次结束。中间还读取 base.js/base.css 并调用自写的 SVG 重叠检查。

最慢 10 页占 344/1,255 次响应（27.4%），累计输入 21,506,762/50,019,659 token（43.0%）。这是含缓存输入的累计 token，不是等额计费或成本占比。

### 5. 代码页：反复改 lesson，并有未真正验收成功的结束

代码页共 3 页，响应数中位数 30、最多 36；其他页型中位数分别为封面 8、交互 8、内容 10。样本很少，不外推所有代码任务。

神经网络 page-09 的 36 次响应：首轮 Read×2 + CodeScaffold；第二轮先 Check 宿主；之后多次 Write/Edit `starter.py`、`trace.py`、`tests.py`、`lesson.js`，共 14 次 Check、6 次 Look，中间 Read `check.py`；最后仍修改 trace.py、Look 后结束。最终独立审计在 timeout recovery 中的 `assert "已终止" in timeout_state["output"]` 失败。

这证明“模型停止”与“验收通过”不是同一回事，不能只看 no_tool_use 或产物存在。它不足以证明该断言失败一定由 lesson、宿主或环境中的哪一方引起。

光合作用 0232 的 page-15 共 30 次，经历多轮 lesson 修正后最终专用检查通过。不能把它与神经网络 page-09 一概叫作无效重试。

## 哪些结论成立，哪些还缺证据

- 所有 106 页最终都以 no_tool_use 停止；105 页最终审计无 fatal，1 页有上述代码检查失败。无 fatal 不等于教学内容或美学质量已逐页人工验收。
- 191 次 Patch 中，9 次调用被记录为 Patch!miss，约 4.7%。匹配失败确实存在，但解释不了全部长尾。patch-misses.jsonl 的记录粒度是具体 edit，与失败调用数不一一对应。
- 只有 7 次带工具的响应同时含可见模型文本；多数中间响应只有工具调用。不能从结束时的总结反推每次改动的理由。
- Read 摘要只有文件名，没有 offset/limit；连续读取同名文件可能是分段读取，不能直接算重复浪费。
- trace 未保存每次 Check 的完整回灌、每次 Write/Patch 正文及逐轮文件快照。因此目前能确定“改查长尾”的形态，不能证明每个 Patch 是在修 bug、追字号/字数指标，还是无必要打磨。`notes` 带字数约束是已确认实验条件，不是已证明的长尾原因。

## 判断

实际流程不是稳定的固定轮数，而是“快速出初稿 → 若干整页重写 → 部分页面进入细粒度改查循环 → 模型自行停止”。值得优先关注的是同轮组合写入与 Check、长尾 Check 对应的具体修改依据，以及代码页的停止与验收是否一致；不据此添加强制轮数上限或自动审核模型。

本次只整理证据，未改变上述行为，也未提交新 commit。
