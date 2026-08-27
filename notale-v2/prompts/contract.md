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

按下面四节输出，标题和顺序保持不变。编号沿用 1/5/6/7，不要重排。文件开头先用几行写清阅读边界：必须读本契约、
`assets/CHASSIS.md` 和本页 `pNN.md`；不要读其他页面、`PLAN.md` 或 CSS/JS 实现源码。

**只写各节独有的东西。** 颜色 token 的含义与允许位置在 `assets/CHASSIS.md` 接口块，通用文风卫生
（套话、过渡词、翻译腔、无源引用、元评论）已统一注入每页，被否决的视觉方向在规划里 —— 都不要重说。

## 1. 这堂课在讲什么

用简洁人话重述全课主张、各幕任务和证据链。强调每页只实现自己的 `pNN.md`；
其中“不许碰”的内容由别页负责，不得提前重复。

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
- 字号只用主题 token。{font_floor}
- 颜色、字体、圆角、阴影和共享组件取自主题接口。语义色只用于接口块声明的那个概念、只出现在
  它允许的位置，不得挪作装饰；没有概念含义的元素用中性色。一次性尺寸可写内联，不为单页尺寸造公共类。
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

只写这个读者、这个题目独有的口径，收束句与下一问的分工另有出处，不要重复。写清四样：

- 术语深度：哪些术语直接用、哪些首次出现要短句解释、哪些整门课都不引入。
- 表述禁忌：本题最容易出现的错误比喻或拟人化，逐条点名。
- 记号口径：公式、符号、单位在画面上怎么写，变量要不要跟人话含义。
- 数字换算：数值统一换成哪类可感尺度；近似或只在当前样本成立的结论怎么标注。

成品不超过 4,200 个 Unicode 字符，目标约 3,600。只输出 `CONTRACT.md` 正文，
不要解释，不加 Markdown 围栏。
