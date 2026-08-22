# CONTRACT.md —— 18 页共用页面构建契约

## 1. 文件边界

- 你只负责一个文件：`pages/page-NN.html`。
- 只创建或修改自己负责的这一页。
- 绝不读取、搜索、比较、复制或修改任何其他 `page-*.html`。
- 允许读取且只应依赖：
  - `CONTRACT.md`
  - `PLAN.md`
  - `assets/theme.css`
  - `assets/lec.js`
  - 本契约指定的底盘、库和技法文档
- 不修改 `assets/` 下任何文件。
- 不创建页面专用 CSS、JS、图片、数据、测试或说明文件。
- 每个 HTML 必须自包含：直接用 `file://` 打开即可显示和交互；资源一律使用相对路径；禁止 CDN、网络请求和运行时下载。
- 若现有文件不足以完成计划，不得越界造新资源；明确报告阻塞，不得用假数据、预录动画或静态截图冒充。

## 2. 固定 HTML 骨架

照抄以下骨架。只替换 `NN`、页面标题信息和 `#stage` 内的页面正文；需要库时，只能在标明的位置加入本契约允许的本地引用。`TT` 固定为 `18`。

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <!-- 仅在需要 KaTeX 时加入 assets/lib/katex.min.css -->
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body data-page="NN" data-total="18">
  <div id="stage">
    <!-- 本页正文只放在这里 -->
  </div>

  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>

  <!-- 本页需要的预置库放在这里；依赖库必须先于依赖它的库 -->
  <!-- 本页初始化脚本最后执行 -->
  <script>
    Deck.init({ index: NN, total: 18 });

    Lec.mount({
      index: NN,
      kicker: '本页眉题',
      title: '本页标题',
      take: '本页带走的一句话'
    });

    // 本页初始化代码
  </script>
</body>
</html>
```

硬性要求：

- 不改 `doctype`、`lang`、`meta`、`#stage`、既有样式表和脚本的路径或顺序。
- 页面只往 `#stage` 里加内容。
- 页眉、页脚只由 `Lec.mount()` 生成。
- 不手写页眉、页脚、页码、进度条或其替代品。
- 不改 `.lec-header`、`.lec-footer` 的类名，不覆盖它们的样式。
- `theme.css` 负责页眉页脚外观与占位高度。正文可用区域是 `#stage` 扣除这两条带后的区域；具体高度以 `theme.css` 为准。
- 页面主标题只能来自 `Lec.mount()` 的 `title`，正文中不得重复放一个同级标题。
- 页面脚本必须在依赖库加载后执行。
- 库只引实际使用的文件，不做“以防万一”的全量引用。

## 3. 画布与版面预算

逻辑画布固定为 `1600 × 900`。不得改画布尺寸，不得自行实现页面整体缩放。

每页必须同时满足以下硬上限：

| 项目 | 硬上限 |
|---|---:|
| 正文说明文字 | 240 个汉字 |
| 可操作控件 | 4 个 |
| 页面上可见文本元素总数 | 64 个 |
| 连续正文段落 | 4 段 |
| 单个正文段落 | 80 个汉字 |
| 单句 | 32 个汉字 |
| 同时并列的主要视觉区域 | 3 个 |

计数规则：

- 正文字数包括说明句、提示语、结论、列表正文和控件旁的解释；不包括页眉标题、纯数字刻度和无语义标点。
- 控件包括按钮、滑块、输入框、选择器、开关、可拖拽物和其他独立操作目标。多个只能一起完成一次操作的控件仍分别计数。
- 文本元素包括页眉页脚文字、标题、正文、列表项、按钮文字、控件标签、实时读数、图例、图注、坐标轴名称、刻度文字、公式旁标注，以及 canvas、SVG、Konva、Three 场景中肉眼可见的文字。
- 一个独立标签、刻度、图例项、读数或按钮文字计一个文本元素。
- canvas 或 WebGL 里的文字即使自检工具看不见，也必须人工计入。
- 隐藏但可被打开的状态文字，按其打开后的最大状态计数。
- 正文不得用逐字拆分、逐字符 `<span>` 等方式规避字数或文本元素预算。

超过任何上限时：

1. 先删去重复说明、冗余图例、次要刻度和重复读数。
2. 合并标签或让图表库抽稀刻度。
3. 仍然超限就报告“本页内容超出版面预算，需要拆页或修改 PLAN”。
4. 不得缩字号、压行高、挤间距、裁切、滚动隐藏或改小画布来塞入内容。

