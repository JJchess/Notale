# 洋葱切分实验室

状态：pending-user-review。仅备选，未晋升正式样例。

原作：[Dicing an Onion, the Mathematically Optimal Way](https://pudding.cool/2025/08/onions/)，Andrew Aquino、Russell Samora、Jan Diehm。源码 https://github.com/the-pudding/onion ，固定 commit 见 assets.json。

## 原作实际复查

已打开原站，查看叙事和 Explore 的剖面、四种切法；实际操作原作的 radial、96% 深度、explode。原作截图位于 ../../evidence/onion/，original-8200.png 是剖面控制器，original-exploded.png 是亲自操作后的 29.5% 散开状态。

## 值得保留的机制

用真实切分路径呈现层与刀线的交集；同一批路径从剖面位置移到按面积递减的行列。面积越接近平均值越偏青色，偏离越大越偏紫红。四个预设让垂直、圆心、向下 60%、向下 96% 可以快速对照，层数、切分数与汇聚深度仍可连续探索。

这是二维剖面模型，分类为 interaction/general；不是 3D。保留原 PNG 洋葱字母与滑块圆点，没有把图片改成 SVG。图表沿用原作自身的 SVG/Paper.js 数学路径机制。

## 提取范围及改动

- onion.js、math.js 原积分与样本标准差公式保留，只有 d3 的导入路径改为本地 bridge。
- 从 Onion.Demo.svelte 提取半圆环与切分区域，从 Onion.PieceAnalyzer.svelte 提取 Paper.js intersect 与按面积排布的机制；用原生 JS 组织独立页面。
- 本 mini 聚焦无水平切的四种策略；未暴露原 Explore 的水平切参数、全文 19,320 组合排行榜。
- 散开/还原保持路径节点身份；改变切分参数重新计算形状。鼠标、触摸滑块、键盘、重置和 reduced-motion 均支持。
- 96% 最优仅针对原作 10 层、10 等分、无水平切条件。文字明确此限制。
- 数值计算分析对称的右半剖面，与原作一致；不把右半边的块数说成整颗洋葱块数。
- 原图形依赖允许的版本范围内使用本地 d3 7.9.0 / Paper.js 0.12.18，许可证附在目录；运行不依赖 CDN。

## 验证

`node experiments/pudding-samples/tools/check-onion.cjs`

1600×900、1280×720、390×844：预设 37.3%、57.7%、34.5%、29.5%；修改层数/切分数/深度，散开/还原，键盘调节及重置；无脚本错误、无缺图、无横向溢出。三尺寸初态、radial 与散开截图保存在 shots/。窄屏使用自然纵向滚动。

每个预设及自定义 13 层 / 7 等分 / 42% 验证积分面积总和为 π×240²/4。实际 Paper.js 路径面积与各块积分面积交叉检查，容差 0.5% + 0.1 平方单位。最初采用绝对 1 平方单位容差，垂直边缘最大碎块因原 Paper.js 圆弧的贝塞尔近似相差约 4.58 / 1691.31（0.27%）；因此改成明确的相对几何误差容限。显示指标未改用近似路径面积。

素材及上游代码 SHA-256 见 assets.json；PNG 均与原仓库逐字节相同。准备脚本 tools/prepare-onion.py 可重建本地素材。
