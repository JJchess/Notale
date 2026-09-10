# Planner 首轮批量搜图复测

2026-09-08。沿用此前神经网络、集成学习、光合作用三个课程 query，以及对应时长、读者设置。Planner 与 ImageSearch 均使用 Gemini 3.8 Flash / low。主题冻结为同题历史 CSS，未调用 Style Director；没有 Builder 或课件渲染。本轮没有改生产提示词、工具行为或选图策略。

**结论：三个 Planner 首轮都正确输出了一次批量 ImageSearch。自动搜图、回灌和页面映射可以完成，但内容匹配并非全部正确。光合作用自行补搜后取得了真电镜图；集成学习仍未取得人物照片；光合作用有一处明显的图片采用失配。**

[全部候选及采用标记预览](index.html)。绿色仅代表 Planner 已采用，不代表人工审核合格。

## 1. 运行结果

| Query | 页数 | 首轮调用 | 后续补搜 | 下载成功图片数 | 映射到页面 | 耗时 |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| 神经网络（120 分钟，原完整 query） | 20 | 1 次，4 个需求 | 无 | 8 | 4 页 | 22.62 秒 |
| 集成学习--机器学习概论第八讲（90 分钟） | 18 | 1 次，2 个需求 | 无 | 4 | 1 页 | 16.35 秒 |
| 光合作用（90 分钟） | 18 | 1 次，5 个需求 | 1 次，2 个需求 | 9（首轮 3、补搜 6） | 4 页 | 100.40 秒 |

图片数包含重复与不合格候选；映射不等于页面已经渲染。三次运行均提交了有效 FinalizePlan，失败字段均为 null。合计 7 次 Planner 请求、4 次 ImageSearch 内部 Gemini 请求；没有额外选图模型。

运行证据：

- [神经网络](../../runs/neural-planner-batch-0908-a/planner-results.json)
- [集成学习](../../runs/ens-planner-batch-0908-a/planner-results.json)
- [光合作用](../../runs/photo-planner-batch-0908-a/planner-results.json)

每个 run 同时保存 `planner-input.json`、`experiment.json`、`trace.jsonl`；素材目录保存真实 API 响应、下载尝试和模型收到的精简结果。`planner-results.json` 的 responses 包含原始搜图参数及最终页表和素材映射。

## 2. 内容核对

### 神经网络：主要目标正确

首轮数组包含 LeNet-5 架构、Rosenblatt / Mark I、MNIST 样本、1997 LSTM 论文四项。

| 采用页 | 实际图片 | 核对 |
| --- | --- | --- |
| page-02 数据结构与架构动机 | MNIST 数字样本 | 相关 |
| page-03 感知机历史 | Mark I 感知机设备图 | 相关的早期系统证据，不是人物照片 |
| page-09 CNN / LeNet-5 | LeNet-5 架构图 | 符合需求 |
| page-14 长程依赖与梯度问题 | 1997 年 LSTM 论文首页 | 可作来源背景；不是梯度机制图 |

工具也返回了神经元插画，Planner 没有采用。原课程 query 允许“人物肖像或原始论文／早期系统图”，所以取得原论文和早期设备图不算违背此 query；但不能据此宣称人物照片也成功了。

### 集成学习：人物照片目标仍未实现

实际首轮 query：

```json
["Leo Breiman Bagging Random Forests", "Yoav Freund Robert Schapire AdaBoost"]
```

返回的是两张随机森林／Bagging 图、一张黑板公式图库照片、一张 Orange 软件截图，没有人物肖像。Planner 只采用 IBM 随机森林图到 page-06，没有补搜。

这次不是“找到创始人照片但没有使用”，而是**工具根本没交回人物照片**。检索词虽含人物姓名，却没有明确要求人物照片或肖像；这是检索意图可能偏向算法讲解素材的原因，不能当作已经证明的唯一因果。页表 page-05 已含 Breiman 与 Bagging 的由来，说明历史内容不再完全缺席，但配图意图没有落实。

### 光合作用：电镜补搜成功，采用仍有失配

首轮五项：叶绿体电镜、恩格尔曼实验、普利斯特利钟罩、海尔蒙特柳树、叶片横切面。首轮返回 15 个候选，仅 3 张可下载，其余包括 403、404 和超时。

Planner 随后自己输出第二次批量 ImageSearch：

```json
["\"chloroplast\" ultrastructure transmission electron microscope thylakoid stroma site:wikimedia.org", "\"Engelmann\" \"spirogyra\" bacteria site:wikimedia.org"]
```

补搜返回 6 张图片，包括两张带比例尺的真电镜图。域名限制由 Planner 自己添加，不是测试者改词或手工指定下载地址。

| 采用页 | 实际图片 | 核对 |
| --- | --- | --- |
| page-04 叶片结构 | 叶片横切面显微照片 | 符合需求 |
| page-05 叶绿体结构 | Anemone 叶绿体 TEM 图，200 nm 标尺 | 符合需求，解决了上一轮独立工具测试的电镜失败 |
| page-06 恩格尔曼实验与吸收光谱 | 水绵单细胞照片 | 仅部分匹配：展示实验材料，不能展示细菌聚集／光谱实验结果 |
| page-02 柳树与钟罩实验背景 | CO₂ 分压随时间变化曲线 | 失配：不是钟罩装置或历史实验过程图 |

page-02 的问题跨两层：ImageSearch 从讲钟罩实验的文章返回了曲线；Planner 又把它映射到实验背景页。同批已经有一张钟罩装置示意图，但未采用。选择理由未记录，不能断言模型为什么这样选。

另记一个已有问题：光合作用页表仍出现 page-17 代码页。此次只复测搜图，没有顺带修改页型选择规则。

## 3. 判断边界与复现

- 已验证：首轮合批、单次批量工具的实际图片回灌、按需补搜、有效路径的最终页面映射。
- 未全部达成：照片意图明确化、候选与需求的精确匹配、Planner 的采用判断。
- 不应只用“下载成功数”“有素材页数”作为正确性结论。此次没有增加门禁、自动合并器或选图评分模型。
- 本轮使用已有实验脚本，增加 gemini 后端选项和首请求／工具参数记录，并移除指纹采集对已归档脚本的硬依赖。没有手工替换图片或生成课件页面。

复现示例（新 label，付费）：

```bash
python experiments/media-search-20260908/run_planner.py --case neural --backend gemini --label your-new-label
```

其他 case 为 `ensemble` 和 `photosynthesis`。本报告及预览保存的是本轮原样结果，未按人工审核结论改写 FinalizePlan。