正常静态状态下，主要内容的画面占用比应在 `35%–85%` 之间。低于下限说明信息不足或布局失衡；高于上限说明过满。页面不得依赖纵向或横向滚动查看核心内容。

## 4. 字号与可读性地板

所有字号均指 1600×900 逻辑画布中的 CSS 计算字号：

| 文本类别 | 最小字号 |
|---|---:|
| 纯数字、短单位刻度 | 12px |
| 标签、图例、图注、带词句的刻度 | 14px |
| 正文、提示语、按钮、控件标签、tooltip | 16px |
| KaTeX 基准字号 | 20px |

另外：

- 正文行高必须 `≥1.35`。
- 多行按钮、提示和图注也必须保持 `line-height ≥1.35`。
- 不得使用缩放变换把合规字号视觉上缩小。
- 不得把正文画进 canvas 来逃避字号检查。
- 仅含数字或极短单位的刻度可以使用 12px；带有词语、类别名或解释的刻度必须至少 14px。
- KaTeX 统一以至少 20px 为基准。分式、上下标或嵌套公式不得另行缩小。
- 1366×768 屏幕上的舞台缩放系数约为  
  `min(1366/1600, 768/900) ≈ min(0.854, 0.853) ≈ 0.85`。  
  因此逻辑画布中的 16px 正文在该屏幕上视觉高度约为 13.6px。字号地板已经考虑了这次整体缩放，不得再以“会自动缩放”为理由降低字号。

## 5. 主题唯一性

- 颜色、字体、字号层级、圆角、阴影、边框、间距、面板、按钮和控件外观一律沿用 `assets/theme.css`。
- 先读取 `theme.css`，使用其中已有类和 CSS token。
- 不自创第二套配色、字体系统、间距系统或组件风格。
- 不在 HTML 中写死颜色值、字体族、阴影、圆角或装饰性尺寸。
- canvas 无法直接使用 CSS `var()` 时，只能通过 `Deck.rgb()` 或 `Deck.rgba()` 读取主题颜色。
- 页面特有 CSS 只允许处理本页必要的布局、定位和尺寸关系；所有视觉值必须取自 `theme.css` 已定义的 token。
- 不覆盖 `.lec-header`、`.lec-footer`、全局 `body`、`html` 或主题组件的外观规则。
- 不用内联 `style` 绕过主题。
- 焦点状态必须清晰可见，并使用主题提供的焦点色。

## 6. 数字与计算

- 所有教学内容中的数值、派生量、比例、单位换算、读数和格式化结果必须来自 `Lec`。
- 页面正文、HTML 标签、图表数据、tooltip、实时读数中不得写死教学数字。
- 页号、总页数、库配置、数组索引、画布尺寸和算法循环边界不属于教学数字，可以作为程序结构值出现。
- 计划中给出的原始量也必须通过适合的 `Lec.P` 接口计算或格式化后再展示。
- 不得把计算结果先算好后写成字符串。
- 交互改变输入后，显示结果必须重新计算，不能在几个预设答案之间切换。
- 数值格式统一使用 `Lec.P.significant()`、`Lec.P.padInteger()` 或 `Lec` 已提供的格式化能力。
- 比例、插值、对数位置、物理量和轨道量必须优先使用对应的 `Lec.P` 函数，不得重复写一套同义公式。

可用接口：

`Lec.P.ageFraction()`、`allometricScale()`、`angularSizeRadians()`、`circularOrbitVelocity()`、`density()`、`divide()`、`force()`、`gravitationalParameter()`、`gravityAtRadius()`、`inverseLerp()`、`lerp()`、`lightTravelTime()`、`log()`、`logPosition()`、`lorentzFactor()`、`luminosityFlux()`、`massEnergy()`、`orbitRadiusFromAltitude()`、`orbitalPeriod()`、`orbitalSpecificEnergy()`、`padInteger()`、`pageIndex()`、`range()`、`ratio()`、`rocketMassRatio()`、`scaleValue()`、`significant()`、`sphereVolume()`、`square()`、`travelTime()`、`weight()`

页眉页脚接口：

`Lec.mount({index, kicker, title, take})`

## 7. 受众与讲授语言

读者是大学一年级通识课学生，文理背景混合，不假定具备微积分或生物学基础。本页既要适合教师课堂带讲，也要让学生课后单独重看。

每页必须遵守：

