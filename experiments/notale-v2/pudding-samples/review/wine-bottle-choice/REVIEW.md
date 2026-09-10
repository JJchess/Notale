# Wine bottle choice · 待用户 review

## 原作与视觉判断

[原作](https://pudding.cool/2025/04/wine-animals/) · [首屏截图](../../evidence/wine-animals/original-00.png) · [选择后截图](../../evidence/wine-animals/original-selected.png)

值得保留的是四支带反光与透明酒液的真实酒瓶，以及选择后瓶身移至中央的空间连续性。五个鼠标位置能显示不同方向，点击后的物体与初始瓶子始终一致。单纯换成一个通用瓶子轮廓会丢掉这个段落的核心品质。

## 源码与 mini 范围

上游 `Intro.Bottles.svelte` 提供四瓶记录，`SpinningBottle.svelte` 提供 8 帧条带及鼠标分区旋转。提交和资产哈希见 [assets.json](assets.json)。

mini 保留原始 WebP、配色、字体、4 瓶选择与聚焦；把原长滚动的后续解释压缩为价格、评分和总样本中位数反馈，并提供重选。数据指的是原研究历史记录，不是实时售卖价格。初始旋转一周后停在正面，移动鼠标可继续转瓶；减少动态效果时不自动旋转。

这是图像选择与证据揭示机制，不是新的酒类购买建议。分类暂记“interaction/general 候选”；是否达到正式学习交互要求由用户入库 review 决定。

## 视觉复核

已查看 mini 的 1600×900 初始与选中画面、1280×720 首屏、390×844 首屏，并与上述原作截图对照。四瓶保留与源作相当的视觉比例和标签清晰度。矮屏页脚与瓶名的碰撞已调整；截图检查覆盖转瓶、重选和 reduced motion。

[打开 mini](index.html) · [初始](shots/1600x900-initial.png) · [选中](shots/1600x900-selected.png) · [窄屏](shots/390x844-initial.png)
