# 一轮预读改革：实施与诊断结果

## 实施

生产改动仅 core/builder.py、core/tools.py、prompts/tech.md、vendor/chassis/lib/LIBS.md；
回归变更在 core/test_builder.py、core/test_prompts.py、core/test_skills.py。

- 固定工具列表与模型上下文链不变；首次响应只有并行 Read（代码页可 CodeScaffold）。
- 首轮之后、真实首次 Write/Edit 前，不执行第二轮 Read 或 Bash 等探索工具；违约或加载失败记录终止原因，不补催/重启。
- 首次实现依据本次成功且非空的实际文件变更；旧页面、空写入、未变更的写入、scaffold 不解锁工具。
- 实现后恢复原有工具行为，Write/Patch 与 Check 可同轮顺序执行。
- LIBS.md 统一目录、版本与常用接口；支持当前 run 的整份全文读取，忽略分页。其他普通文件仍按行读取。
- 不新增 mlp-api.md、不复制全套第三方手册、不改 Director 或 Check。

## 离线验证

最终组合：`python -m unittest core.test_builder core.test_prompts core.test_skills core.test_tool_evidence.ToolEvidenceTests -q`
结果：81 项通过，0.486 秒。

另直接执行 MLP 文档调用链：step/evaluate、field 输出复用与行列坐标、activationLevels、固定 seed reset 均通过。
没有重跑代码工作台或全量浏览器回归，相关代码本轮未变。

## 模型诊断

输入来源：`nn-page12-evidence-0909-203108`。相同 brief、主题、样例模式、200 字符上限，
Gemini 3.8 Flash low，仅该页 Builder；不调用 Planner/Director，不人工修页，不补催/换模型。
模型仍自行选择 Main/辅助样例，本次与上次选择不同，所以这是单次诊断，不是稳定效果证明。

- 第1轮：并行 Read reference、Main、一个辅助样例、LIBS.md；没有主题/底盘源码巡读。
- 第2轮：首次 Write，23014 字符，包含完整界面、MLP 初始化和交互，不是空占位。
- 第3轮 Check：模型未初始化就调用 field/step。
- 第4–11轮：5次读取 MLP 源码，3次读取自身 HTML；定位到 Deck.autofit 的首次绘制早于网络初始化。
- 第12轮 Patch：调整初始化顺序。后续修订绘制与文字，未改共享库或 Checker。
- 第18轮自然结束。Builder 137.1 秒，进程墙钟138.0秒；上次21轮、进程墙钟160.7秒。
- 记录覆盖范围内代码哈希无漂移，原页面保持不变。

最终 Check 无 JS 错误、越界和裁切；初态199字符，推进后201字符，仍超过200上限1字符。
返回的准确率和损失主要从标签读取，不能据此宣布完整计算语义通过。

结论：一轮预读顺序已实现且本次执行成立；仍有写后碎片化排错，未达到7–11轮目标。
不把较少的轮数或无致命错误视为完整质量通过。本轮不追加门禁来隐藏写后读取。

## 用量

输入748679 token，其中缓存599380；输出12426。
按此前核对的 [Gemini 标准价格](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)
（未缓存输入$0.75/M、缓存$0.075/M、输出$3.75/M）估算该页API费用$0.20352525，非账单实扣。