- 只讲一个中心问题。
- `take` 必须是一句脱离教师口头补充也能看懂的结论。
- 首次出现的专业术语必须立刻用日常语言解释。
- 不使用“显然”“不难看出”“大家都知道”等预设知识或带评判意味的措辞。
- 不直接使用未解释的导数、积分、极限、基因表达、细胞器等术语。
- 必须使用公式时，先用一句话说明它回答什么问题，再解释每个符号代表什么。
- 单句不超过 32 个汉字；一句只表达一个主要关系。
- 提示语使用“试着拖动……，观察……”或“按……比较……”的中性口气。
- 不使用“点击这里”“随便试试”“你答错了”等含糊或责备式提示。
- 操作提示必须点名控件和预期观察对象。
- 不依赖教师口头补充才能知道如何开始、如何重置或当前结果代表什么。
- 不依赖 hover 才能获得核心结论；hover 只能补充次要信息。
- 图注要说明“看什么”，不要重复标题。
- 类比必须同时指出对应关系；可能误导时补一句边界。
- 信息深度以“理解关系与数量级”为目标，不要求学生掌握专业推导。
- 每页最多引入 3 个新术语。
- 缩写首次出现时必须写出中文全称或直接改用中文。
- 单位必须与数值相邻，不能只藏在图例或说明段落中。

## 8. 什么算真交互

真交互必须满足以下全部条件：

1. 学生能通过按钮、滑块、键盘、拖拽或选择器改变一个有教学意义的输入或状态。
2. 改变后，模型、数据、几何关系、计算结果或解释文本会真实更新。
3. 输出来自实时计算、库的真实模拟或数据变换。
4. 页面提供即时、可理解的视觉反馈。
5. 交互帮助回答本页中心问题，而不是只增加动效。
6. 初始状态、操作方法和结果含义不依赖教师口头说明。
7. 鼠标、触摸和键盘都能完成核心操作。

以下只算装饰，不算交互：

- hover 发光、卡片倾斜、按钮波纹。
- 自动播放但不能改变输入的动画。
- 点击后只播放预录动画。
- 只显示或隐藏早已写好的答案。
- 与知识内容无关的粒子、背景、彩带或过场。
- 拖动物体但不改变任何可解释的量。
- 切换标签页但内容没有计算或比较关系。

若 `PLAN.md` 要求交互，至少实现一个真交互。不得用多个装饰动作充数。

## 9. canvas、指针、动画与可访问性

硬性规定：

- canvas 一律使用 `Deck.fit()` 或 `Deck.autofit()`。
- 指针坐标一律使用 `Deck.pt()`。
- 动画一律使用 `Deck.loop()`。
- canvas 取色一律使用 `Deck.rgb()` 或 `Deck.rgba()`。
- 禁止自行读取 `devicePixelRatio` 并缩放 canvas。
- 禁止自行用 `getBoundingClientRect()`、`offsetX` 或 `offsetY` 换算指针。
- 禁止直接编写 `requestAnimationFrame()` 循环。
- 交互区若支持拖动，必须使用 `.no-pan`。
- 铺满容器的 canvas 必须使用 `.cv-fill`。
- grid/flex 分栏的每个子项必须使用 `.min0`。
- 图形信息必须提供 `.sr-only` 文字替代。
- 不能只靠颜色区分类别；同时使用形状、线型、位置或文字标签。
- 按钮必须使用原生 `<button>`。
- 滑块必须有可关联的 `<label>` 和当前值。
- 自定义可操作元素必须具有正确角色、可聚焦状态、键盘事件和可见焦点。
- 拖拽必须提供键盘等价操作；方向键应能细调，必要时提供明确的步长说明。
- Escape 应取消未完成的拖拽或临时状态；重置操作必须可键盘触发。
- 动画必须有 `Deck.reduced()` / `Deck.loop()` 的 reduced-motion 分支。
- reduced-motion 下必须直接显示有信息的稳定状态，不能停在空白起始帧。
- 自动动画不得成为理解结论的唯一方式。
- 持续动画应提供暂停方式，除非 `Deck.loop()` 的单次短过渡在数秒内结束。
- 页面失焦或标签页隐藏时不得继续自行积累时间状态。

## 10. 库：已有能力不得从底层重写

动手前先按“要做的事”检查 `assets/lib/LIBS.md`。凡已有库能完成的呈现工作，不允许自己从底层重写。

