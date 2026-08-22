# CONTRACT.md —— 全套 50 页共用的页面构建契约

每个页面由一个独立的 agent 构建，它们互相看不见，只共享这份契约、`PLAN.md`、`assets/theme.css` 和 `assets/lec.js`。所以凡是每页都一样的东西都要写在这里，不要留给各页自己决定 —— 那是页面之间长歪的唯一原因。

## 受众与场合

读者是大学一年级通识课学生，专业背景文理兼有，不假定具备微积分或生物学基础。使用场合是课堂授课，教师带着讲；学生课后可以自己重看一遍。这两条对契约同样是硬约束：语言深浅、术语要不要展开、说明句写多长、提示语用什么口气，都要对得上这个受众和这个场合。具体执行：

- 术语第一次出现必须用一句话解释，且解释不超过 20 个字。
- 每个成句尽量不超过 25 个汉字，超过就拆句。
- 语气是“引导者”而非“教科书”，允许第二人称“你”，但不得居高临下。
- 不出现任何需要微积分或生物学先修的符号或词。

## 工作边界

- 你只碰一个文件：只写自己那一页的 HTML。
- 绝不读别的 `page-*.html`，也不改 `assets/` 下的任何文件。
- 你的页面必须自包含：直接在浏览器打开就能显示和交互，资源一律相对路径，不用 CDN。
- 你的页面文件放在 `pages/` 下，文件名 `page-NN.html`，`NN` 来自 `PLAN.md`。

## HTML 骨架

你的页面文件结构照抄下面这个模板，只改页号、标题和正文：

```html
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
```

页号 `NN` 和总页数 `TT` 来自 `PLAN.md`。只往 `#stage` 里加内容，别动其他元素。

## 版面预算

预算可以数出来，超了就说超了，不许压字号或缩间距硬塞。超限时必须删减内容或拆页。

| 指标 | 硬上限 |
|---|---|
| 正文字数（所有成句的文本，含标点） | 300 字 |
| 控件数量（按钮、滑块、输入框、下拉等实际交互控件） | 8 个 |
| 页面上文本元素总数（含刻度、图例、标签、读数、句子的所有文本节点） | 80 个 |

参考：一页上的文本元素（含坐标刻度、图例、控件标签、读数）中位数约 45 个；超过 80 个的页面人眼一看就是“太满”。而且其中只有约 18% 是句子，82% 是标签和刻度，所以“少写几句话”解决不了太满，要减的是元素个数本身（合并读数、去掉冗余图例、把刻度交给库去抽稀）。

## 字号下限

| 类别 | 下限 | 说明 |
|---|---|---|
| 刻度类（纯数字+单位） | ≥12px | 例如坐标轴 tick，只含数字和单位 |
| 标签图注（控件标签、图例、操作提示） | ≥14px | 带词句的刻度、图注、tooltip |
| 正文（成句文字） | ≥16px | 所有句子、说明、段落 |
| 行高 | ≥1.35 | 所有正文文本 |

1366 屏上缩放系数约 0.85 的由来：画布逻辑尺寸是 1600×900，在 1366 像素宽的屏幕上要把它完整显示出来，缩放系数 `s = 1366/1600 ≈ 0.85375`，所以约 0.85。因此所有字号下限是在设计时的 CSS 像素值，缩放后视觉字号会打八五折；如果设计时低于下限，视觉上会更小，不可读。

注意：KaTeX 公式的字号是嵌套缩放的，基准字号必须 ≥20px，见“库”一节。

## 用主题，不要自创一套

所有颜色、字体、间距、圆角、阴影等视觉属性一律从 `assets/theme.css` 的 token 或 class 取，不得在页面 CSS 中自定义新的色值或字体。页面的布局可以用 flex/grid，但间距要使用主题变量（如 `--gap-*`，如果有）或按主题 class 的样式。尤其注意：不要为了“排得好看”去覆盖 `base.css` 或 `theme.css` 提供的外观。

## 数字一律从 Lec 取

页面上出现的所有物理常数、天文数字、日期、比例，必须从 `Lec.K` / `Lec.P` 取，页面不许写死。例如某事件发生在多少年前、质量、速度、距离等。需要格式化时用 `Deck.fmt` 或自己按 locale 格式化，但数值来源必须是 `Lec`。如果 `Lec` 没有，用 `PLAN.md` 中给出的数字，并在注释里标明来源。

