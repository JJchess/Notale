# CHASSIS.md —— 底盘接口速查

`base.css` 和 `base.js` 的**全部对外接口都在这一页里**。要用底盘，读这一页就够了，
不需要打开那两个源文件（合起来 400 行）。只有在你打算**改写或替换**底盘时才去读源码，
那时源码里每一条旁边都写了它各自解决什么问题。

底盘里只有和主题无关的机制：固定画布的整体缩放、canvas 在高分屏和缩放下的适配、
指针坐标换算、几个不写就一定出 bug 的布局细节、可访问性地板。
**没有任何配色、字体、字号、间距或组件外观** —— 那些是每次生成自己的设计。

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
页面里只要有 `#stage`，引入即开始工作（缩放监听在文件末尾自动装好）。

### 尺寸与缩放

```
Deck.W / Deck.H          逻辑画布尺寸(读自 --stage-w / --stage-h)
Deck.s                   当前缩放比(同 :root 上的 --s)
Deck.onResize(fn)        注册尺寸变化回调,返回注销函数
Deck.init(cfg)           可选,只做键盘翻页和 document.title,不生成任何外观
```

```js
Deck.init({ index:3, total:14 });                 // 通常只需要这一行
Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页
Deck.init({ index:3, total:14, href:n => 'p'+n+'.html' });
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
Deck.clamp / Deck.lerp / Deck.fmt
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段
```

---

## 底盘不做的事

顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、
版式模板 —— 一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

**如果这一轮另外做了共享文件**（比如统一的顶栏和进度轨、统一的数字格式化、
共用的底纹），把它的接口按上面这个格式追加到本文件末尾。多个页面各自
`cat` 一遍源码去认接口，是纯浪费。

---

## 本轮追加:`theme.css` 提供的 token 与 class

```
token    --bg #f7f3ea             舞台底色，纸张米白
   token    --text #22242a           正文主色，深灰近黑
   token    --ink #2b4c7e            钢笔蓝，当前数值/状态专用
   token    --accent #d1495b         红铅笔色，当下要看的变化
   token    --paper #fffdf7          读数框/面板浅底
   token    --line #c9c2b2           中性描边、分隔
   token    --muted #6b6558          次要文字、刻度
   token    --good-shadow            向下坡度阴影，「变好」语义
   token    --bad-shadow             向上凸起阴影，「变差」语义
   token    --font-sans              正文/UI 无衬线
   token    --font-serif             整页标题手写体质感衬线
   token    --font-mono              权重/损失/学习率等数值等宽
   token    --fs-h1 34               页标题
   token    --fs-h2 22               区块标题
   token    --fs-lead 19             导语/强调正文
   token    --fs-body 18             正文
   token    --fs-sec 16              次级成句说明
   token    --fs-label 15            控件、图例、图注、提示
   token    --fs-tick 13             纯数字刻度
   token    --focus                  焦点环颜色
   版心     1488×844                #stage 已含 28px 56px padding，flex 纵向
   版式     .canvas-full            全画布单区，铺满内容/画面
   版式     .focus                  单焦点构图，标题+kicker 堆叠于上，主内容居中
   版式     .ledger                 记录本式：上导语条 + 下多栏读数区
   版式     .split-lr               左右两栏，比例可由页面用 flex-basis 调整
   版式     .split-tb               上下两栏
   版式     .triptych               三栏等分，中栏可强调
   骨架     .k-process              .step 由 .arw / .axis 串联，方向可见
   骨架     .k-comparison           .dim/.hdr/.rowline/.diff 同行同基线比较
   骨架     .k-classification       .lv/.box/.bt 嵌套缩进表达归属
   骨架     .k-generalization       .claim 主张 + .trunk 主干挂 .supports > .support
   组件     .panel / .panel.q       读数与控件容器，.q 版无填色
   组件     .big / .big.sm/.lg / .num / .unit   数值读数，等宽 tabular nums
   组件     .hint / .btn / .btns / .ctl / input[range]   操作与提示，含焦点/选中/禁用
   组件     .tag / .legend>.li>.sw / .sw.line   标记与图例
   组件     .cvbox                  媒体/画布包裹：定位、圆角、裁切
   组件     .quiz / .opt / .fb      作答区，选中态与正确性态分离
   组件     .lead / .small / .note  文字辅助类
   组件     .backdrop / .backdrop-note   整页氛围底图与角标
```

## 已知陷阱

`Deck.fmt(v, d)` **给非负数加 `+`** —— 它是给增量用的（`+3.2%`、`余量 +0.42 cm`）。
**绝对量不要用它**：年代、质量、温度、距离一律 `v.toFixed(d)`。
实测代价：一页把年代印成「约 +366 万年前」，19 处。
