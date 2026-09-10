# Waistline cohorts · 待用户 review

## 原作与视觉判断

[原作](https://pudding.cool/2026/02/womens-sizing/) · [15 岁 / 女装](../../evidence/womens-sizing/detail-6000.png) · [成人状态](../../evidence/womens-sizing/detail-16000.png)

人物的衣服、轮廓、灰阶和中位数彩色人物，比普通圆点更直接表达“尺码对应身体”。蓝色尺码带与人物分布分别改变，使“身体变化”和“标签变化”可以被区分。值得抽取，必须保留完整人物原图层和数据驱动布局。

## 源码与 mini 范围

以 `IntroJD.svelte`、`avatar-generator.js`、`pointsData_JD.csv` 和 `ASTMsizes.json` 为来源。保留上游的 x=20–60 英寸、D3 forceX / forceY / collide、百分位固定点、原图层选择规则。

mini 压缩为 4 个可往返状态：10–11 岁 junior、14–15 岁 junior、相同年龄 women、20+ women。101 点是源作由百分位生成的示意分布，**不是 101 位真实参与者的测量记录**；页面页脚明确这一点。各状态在同一 DOM 人物上更新，衣服变体固定，避免每次点击随机换人。

66 份人物 PNG 逐字节复制；不栅格化图表，不重新描人像，不用 SVG 图标替代。代码/数据/图片出处与哈希见 [assets.json](assets.json)。

## 视觉复核

已经查看初始、女装切换、成人状态及窄屏画面。首轮发现成人右侧人群被说明遮挡、窄屏 swarm 越过轴线；修正为成人说明上移，小屏保留 1000px 坐标画布并在局部横向浏览，切换时定位到中位数附近。对应画面须以最终 `shots/` 为准。

[打开 mini](index.html) · [同龄换尺码](shots/1600x900-state-2.png) · [成人](shots/1280x720-state-3.png) · [窄屏](shots/390x844-initial.png)

此项是 page/chart 的 authored 状态比较，按钮用于复查作者观点，不把它包装成用户能改变人口模型的仿真实验。
