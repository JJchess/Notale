# 确定性清理与集成学习全量实验

> 后续状态：按用户要求，2026-09-08 已回退本次清理及新增测试。以下是实验时的历史记录；实验产物与预览保留，不代表当前源码。

2026-09-08。清理已实现；全量实验完成。未提交 commit，未手工修改模型生成的页面，未新增生成门禁。

## 本次改动

- R01：代码页生成中的 Check 和结束后的 audit_delivery 都只运行代码工作台自检，不再运行外层 selfcheck。复用已有首尾选图逻辑，内联 initial/final，active 留路径。代码页可 Read 自己的三张工作台截图，不开放其他页或写权限。shot=false / 非视觉模型不带历史截图。
- R02：按 workflow 改写代码页 Check 描述，不再宣称检查讲义主题字阶和 data-step；说明工作台不用 after。
- R03：只精简宿主 Reset 内部动作清单、重复重置测试和强制制造视图错误的测试要求，共 343 字节。保留布局禁令、Worker 职责边界、reset 消息语义、初始状态及教学内容检查。
- R07、R08：删除哲学块的字阶复述，以及库索引尾部重复的 LIBS.md 阅读指导。
- R09：删除破折号次数限制、操作标签固定词数；保留信息前置、错误反馈三要素和事实/单位护栏。
- R10、R11：删除工具参数同义描述和图片像素推算 token 文案；保留工具匹配、默认值和坐标语义。
- R12：删除 Planner 示例中“单独成套也不多于此”。

未改：R04 样本路径、R05 首轮选样理由、R06 响应次数提示、样本 full/mini、sample_use/check_use、check-page、主题契约和视觉指标。保留工作区中此前的媒体接入等改动。

## 配置与复现

- 对照：ens-plan-first-0907-2234。
- Query：集成学习--机器学习概论第八讲；90 分钟。
- 读者：学过一点相关基础、但没系统学过这个题目的读者；场合为空。
- Planner、所有 Builder：gemini-3.8-flash / low，profile=gemini38-google-low。
- 并发上限 30；uniform；samples=mini；aux-samples；notes=notes。
- Director 没有调用模型，和上次一样复用 ens-trim-full-0907 的主题；未改变主题文件。
- 实验期间 experiment.json 中记录的 core/prompts 源码哈希没有漂移。

```bash
python3 -B -u experiments/media-a-20260907/run_full.py --label ens-cleanup-0908-0100 --concurrency 30
python3 -B experiments/media-a-20260907/verify.py --label ens-cleanup-0908-0100
```

## 输入减量：固定上次页表复算

UTF-8 字节；工具使用紧凑 JSON 计量。不是 token，不含图片和初始用户消息。固定页表使此处不受本轮页数变化影响。

| 页型 | system：清理前 → 后 | tools：清理前 → 后 | 首请求合计减少 |
|---|---:|---:|---:|
| 标题页 | 20,951 → 20,658 | 4,175 → 3,919 | 549 B |
| 内容页 | 25,575 → 25,282 | 4,175 → 3,919 | 549 B |
| 交互页 | 22,615 → 22,322 | 4,175 → 3,919 | 549 B |
| 代码页 | 5,317 → 5,109 | 4,042 → 3,488 | 762 B |

代码 reference 另从 15,598 减至 15,255 B。Planner 示例句另减 30 B。没有把未加载的目录或注释计入输入收益。

## 全量结果

