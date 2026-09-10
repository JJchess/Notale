# Brand size atlas · 待用户 review

## 原作与视觉判断

[原作](https://pudding.cool/2026/02/womens-sizing/) · [品牌段落原作截图](../../evidence/womens-sizing/detail-24000.png)

以同一条 20–60 英寸轴对照品牌尺码，紫色连续区间保留各品牌范围，浮动尺码标签揭示“L 并不对应同一个数值”。高密度仍然清楚，适合独立成 chart sample。原作此段本身是原生点与区间图形，没有照片资产需要替换。

## 源码与 mini 范围

`SizeChartJD.svelte`、`sizeCharts.json`、`ASTMsizes.csv`，固定提交见 [assets.json](assets.json)。沿用 regular 范围、排除 Banana Republic 与 Polo Ralph Lauren、末端范围排序、ASTM 比较行。161 条记录，15 个品牌加 1 个标准。

按钮提供全部、Size 8、Large，点击数据端点可读品牌、字母尺码、数字尺码与完整测量区间。范围条和两端点都保留；若没有数字尺码则不显示虚假数字或 null。mini 只取 regular 范围的标签对照，不包含原长文中的 plus-size、年龄中位数和后续产业历史段落。

**线上与仓库差异：**本次固定 clone 的数据包含 COS，原作当前截图中的品牌序列未显示 COS。mini 根据固定源码数据计算；Large 的完整测量区间是 28.7–36.5 英寸，不把原作段落的近似文案 29–34 强写成所有范围端点的精确统计。保留源数据，明确比较对象。

## 视觉复核

已经查看 1600×900 与 1280×720 的 Large 状态。首轮发现部分端点标签重复且出现缺失数字，已修正；保留原范围条，把标签压成单行以适配 mini 的较短高度。小屏保留 830px 图表并允许局部横向浏览。

[打开 mini](index.html) · [Large](shots/1600x900-large.png) · [Size 8](shots/1600x900-size-8.png) · [点详情](shots/1600x900-detail.png)
