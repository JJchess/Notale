# Planner 接口对齐与冗余门禁清理

2026-09-08 · 已实施，未 commit。

## 改动

- `core/image_search.py`：替换搜索工具内部的交付说明。普通来源提供实际图片直链；Commons File 文件页可由现有解析器取主图。找不到可交付候选时返回空结果，不猜 URL。未改 schema、下载器或增加模型调用。
- `core/planner.py`：素材映射的简单数字页号、下划线页号统一为 `page-NN`；返回新映射，保留原始调用参数。仍检查真实页面、映射冲突、素材来源、文件存在和路径边界。FinalizePlan 描述补标准页号示例。
- 删除 `_valid_pages` 中永远无法触发的 `len(nn) > N_CEIL` 分支。解析器的原有页数范围未改变。
- 未修改页表内容要求、建页 skill、Planner 主提示词、重试策略；未新增工具、预算或质量门禁。

## 本地回归

`python -m unittest discover -s core -p 'test_*.py'`：**125 项通过**。

新增覆盖：页号规范化及原参数不变；未知页、非约定写法、键冲突拒绝；空映射可用；下划线页号无需多一次模型响应。既有素材安全、缺失文件、失败可无图等测试继续通过。搜索测试确认两种交付形式写入请求且 schema 未收紧；这不等于证明检索模型一定遵守。

另外用上次神经网络的真实首个 FinalizePlan 参数做了一次不调用模型的验证：现在直接通过；规范后的映射与旧实验第二次定稿完全相同，页表及原始参数未变。此验证不混入下面的自然测试。

## 原三题的 Planner 测试

复用既有 `experiments/media-search-20260908/run_planner.py`，仅更换 label，三个进程并行、每题运行一次。query、audience、scenario、minutes、profile 已与上一轮逐项比对相同，运行后的代码哈希仍与启动快照一致。

模型仍为 Gemini 3.8 Flash，Planner profile 为 `gemini38-google-low`。这是 **Planner-only**：沿用原题冻结主题，没有 Style Director 或 Builder 调用。模型自己决定搜图词、补搜、采用和页表；没有人工回灌、修改候选或映射、固定候选模型对照，也未为取好结果重跑。

| 题目 | 上次总调用 | 本次 Planner + ImageSearch | 本次总调用 | 页数 | 候选 / 下载成功 | 采用图片 / 页面 | 耗时 |
| --- | ---: | --- | ---: | ---: | --- | --- | ---: |
| 神经网络 | 6 | 2 + 1 | 3 | 16 | 9 / 7 | 3 / 3 | 24.75 秒 |
| 集成学习 | 3 | 2 + 1 | 3 | 14 | 8 / 7 | 3 / 2 | 29.64 秒 |
| 光合作用 | 3 | 3 + 2 | 5 | 17 | 14 / 9 | 3 / 3 | 66.75 秒 |

合计 7 次 Planner 响应、4 次 ImageSearch 模型请求，共 11 次；四次搜索 HTTP 均为 200。每题均只有一次 FinalizePlan，没有定稿拒绝或格式重交。Google 内部展开的搜索词不另算模型调用。下载成功仅表示取得可解码图片，不表示需求已正确满足。

### 神经网络：首轮得到 LeNet，不再补搜

首批三项需求：早期感知机、LeNet、LSTM，分别下载 3、2、2 张。没有再出现“候选未提供图片直链”。最终分配：

- page-02：[Mark I 设备图](../../runs/neural-planner-align-0908-a/pages/assets/img/planner-77bb9a8422cb/00.png)。
- page-08：[LeNet 架构图](../../runs/neural-planner-align-0908-a/pages/assets/img/planner-77bb9a8422cb/05.webp)，能读到层次、尺寸及 Fig. 2 图注。
- page-13：[标为 1997 版本的 LSTM 单元图](../../runs/neural-planner-align-0908-a/pages/assets/img/planner-77bb9a8422cb/06.png)。图中是输入、输出门控，不能当作涵盖所有现代 LSTM 门的完整图示。

本次 6→3 是观测结果，不是全部由格式修复贡献：本轮首批搜索词、候选和页数均不同。16 页相比上次 24 页更少，未生成课件，不据此宣称整课教学质量等价。

### 集成学习：自然运行中确实命中了页号兼容

模型原始定稿仍写 `page_04`、`page_08`；本地规范化后直接完成。检查 `briefs.json` 确认素材真实交付到了 `Build page-04` 和 `Build page-08`，不只是校验函数接受了参数。原始拼写仍保存在 `planner-results.json`。

首批三项需求各下载 3、3、1 张；采用搜索结果标为 Breiman、Freund、Schapire 的三张人物照，没有采用 Friedman 图。目视确认是人物照片而非图标，但不靠脸验证身份。额外只读来源核查：两个 Wikipedia 来源返回 403，Schapire 的 Microsoft Research 来源返回 404；因此本轮**不能宣称人物与来源对应已全部核实**。这些核查未回灌 Planner，也没有另加审核模型或来源门禁。

### 光合作用：仍有真正的取图缺口

首批四项需求各下载 3、0、3、1 张：叶绿体、恩格尔曼实验、叶绿素光谱、卡尔文示踪。恩格尔曼候选 403，确实没有图；卡尔文候选虽可下载，但画面是一维条带，不能直接视为搜索标题宣称的二维色谱。

Planner 自行补搜恩格尔曼与卡尔文示踪。前者取得可用实验示意；后者一个成功下载项实际是极小缩略图，其他候选 403/404。最终采用[叶绿体电镜与重建](../../runs/photo-planner-align-0908-a/pages/assets/img/planner-2644087bd6c3/02.jpg)、[光谱图](../../runs/photo-planner-align-0908-a/pages/assets/img/planner-2644087bd6c3/06.png)、[恩格尔曼示意](../../runs/photo-planner-align-0908-a/pages/assets/img/planner-a22d7dcabf7e/03.png)，均支持对应主题；卡尔文示踪页保留，但没有分配图片。

两次搜索都没有缺图片直链的候选错误，但仍有 403/404、图像规格与语义匹配问题。这次补搜不是格式门禁触发；不从没有记录的模型思考推断具体弃图理由。

## Token 与结论

| 题目 | Planner 输入 / 输出 | ImageSearch 输入 / 输出 |
| --- | ---: | ---: |
| 神经网络 | 14,814 / 683 | 249 / 1,058 |
| 集成学习 | 11,992 / 586 | 215 / 868 |
| 光合作用 | 27,033 / 764 | 458 / 2,164 |

格式门禁修复已通过历史记录回归和自然运行两种验证。搜索说明已与下载能力对齐，本次所有候选均未再报缺直链；但不能保证一次搜索满足所有需求，更不能以调用变少代替准确率评价。保留上述素材与来源问题，不追加计划之外的规则。

原始结果：[神经网络](../../runs/neural-planner-align-0908-a/planner-results.json)、[集成学习](../../runs/ens-planner-align-0908-a/planner-results.json)、[光合作用](../../runs/photo-planner-align-0908-a/planner-results.json)。各目录保留每轮输入、原始工具参数、来源和下载错误；上一轮对照见[旧报告](../planner-simple-20260908/REPORT.md)。
