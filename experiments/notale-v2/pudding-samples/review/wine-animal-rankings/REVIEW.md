# Wine animal rankings · 待用户 review

来源：[The Pour-igin of Species](https://pudding.cool/2025/04/wine-animals/)，Fox Meyer & Jan Diehm / The Pudding。沿用本地完整 clone，提交 `134e56e14dfd1ec356e04df73b83b50f888f7a31`。

## 原作视觉检查

上轮图像请求失败，这轮在原网页重新请求失败图片后正常加载。已查看[价格状态](../../evidence/wine-animals/followup-5550.png)与[评分状态](../../evidence/wine-animals/followup-6400.png)。16 个瓶子的类别身份不变，换度量后整体重排；浅色标签上的原动物图形让读者能够追踪对象。这比重新画三张不相关的柱状图更有参考价值。

## Mini 范围与来源

参考 `Intro.SummaryBottles.svelte` 与 `ChartScroll.SummaryBottles.svelte`，保留其实际读取的 `wineData_summary.csv`，不是另一个略有差异的 `wineData_median.csv`。例如 pachyderm 在页面 summary 中价格中位数为 24.22；另一 CSV 是 23.445。mini 以原页面实际数据为准。

原 16 动物 PNG、直立/横置两种瓶形、选中轮廓原图和原字体全部原字节复制。桌面一排 16 瓶，小屏改用原横置瓶形按行排列；同一个瓶子 DOM 在三种度量间移动，用户可选中追踪。排序距离只表达名次，页面说明不代表数值间距。

原代码的 good-deal 参考标记将两个汇总名称交换了；这里按源 CSV 正确显示：animal wines 14.5%，all wines 13.9%。不复刻标签错误。阈值依据原分析代码：价格 ≤ 29.99、评分 ≥ 4.0；都是研究历史数据。

## 验证

三尺寸检查价格、评分、good-deal 状态、fish 排名与 24.2% 数值、对象身份连续、跟踪取消、减少动态效果、图片加载及无外部运行时请求。人工对照了原作和 mini 桌面画面，并检查矮屏、手机状态。结果：[rankings-candidate-checks.json](../../evidence/rankings-candidate-checks.json)。

[打开 mini](index.html) · [价格](shots/1600x900-price.png) · [追踪 fish](shots/1600x900-deals.png) · [手机](shots/390x844-price.png)

归类建议：page/chart，类别重排与比较。待用户统一 review，未正式入库。素材溯源与哈希见 [assets.json](assets.json)。
