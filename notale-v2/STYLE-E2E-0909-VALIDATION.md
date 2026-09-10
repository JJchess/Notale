# 三路真实端到端实验 · 2026-09-09

状态：三路均已结束，**0/3 条完整路线通过**。计划 9 页，实际进入 Builder 6 页、交付 4 页。没有手工救页或重跑覆盖失败。

## 固定输入与执行方式

复现：`python3 -B scripts/style_e2e.py --prefix <全新前缀>`（真实付费模型调用）。

本次前缀为 `style-e2e-0909a`。每路由真实 Planner 生成 3 页《指数增长 / Exponential Growth》：封面、复利与固定增加的真实数据对照、增长率滑块交互。不是固定 HTML 测试页。

| 路线 | 输入 |
| --- | --- |
| auto | 无模板、无显式风格，自动选参考 |
| reference | 用户手绘参考裁图 `19-hand-drawn.png`，显式风格 `19-hand-drawn` |
| modify | 上轮 Swiss 主题资产包，显式改为 `38-fashion-editorial` |

Planner/Director 使用当前默认 `AWS-GPT-5.6-Sol`、medium；Builder 使用默认 `sonnet5-low` / `AWS-Claude-Sonnet-5`、mini + aux、视觉输入开启。CLI 不传 Style Director 开关，验证其默认开启行为。三路并行，每路 Builder 并发 3。

没有手改模型产物、替换模型或失败后新建 run 补跑；不使用前轮 420 秒的脚本截止时间，保留生产默认时限。旧主题保持只读。

