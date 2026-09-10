# 完全移除 sample 的 Builder A/B

2026-09-08。结论：**本轮没有减少总响应次数；累计输入减少，但输出、耗时及代码页审计结果没有改善。** 不将实验配置改为生产默认，不修改 baseline。

## 方法

冻结 `neural-networks-style-media-0908-0241-r2` 的全部 32 页：brief、页表、主题、底盘和素材。A/B 从完全相同的输入文件开始，不复制已生成页面或 lesson。两臂都使用当前 baseline `c1cf068`，不是拿旧版 419 次响应充当唯一对照。

- A：`samples=mini` + `aux-samples`，保持原实验的样本条件。实际读取 57 次 sample，其中 5 次因为没有 mini 而回退 full，代码页读取 one 版本。
- B：`samples=none`，关闭辅助样本。实际 sample bundle 读取 **0 次**，reference 保留。
- 两臂均为 `gemini38-google-low --uniform --notes notes`；不开 ref-shots/sample-shots/frame-cap/visual-focus。各并发 15，同时运行，全局 Builder 并发上限 30。
- 不重新运行 Planner 或 Style Director；没有额外评分模型。Builder 自己读材料、写文件、Check、修改、停止；观察记录不回灌，没有中途提示、干预或挑选重跑。

两臂启动输入哈希完全一致，生产源码运行前后未变。输入文件唯一的运行后变化是 harness 在结束时重写 `assets/img/CREDITS.md`，两臂结果相同；brief、页表、主题及图片文件未变。记录见两臂 `experiment.json`。

## 总结果

| 指标 | A：mini＋辅助 | B：无 sample | B 相对 A |
| --- | ---: | ---: | ---: |
| Builder 模型响应 | 330 | 332 | +0.6% |
| 单页响应中位数 | 8 | 8 | 不变 |
| 单页最多响应 | 30 | 25 | -5 |
| 超过 11 次的页 | 8 | 6 | -2 |
| 累计输入 token（含缓存） | 11,432,611 | 9,741,724 | -14.8% |
| 缓存输入 token | 8,818,931 | 6,997,388 | — |
| 未缓存输入 token¹ | 2,613,680 | 2,744,336 | +5.0% |
| 输出 token | 486,527 | 576,577 | +18.5% |
| 总耗时 | 315 秒 | 417 秒 | +32.4% |
| 非空页面产物 | 32/32 | 32/32 | 不变 |
| 最终独立审计有 fatal 的页 | 0 | 1（page-09） | +1 |

¹ 总输入减接口报告的缓存输入。没有核对账户账单，不将总输入下降直接说成费用下降。模型响应数包含不调用工具的结束响应，不把每个工具或 Check 内部浏览器过程另算模型调用。本轮没有 ImageSearch/ImageGen 调用。

逐页配对：16 页调用减少，4 页相同，12 页增加。[完整配对表](PAIRS.md)；[结构化结果](results.json)。

## 分页型看

| 页型 | 页数 | A 响应 | B 响应 |
| --- | ---: | ---: | ---: |
| 标题页 | 6 | 53 | 43 |
| 内容页 | 17 | 188 | 183 |
| 交互页 | 7 | 75 | 72 |
| 代码页 | 2 | 14 | 34 |

非代码页合计 316→298（-5.7%），累计输入 11,212,285→7,970,155（-28.9%）。代码页抵消了调用数收益，且只有两个样本，不能外推全部代码任务。

部分改善明显：page-08 30→13、page-03 19→6、page-20 20→10。也有反向变化：page-09 4→25、page-06 8→23、page-05 8→22、page-11 8→18、page-07 12→20。并不是所有页面统一少一两次 Read 就结束得更快。

## 工具循环

| 工具 | A | B |
| --- | ---: | ---: |
| Read | 108 | 48 |
| Write | 89 | 105 |
| Patch | 50 | 29 |
| Edit | 0 | 21 |
| Check | 114 | 129 |
| Look | 1 | 7 |
| Bash | 10 | 1 |
| CodeScaffold | 2 | 2 |

无 sample 确实减少了读取，但增加了 Write、Check 和代码页 Edit；不是“读少了，后续自然按比例变少”。这描述本轮观察，不把它当作已经证明的普遍因果规律。

### page-09：停止与验收分离

A 在 4 次响应后结束，专用审计通过。B 在 25 次响应后结束，最终专用审计失败于 timeout recovery 的 `assert "已终止" in timeout_state["output"]`。尚未定位是 author lesson、宿主还是环境导致，不能仅凭这次差异断言“没有 sample 必然导致超时恢复失败”。

另查教学实现：A 实现线性预测器的一次梯度更新，B 实现带 ReLU 隐藏层的两层极小网络；两者都不是换标题的排序代码，但实现复杂度不同。冻结页表写“纯 NumPy”，两组 starter 实际均用标准 Python；A 标题仍写 NumPy，B 标题改成 Python。因此 4 次完成和审计通过不代表 A 在内容表达上完全无瑕疵。

## 画面抽查与限度

对已结束的 page-01、page-06、page-07 做了双臂截图检查：均有完整主体与可读结构，没有出现无 sample 就整页空白的情况。A/B 的构图和交互设计明显不同，不能只凭局部截图宣称整套质量等价或某一组全面更好。

- [A 封面](../../runs/neural-samples-mini-0908-ab-a/.shots/page-01.png) / [B 封面](../../runs/neural-samples-none-0908-ab-b/.shots/page-01.png)
- [A 交互页](../../runs/neural-samples-mini-0908-ab-a/.shots/page-06.png) / [B 交互页](../../runs/neural-samples-none-0908-ab-b/.shots/page-06.png)
- [A 讲解页](../../runs/neural-samples-mini-0908-ab-a/.shots/page-07.png) / [B 讲解页](../../runs/neural-samples-none-0908-ab-b/.shots/page-07.png)

这是一个题目、每臂一次的配对实验，模型仍有随机性；保持了原 notes 约束，未验证关闭 notes 的情况。本轮可以支持“去掉所有 sample 未带来总调用减少”，不能支持“sample 永远有用/永远无用”。

建议先不全局关闭 sample。如果要继续精简，可另行审阅是否只针对非代码页试用无 sample；本轮不擅自更改页型默认配置或增加门禁。

原始结果：[A](../../runs/neural-samples-mini-0908-ab-a/builder-results.json)、[B](../../runs/neural-samples-none-0908-ab-b/builder-results.json)。实验脚本：[prepare.py](prepare.py)、[compare.py](compare.py)。未新增 commit。
