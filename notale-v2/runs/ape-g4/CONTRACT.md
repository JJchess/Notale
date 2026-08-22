# CONTRACT.md —— 全套 50 页共用的页面构建契约

## 1. 任务边界

每个 agent 只负责一个页面文件：`pages/page-NN.html`。

硬约束：

- 只创建或修改自己负责的 `page-NN.html`。
- 不读取、不搜索、不复制、不比较任何其他 `page-*.html`。
- 不修改 `PLAN.md`、`assets/theme.css`、`assets/lec.js`、底盘、库或其他共享文件。
- 不创建页面专属 CSS、JS、图片、数据、测试、说明或临时文件。
- 页面所需 CSS 和 JS 写在自己的 HTML 内。
- 只依据本契约、`PLAN.md`、`assets/theme.css`、`assets/lec.js` 的公开接口和获准使用的技法文档构建。
- `PLAN.md` 决定本页讲什么、承担哪一步叙事任务；不得擅自换题、跨页补课或重复其他页内容。
- 每个 HTML 必须自包含，使用相对路径，直接以 `file://` 打开即可显示和交互；禁止 CDN 和外部网络请求。
- 发现需求在本页预算内无法完成时，明确报告“本页超出契约预算，需要拆页或删减”，不得用缩字号、堆叠、裁切或隐藏内容强塞。

## 2. 固定受众与教学场合

全套页面面向大学一年级通识课学生，文理专业混合，不假定学生具备微积分、生物学或相关专业基础。

每页必须同时适合：

1. 课堂授课：教师能在约一至两分钟内指出页面主线并带着学生操作。
2. 课后重看：没有教师口头补充时，学生仍能根据页面上的简短说明理解操作、现象和结论。

语言规则：

- 使用清楚、直接、克制的现代汉语。
- 一句话只承担一个主要意思，正文单句原则上不超过 35 个汉字。
- 首次出现的必要术语，立即用一句日常语言解释；不要用另一个未解释术语定义它。
- 能用常见词说明时，不用学科黑话。
- 不假定学生知道导数、积分、极限、向量、细胞机制等概念；若本页必须使用，先给直观含义，再给符号或名称。
- 公式必须配一条自然语言解释，说明符号代表什么以及读者应观察什么。
- 不堆定义，不把教材段落搬上屏幕，不写论文式背景综述。
- 提示语使用可执行的口气，如“拖动滑块，观察曲线何时变平”，不用“请自行探索”“显然”“容易看出”。
- 反馈语说明发生了什么以及为什么，不用“正确/错误”作为唯一反馈。
- 不用幼儿化语气，不使用网络梗，不以专业优越感制造压力。
- 页面必须有一个可复述的核心结论；由 `Lec.mount()` 的 `take` 提供，正文不得再重复一遍。

## 3. 唯一允许的 HTML 骨架

以下骨架必须照抄。只替换 `NN`、标题字段和 `#stage` 内正文；`TT` 固定为 `50`。按需增加的库只能放在 `assets/lec.js` 之后、本页脚本之前。

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
  <style>
    /* 只写本页结构；颜色、字体、字号、间距必须使用 theme.css token/class。 */
  </style>
</head>
<body data-page="NN" data-total="50">
  <div id="stage"></div>

  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>

  <!-- 仅在确有需要时，按本契约规定顺序引用 assets/lib/ 中的库。 -->

  <script>
    Lec.mount({
      index: NN,
      kicker: "按 PLAN.md 填写",
      title: "按 PLAN.md 填写",
      take: "按 PLAN.md 填写"
    });

    Deck.init({ index: NN, total: 50 });

    var stage = document.getElementById("stage");
    /* 只向 #stage 添加本页内容并初始化本页交互。 */
  </script>
</body>
</html>
```

不得改变：

- `<!doctype html>`、`lang="zh"`、`meta charset`。
- `base.css` 在前、`theme.css` 在后的顺序。
- `#stage` 的 id。
- `base.js` 在前、`lec.js` 在后的顺序。
- `body[data-page]` 与 `body[data-total="50"]`。
- `Lec.mount()` 和 `Deck.init()` 的页码必须与文件名一致。
- 页面只往 `#stage` 里加内容。

`Lec.mount()` 负责生成页眉、页脚和主内容结构：

- `.lec-header`
- `.lec-footer`
- `.lec-main`
- `#main`