## 交互的标准

- 真交互：用户输入（点击、拖拽、键入、指针移动等）引起页面上的数据、视角、计算或布局的变化。比如拖拽滑块改变参数、点击按钮启动计算、指针扫过显示读数。
- 装饰：仅样式变化而不改变数据或逻辑，如 hover 变色、入场动画、跟随指针倾斜。这些不算真交互。

每个页面至少要有一次真交互，除非 `PLAN.md` 明确说该页是纯演示。真交互必须键盘可达（见下节）。装饰动画必须遵循 reduced-motion 偏好。

## canvas / 交互的必守条款

- 所有 `<canvas>` 一律通过 `Deck.fit(cv)` 或 `Deck.autofit(cv, draw)` 适配高分屏和缩放。
- 所有指针坐标换算一律用 `Deck.pt(el, e)`，不要自己 `getBoundingClientRect` 换算，不要用 `offsetX`（外层有 `transform: scale()` 时它是错的）。
- 所有动画一律走 `Deck.loop(fn, opt)`，不要自己 `requestAnimationFrame`。`Deck.loop` 会自动处理 reduced-motion（不循环，只画 `fn(opt.still||0, 0)`）和标签页隐藏。
- canvas 取色一律用 `Deck.rgb(name)` / `Deck.rgba(name, a)`，不要直接写 `var()` 或 CSS 字符串。
- 键盘可达：所有真交互都必须能用键盘完成。按钮要有 tabindex 和 Enter/Space 处理；滑块要支持方向键；拖拽要有替代的键盘操作（如用 +/- 或方向键调节）。焦点可见（利用 `--focus` token）。
- 如果一个交互只靠鼠标/触摸才能完成，必须提供等价的键盘路径。

## 库

### 硬约束，不是可选项

凡是 `assets/lib/` 下已有库能完成的呈现工作，不允许自己从底层重写。动手之前先按“要做的事”查下表。对照关系是明确的：

| 要做的事 | 引用这一行 | 全局对象 |
|---|---|---|
| 物体下落、碰撞、摆动、堆叠、拖拽、约束 | `<script src="assets/lib/matter.min.js"></script>` | `Matter` |
| 三维场景、可旋转的立体结构、光照材质 | `<script src="assets/lib/three.min.js"></script>` | `THREE` |
| 三维地球、球面上的点/弧线/区块 | three 之后再引 `<script src="assets/lib/globe.gl.min.js"></script>` | `Globe` |
| 生成式动画背景 | three 之后再引 `<script src="assets/lib/vanta.net.min.js"></script>` | `VANTA` |
| 坐标轴+刻度+图例的常规图表（折线、柱、散点、面积、饼、热力） | `<script src="assets/lib/echarts.min.js"></script>` | `echarts` |
| 可拖拽、可命中检测的二维场景（形状、分组、变换、层） | `<script src="assets/lib/konva.min.js"></script>` | `Konva` |
| 节点连线图、精确控制的矢量图形、数据绑定 | `<script src="assets/lib/d3.min.js"></script>` | `d3` |
| 成千上万个元素同时运动 | `<script src="assets/lib/pixi.min.js"></script>` | `PIXI` |
| 分步动画、依次出现、路径描绘、形变 | `<script src="assets/lib/anime.min.js"></script>` | `anime` |
| 多个动画按一条时间线精确编排 | `<script src="assets/lib/gsap.min.js"></script>` | `gsap` |
| 动画进度绑定到滚动位置 | gsap 之后再引 `<script src="assets/lib/ScrollTrigger.min.js"></script>` | `ScrollTrigger` |
| 播放矢量动画文件 | `<script src="assets/lib/lottie.min.js"></script>` | `lottie` |
| 伪三维插画 | `<script src="assets/lib/zdog.min.js"></script>` | `Zdog` |
| 元素跟随指针倾斜 | `<script src="assets/lib/vanilla-tilt.min.js"></script>` | `VanillaTilt` |
| 进入视野时淡入 | `<script src="assets/lib/aos.js"></script>` | `AOS` |
| 数学公式排版 | `<link rel="stylesheet" href="assets/lib/katex.min.css">` 加 `<script src="assets/lib/katex.min.js"></script>` | `katex` |
| 矩阵乘法、行列式、求逆、特征分解 | `<script src="assets/lib/ml-matrix.umd.js"></script>` | `mlMatrix` |
| 可复现的随机（同种子同序列） | `<script src="assets/lib/seedrandom.min.js"></script>` | `Math.seedrandom` |
| 在页面上实时训练一个小神经网络、画决策边界 | `<script src="assets/lib/mlp.js"></script>` | `MLP` |
| 加载预训练模型、在真图片上跑卷积、需要 GPU 的大矩阵 | `<script src="assets/lib/tf.min.js"></script>` | `tf` |