| 指标 | 上次 | 本次 |
|---|---:|---:|
| 生成页数 | 22/22 | 25/25 |
| 标题 / 内容 / 交互 / 代码 | 6 / 8 / 5 / 3 | 7 / 11 / 4 / 3 |
| Planner 响应次数 | 3 | 4 |
| Planner 输入 / 输出 token | 13,577 / 1,249 | 15,061 / 683 |
| Builder 墙钟 | 158.6 秒 | 205.1 秒 |
| Builder 响应次数 | 165 | 257 |
| 平均每页响应次数 | 7.50 | 10.28 |
| 单页最多响应 | 15 | 29 |
| 超过 11 次的页数 | 2 | 7 |
| Builder 输入 token（含缓存命中） | 4,458,065 | 8,264,032 |
| 其中缓存命中 token | 3,089,424 | 6,400,360 |
| Builder 输出 token | 229,031 | 327,015 |
| Check 调用 | 62 | 96 |
| 独立审计：致命错误 / 视觉警告页 | 0 / 0 | 0 / 0 |
| HTTP 浏览器错误页 | 0 | 0 |
| 实际使用素材的页面 | 0 | 0 |

本次 Planner 约 24 秒，生成阶段总计约 229 秒，不含后续浏览器验证。一次模型服务 InternalServerError 由既有重试机制恢复。第 21 页用了 29 次响应，第 14 页 25 次，第 15 页 22 次。

结论：确定性输入有所减少，但本轮实际调用数与 token 增加，没有证据支持降本成功。两轮是重新规划的不同页表，页型组成和模型输出都变化；即使按页归一化本轮用量仍更高，也不能据单次实验判定清理的因果效果。

## 素材结果

Planner 调用三次 ImageSearch，依次搜索 Leo Breiman statistician、Galton ox competition crowd、Francis Galton vox populi nature 1907。共取得四张图片，FinalizePlan 一次成功，但 media_by_page 为空。

候选元数据包括科学文献网络图和同名 Vox Populi Vox Dei 图像，没有显示为所需人物肖像或猜牛重原始证据。最终未分配素材；全部 Builder 均未调用 ImageSearch/ImageGen，浏览器未发现实际使用素材图片的页面。这与上次“分配一张但 Builder 没用”不同。

## 内容与视觉问题：自检通过不等于交付质量通过

1. **page-12**：标题承诺使用 Scikit-Learn，但最终 starter.py 是手写 SimpleDecisionTree / SimpleRandomForestClassifier，没有 sklearn 调用。界面标注 MDI Gini Importance，而实际 feature_importances_ 混合了硬编码 base_weights 与分裂频率，不能当作该指标的真实计算。
2. **page-18**：标题承诺使用 LightGBM/XGBoost，最终只 import math，手写梯度提升决策桩。它是机制示例，不是承诺的库调用实操。
3. **page-18**：终态截图右侧最后一列被裁切；独立浏览器测量原生视图 viewport=690px，sample-grid 宽 634px、scrollWidth=711px，末列右边界约 739px。工作台自检仍通过，说明其检查没有覆盖所有 lesson 内部溢出。
4. 逐页浏览器检查覆盖加载、控制台错误、请求失败和素材加载；不是全部交互状态、数据真实性和教学目标的人工验收。人工抽看了 page-03 以及代码页 page-12、page-18 的截图，没有完成整套逐项语义审阅。

没有为这些实验产物问题补提示、加门禁或手工改页，以免改变本轮实验结果。

## 验证与预览

- 测试：89 passed，167 subtests passed；git diff --check 通过。
- 回归测试覆盖代码 Check/结束审计均不调用外层、初态终态选图、中间态路径、非视觉/shot=false、失败报告保留、截图访问边界、页型工具描述隔离及图片说明不再猜 token。
- 25/25 页 HTTP 验证，无 pageerror、console.error、requestfailed。
- [完整预览](http://192.168.0.72:4177/lab/ens-cleanup-0908-0100/index.html)
- [代码页 12](http://192.168.0.72:4177/lab/ens-cleanup-0908-0100/index.html#/11)
- [代码页 18](http://192.168.0.72:4177/lab/ens-cleanup-0908-0100/index.html#/17)
- 证据：experiment.json、builder-manifest.json、builder-results.json、builder.log、trace.jsonl、verification/browser.json、verification/page-*.png、.shots/code/page-*/final.png。