这些类名和 id 是唯一真相。页面不得重复生成、改名、删除或替换这些结构，也不得覆盖它们的定位、尺寸和占位样式。页眉页脚外观及占位高度由 `theme.css` 负责。页面内容区是 `#stage` 减去页眉和页脚带后的区域，按主题规定的 1408×620 内容版心排布，不得自行重算另一套版心。

## 4. 版面预算

逻辑画布固定为 1600×900。

主题规定：

- 内容区：1408×620。
- 页眉：96。
- 页脚：88。

每页硬上限：

| 项目 | 上限 |
|---|---:|
| 正文汉字数 | 240 字 |
| 成句正文 | 8 句 |
| 交互控件 | 4 个 |
| 同时显示的主要读数 | 6 个 |
| 图例项 | 6 个 |
| 页面上可见文本元素总数 | 70 个 |
| 主要内容容器 | 8 个 |

计数规则：

- 正文字数包括标题之外的说明、注释、问题、结论、按钮长文案和反馈句；数字、拉丁字母、标点不抵消预算。
- 一个按钮、标签、刻度、图例项、读数、表头、表格单元文字、图注、轴名、tooltip 可见文本均算一个文本元素。
- Canvas、SVG、Konva、Three 或其他绘图层中的文字同样计数，不能因为自检工具看不见就不计。
- 动态状态按文本元素最多的状态计数。
- 控件包括按钮、滑块、选择框、开关、可拖拽物、输入框；同一组单选项按每个可操作项分别计数。
- 装饰图形不计作控件；一旦可点击、可拖动、可聚焦或会改变状态，就计作控件。
- 隐藏起来等待交互显示的教学正文仍计入预算。

超过任一上限时：

1. 删除重复标签、冗余图例和非必要刻度。
2. 合并读数或让图表库自动抽稀刻度。
3. 减少并行控件和同时出现的状态。
4. 仍超限则报告需要拆页或删减。

禁止通过缩字号、减小行高、负间距、内容裁切、滚动小窗、hover 隐藏主要说明或把文字画进 canvas 来规避预算。

## 5. 字号与可读性地板

所有实际渲染文字必须满足：

- 纯数字或“数字＋短单位”的刻度：≥12px。
- 控件标签、图例、轴名、图注、短标注、操作提示：≥14px。
- 正文、成句说明、按钮文字、tooltip、反馈语：≥16px。
- 正文行高：≥1.35。
- KaTeX 基准字号：统一使用 ≥20px。
- 带词句的刻度不是刻度档，按标签档 ≥14px。
- Canvas、SVG、WebGL 贴图和库内部文字也受同一地板约束。

主题已提供：

- `--fs-body: 18`
- `--fs-label: 15`
- `--fs-tick: 13`

成句文字只使用主题的 body、lead、sec 档，不得自行发明更小的正文档。

1366×768 屏幕相对 1600×900 逻辑画布的宽度比例为 `1366 / 1600 ≈ 0.854`，高度比例为 `768 / 900 ≈ 0.853`，因此实际整体缩放系数约为 0.85。字号地板是逻辑画布内的 CSS 字号下限；在常见 1366 屏上还会整体缩小约 15%，所以不得把地板当作推荐字号，更不得低于地板。

## 6. 主题与结构

所有颜色、字体、字号、圆角、阴影、描边、间距和组件外观必须从 `assets/theme.css` 的 token 或 class 获取。禁止自创第二套视觉系统，禁止硬编码颜色值、字体族、任意字号或与主题冲突的间距尺度。

底盘只提供机制，不提供视觉设计。不得把底盘工具类当作主题组件。

根据内容关系选择主题骨架：

- `.k-process`：先后、因果或阶段过程。
  - `.axis` 为主轴。
  - `.step` 为阶段。
  - `.arw` 表示方向。
- `.k-comparison`：同一维度上的差异。
  - `.dim` 为维度名。
  - `.hdr` 为对象列。
  - `.rowline` 为通栏分隔。
  - `.diff` 标出差异。
- `.k-classification`：归属和包含关系。
  - `.lv` 连接下位项。
  - `.box > .bt` 标识上位类别。
- `.k-generalization`：主张与支撑。
  - `.claim` 为主张。
  - `.supports > .support` 挂接到 `.trunk`。
- `.k-enumeration`：真正同级、无顺序的并列项。
  - `.it` 使用统一项模板。
  - 不用箭头，不暗示顺序。
  - 不得把它当默认骨架。