[4177 实验面板](http://localhost:4177/runs/notale-v2/style-e2e-0909a-report/) · [冻结输入与代码哈希](../runs/notale-v2/style-e2e-0909a-report/experiment.json)

## 已确认的失败与偏差

1. **自动路线在 Director 失败。** 已选样、读详情并提交 CSS；技术校验拒绝独立的 `::-moz-range-track` / `::-moz-range-thumb` 规则后，下一次响应没有工具调用，抛出“Director 结束但没有有效 Write”。不是 Builder 超时。
2. **技术闸误拒绝浏览器兼容分支。** 三路主题都因此增加修订。对自动路线被拒 CSS 直接调用 Chromium `CSSStyleSheet.replaceSync()`：保留 66 个规则、2 个 WebKit 滑块规则，Firefox 滑块规则被安全忽略，根规则仍存在。不能把这种分支等同于整份主题不能运行。原始 CSS 和拒绝信息保留在各 run 的 `style.rejected.json`。
3. **两页提前空交付。** reference/page-01、modify/page-03 均在 2 次响应后以 `no_tool_use` 结束，没有 HTML；最终文本均为 “I'm ready to help. What would you like to work on?”。现有记录不足以将原因归给模型或网关/适配链某一层。适配器 5 项确定性测试通过，不替代线上链路排查。
4. **修改主题没有采用所选详情的标题字体。** trace 确认输入包含 Fashion Editorial 详情及 `NTF-zcool-xiaowei`、`NTF-bodoni-moda` 声明；最终 CSS 仍用旧主题的 Barlow Condensed / Noto Sans SC。详情搭配本身是建议，技术闸不会阻止这一选择；但这是本次风格执行的明显偏差，不能宣称所选字体已落实。
5. **手绘内容页图表坐标错误，最终版本未修正。** SVG 将两条序列的本金 100 都画在 `(70,420)`，与标为 0 的横轴重合，100 刻度却在其上方；正确的表格文字不能弥补图形误导。这不是配色或审美偏好，属于数据表达错误。补充审计从最终 DOM 提取刻度、轴线、折线并记录 `initial_amount_plotted_on_zero=true`、`ok=false`。
6. **局部 SVG 标签回退服务器字体。** 扩展检查 4 页共 191 个直接含文字的可见元素；手绘交互页 `20% 参照` 中的 2 个汉字实际来自系统 `WenQuanYi Zen Hei`，不是随包字体。其余检查到的文字未发现系统字体。只抽查标题和正文会漏掉此处。逐元素 CDP 字体证据在 [补充审计](../runs/notale-v2/style-e2e-0909a-report/supplemental.json)。
7. **技术检查未覆盖的排版错误。** 修改路内容页的 `<text class="label fixed">200.00</text>` 被主题 `svg.nt-growth-chart .fixed` 的线条规则附加了 4px 蓝色描边，数值发糊；右侧公式断行为两行，阅读不佳。机器零视觉告警不能称视觉质量通过。

## 验收范围

每张最终页面检查独立的 Builder 交付审计、1600×900 浏览器渲染、JS/资源错误、实际字体 glyph 来源及截图。交互页实际使用键盘和重置按钮，核对 20% → 248.83、50% → 759.38、重置 → 248.83、800×450 下 Home → 100.00。图形与数值同步变化另核对页面 DOM/路径；不只判断金额文本。

已完成的手绘交互页通过上述 4 个状态。另从 SVG 路径提取 6 个数据点，验证各增长率下相对金额变化与纵向位移成比例；0% 时全部同高。完整路径、六年数值、实际操作结果与页面哈希保存在补充审计中。字体回退问题不因功能通过而豁免。

功能正确与排版质量分开记录。三条完整路线全部成功才可称三路端到端通过；有主题、有 HTML 或单页功能通过均不能代替。

## 最终结果

| 路线 | Director 响应 | Planner 响应 | Builder 响应 | 交付 | 整路结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| auto | 4 | 1 | 0 | 0/3 | Director 失败，未进入 Builder |
| reference | 4 | 1 | 37（2 / 25 / 10） | 2/3 | 缺封面；内容图坐标错误；交互功能通过但有两字系统字体回退 |
| modify | 3 | 1 | 27（12 / 13 / 2） | 2/3 | 缺交互页；标题字体偏离所选详情；内容页有 SVG 标签描边污染 |

括号内为 page-01 / 02 / 03 各自响应数。三条流程均未传开关即可进入 Director，默认开启已由实际执行确认。

- 模型实验至自动浏览器审计完成的并行墙钟 **3,106.3 秒（51 分 46 秒）**，不含随后人工审阅整理。
- 共记录 **78 次模型响应**：Planner 3、Director 11、Builder 64。不是正常路径的 2 / 1 / 1 次主题调用：本次包含 Read 和技术修订；reference 还重复 Read 了已预载的同一详情。
- 累计输入 **3,058,263** token，输出 **69,804**；输入包含重复历史，缓存读取 **1,666,785**。消息路由另报告缓存创建 1,313,441；不将其重复加到输入总量，不猜测网关价格或未记录的 HTTP 重试次数。
- reference 的 Builder 墙钟 **48.9 分钟**；其中内容页 25 次响应、48.9 分钟、20 张累计图片输入，反复 Check / Look / Patch 后自然结束，仍遗漏坐标错误。modify 的 Builder 墙钟 **18.3 分钟**。
- 进入 Builder 的 6 页全部以 `no_tool_use` 自然结束；2 页没有产物，4 页有产物。没有人工超时截断，也没有触及生产单页时限。
- 4 个产物的浏览器加载均无 JS 异常、无失败请求，原生主题校验通过；Builder 交付审计也没有将其列入 `fatal_errors` 或 `visual_warnings`。这些只证明运行层，不覆盖上面的数据和视觉错误，且不等于原自检报告完全没有其他提示。
- 已逐张看过 4 张最终截图。补充字体/交互/数据检查的 HTML 哈希与最终 4 个文件全部一致，保留手绘内容页较早一次检查作为 `previous_snapshot`。
- 原始复用主题 SHA-256 未变；两个交付主题与 Director 最后一次成功 Write 文本完全一致，没有被人工或 Builder 改写。

[完整机器结果](../runs/notale-v2/style-e2e-0909a-report/summary.json) · [调用与耗时统计](../runs/notale-v2/style-e2e-0909a-report/metrics.json) · [补充语义与字体证据](../runs/notale-v2/style-e2e-0909a-report/supplemental.json)

### 版本与结论边界

本轮工作只新增实验脚本、报告和审计数据，未修改生产代码或模型产物。脚本在模型运行期间补了最终报告排版和后续复现的失败退出码，不影响已在运行进程内加载的实验流程；本次旧进程退出 0，**不能以进程退出码代替结构化的 `passed=false` 结果**。当前脚本在任一路失败时会退出 1。

共享工作树在运行期间检测到两处其他修改：`core/sample_bundles.py`（00:41）与 `test/test_skills.py`（00:51），均晚于两个 Builder 进程启动。已保留，没有覆盖；变更文件名列于 summary/metrics 的 `changed_code_during_experiment`。本轮因此不是完全静止工作树下的基线对照，也没有借此推断任何失败的归因。

这些结果证明**当前这组三路端到端没有验收通过**，不能据此估计整体失败率，也不能未经同输入基线对照就说全部问题由本次升级引入。未覆盖全部 40 种风格、代码页、外部图片生成或所有媒体/背景场景。

## 后续四项整改 · 2026-09-09（非新一轮端到端结果）

按用户选定范围，已修改：

- Director 定主题方向，Builder 结合题材做具体页面视觉设计；主题类不是必用组件。收窄 reference 和 Check 对装饰渐变/局部材质的限制，保留数据真实性与反卡片墙边界。
- 主题输入明确混排标签中文承接、修改时字体角色优先级、线/点/文字选择器分离、公开最小用法，以及固定逻辑画布不二次缩放；Builder 默认预置短接口，必要时可按需读 CSS，不增加强制调用或全量 CSS 注入。
- 自检移除 pad-x 与 offScale 判据，保留实际字号与必需主题值测量；不凭容器填充率下达删除指令。`Deck.rgb/rgba` 保持接口，改用浏览器 sRGB 像素转换；自检的颜色 alpha/亮度也不再正则拆颜色，无法覆盖的叠色与背景明确标未测。

回归命令：

```sh
python3 -B -m unittest test.test_director test.test_style_upgrade test.test_style_fonts test.test_builder test.test_llm_adapters test.test_prompts test.test_skills test.test_media test.test_artifacts
python3 -B -m unittest test.test_style_consumers test.test_style_browser test.test_style_fonts_browser
python3 -B -m pytest test/test_check_report.py -q
```

分别通过 136、10、4 项（合计 150 项）；全部离线/模拟调用，无新增付费模型请求。新增 [消费者回归](test/test_style_consumers.py) 实际验证拼装后的 Builder 输入、Read/Check 提示、混排标签字体命中、SVG 描边用途、1600→800 同比缩放与点击/键盘、现代颜色与连续探针状态、复杂背景未覆盖，以及真实缺资源/JS/越界仍报告。CSS 使用明确的回归夹具，不能当作模型生成质量证据。

另将新 PROBE 只读用于原四页，四页的必需 token 均有效，不再产生 pad-x/offScale 误判。四份 HTML 与两份主题前后哈希一致；原字体回退、SVG 标签、图表坐标及视口字号问题没有被暗中手改。本节表示新生成链路的规则与消费者已修，**不改变本报告原三路 0/3 通过的结论，也不声称原产物或空交付已修复**。

没有修改 Builder 循环、模型配置、Main/aux 策略或重试方式，没有启动空交付抓包和三路重跑；代码页仍独立。

## 整改后 auto 全流程重跑 · 0909b

[4177 查看本套](http://localhost:4177/runs/notale-v2/style-e2e-0909b-report/) · [机器结果](../runs/notale-v2/style-e2e-0909b-report/summary.json) · [补充审计](../runs/notale-v2/style-e2e-0909b-report/supplemental.json)

使用上一轮相同的指数增长三页任务及模型配置，从自动选参考、Planner 与 Director 到三页 Builder 全量执行，没有复用页表或主题。命令：`python3 -B scripts/style_e2e.py --prefix style-e2e-0909b --route auto`。脚本新增单路选择和 auto 独立预检；原三路默认行为保留。运行期间冻结文件哈希没有变化。

本轮 3/3 页生成且运行检查通过，总墙钟 375.1 秒（6 分 15 秒，含自动审计）。Planner 与 Director 阶段 76.2 秒，Builder 并行阶段 293.8 秒。Director 选择 Swiss + Abstract Geometry，选样 1 次、读取两份详情 1 次、写主题 1 次，首次提交通过；Planner 1 次。Builder 封面 / 正文 / 交互分别 7 / 15 / 21 次响应、102.2 / 206.4 / 293.0 秒，均自然结束，无空交付、人工重启、换模型或手工修补。累计 47 次模型响应；输入 2,200,115 token（包含重复历史和缓存），输出 35,705 token。

独立复核：三页无 JS 异常或失败请求；134 个可见直接含文字元素均命中随包字体。正文 12 个图表值及本金相对零轴的位置正确；交互页 20%、50%、0%、重置四个状态的数值与六个图形点同步正确。三页在 1600×900 → 800×450 下舞台与标题几何同比缩小，逻辑字号不变。补充审计保留早期未等布局稳定的缩放探针，但结论使用独立新页面、等待实际舞台宽度和两帧后的复核值。

**视觉质量未全过。** 已逐张查看最终截图：交互页青色背景网格过重，穿过标题和说明，大标题挤占图表高度；正文标题偏大、公式换行不佳。正文和交互仍有较多 Look/Patch 回合，不能称效率问题全部解决。运行通过与视觉审阅分开记录，原产物原样保留。本轮只证明这一套 auto 可完整交付，不覆盖全部风格，不推断空交付根因或整体成功率；上文 0909a 原三路结果保持不变。
