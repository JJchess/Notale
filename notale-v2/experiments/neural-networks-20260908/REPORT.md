# 神经网络专题：完整 query 与 Style Director 实验

2026-09-08。32/32 页生成完成；现有独立审计有 1 页报错，不能记为全部通过。

[完整预览](http://192.168.0.72:4177/lab/neural-networks-style-media-0908-0241-r2/index.html) · [实际输入 query](query.md)

## 课程设定与覆盖

- **Topic**：神经网络——从可学习的函数到 CNN、RNN 与注意力机制。
- **Audience**：会基础 Python、向量矩阵乘法、导数直觉及训练/测试集概念，但未系统学过深度学习的本科生。
- **时长**：120 分钟；教师投影讲授，穿插预测问题、交互演示与少量代码实操。
- **主线**：数据结构 → 网络的结构偏好 → 参数如何从误差中学习 → 如何选择架构与验证效果。

下表时间是输入中的课程规划，不是已测量的课堂耗时。

| 内容 | 建议时间 | 实际页表覆盖 |
| --- | ---: | --- |
| 问题与发展脉络 | 10 分钟 | p01–03：图像/语言输入结构、感知机与结构化先验 |
| MLP 与训练 | 30 分钟 | p04–11：神经元、XOR、前向/损失、反向传播、参数更新、学习率、泛化 |
| CNN | 30 分钟 | p12–18：卷积乘加、权重共享、通道/步幅/感受野、池化、LeNet、二维卷积代码 |
| RNN / LSTM | 25 分钟 | p19–24：时间展开、逐词隐状态、BPTT、梯度问题、LSTM 门控与 GRU 对照 |
| 注意力机制 | 15 分钟 | p25–29：状态瓶颈、加权读取、Q/K/V、位置与三类结构对比 |
| 任务迁移与总结 | 10 分钟 | p30–32：图像、情感、时序、表格任务的模型选择与理解检验 |

共 6 标题页、17 内容页、7 交互页、2 代码页。时间/内容/读者均显式传入，而不是只给“神经网络”四个字。没有强制页数或配图数量。

## 配置与重试

- Gemini 3.8 Flash，统一 `gemini38-google-low`，Builder 并发上限 30。
- 使用真实 Style Director；mini + aux samples、notes=notes、sample-shots 关闭，沿用此前实验设置。
- 实验入口新增 `--audience` / `--scenario`，保留原默认值；生产提示词、工具定义、门禁和模型配置没有为此更改。
- 相关测试 `core.test_director` + `core.test_prompts` 共 18 项通过。
- 首次 run `neural-networks-style-media-0908-0241`：主题三次未过，最后语义色明度极差 8pp，未进入 Builder。失败产物保留在该 run 的 style.rejected.json。
- 相同配置完整重试 `neural-networks-style-media-0908-0241-r2`：选参照一次，写主题第二次通过，然后生成全部页面。没有放宽校验，也没有换成旧主题。

命令：

```bash
python3 -B -u experiments/media-a-20260907/run_full.py \
  --label neural-networks-style-media-0908-0241-r2 \
  --query "$(< experiments/neural-networks-20260908/query.md)" \
  --audience '会基础 Python、向量矩阵乘法、导数直觉及训练/测试集概念，但没有系统学过深度学习的本科生' \
  --scenario '本科机器学习课程中的神经网络专题；120 分钟，教师投影讲授，穿插预测问题、交互演示与少量代码实操' \
  --minutes 120 --concurrency 30 --fresh-theme
```

## 风格与素材结果

Director 选择浅冷白 `#F1F4F2` 背景、深墨绿 `#1C4436` 结构、朱红 `#D43811` 反馈。主题 SHA256 为 `cd5824b14e845b1e5fa1768c0e580dfed8806d5c268ab7251f07cb535b831f28`，Builder 完成后未改变。代码工作台内部仍采用独立界面风格。

**本轮外部素材实际使用为 0，不应算 media 成功案例。**

- Planner 搜索了 `LeNet-5 Yann LeCun 1998 architecture paper`、`MNIST handwritten digits grid sample`、`Perceptron Frank Rosenblatt 1958 Mark I`。
- 三组结果一组为空，两组共下载 6 张 Met 馆藏图，内容为画作、茶壶等，与本课素材诉求无关。
- Planner 提交的 `media_by_page` 为空，没有继续补搜；Builder 也没有 ImageSearch / ImageGen 调用。
- 逐页浏览器检查未发现显示的外部素材。课程中的数字、网络、特征图等由页面代码绘制，不能当作搜图使用。

Query 已明确方法来源页、人物/原始资料及相关性要求。因此这轮不能简单归因为“没让 Planner 找图”；至少还有搜索相关性差、无效结果后未继续搜索两项观察。没有改搜索链或手工补图来掩盖结果。

## 验证与问题

32 页初始状态与存在的分步终态检查无 pageerror、console.error 或 requestfailed。检查截图见 run 的 verification 目录。已查看封面、CNN、LSTM、梯度代码页等截图；未穷举所有交互，也未完成整套学术事实审查。

代码任务确实对应本课：

- p09：前向计算、链式求导、参数更新，示例损失 `0.0085 → 0.0083`；最终采用原生 Python，而不是页表最初写的 NumPy。生成的 3 项计算测试通过。
- p18：二维滑窗乘加，默认特征图为三行 `[0, 30, 30]`；4 项计算测试及现有工作台全套自检通过。

**p09 的现有工作台自检报错可复现，但不是默认示例的计算错误。**

自检将源码替换为无限循环；实际先返回“执行轨迹超过 2400 帧，请缩小输入或减少循环。位置：starter.py:2”，状态为 `outputKind=error`、`running=false`、`runtimeReady=true`。检查脚本第 342 行却只接受包含“已终止”的超时文案，因此断言失败。证据说明轨迹上限保护先于超时生效；不能将它描述成页面卡死，也不能宣称超时重启路径已经验证通过。此项未顺带修改。

另一个小问题：p09 生成测试的 expected 展示文字仍写 `0.0080`，实际 observed 为 `0.0083`，虽然当前测试判为通过，展示数值仍不一致。未手改生成产物。

## 生成开销

成功 run 的 Builder：墙钟约 6.7 分钟，419 次响应，输入 token（含缓存）17,863,481，其中缓存输入 14,805,985，输出 538,440。p06 为 47 次响应，p09 为 36 次，存在明显修整长尾。这些数不含前一次失败 run，也不含 Planner / Director。

证据：

- [页表](../../runs/neural-networks-style-media-0908-0241-r2/pages/plan/pages.md)
- [运行配置](../../runs/neural-networks-style-media-0908-0241-r2/experiment.json)
- [Builder 结果与原始审计](../../runs/neural-networks-style-media-0908-0241-r2/builder-results.json)
- [逐页素材/浏览器观察](../../runs/neural-networks-style-media-0908-0241-r2/verification/media-audit.json)
- [素材来源记录](../../runs/neural-networks-style-media-0908-0241-r2/pages/assets/img/CREDITS.md)

没有为使实验通过手工修改页面、补图或更改校验。