可用主题组件：

- `.panel`
- `.ctl`
- `.note`

默认使用 flex。只有矩阵、维度表等确实需要二维对齐时才使用 grid。任何 grid/flex 分栏子项都必须加 `.min0`。

需要靠计算坐标才能对齐的地方，应改结构，不要算坐标：

- 拖拽用 `transform` 偏移，让元素保留在正常结构中，不持续修改 `left/top`。
- 刻度和滑块不对齐时拆成上下区块，不用绝对定位凑点。
- 缩放画布内禁止 `position: fixed`；需要固定在内容区时使用相对容器内的 `position: absolute`。

不得删除底盘或主题提供的类，不得执行：

```js
element.classList.remove("lec-root");
element.classList.remove("lec-page");
element.classList.remove("min0");
element.classList.remove("cv-fill");
```

也不得覆盖这些类承担的定位属性。

## 7. 底盘接口：必须直接使用，不得重写

### base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在自己的样式之前。

底盘读取：

```css
:root{
  --bg:        #0b0e14;
  --text:      #e6e6e6;
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

本轮这些视觉 token 必须由 `theme.css` 提供，页面不得自行重定义。

底盘还读取：

- `--stage-w`
- `--stage-h`
- `--focus`

缩放比由底盘写回 `:root` 的 `--s`。

页面必须有 `#stage`。引入 `base.css` 与 `base.js` 后，1600×900 逻辑画布自动缩放，页面不得再写缩放代码。

底盘工具类：

| 类 | 作用 | 使用要求 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | 任何 grid/flex 分栏子项必须加 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 canvas 必须加 |
| `.no-pan` | 关闭触摸平移 | 需要拖动的交互区必须加 |
| `.sr-only` | 仅供读屏软件 | 无 DOM 文字的图形必须提供文字替代 |

### base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象为 `Deck`。

尺寸与缩放：

```js
Deck.W
Deck.H
Deck.s
Deck.onResize(fn)
Deck.init(cfg)
```

初始化：

```js
Deck.init({ index: NN, total: 50 });
```

Canvas 与指针：

```js
Deck.fit(cv)
Deck.autofit(cv, draw)
Deck.pt(el, e)
```

硬约束：

- canvas 一律使用 `Deck.fit` 或 `Deck.autofit`。
- 指针坐标一律使用 `Deck.pt`。
- 禁止自己通过 `devicePixelRatio` 调整 canvas。
- 禁止自己用 `getBoundingClientRect()`、`offsetX`、`clientX` 等拼装舞台坐标换算。
- `Deck.pt` 支持外层及嵌套缩放，但元素旋转后不适用；交互命中层不得旋转。

Canvas 取主题颜色：

```js
Deck.token(name)
Deck.rgb(name)
Deck.rgba(name, a)
```

硬约束：

- canvas 取色一律使用 `Deck.rgb` 或 `Deck.rgba`。
- 需要原始 token 时使用 `Deck.token`。
- 禁止在绘图脚本中硬编码颜色。
- canvas 不能直接使用 CSS `var()`。

动画：

```js
Deck.reduced()
Deck.loop(fn[, opt])
```

硬约束：

- 动画一律使用 `Deck.loop`。
- 禁止直接编写 `requestAnimationFrame` 循环。
- `Deck.loop` 在 reduced-motion 下只绘制一帧 `fn(opt.still || 0, 0)`。
- 起始帧没有信息的动画必须设置有教学意义的 `opt.still`。
- 页面隐藏和恢复由 `Deck.loop` 处理，不得另写一套暂停机制。
- 非循环库动画也必须提供 reduced-motion 分支；减少动态时立即显示稳定终态或有意义的静态状态。

小工具：

```js
Deck.clamp
Deck.lerp
Deck.fmt
Deck.rr(ctx,x,y,w,h,r)
Deck.arrow(ctx,x1,y1,x2,y2,size)
```

已有工具能完成时直接使用，不得重写同名机制。

## 8. 数字与计算

页面中的教学数字一律从 `Lec` 获取或由 `Lec.P` 计算，页面不得写死计算结果。

允许在页面中写：

- `Lec.P` 函数的输入参数。
- `PLAN.md` 明确指定的情境常量、初始条件和类别编号。
- 控件的范围端点与步长。
- 几何绘制所需的非教学性坐标。

不得直接写：