### 加载顺序与版本

所有库都是 UMD 构建，在 `file://` 下直接可用，不需要静态服务器。它们已经在 `assets/lib/` 里，不需要下载、不需要复制、不需要检查。页面里直接按上表的 `引用这一行` 写 `<script>` 标签，相对 `pages/` 目录。

库版本按下面写，写代码按这些版本的 API 来，不要去库文件里查（压缩构建里的版本号往往抓不到）：

| 文件 | 版本 |
|---|---|
| `three.min.js` | three **r160** (0.160.1) —— `outputColorSpace` 时代，不是 `outputEncoding` |
| `matter.min.js` | Matter.js **0.20.0** |
| `d3.min.js` | d3 **7.9.0** |
| `pixi.min.js` | PixiJS **7.4.2** |
| `anime.min.js` | anime.js **3.2.2**（旧版 API：`anime({targets:…})`，不是 v4 的 `animate()`） |
| `gsap.min.js` / `ScrollTrigger.min.js` | GSAP **3.12.5** |
| `globe.gl.min.js` | globe.gl **2.32.0** |
| `vanta.net.min.js` | Vanta **0.5.24**（只有 NET 这一种效果） |
| `lottie.min.js` | lottie-web **5.12.2** |
| `zdog.min.js` | Zdog **1.1.3** |
| `vanilla-tilt.min.js` | vanilla-tilt **1.8.1** |
| `aos.js` | AOS **2.3.4** |
| `mlp.js` | 自家维护，无版本号。原本在 `zzz/lib/mlp.js`，改了要两边同步 |
| `tf.min.js` | TensorFlow.js **4.22.0**（`tf.sequential` / `tf.layers.*` / `model.fit` 这代 API；1.5MB，加载要一两百毫秒） |
| `echarts.min.js` | 6.1.0 |
| `konva.min.js` | 10.3.1 |
| `katex` | 0.18.4 |
| `ml-matrix.umd.js` | 6.15.0 |
| `seedrandom.min.js` | 3.0.5 |

用不到的文件留着不管。需要别的库可以自行下载，同样放进 `pages/` 下本地引用，不要用 CDN。

### 专项注意事项

#### echarts —— 必须加 `renderer:'svg'`（硬要求）

默认 canvas renderer 会把这一页的所有图表文字变成自检的盲区。实测同一份配置：

```
echarts.init(dom)                                      → DOM 里 0 个文字
echarts.init(dom, null, {renderer:'svg'})              → DOM 里 10 个文字
```

所以必须用 `renderer:'svg'`。且默认配置下所有文字都是 12px，违反字号分档。因此初始化时要显式设置：

```js
var c = echarts.init(el, null, { renderer: 'svg' });
c.setOption({
  textStyle: { fontSize: 16 },                    // 全局底线
  xAxis: { axisLabel: { fontSize: 14 } },         // 刻度带词句的按标签档
  yAxis: { name: '…', nameTextStyle: { fontSize: 14 } },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { textStyle: { fontSize: 16 } }
});
```

只含数字的刻度可以到 12px（刻度档地板就是 12），带词句的一律 ≥14。在缩放舞台里正常：实测 1366×768（系数 0.853）下 hover 与 tooltip 定位都对。

#### konva —— 二维场景，指针换算它自己就对

Konva 10.3.1。它替掉的是可拖拽、可命中检测的二维场景。指针换算不用自己做：`stage.getPointerPosition()` 返回的是舞台逻辑坐标，天然扛住外层缩放。但它的文字画在 canvas 里，自检看不见，且 `Konva.Text` 默认 `fontSize: 12`，违反地板。所以：