| 要做的事 | 必须使用 | 引用方式 |
|---|---|---|
| 下落、碰撞、摆动、堆叠、拖拽、约束 | Matter.js | `<script src="assets/lib/matter.min.js"></script>` |
| 三维场景、立体结构、光照材质 | Three.js | `<script src="assets/lib/three.min.js"></script>` |
| 三维地球、球面点线区块 | globe.gl | three 后引 `<script src="assets/lib/globe.gl.min.js"></script>` |
| 生成式动画背景 | Vanta NET | three 后引 `<script src="assets/lib/vanta.net.min.js"></script>` |
| 常规图表、坐标轴、刻度、图例 | ECharts | `<script src="assets/lib/echarts.min.js"></script>` |
| 可拖拽、可命中检测的二维场景 | Konva | `<script src="assets/lib/konva.min.js"></script>` |
| 节点连线、矢量图形、数据绑定 | d3 | `<script src="assets/lib/d3.min.js"></script>` |
| 成千上万元素同时运动 | PixiJS | `<script src="assets/lib/pixi.min.js"></script>` |
| 分步动画、依次出现、路径与形变 | anime.js | `<script src="assets/lib/anime.min.js"></script>` |
| 多动画时间线编排 | GSAP | `<script src="assets/lib/gsap.min.js"></script>` |
| 动画进度绑定滚动 | ScrollTrigger | gsap 后引 `<script src="assets/lib/ScrollTrigger.min.js"></script>` |
| 播放矢量动画文件 | lottie-web | `<script src="assets/lib/lottie.min.js"></script>` |
| 伪三维插画 | Zdog | `<script src="assets/lib/zdog.min.js"></script>` |
| 元素随指针倾斜 | VanillaTilt | `<script src="assets/lib/vanilla-tilt.min.js"></script>` |
| 进入视野淡入 | AOS | `<script src="assets/lib/aos.js"></script>` |
| 数学公式排版 | KaTeX | CSS 与 JS 都必须引入 |
| 矩阵运算 | ml-matrix | `<script src="assets/lib/ml-matrix.umd.js"></script>` |
| 可复现随机 | seedrandom | `<script src="assets/lib/seedrandom.min.js"></script>` |
| 页面实时训练小型二分类网络 | mlp.js | `<script src="assets/lib/mlp.js"></script>` |
| 预训练模型、真实图片卷积、大型 GPU 矩阵 | TensorFlow.js | `<script src="assets/lib/tf.min.js"></script>` |

加载规则：

- 所有库从 `assets/lib/` 本地引用。
- 不使用 CDN。
- 依赖项必须先加载：three 在 globe.gl、Vanta 之前；GSAP 在 ScrollTrigger 之前。
- KaTeX 必须同时引用：
  - `<link rel="stylesheet" href="assets/lib/katex.min.css">`
  - `<script src="assets/lib/katex.min.js"></script>`
- 库版本以 `assets/lib/LIBS.md` 为唯一依据。
- 不打开或搜索压缩库文件确认版本。
- 不需要检查库是否存在，不需要下载或复制。
- 页面只能引用完成本页所需的库。
- 呈现层必须使用对应库；交互背后的计算必须真实执行。

精确版本：

| 文件 | 版本 |
|---|---|
| `three.min.js` | three r160 / 0.160.1 |
| `matter.min.js` | Matter.js 0.20.0 |
| `d3.min.js` | d3 7.9.0 |
| `pixi.min.js` | PixiJS 7.4.2 |
| `anime.min.js` | anime.js 3.2.2 |
| `gsap.min.js` / `ScrollTrigger.min.js` | GSAP 3.12.5 |
| `globe.gl.min.js` | globe.gl 2.32.0 |
| `vanta.net.min.js` | Vanta 0.5.24 |
| `lottie.min.js` | lottie-web 5.12.2 |
| `zdog.min.js` | Zdog 1.1.3 |
| `vanilla-tilt.min.js` | vanilla-tilt 1.8.1 |
| `aos.js` | AOS 2.3.4 |
| `echarts.min.js` | ECharts 6.1.0 |
| `konva.min.js` | Konva 10.3.1 |
| `katex.min.js` | KaTeX 0.18.4 |
| `ml-matrix.umd.js` | ml-matrix 6.15.0 |
| `seedrandom.min.js` | seedrandom 3.0.5 |
| `mlp.js` | 自家维护，无版本号 |
| `tf.min.js` | TensorFlow.js 4.22.0 |

### ECharts

- 必须使用 SVG renderer：

```js
var chart = echarts.init(el, null, { renderer: 'svg' });
```

- 不得使用默认 canvas renderer。
- 必须显式设置字号地板：

```js
chart.setOption({
  textStyle: { fontSize: 16 },
  xAxis: { axisLabel: { fontSize: 14 } },
  yAxis: {
    name: '…',
    nameTextStyle: { fontSize: 14 },
    axisLabel: { fontSize: 14 }
  },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { textStyle: { fontSize: 16 } }
});
```

