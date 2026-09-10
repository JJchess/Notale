# 候选 26：着装规定，限制了谁？

- 状态：pending-user-review；promoted=false。
- 原作：[The Sexualized Messages Dress Codes are Sending to Students](https://pudding.cool/2019/02/dress-code-sexualization/)，Amber Thomas，2019 年 2 月；数据协助 Kait Thomas、Anna Houston。
- 仓库：https://github.com/the-pudding/dress_codes
- 完整本地 clone：`../../sources/dress_codes`，提交 `1e1d4abce73f582b7cab119045927984a842b41d`。
- 入口：`index.html`；无需构建，预览服务直接运行。

## 提取范围与保真

提取 Clothes We Wear 的完整服装分布：41 项原 CSV 记录、七个原区间（含空的 50–60%）、原顺序、百分比、五种状态及五段原解释。37 项被作者归为显露或强调身体，其中 21/14/2 项分别主要面向 girls/any/boys 营销；其余四项淡化机制完整保留。这些分类是原研究编码，不是本地另行判断。

`chart.js` 来自原 `wordHist.js`，保留 D3 分组、补空区间、标签生成与全部五个高亮函数；移除 scrollama 与文章整屏滚动高度，改为五个直接选择按钮。原 300ms 配色过渡保留，快速切换先取消旧动画；减少动态效果设置下直接显示最终状态。增加每项可点击/键盘选择的学校数量、百分比与分类详情。

原模块本身为 HTML 标签图，没有将栅格图换成 SVG。原 clothes.gif、National 2 Narrow 三种字重、Tiempos 正文字体及 D3 4.12.0+Jetpack 均按原文件保留。桌面继续使用七列标签分布；手机沿用原纵向逆序分组方式并让标签自然换行，全部内容可读。原解释移到图下，避免覆盖图中标签。

此 mini 不包含学校图阵、身体部位条形图和原长文其它段落。原研究为 2018–2019 学年手册的机会抽样，页面注明时间、范围、营销分类方式和“short”的定义；不将其解释为当前所有学校的规则。原 CSV 可下载，完整原文副本在 upstream/doc.json。

## 亲眼视觉复核

实际打开官网，查看原入口、学校图阵及服装分布全览。网页偶尔数据请求失败，空图不作为复核通过证据。成功重访后逐步滚动至全部五种状态，记录在 `../../evidence/dress-codes/state-*.png` 和 original-states.json；已亲眼查看 all 分布和 color 状态，确认 21 个蓝色标签及图例。

本地已亲眼查看 `shots/1600-color.png`、`shots/390-color.png`，确认所有标签、原配色、七分组、手机说明及原 GIF 正常显示。

## 验证

- `tools/check-dress-clothing.cjs`：1600、1024、390 三种屏宽，41 项×5 状态，全部 41 项键盘详情、空区间、原 GIF 解码、说明展开；无横向溢出、JS 错误或外部请求。
- `tools/check-dress-original-match.cjs`：205 项逐一比对官网实际 DOM 的标签顺序、背景色、单项淡化和整组淡化；正常动画及快速来回切换通过。
- `../../evidence/dress-clothing-source-check.json`：assets.json 中 11 个原文件逐字节一致，CSV 全部 41 行及分类计数核验。
- 复核与检查工具在 `../../tools/`，运行记录在 `../../evidence/dress-clothing-*.json`。

原仓库 MIT LICENSE 已保留；原字体及 GIF 保留对应来源，不宣称额外授权。只登记为本地候选，等待用户统一决定是否入库。