- 场景里的图形用 Konva；
- 场景上的文字标签用 DOM 元素绝对定位叠在上面，不用 `Konva.Text`；
- 只有画在图形内部、离不开变换的短标注才用 `Konva.Text`，那时显式写 `fontSize`。

#### katex —— 必须连 CSS 一起引，只要这两个文件

```html
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
<script>katex.render("\\sum_{i=1}^{n} x_i^{2}", el, {throwOnError:false});</script>
```

这份 `katex.min.css` 里的 20 个字体已经 base64 内嵌，零外部引用，`file://` 下零加载失败。**基准字号 ≥20px**。因为缩放是嵌套叠乘的，不是一层：实测 16px 基准下简单式约 13.55px，分式里带下标约 9.68px。统一取 20px 最省事。

#### ml-matrix —— 纯计算，不画任何东西

```js
var A = new mlMatrix.Matrix([[1,2],[3,4]]);
A.mmul(A).to2DArray()        // [[7,10],[15,22]]
mlMatrix.determinant(A)      // -2
```

和 `mlp.js` 不重叠：`mlp.js` 是整套逐帧可控训练循环，`ml-matrix` 只是矩阵原语。要在页面上实时训练小网络用 `mlp.js`，不要拿 ml-matrix 重写一遍。

#### seedrandom —— 随机必须可复现

```js
var rng = new Math.seedrandom('page-07');   // 每次打开都一样
rng();                                      // 0.731943…
```

凡页面上“随机生成一批样本/一组点/一次抽样”的地方都要用它。不给种子的话，读者每次打开看到的数不一样，而讲解里写的数字是固定的——那句讲解就变成了假话。

#### mlp.js —— 怎么用

任意层数、任意输入维度、单个 sigmoid 输出的二分类，损失是交叉熵。不做多分类、不做回归、不做卷积、不做动量/Adam。

```js
var net = MLP.create({ sizes:[2,10,10,1], act:'tanh', lr:0.3, seed:1 });
for (var i = 0; i < 12; i++) net.step(trainSet, 16);
net.predict([x, y]);
net.evaluate(valSet);
net.field(-1.3,-1.3, 1.3,1.3, 80,80);
net.layers[1].a;
net.activationLevels();
net.reset();
net.diverged;
```

样本格式 `{ x:[…], t:0|1 }`，`x` 长度等于 `sizes[0]`。`diverged` 只判数值崩了（NaN/Inf 或 |w| 超 `cfg.wmax` 默认 1e4）。“学习率太大没学会”是另一回事，要看 `evaluate().acc`。实测 `[2,10,10,1]`、200 个点、每帧 12 个 mini-batch、80×80 决策边界每 8 帧重算：每帧 0.66ms，热力场一次 4.4ms，准确率 0.995。这个量级不需要 tf.js。

#### tf.min.js —— 适用边界（先读这段再决定用不用）

两三层的小网络在页面上实时训练，不要用它。实测 2→10→10→1、200 个点、每帧 12 个 mini-batch：tf.min.js 每帧 102.7ms，热力场一次 124ms；手写四十行每帧 0.79ms，热力场 4.4ms。两边收敛结果一样。小规模浮点量微不足道，时间全花在 kernel launch 和 `dataSync()` 回读上。这种场合手写就好（前向传播十几行、反向传播十几行、mini-batch 十行，用 `Float64Array`，每层激活留在 `layer.a` 里给可视化读）。该用它的场合：加载别人训练好的模型、在真图片上跑卷积网络、矩阵大到 GPU 才算得动。用它记住一个坑：每一步都要 `tf.tidy(() => …)` 或手动 `dispose()`，否则张量只增不减，页面越跑越慢，且不报错——用 `tf.memory().numTensors` 看这个数会不会一直涨。

#### 一条自检盲区的处理

KaTeX 每个公式会渲染两份：可视的 `.katex-html`，加一份给读屏器的 `.katex-mathml`（用 1×1 裁剪隐藏）。那份隐藏副本会让自检每个公式报一次“被裁”和数处“文字叠压”——全是假的。`selfcheck.py` 已经排除 `.katex-mathml`，所以报告是干净的。同理零宽字符也已排除。