- 只有纯数字短刻度可以降到 12px。
- 图表容器尺寸变化时必须调用 `resize()`，并通过 `Deck.onResize()` 注册。
- 不手写坐标轴、刻度、图例、折线、柱状、散点、面积、饼图或热力图。

### Konva

- 可拖拽和命中检测的二维场景必须用 Konva。
- 不自行换算 Konva 指针坐标；`stage.getPointerPosition()` 已返回逻辑坐标。
- 图形使用 Konva，场景标签优先用 DOM 绝对定位叠加。
- 不使用默认 12px 的 `Konva.Text`。
- 只有必须随图形变换的短标注可以使用 `Konva.Text`，并显式设置合规字号。
- Konva 拖拽仍须提供键盘等价操作和 DOM 文字替代。

### KaTeX

- 基准字号必须至少 20px。
- 使用 `throwOnError:false`。
- 不自行用普通 HTML 字符拼装复杂公式。
- 公式中的每个变量必须在附近用普通语言解释。
- 公式不得成为唯一说明。

### 随机数据

- 所有随机数据必须使用 seedrandom。
- 种子固定为页面号，例如：

```js
var rng = new Math.seedrandom('page-NN');
```

- 禁止使用无种子的 `Math.random()`。
- 同一页面每次打开、重置和课堂演示必须得到相同初始数据。

### 小型神经网络与 TensorFlow.js

- 页面实时训练两三层小型二分类网络时使用 `mlp.js`。
- 不用 TensorFlow.js 重写该场景。
- `mlp.js` 不支持多分类、回归、卷积或 Adam。
- 数值崩溃检查使用 `net.diverged`；是否学会必须另看 `net.evaluate().acc`。
- 只有预训练模型、真实图片卷积或 GPU 才适合的大矩阵才使用 TensorFlow.js。
- 使用 TensorFlow.js 时，每一步必须放在 `tf.tidy()` 中或手动 `dispose()`。
- 必须检查 `tf.memory().numTensors` 不会随交互持续增长。

## 11. 技法文档

- 动手前先检查任务是否有对应技法文档。
- 清单中存在对应文档时，必须先用 `Skill` 读取，再实现。
- 不得跳过现有技法文档，自己从头试出另一套实现。
- 清单中没有对应文档时，才可自行实现。
- 技法文档与本契约冲突时，以本契约为准。
- 已安装的 `node`、`python3`、NumPy、Playwright 和 Chromium 直接使用，不做安装检测。

## 12. CHASSIS.md —— 底盘接口速查

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

## 13. 完工前自检

在 `pages/` 目录运行：

```bash
python3 assets/selfcheck.py page-NN.html
```

对每个真交互状态，使用 `--after` 触发并复查。例如：

```bash
python3 assets/selfcheck.py page-NN.html \
  --after "document.querySelector('button').click()"
```

需要多个状态时可重复提供 `--after`。至少检查：

- 初始状态。
- 每个控件的一个非默认状态。
- 极小输入和极大输入。
- 重置后的状态。
- 动画的稳定状态。
- 错误或边界状态。
- 键盘操作后的状态。
- reduced-motion 状态。

通过判据：

- 0 个 JavaScript 报错。
- 0 个资源加载失败。
- 0 个超出 1600×900 画布的元素。
- 0 个非故意裁切的元素。
- 0 个文字叠压。
- 0 个低于字号地板的可见文本。
- 0 个低于 1% 且无明确用途的小容器。
- 正文字数不超过 240 个汉字。
- 控件不超过 4 个。
- 文本元素总数不超过 64 个。
- 画面占用比在 35%–85%。
- 所有核心控件可用 Tab 到达。
- Enter、Space 或方向键可完成对应操作。
- 焦点清晰可见。
- 鼠标、触摸和键盘得到一致结果。
- canvas 在缩放和高分屏下清晰。
- 指针命中位置与视觉位置一致。
- reduced-motion 下信息完整且无持续运动。
- 随机数据重载后完全一致。
- 交互输出来自真实计算。
- ECharts 使用 SVG renderer。
- KaTeX 基准字号至少 20px。
- 页面无横向或纵向滚动才能看到的核心内容。
- 页眉页脚只出现一套。
- 页面视觉与 `theme.css` 一致。

任何一项不通过，都必须修改本页并重新运行自检。不得把警告留给下一位 agent，不得以“浏览器里看起来还行”为通过依据。改到报告干净且全部人工判据通过为止。

## 14. 交付

- 只交付 `pages/page-NN.html`。
- 不交付文档。
- 不交付测试。
- 不交付截图。
- 不交付资源文件。
- 不写实现说明。
- 不写自检总结。
- 不写改动摘要。
- 不修改任何其他文件。