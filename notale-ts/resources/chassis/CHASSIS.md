# 底盘接口

## 舞台与主题机制

底盘负责逻辑画布、等比缩放、Canvas 高分屏及指针坐标；主题提供视觉实现。
`#stage` 默认 1600×900，尺寸由 `--stage-w/--stage-h` 指定；整体缩放仅由底盘负责。
舞台内按逻辑尺寸排版，不用外部视口单位、宽度断点或 `position:fixed` 二次缩放／脱离舞台。
`--s` 是底盘写入根元素的缩放比；`--focus` 用于焦点圈。
主题必须提供 `--bg/--text/--font-sans`，底盘不兜底。

根 `html[data-variant]` 同时切换前景与背景，须在初始化图表前设置；不设置即默认。
不要用 stage 的 `background` 简写清空主题合成。
`#stage::after` 是不拦截指针的品牌层（z-index:100）；内容在其下并按主题接口留净空，无 logo 时不可见。

## 布局类与坐标

| 类 | 用途 |
|---|---|
| `.min0` | grid/flex 子项设置 min-width/min-height:0，允许收缩 |
| `.cv-fill` | Canvas 铺满父容器：absolute、inset:0、width/height:100%；不能只写 inset |
| `.no-pan` | 拖动交互区关闭触摸平移 |
| `.sr-only` | 只给读屏软件的图形文字替代 |

保留这些类的机制。全局对象为 `Deck`：

```text
Deck.W / Deck.H          逻辑画布尺寸
Deck.s                   缩放比，同 --s
Deck.onResize(fn)        注册尺寸变化回调，返回注销函数
Deck.fit(canvas)         高分屏适配，返回已 setTransform 的 2d ctx
Deck.autofit(cv, draw)   fit、首次绘制及 resize 重绘
Deck.pt(el, event)       指针／触摸转换为局部逻辑坐标 {x,y}
Deck.init(cfg)           可选：键盘翻页与 document.title，不生成外观
```

缩放下必须用 `Deck.pt`，不能依赖 `offsetX`；支持嵌套缩放，不支持元素 rotate。
可选翻页示例：`Deck.init({index:3,total:14})`；`keys:false` 关闭键盘翻页，
`href:n=>…` 自定义目标路径。

## 字体、颜色与动画

字体由主题的本地 `@font-face` 提供，不重复下载。
Canvas 先 `await document.fonts.load(font,text)` 再等 `document.fonts.ready`，随后测量、绘制。
字号和混排字体栈取对应元素的 computed style；不把原始 clamp()/calc() token 拼进 Canvas font。
字体加载后重绘，不把首次 fallback 字宽当最终值。
Canvas 颜色从根 token 读取；局部反色区域取对应元素的 computed style。

```text
Deck.token(name)         token 原始字符串，不求值字体长度表达式
Deck.rgb(name)           浏览器转换为 sRGB [r,g,b]；超色域裁剪，全透明返回 [0,0,0]
Deck.rgba(name, alpha)   rgba 字符串，使用传入 alpha，不保留源色 alpha
Deck.reduced()          是否启用 reduced-motion
Deck.loop(fn[,opt])     rAF 循环，返回 stop 函数
Deck.clamp / Deck.lerp / Deck.fmt   数值辅助
Deck.rr(ctx,x,y,w,h,r)  圆角矩形路径
```

`Deck.loop` 在 reduced-motion 下仅调用一次 `fn(opt.still||0,0)`；
初态无信息时用 `opt.still` 指定有效定格。标签页隐藏自动暂停，恢复时无 dt 跳变。

## 可选分步

元素在第 n 步出现时写 `data-deck-step="n"`，不需要分步就不写：

```html
<p data-deck-step="2">第 2 步出现的证据</p>
```

初始为第 0 步，按第一次进入第 1 步；右键先推进分步再翻页，左键对称回退。
Canvas/SVG 用 `Deck.onStep(fn,maxStep)`，回调为 `fn(step,max)`；
maxStep 是最大下标，不是状态数量：状态 0/1/2 传 2，数组传 `states.length-1`。
回调必须重绘任意 step 的完整状态，不能只追加，保证回退和课后复看。
未出现的元素透明且 inert；`?all` 或 reduced-motion 停在末步。
默认淡入加 6px 上移，可覆盖；静态、单次推进和多步均合法。