## 底盘机制（CHASSIS.md —— 原样转达）

`base.css` 和 `base.js` 的全部对外接口都在这里。要用底盘，读这一页就够了，不需要打开那两个源文件（合起来 400 行）。只有在你打算改写或替换底盘时才去读源码。底盘里只有和主题无关的机制：固定画布的整体缩放、canvas 在高分屏和缩放下的适配、指针坐标换算、几个不写就一定出 bug 的布局细节、可访问性地板。没有任何配色、字体、字号、间距或组件外观——那些是每次生成自己的设计。

### base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在你自己的样式之前。

必须由你给出的三个 token（底盘不给默认值，缺了页面会明显不对）：

```css
:root{
  --bg:        #0b0e14;      /* 页面底色 */
  --text:      #e6e6e6;      /* 默认文字色 */
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

底盘另外会读 `--stage-w` / `--stage-h`（画布逻辑尺寸，默认 1600 / 900）和 `--focus`（焦点圈颜色）。缩放比由底盘算出后写回 `:root` 的 `--s`，CSS 里可以直接用。

结构：页面里要有 `#stage`，它就是那块 1600×900 的逻辑画布；引入 base.css + base.js 之后缩放自动生效，不需要写任何缩放代码。

四个工具类（base.css 提供的全部类）：

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | 任何 grid/flex 分栏的子项。子项默认不许缩到比内容小，一段长文本或一个宽 canvas 会把整列顶开、被裁掉，表现为“右边内容莫名其妙没了” |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 `<canvas>`。canvas 是替换元素，有 300×150 的默认尺寸，只写 `inset:0` 拉不开它 |
| `.no-pan` | 关掉触摸平移 | 需要拖动的交互区 |
| `.sr-only` | 只给读屏软件 | 图形的文字替代 |

### base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。页面里只要有 `#stage`，引入即开始工作（缩放监听在文件末尾自动装好）。

尺寸与缩放：

```
Deck.W / Deck.H          逻辑画布尺寸（读自 --stage-w / --stage-h）
Deck.s                   当前缩放比（同 :root 上的 --s）
Deck.onResize(fn)        注册尺寸变化回调，返回注销函数
Deck.init(cfg)           可选，只做键盘翻页和 document.title，不生成任何外观
```

```js
Deck.init({ index:3, total:14 });                 // 通常只需要这一行
Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页
Deck.init({ index:3, total:14, href:n => 'p'+n+'.html' });
```

canvas 与指针：

```
Deck.fit(cv)             高分屏适配，返回已 setTransform 的 2d ctx
Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}（缩放/触摸/触摸结束都兼容）
```

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。它靠 `r.width / el.offsetWidth` 反推，嵌套缩放也对，但元素被 rotate 之后不适用。

从 CSS 读颜色（canvas 里写不了 `var()`）：

```
Deck.token(name)         读成原始字符串
Deck.rgb(name)           读成 [r,g,b]
Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'
```

动画：

```
Deck.reduced()           系统是否要求减少动态
Deck.loop(fn[,opt])      rAF 循环，返回 stop()
```

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧 `fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；标签页隐藏时自动暂停，回来不会有 dt 跳变。

小工具：

```
Deck.clamp / Deck.lerp / Deck.fmt
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径（有原生 roundRect 就用原生）
Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段
```

底盘不做的事：顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、版式模板——一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

## 本轮追加：theme.css 提供的 token 与 class

theme.css 提供的是版心和骨架组件，以及页眉页脚的外观。

```
token   --fs-h1 34      页标题
token   --fs-h2 22      区块小标题
token   --fs-lead 19    导语 / 强调正文
token   --fs-body 18    正文（默认）；成句文字只许用 body / lead / sec
token   --fs-sec 16     次级说明、表格正文、图注正文
token   --fs-label 15   控件标签、图例、操作提示
token   --fs-tick 13    纯数字刻度，只有数字和单位时才可以用

版心     内容区 1408×620，页眉 96 / 页脚 88 —— 照这个排，不要自己量

骨架     .k-process        把「先后 / 因果」显式化：横向分段 + 段间箭头，
                          当前段高亮，已过的段降饱和
骨架     .k-comparison     把「同一维度上的差异」显式化：对齐的行列 +
                          共同基准轴，差异列加底色