- 由输入可推导出的结果。
- 百分比、速度、时间、质量、能量、比值等展示值。
- 与交互状态相关的预制答案。
- 用假数据或预录动画冒充计算结果。

计算结果必须通过已公开的 `Lec.P` 接口取得；格式化使用 `Lec.P.formatNumber`、`Lec.P.roundTo`、`Lec.P.formatDuration` 或适合的公开接口。不得读取 `lec.js` 源码寻找私有实现。

交互改变输入后，相关数值、图形和解释必须从同一状态重新计算，不能只改显示文字。

随机生成样本、点、抽样或初始状态时必须引用：

```html
<script src="assets/lib/seedrandom.min.js"></script>
```

并使用固定种子：

```js
var rng = new Math.seedrandom("page-NN");
```

同一页面每次打开必须得到同一序列。

## 9. 库的强制使用规则

凡是 `assets/lib/` 中已有库能完成的呈现工作，不允许从底层重写。

动手前必须按任务对照：

| 呈现任务 | 必须使用 |
|---|---|
| 下落、碰撞、摆动、堆叠、拖拽约束 | Matter.js |
| 三维场景、可旋转立体、光照材质 | Three.js |
| 三维地球、球面点、弧线、区块 | Three.js 后加载 globe.gl |
| 生成式动画背景 | Three.js 后加载 Vanta NET |
| 坐标轴、刻度、图例、折线、柱、散点、面积、饼、热力 | ECharts |
| 可拖拽、可命中检测的二维场景 | Konva |
| 节点连线、数据绑定、精确矢量图形 | D3 |
| 成千上万元素同时运动 | PixiJS |
| 分步动画、依次出现、路径描绘、形变 | anime.js |
| 多动画时间线编排 | GSAP |
| 动画进度绑定滚动 | GSAP 后加载 ScrollTrigger |
| 播放矢量动画文件 | lottie-web |
| 伪三维插画 | Zdog |
| 元素随指针倾斜 | VanillaTilt |
| 进入视野淡入 | AOS |
| 数学公式 | KaTeX |
| 矩阵乘法、行列式、求逆、特征分解 | ml-matrix |
| 可复现随机 | seedrandom |
| 页面实时训练小型二分类网络 | `mlp.js` |
| 预训练模型、真实图片卷积、GPU 大矩阵 | TensorFlow.js |

库引用放在 `base.js`、`lec.js` 之后，本页初始化脚本之前。依赖库必须先加载。

引用方式：

```html
<script src="assets/lib/matter.min.js"></script>
<script src="assets/lib/three.min.js"></script>
<script src="assets/lib/globe.gl.min.js"></script>
<script src="assets/lib/vanta.net.min.js"></script>
<script src="assets/lib/echarts.min.js"></script>
<script src="assets/lib/konva.min.js"></script>
<script src="assets/lib/d3.min.js"></script>
<script src="assets/lib/pixi.min.js"></script>
<script src="assets/lib/anime.min.js"></script>
<script src="assets/lib/gsap.min.js"></script>
<script src="assets/lib/ScrollTrigger.min.js"></script>
<script src="assets/lib/lottie.min.js"></script>
<script src="assets/lib/zdog.min.js"></script>
<script src="assets/lib/vanilla-tilt.min.js"></script>
<script src="assets/lib/aos.js"></script>
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
<script src="assets/lib/ml-matrix.umd.js"></script>
<script src="assets/lib/seedrandom.min.js"></script>
<script src="assets/lib/mlp.js"></script>
<script src="assets/lib/tf.min.js"></script>
```

版本按以下 API 编写，不读取压缩库文件查版本：

| 库 | 版本 |
|---|---|
| Three.js | r160 / 0.160.1 |
| Matter.js | 0.20.0 |
| D3 | 7.9.0 |
| PixiJS | 7.4.2 |
| anime.js | 3.2.2 |
| GSAP / ScrollTrigger | 3.12.5 |
| globe.gl | 2.32.0 |
| Vanta | 0.5.24 |
| lottie-web | 5.12.2 |
| Zdog | 1.1.3 |
| VanillaTilt | 1.8.1 |
| AOS | 2.3.4 |
| ECharts | 6.1.0 |
| Konva | 10.3.1 |
| KaTeX | 0.18.4 |
| ml-matrix | 6.15.0 |
| seedrandom | 3.0.5 |
| TensorFlow.js | 4.22.0 |

