为一套 {n_pages} 页、{minutes} 分钟的互动讲义编写 `CONTRACT.md`。

每页由独立 agent 构建，只共享本契约、`assets/CHASSIS.md` 和自己的 `pNN.md`。
因此这里只写跨页必须一致、且能被执行或检查的规则；页内内容和构图留给逐页规格。

输入：

- 读者：{audience}
- 场合：{scenario}
- 全课主线：

{spine}

- 视觉世界：

{world}

按下面五节输出，标题和顺序保持不变。编号沿用 1/2/5/6/7，不要重排。文件开头先用几行写清阅读边界：必须读本契约、
`assets/CHASSIS.md` 和本页 `pNN.md`；不要读其他页面、`PLAN.md` 或 CSS/JS 实现源码。

## 1. 这堂课在讲什么

用简洁人话重述全课主张、各幕任务和证据链。强调每页只实现自己的 `pNN.md`；
其中“不许碰”的内容由别页负责，不得提前重复。

## 2. 颜色语义

把视觉世界中有概念含义的色相整理成 `token / 色相｜唯一含义｜允许出现的位置` 表。
语义色不得挪作装饰；没有概念含义的元素使用中性色。不要重新设计规划已经确定的视觉方向。

## 5. 技术契约

写入以下固定骨架：

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="{n_pages}">
      <div id="stage"></div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

并写清：

- 只修改 `#stage` 内容；保留两位 `data-page` 和 `data-total`，不把页码显示给读者。
- 逻辑画布固定 {canvas_w} × {canvas_h}，不得滚动。`#stage` 是 flex 列；顶层区块给固定高度或
  flex 份额，主内容区使用 `flex:1`。
- 字号只用主题 token。正文与成句说明 ≥16px；控件标签、图例、图注和提示 ≥14px；
  纯数字刻度 ≥12px；多行文字行高 ≥1.35。
- 颜色、字体、圆角、阴影和共享组件取自主题接口。一次性尺寸可写内联，不为单页尺寸造公共类。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制；缩放画布内禁止 `position:fixed`。
- 默认用 flex；只有真正二维对齐时用 grid。自包含运行，只引用 `pages/` 内相对路径，不用 CDN。
- 图表优先使用已安装库，不重复实现成熟能力；ECharts 必须用 SVG renderer 并显式设置可读字号。
  Canvas 使用 `Deck.fit()` / `Deck.autofit()`，指针坐标使用 `Deck.pt()`，动画使用 `Deck.loop()`。

可用库如下；在契约中压成一张“用途 → 库”的短表，不复制版本说明：

{libs}

并写清教学数据的口径：教学常量、范围、初值和结果来自 `Lec.K` / `Lec.P` 并当场计算，
禁止预录结果和假数据；随机过程必须固定种子，首屏静止状态已经包含可讲信息。

`Lec` 的公开接口如下；原样保留签名和返回字段，不复制实现：

{lec_api}

## 6. 图片

优先使用 `assets/img/IMG.md` 已登记的素材，不重复下载或生成。按索引填写 `<img title="…">`；
出处和许可不进入主画面。生成插画的“AI生成”角标不得被内容遮挡。

## 7. 文字风格

根据读者和场合规定术语深度、句长与提示口吻。使用讲课短句；删除“如图所示”“接下来我们将”
和评价教学设计的元评论。关键数字给可感换算，不确定结论明确标注。收束句给出带走的主张，
下一问负责推进，不写成本页摘要。

成品不超过 4,600 个 Unicode 字符，目标约 4,000。只输出 `CONTRACT.md` 正文，
不要解释，不加 Markdown 围栏。