骨架     .k-classification 把「归属」显式化：嵌套包含框，层级靠缩进和边框粗细
骨架     .k-generalization 把「主张—支撑」显式化：主干居中，分支向外，
                          支撑在视觉上从属于主张
骨架     .k-enumeration    把「同级并列」显式化：统一的项模板，不暗示顺序

组件     .panel            读数面板    .ctl 控件行    .note 图注
```

### 页眉页脚已经由 Lec.mount() 生成，页面不要自己再造一套

`Lec.mount()` 会往 `<body>` 里插入下面这些元素（共 9 个类名）：

```
.lec-header
.lec-footer
.lec-header-inner
.lec-kicker
.lec-title
.lec-sub
.lec-footer-inner
.lec-foot
.lec-progress
```

以 id 定位、重复调用时复用：`#main`。这些类名是唯一真相，别改名、别另起一套。mount 只生成结构，不带任何外观。

页面只往 `#stage` 里加内容，页眉页脚由 `mount()` 负责、`theme.css` 负责它们的外观和占位高度。页面不许重复生成、不许改它们的类名，也不要为了“排得好看”去覆盖它们的样式。页面自己的内容区是 `#stage` 减掉这两条带之后剩下的部分——具体取值看 `theme.css` 里那两个类的高度。

## 页面骨架

harness 已经把每页的骨架建好了，长这样，只往 `#stage` 里加内容，别动别的：

```html
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
```

## 硬约束

- 每个 HTML 自包含：直接在浏览器打开就能显示和交互，资源一律相对路径，不用 CDN。
- 不许删底盘或主题提供的类。具体说：不许 `classList.remove(...)` 掉 `lec-root` / `lec-page` / `min0` / `cv-fill` 这类由 `base.css` 或 `theme.css` 提供的类，也不许覆盖它们的定位属性。那些类承载的是“内容避开页眉页脚带”这件事，删掉之后标题会顶穿画布上边界、读数面板会被主画布压住——实测有一轮 17/48 页这么干了，而闸看不见。
- 不许在这块缩放画布里用 `position: fixed`。画布整体走 `transform: scale()`，`fixed` 的参照系是视口而不是舞台，它会脱离缩放、压在别的东西上面。要固定就用 `position: absolute` 相对内容容器。
- 默认用 flex 而不是 grid。一维流式排布天然不重叠，二维放置放错格子就叠。真正需要二维对齐（矩阵、维度表）时再用 grid。
- 需要靠算坐标才能对齐的地方，改结构，不要算坐标。拖拽用 `transform` 偏移、让元素留在正常流里，不要改 `left/top`；刻度和滑块对不齐时把它们拆成上下两个区块，而不是用绝对定位去凑。
- 库的版本按上文版本表来，不要去库文件里查版本——压缩构建里查不到。

## 技法文档

清单里已经有对应技法文档的，先用 `Skill` 读它，再动手，不要自己从头摸索或另发明一套。理由和库一样：每一页都自己重新试一遍，产出不稳定、也慢。清单里没有对应的，就自己写，不必硬凑。这台机器上已装好 `node`、`python3` 带 numpy、`playwright` + `chromium`，不需要检查装没装。

## 完工前自检

在 `pages/` 目录下运行：

```
python3 assets/selfcheck.py page-NN.html
```

它按 1600×900 真渲染一遍，报 JS 报错、加载失败的资源、超出画布的元素、被裁掉的元素、字号最小值与中位数，以及密度（画面占用比、容器数、文本块数、文字叠压、占比不足 1% 的小容器）。想看触发交互之后的样子，用 `--after "<一段 JS>"`（可给多次，每次多存一张截图）。只报告，不改文件。

判据：
- 没有 JS 报错、没有加载失败的资源。
- 没有元素超出画布、没有被裁掉。
- 字号最小值和中位数符合本契约的字号下限。
- 密度指标：文本块数 ≤ 80，画面占用比合理（无大面积空白或明显拥挤），文字叠压为 0。
- 超了预算就按“版面预算”处理：删减或拆页，不是缩字号。

**改到干净为止**。

## 交付

只交这一个文件：你的 `page-NN.html`。不写文档、不写测试、不写总结。提交前删掉调试代码和 console 输出。页面要能从 `file://` 直接打开正常工作。