需要其他库时，只有现有库确实无法完成任务才允许增加；必须放在 `pages/` 下本地引用，禁止 CDN。但本任务的最终交付仍只能包含一个 HTML，因此无法随 HTML 一并交付的新库不得采用。

### ECharts

必须使用 SVG renderer：

```js
var chart = echarts.init(el, null, { renderer: "svg" });
```

至少显式设置：

```js
chart.setOption({
  textStyle: { fontSize: 16 },
  xAxis: { axisLabel: { fontSize: 14 } },
  yAxis: {
    nameTextStyle: { fontSize: 14 },
    axisLabel: { fontSize: 14 }
  },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { textStyle: { fontSize: 16 } }
});
```

只有纯数字或“数字＋短单位”刻度可使用 12px；带词句刻度必须 ≥14px。禁止使用默认 canvas renderer。

### Konva

Konva 用于场景图形、拖拽和命中检测。它会自行处理缩放舞台中的指针换算，不得再包一层自制坐标换算。

场景文字优先使用绝对定位的 DOM 标签覆盖在图形上，不用 `Konva.Text`。只有必须跟随图形内部变换的短标注才可使用 `Konva.Text`，并显式设置符合地板的 `fontSize`。

### KaTeX

必须同时引用 CSS 和 JS：

```html
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
```

统一使用 ≥20px 基准字号，并使用：

```js
katex.render(expression, el, { throwOnError: false });
```

公式必须有自然语言解释和读屏文本。不得下载或替换官方字体资源。

### MLP、ml-matrix 与 TensorFlow.js

- 页面上实时训练两三层小型二分类网络，使用 `mlp.js`。
- 矩阵原语使用 `ml-matrix`。
- 不得拿 `ml-matrix` 重写 `mlp.js`。
- 预训练模型、真实图片卷积或必须依赖 GPU 的大矩阵才使用 TensorFlow.js。
- 使用 TensorFlow.js 时，每步必须放入 `tf.tidy(() => …)` 或手动 `dispose()`。
- 必须检查 `tf.memory().numTensors` 不随交互持续增长。
- `net.diverged` 只表示数值崩溃；是否学会必须检查 `net.evaluate(...).acc`，不能用 `diverged` 代替学习效果判断。

## 10. 技法文档

开始实现前，先检查当前任务是否在已提供的技法清单中。

- 清单有对应文档：必须先用 `Skill` 读取，再开始写页面。
- 清单没有对应文档：自行实现，不得硬套无关技法。
- 不得在已有技法覆盖的情况下从头另造一套。
- 技法文档不能覆盖本契约；冲突时以本契约为准。
- 不得通过读取其他页面学习技法。

## 11. Canvas、交互与动画

所有 canvas 必须：

- 使用 `.cv-fill` 铺满容器。
- 使用 `Deck.fit` 或 `Deck.autofit` 处理高分屏和舞台缩放。
- 使用 `Deck.rgb`、`Deck.rgba` 或 `Deck.token` 读取主题色。
- 提供 `.sr-only` 的文字替代，说明图中对象、状态和关键结论。
- 在尺寸变化后重绘，不保留错误的物理像素尺寸。

所有手写指针交互必须：

- 使用 Pointer Events。
- 交互区添加 `.no-pan`。
- 使用 `Deck.pt(el, event)` 转换坐标。
- 支持 `pointerdown`、`pointermove`、`pointerup`、`pointercancel`。
- 在拖动开始时使用 `setPointerCapture`，结束时释放或允许浏览器自动释放。
- 不用 `offsetX/offsetY`。
- 不自行读取 DPR 或自行换算舞台缩放。

所有动画必须：

- 使用 `Deck.loop`，或由规定的动画库执行。
- 检查 `Deck.reduced()`。
- reduced-motion 模式下显示有意义的静态终态，不闪烁、不自动循环、不丢失信息。
- 不让理解依赖“刚好看见某一帧”。
- 不以无限运动作为唯一反馈。
- 自动动画必须可暂停，或持续时间短且最终稳定。
- 页面离开或组件销毁时停止循环、时间线和监听器。

## 12. 键盘与可访问性

每个交互必须同时支持指针和键盘。

最低要求：

