# CHASSIS.md —— 底盘接口速查

`base.css` 和 `base.js` 的**全部对外接口**在这一页里；只有和主题无关的机制（画布缩放、
canvas 高分屏适配、指针坐标换算、可访问性地板）。**没有任何配色、字体、字号、间距或
组件外观** —— 那些是每次生成自己的设计。

---

## base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在你自己的样式之前。

### 必须由你给出的三个 token（底盘不给默认值，缺了页面会明显不对）

```css
:root{
  --bg:        #0b0e14;      /* 页面底色 */
  --text:      #e6e6e6;      /* 默认文字色 */
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

底盘另外会读 `--stage-w` / `--stage-h`（画布逻辑尺寸，默认 1600 / 900）和
`--focus`（焦点圈颜色）。缩放比由底盘算出后写回 `:root` 的 `--s`，CSS 里可以直接用。

### 结构

页面里要有 `#stage`，它就是那块 1600×900 的逻辑画布；引入 base.css + base.js 之后
缩放自动生效，不需要你写任何缩放代码。

### 四个工具类（这是 base.css 提供的全部类）

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | **任何 grid/flex 分栏的子项。** 子项默认不许缩到比内容小，一段长文本或一个宽 canvas 会把整列顶开、被裁掉，表现为「右边内容莫名其妙没了」 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 `<canvas>`。canvas 是替换元素，有 300×150 的默认尺寸，只写 `inset:0` 拉不开它 |
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
