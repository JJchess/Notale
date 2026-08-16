写一份 `CONTRACT.md` —— 全套 {n_pages} 页共用的页面构建契约。

每个页面由一个独立的 agent 构建，它们互相看不见，只共享这份契约、`PLAN.md`、
`assets/theme.css` 和 `assets/lec.js`。所以凡是**每页都一样**的东西都要写在这里，
不要留给各页自己决定 —— 那是页面之间长歪的唯一原因。

这份契约要覆盖的东西（按 nn-06 那份的实际结构）：

- 你只碰一个文件：只写自己那一页的 HTML，绝不读别的 `page-*.html`
- HTML 骨架：照抄的模板，只改页号、标题、正文
- 版面预算：每页正文字数、控件数量的硬上限，超了就说超了，不许压字号塞进去
- 字号下限：刻度类 ≥12px / 标签图注 ≥14px / 正文 ≥16px / 行高 ≥1.35，
  说明 1366 屏上缩放系数约 0.85 这个由来
- 用主题，不要自创一套：所有颜色字体间距从 `theme.css` 取
- 数字一律从 `Lec` 取，页面不许写死
- canvas / 交互的必守条款：高分屏与缩放下的尺寸适配、指针坐标换算、
  reduced-motion 分支、键盘可达
- 库：怎么引、加载顺序、版本从哪看
- 交互的标准：什么算真交互，什么是装饰
- 完工前自检：跑什么、判据是什么、**改到干净为止**
- 交付：只交这一个文件，不写文档不写测试不写总结

画布是 {canvas_w} × {canvas_h}。可用的库：

{libs}

`Lec` 的接口：

{lec_api}


## `assets/base.js` 提供的机制(契约里要原样转达,别让页面自己重写一遍)

    Deck.W / Deck.H          逻辑画布尺寸
    Deck.s                   当前缩放比
    Deck.fit(cv)             canvas 高分屏适配,返回已 setTransform 的 2d ctx
    Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
    Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸都兼容)
    Deck.token(name)         读 CSS 自定义属性原始字符串
    Deck.rgb(name)           读成 [r,g,b] —— canvas 里写不了 var(),必须先读出来
    Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'
    Deck.reduced()           系统是否要求减少动态
    Deck.loop(fn[,opt])      rAF 循环,返回 stop();reduced-motion 下只画一帧
                             fn(opt.still||0, 0);标签页隐藏自动暂停,回来无 dt 跳变
    Deck.onResize(fn)        尺寸变化回调,返回注销函数
    Deck.clamp / lerp / fmt / rr(圆角矩形) / arrow(带箭头线段)

`assets/base.css` 提供的类:`.min0`(flex/grid 子项允许收缩,不加内容会被静默裁掉)、
`.cv-fill`(canvas 铺满父容器)、`.no-pan`(触摸时禁页面平移)、`.sr-only`。

契约里要写死:**canvas 一律走 `Deck.fit`/`Deck.autofit`,指针一律走 `Deck.pt`,
动画一律走 `Deck.loop`,canvas 取色一律走 `Deck.rgb`/`Deck.rgba`。**
自己写 `getBoundingClientRect` 换算、自己 `devicePixelRatio` 缩放、自己
`requestAnimationFrame` 循环 —— 都是重复实现,不许。

## 页面骨架

harness 已经把每页的骨架建好了,长这样,**只往 `#stage` 里加内容,别动别的**:

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="TT">
      <div id="stage"></div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

## 还要写进契约的几条硬约束

- 每个 HTML 自包含:直接在浏览器打开就能显示和交互,资源一律相对路径,不用 CDN。
- 库的版本按 `assets/lib/LIBS.md` 上写的来,**不要去库文件里查版本** ——
  压缩构建里查不到,查也是白烧调用。
- 这台机器上已装好 `node`、`python3` 带 numpy、`playwright` + `chromium`,
  不需要检查装没装。
- 自检工具是 `python3 assets/selfcheck.py page-NN.html`,在 `pages/` 目录下跑。
  它按 1600×900 真渲染一遍,报 JS 报错、加载失败的资源、超出画布的元素、
  被裁掉的元素、字号最小值与中位数。只报告,不改文件。改到干净为止。

只输出 CONTRACT.md 的内容本身，不要任何解释、不要 markdown 围栏。