- 原生按钮使用 `<button type="button">`，不用可点击的 `<div>` 冒充按钮。
- 滑块优先使用 `<input type="range">`。
- 自定义可拖拽物必须可聚焦，并提供明确的 `role`、可读名称和当前值。
- 自定义拖动至少支持方向键微调；需要大步移动时支持 Shift＋方向键。
- Enter 或 Space 能触发与点击相同的主要动作。
- 焦点顺序与视觉阅读顺序一致。
- 不移除焦点圈；焦点样式使用主题的 `--focus`。
- 状态变化需要被读屏器感知时使用适当的 `aria-live`。
- 信息不能只靠颜色区分；同时使用文字、形状、位置或线型。
- Hover 信息必须也能通过 focus 或固定标签获得。
- Canvas、WebGL、Konva 场景必须有 DOM 文本替代。
- 装饰元素不得进入 Tab 顺序。
- 键盘翻页由 `Deck.init` 负责，不得重新绑定同一组全局翻页键。

## 13. 真交互标准

一个控件只有同时满足以下条件才算真交互：

1. 用户能主动改变输入、状态、视角、顺序或参数。
2. 页面根据该输入实时进行真实计算或状态更新。
3. 至少两个相互关联的输出随之变化，例如图形与读数、模型与解释。
4. 变化帮助学生检验一个问题、比较两个状态或发现一个规律。
5. 页面给出明确任务，学生知道该操作什么、观察什么。
6. 键盘可以完成等价操作。
7. 重置后能回到可预测的初始状态。

以下不算真交互：

- 纯自动播放。
- 背景粒子跟随指针。
- 卡片 hover、倾斜、发光、视差。
- 只切换装饰颜色。
- 点击后播放预录动画。
- 没有教学问题的旋转、拖动或缩放。
- 按钮只显示预先写死的答案。
- 控件改变了读数，但图形和解释没有同步。
- 图形运动了，但没有输入、反馈或可检验结论。

装饰可以存在，但不得占用主要控件预算，不得抢夺焦点，不得成为页面唯一动态，不得妨碍 reduced-motion。

## 14. 完工前自检

在 `pages/` 目录运行：

```bash
python3 assets/selfcheck.py page-NN.html
```

需要检查交互后状态时，使用一个或多个：

```bash
python3 assets/selfcheck.py page-NN.html --after "<一段 JS>"
```

至少检查：

1. 初始状态。
2. 每个控件的一个代表性中间状态。
3. 每个控件的边界状态。
4. 重置后的状态。
5. 会展开、切换或显示反馈的状态。
6. 动画的稳定状态或 reduced-motion 等价状态。

通过判据：

- 0 个 JavaScript 报错。
- 0 个资源加载失败。
- 0 个元素超出 1600×900 画布。
- 0 个元素被意外裁切。
- 0 处文字叠压。
- 0 个占比不足 1% 且无教学必要的小容器。
- 所有可见 DOM 字号符合地板。
- 页面文本元素总数 ≤70。
- 正文字数、成句数、控件数、读数数、图例项和容器数均不超预算。
- 画面占用比合理，不靠大片无意义装饰填充，也不因过密造成拥挤。
- 1366×768 对应约 0.85 缩放时仍可读、可点、可拖。
- ECharts 使用 SVG renderer。
- Canvas 使用 `Deck.fit` 或 `Deck.autofit`。
- 指针使用 `Deck.pt`。
- 动画使用 `Deck.loop` 或规定动画库，并有 reduced-motion 分支。
- 随机数据使用固定种子的 seedrandom。
- 所有教学数字来自 `Lec` 或由其输入实时计算。
- 所有交互可用键盘完成。
- Tab 顺序、焦点圈、ARIA 名称和读屏替代有效。
- 交互后的图形、读数和解释彼此一致。
- 不存在 `position: fixed`。
- 不存在被删除或定位被覆盖的底盘、主题类。
- 不存在已有库可完成却手写重做的呈现层。

Canvas、Konva 或其他非 DOM 文字即使不被 `selfcheck` 检出，也必须人工按同一字号地板、文本元素预算和叠压标准检查。

任何一项不通过，都必须修改页面并重新运行自检；重复执行，直到报告干净且所有人工判据通过为止。不得以“只是警告”“肉眼看起来可以”或“工具查不到”为理由交付。

## 15. 交付

最终只交付自己负责的 `page-NN.html`。

不得交付：

- 文档。
- 测试。
- 截图。
- 自检报告。
- 总结。
- 修改说明。
- 新资源文件。
- 其他页面。
- 对共享文件的改动。