# CHASSIS.md —— 底盘接口速查

底盘负责画布缩放、canvas 高分屏、指针坐标与可访问性机制；主题提供共享 CSS 与使用说明。

---

## base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在你自己的样式之前。

主题实现由 `assets/theme.css` 加载；根 `html[data-variant]`
同时选择背景与前景，应在初始化图表前设置；不设置就是默认。Canvas 通过 `Deck.token()`
取根值，局部反色区域读取对应元素值。页面不要用 stage 的 background 简写清空主题合成。
`#stage::after` 保留为不拦截指针的品牌层（z-index:100），内容在其下并留接口要求的净空。
无 logo 时此层不生成可见内容。代码工作台不加载共享 theme.css。

主题须提供 `--bg`、`--text`、`--font-sans`，底盘不给默认值。
舞台内按固定逻辑画布设计尺寸，不用外部视口单位或宽度断点再次缩放字号/排版；整体缩放只由底盘负责。

主题主要字体由本地 `@font-face` 随包交付。
Canvas 使用字体前先 `await document.fonts.load(font, text)`，再等待 `document.fonts.ready`，然后测量和绘制；
从对应元素的 computed style 获取已解析的字号与混排字体栈，不把原始 clamp()/calc() token 直接拼成 Canvas font。
字体加载后重绘，不将首次 fallback 的字宽缓存为最终结果；页面不重复下载字体。
截图等待 `document.fonts.ready`，但该 Promise 本身不证明没有缺字或 fallback。
不要以服务器安装字体、CSS family 字符串或字体请求成功冒充跨机器渲染一致。

底盘另外会读 `--stage-w` / `--stage-h`（画布逻辑尺寸，默认 1600 / 900）和
`--focus`（焦点圈颜色）。缩放比由底盘算出后写回 `:root` 的 `--s`，CSS 里可以直接用。

### 结构

页面里要有 `#stage`，它就是那块 1600×900 的逻辑画布；引入 base.css + base.js 之后
缩放自动生效，不需要你写任何缩放代码。
Check 核对基础资源是否引入并生效、舞台逻辑尺寸及居中等比缩放；缺资源时先恢复引用，不改主题或靠页面布局补偿。

### 四个工具类（这是 base.css 提供的全部类）

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | grid/flex 分栏的子项，允许内容收缩 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 canvas，不能只写 inset |
| `.no-pan` | 关掉触摸平移 | 需要拖动的交互区 |
| `.sr-only` | 只给读屏软件 | 图形的文字替代 |

---

## base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。

### 尺寸与缩放

```
Deck.W / Deck.H          逻辑画布尺寸(读自 --stage-w / --stage-h)
Deck.s                   当前缩放比(同 :root 上的 --s)
Deck.onResize(fn)        注册尺寸变化回调,返回注销函数
Deck.init(cfg)           可选,只做键盘翻页和 document.title,不生成任何外观
```

```js
Deck.init({ index:3, total:14 });                 // 通常只需要这一行
Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页;另有 href:n=>… 自定义跳转
```

### canvas 与指针

```
Deck.fit(cv)             高分屏适配,返回已 setTransform 的 2d ctx
Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸/触摸结束都兼容)
```

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。
它靠 `r.width / el.offsetWidth` 反推，**嵌套缩放也对，但元素被 rotate 之后不适用**。

### 从 CSS 读颜色（canvas 里写不了 `var()`）

```
Deck.token(name)         读成原始字符串
Deck.rgb(name)           读成 [r,g,b]
Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'
```

`Deck.rgb()` 用浏览器转换为 sRGB 数值（超出 sRGB 的颜色会裁至可表示范围）；完全透明颜色返回 `[0,0,0]`。
`Deck.rgba()` 使用传入的 alpha，不保留源色 alpha。`Deck.token()` 不求值字体长度表达式。

### 动画

```
Deck.reduced()           系统是否要求减少动态
Deck.loop(fn[,opt])      rAF 循环,返回 stop()
```

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧
`fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；
标签页隐藏时自动暂停，回来不会有 dt 跳变。

### 小工具

```
Deck.clamp / Deck.lerp / Deck.fmt / Deck.rgba
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
```

## 分步出场（可选）

元素需要在第 n 步出现时，写 `data-deck-step="n"`；不需要分步出场就不写。

```html
<p data-deck-step="2">第 2 步出现的证据</p>
```

第 0 步是页面刚打开的样子，第 1 步是按第一下。右方向键先在页内推进，出完才翻页，左键对称回退。
canvas/svg 里画的东西用 `Deck.onStep(function(step, max){ … }, maxStep)` 按步重绘；第二参数是最大 step 下标，不是状态个数。
例如三个状态 0/1/2 传 `2`，数组驱动时传 `states.length - 1`。
函数是步数的函数：任何 step（含 0）都要画出那一步的
完整画面，不能只向前追加——回退、`?all`、课后复看靠的都是这一点。
未出场的元素透明且 `inert`。`?all` 或系统 reduced-motion 直接停在末步，给课后复看。
默认淡入加 6px 上移，页面可覆盖；静态页、只推进一次或多步都合法，按内容需要选择。
