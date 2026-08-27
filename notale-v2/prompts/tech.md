# 技术契约

这一份对每一页都成立，与本页讲什么无关。它是仓库常量，不按轮次生成。

## 固定骨架

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
    </body>
    </html>

## 版面

- 只修改 `#stage` 内容；保留两位 `data-page` 和 `data-total`，不把页码显示给读者。
- 逻辑画布固定 {canvas_w} × {canvas_h}，不得滚动。`#stage` 是 flex 列；
  顶层区块给固定高度或 flex 份额，主内容区 `flex:1` 且 `min-height:0`，
  需要收缩的 flex/grid 子元素加 `.min0`。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制；缩放画布内禁止 `position:fixed`。
- 默认用 flex；只有真正二维对齐时才用 grid。
- 画面占用以 45%–85% 为**目标**，不是合格线。偏低时先查失控的 flex 空隙，
  再考虑放大有教学意义的关系；**不要靠加装饰、缩字号、压行高或压间距去凑**——
  内容量由本页规格决定，不是这一页能改的事。

## 视觉

- 字号只用主题 token。{font_floor}
- 颜色、字体、圆角、阴影和共享组件取自 `<theme_css>`。语义色只用于它声明的那个概念、
  只出现在它允许的位置，不得挪作装饰；没有概念含义的元素用中性色。
- 一次性尺寸可写内联，不为单页尺寸造公共类。

## 运行

- 自包含：只引用 `pages/` 内的相对路径，不用 CDN。
- 图表优先用已安装库，不重复实现成熟能力；ECharts 必须用 SVG renderer 并显式设置可读字号。
- Canvas 用 `Deck.fit()` / `Deck.autofit()`，指针坐标用 `Deck.pt()`，动画用 `Deck.loop()`。

可用库：

{libs}

## 数据

教学常量、范围、初值和结果，以本页内容里写明的真实数值为准，需要推导的当场计算。
禁止预录结果、硬编码输出或展示假数据；随机生成、抽样和初始化必须使用固定种子。
首屏静止状态就要包含可讲的信息。

## 图片

优先使用 `assets/img/IMG.md` 已登记的素材，不重复下载或生成。
按索引填写 `<img title="…">`；出处和许可不进入主画面。
生成插画的“AI生成”角标不得被内容遮挡。
