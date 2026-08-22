# CONTRACT.md —— 50 页共用页面构建契约

适用对象：本套讲义全部 50 页。每一页由一个独立 agent 构建，agent 之间互相不可见。跨页统一的一切，都以本契约为唯一来源。

每个 agent 手头只有：本契约、`PLAN.md`、`assets/theme.css`、`assets/lec.js`、`assets/base.css`、`assets/base.js`、`assets/lib/` 下的预置库。合同里没有写到的“每页自己决定”的事项，以 `PLAN.md` 对应页的内容为准；`PLAN.md` 与本契约冲突时，以本契约为准。

---

## 1. 文件边界

- 你只碰一个文件：自己那一页的 HTML（`page-NN.html`，NN 为页号）。
- 绝不读取或修改任何其他 `page-*.html`。
- 不修改 `assets/` 下任何文件，不新增共享文件。
- 不修改 `PLAN.md`。
- 页面自包含：直接在浏览器打开即可显示和交互；所有资源用相对路径，不用 CDN，不依赖静态服务器。

## 2. 页面骨架

页面骨架已经由 harness 建好，长这样：

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

在 `#stage` 内，页面自己放入内容容器：

```html
<div id="stage">
  <div id="main">
    <!-- 页面内容 -->
  </div>
</div>
```

- 只改 `NN`、`TT`、标题、正文和页面脚本。
- `#stage` 是 1600×900 的逻辑画布，缩放由 `base.css` + `base.js` 自动处理，页面不写任何缩放代码。
- 页眉、页脚、导航、进度条由 `Lec.mount()` 生成，页面不重复生成、不改类名、不覆盖样式。
- 页面内容统一放进 `#main`。`#main` 的尺寸与位置由 `theme.css` 决定，可用版心是 1408×620；按这个尺寸排版，不要自己量、不要覆盖。
- 页面脚本写在 `<script src="assets/lec.js"></script>` 之后；脚本开头调用一次：

```js
Lec.mount({ index: NN, kicker: "…", title: "…", take: "…" });
```

## 3. 受众与场合

读者是大学一年级通识课学生，文理兼有，不假定具备微积分或生物学基础。使用场合是课堂授课，教师带着讲；学生课后可以自己重看。

由此产生硬约束：

- 语言用平实中文，不用术语堆叠。任何专业术语第一次出现时必须用一句不含其他术语的话解释。
- 不写需要微积分、线性代数或生物化学背景才能看懂的句子。允许用加减乘除、比例、直观类比。
- 单个说明句不超过 30 个汉字；超过就拆成两句。第一句说是什么，第二句说为什么。
- 提示语用带引导性的口气，像助教在旁边提一句；不用命令式，不用网络梗，不用夸张感叹号。
- 页面结构必须允许教师按顺序讲，也允许学生课后脱离讲解独立重看：关键信息不能只存在于教师口头补充里。
- 讲解中写出的每个数字，读者都能用页面上的交互去验证；随机生成的数据用 `seedrandom` 固定种子，保证每次打开一致。

## 4. 版面预算

预算用可数的指标，不用形容词。以下上限是硬性的：

| 指标 | 上限 |
|---|---|
| 正文总字数（成句正文的中文字符数，不含标点，不含标签/图注/刻度/按钮文字） | ≤ 900 字 |
| 成句正文句子数 | ≤ 12 句 |
| 交互控件数（button、滑块、输入框、下拉、单选组、拖拽手柄、播放/暂停等） | ≤ 6 个 |
| 页面文本元素总数（selfcheck 的“文本块数”） | ≤ 80 个 |
| 文字叠压 | 0 处 |
| 元素被裁、超出画布 | 0 处 |

参考：实测一页文本元素中位数约 45 个；超过 80 个必然显得满。文本元素里通常只有约 18% 是句子，82% 是标签和刻度，因此“少写几句话”解决不了太满；要删的是冗余标签、合并读数、把刻度交给库去抽稀。

超了怎么办：**拆页，不是缩字号。** 不许用缩小字号、压行高、负 margin、绝对定位重叠等手段把内容硬塞进一页。内容确属一页放不下的，按 `PLAN.md` 的内容结构拆成两页。

## 5. 字号与行高地板

字号下限是设计稿里的逻辑像素，以 selfcheck 在 1600×900 视口下的测量值为准：

| 文本类型 | 下限 |
|---|---|
| 刻度（纯数字、只有数字和单位） | ≥ 12px |
| 标签、图注、图例、控件标签、tooltip 关键字 | ≥ 14px |
| 正文、导语、区块标题、说明句 | ≥ 16px |
| 所有成行文字的行高 | ≥ 1.35 |

1366 宽屏上，整块 1600 画布缩放系数为 1366/1600 ≈ 0.85。也就是说上面这些逻辑字号在实际屏幕上显示成约 10px / 12px / 13.6px。因此 12px 是地板，不是推荐值；theme.css 的 token 已经给出推荐值：`--fs-tick:13`、`--fs-label:15`、`--fs-body:18`。页面一律使用 token，不写裸字号。

KaTeX 公式的基准字号 ≥ 20px，因为嵌套缩放会复利：分式里带上下标时，16px 基准下最小字形只有约 9.7px。

## 6. 主题纪律：用主题，不创新规范

- 所有颜色、字体、字号、间距、圆角、阴影，一律从 `theme.css` 和 `base.css` 提供的 token 取。
- 页面内禁止出现魔法值：不写 `#fff`、`font-size: 15px`、`margin-left: 10px` 这类裸值。
- 需要语义色或组件外观时，使用 theme.css 提供的组件类（`.panel`、`.ctl`、`.note`）和骨架类（`.k-process`、`.k-comparison`、`.k-classification`、`.k-generalization`、`.k-enumeration`）。
- 不要自创组件、自创配色变量、自创排版体系。缺 token 时先查 `PLAN.md`；还缺就说明，不要在页面里发明。

## 7. 数字一律从 Lec 取

讲解和交互中出现的任何与主题相关的数字（年份、距离、速度、天体参数、换算结果），都必须来自 `Lec.K` 或 `Lec.P`，禁止页面写死。计算过程写在页面脚本里，不许预先把结果贴进 HTML。

### `Lec.K` 常量

```js
Lec.K.AGRICULTURE_START_YEARS
Lec.K.CURRENT_YEAR
Lec.K.DAYS_PER_JULIAN_YEAR
Lec.K.DINOSAUR_EXTINCTION_YEARS
Lec.K.EARLIEST_LIFE_YEARS
Lec.K.EARTH_AGE_YEARS
Lec.K.EARTH_ESCAPE_VELOCITY_KMPS
Lec.K.EARTH_GRAVITY_MPS2
Lec.K.EARTH_MOON_KM
Lec.K.EARTH_RADIUS_KM
Lec.K.EARTH_SUN_KM
Lec.K.HOMININ_DIVERGENCE_YEARS
Lec.K.HOMO_ERECTUS_YEARS
Lec.K.HOMO_SAPIENS_YEARS
Lec.K.INDUSTRIAL_REVOLUTION_YEARS
Lec.K.KM_PER_AU
Lec.K.KM_PER_LY
Lec.K.KM_PER_MILE
Lec.K.MARS_GRAVITY_MPS2
Lec.K.MILKY_WAY_LY
Lec.K.MOON_GRAVITY_MPS2
Lec.K.MOON_RADIUS_KM
Lec.K.M_PER_AU
Lec.K.M_PER_FOOT
Lec.K.M_PER_KM
Lec.K.M_PER_LY
Lec.K.NEAREST_STAR_LY
Lec.K.OBSERVABLE_UNIVERSE_LY
Lec.K.SECONDS_PER_DAY
Lec.K.SECONDS_PER_HOUR
Lec.K.SECONDS_PER_JULIAN_YEAR
Lec.K.SECONDS_PER_MINUTE
Lec.K.SPACE_AGE_START_CE
Lec.K.SPEED_OF_LIGHT_KMPS
Lec.K.SPEED_OF_LIGHT_MPS
Lec.K.UNIVERSE_AGE_YEARS
```

### `Lec.P` 函数

```js
Lec.P.auToKm(au)
Lec.P.auToMiles(au)
Lec.P.billionYearsToYears(by)
Lec.P.clamp(value, min, max)
Lec.P.daysToSeconds(days)
Lec.P.earthTimelinePercent(yearsAgo)
Lec.P.fractionAlongTimeline(value, start, end)
Lec.P.gravityRatio(gravityMPS2)
Lec.P.homininDurationYears()
Lec.P.homininTimelinePercent(yearsAgo)
Lec.P.hoursToSeconds(hours)
Lec.P.invLerp(value, a, b)
Lec.P.kmToAU(km)
Lec.P.kmToLy(km)
Lec.P.kmToM(km)
Lec.P.kmToMiles(km)
Lec.P.lerp(a, b, t)
Lec.P.lightTravelTimeHours(distanceKm)
Lec.P.lightTravelTimeMinutes(distanceKm)
Lec.P.lightTravelTimeSeconds(distanceKm)
Lec.P.linear(value, inMin, inMax, outMin, outMax)
Lec.P.lyToKm(ly)
Lec.P.lyToMiles(ly)
Lec.P.mToKm(m)
Lec.P.milesToKm(miles)
Lec.P.millionYearsToYears(my)
Lec.P.minutesToSeconds(minutes)
Lec.P.normalize(value, a, b)
Lec.P.percent(part, whole)
Lec.P.percentAlongTimeline(value, start, end)
Lec.P.round(value, precision)
Lec.P.secondsToDays(seconds)
Lec.P.secondsToYears(seconds)
Lec.P.spaceAgeYearsAgo()
Lec.P.speedFromFractionOfLight(fraction)
Lec.P.thousandYearsToYears(ky)
Lec.P.timelinePercent(value, start, end)
Lec.P.travelTimeYears(distanceKm, speedKmPerSec)
Lec.P.universeTimelinePercent(yearsAgo)
Lec.P.weightOnBody(massKg, gravityMPS2)
Lec.P.yearsToBillionYears(years)
Lec.P.yearsToMillionYears(years)
Lec.P.yearsToSeconds(years)
Lec.P.yearsToThousandYears(years)
```

每次换算在页面脚本里现算，并把中间结果显示在相应位置；不要在 HTML 里写转换后的数字。

### 随机数

凡是页面里“随机生成一批样本/一组点/一次抽样”的地方，都必须用 `seedrandom` 给定种子：

```js
var rng = new Math.seedrandom('page-07');
rng();
```

同种子必须同序列。不给种子就是每次打开看到不同的数，讲解里写死的数字会变成假话。

## 8. Canvas、指针与动画的必守条款

从底盘 `base.js` 继承以下规则，页面不要自己重新实现：

- **Canvas 尺寸适配**：canvas 一律走 `Deck.fit(cv)` 或 `Deck.autofit(cv, draw)`。不要自己写 `devicePixelRatio` 缩放、不要自己 `getBoundingClientRect` 换算。
- **指针坐标**：指针事件一律用 `Deck.pt(el, e)` 转逻辑坐标。外层有 `transform: scale()` 时 `e.offsetX` 是错的。
- **动画**：动画一律走 `Deck.loop(fn)`。不要自己写 `requestAnimationFrame` 循环。`Deck.loop` 已处理 reduced-motion 和标签页隐藏；用 `opt.still` 指定定格帧。
- **canvas 取色**：canvas 里不能写 `var()`，一律用 `Deck.token(name)`、`Deck.rgb(name)`、`Deck.rgba(name, a)` 从 CSS 变量读数。
- **减少动态**：系统要求 reduced-motion 时，`Deck.loop` 只画一帧；不要额外加会动的装饰。
- **键盘可达**：所有交互控件必须能用键盘操作。原生 `button`、`a`、`input` 优先；自定义拖拽必须有方向键替代，步长为 10px。任何可点击的 canvas 命中区域，都要在 DOM 里有对应的可聚焦元素，或通过 `tabindex` + `role` + `aria-label` 暴露。

库里已经解决的同一类问题不要重复解决：Konva 的 `stage.getPointerPosition()` 已经换算过缩放舞台，不需要再包一层 `Deck.pt`。

## 9. 库：能用库就不从底层重写

**凡是 `assets/lib/` 下已有库能完成的呈现工作，不允许自己从底层重写。** 对照关系如下：

| 要做的事 | 引用这一行 | 全局对象 |
|---|---|---|
| 物体下落、碰撞、摆动、堆叠、拖拽、约束 | `<script src="assets/lib/matter.min.js"></script>` | `Matter` |
| 三维场景、可旋转的立体结构、光照材质 | `<script src="assets/lib/three.min.js"></script>` | `THREE` |
| 三维地球、球面上的点/弧线/区块 | three 之后再引 `<script src="assets/lib/globe.gl.min.js"></script>` | `Globe` |
| 生成式动画背景 | three 之后再引 `<script src="assets/lib/vanta.net.min.js"></script>` | `VANTA` |
| 坐标轴 + 刻度 + 图例的常规图表（折线、柱、散点、面积、饼、热力） | `<script src="assets/lib/echarts.min.js"></script>` | `echarts` |
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

加载顺序：第三方库先于页面脚本；存在依赖的库必须按上表顺序（如 `globe.gl`、`vanta.net` 在 `three` 后，`ScrollTrigger` 在 `gsap` 后）。

精确版本写代码用这些，不要到库文件里查（压缩构建常查不到）：

| 文件 | 版本 |
|---|---|
| `three.min.js` | three r160 (0.160.1)，`outputColorSpace` 时代，不是 `outputEncoding` |
| `matter.min.js` | Matter.js 0.20.0 |
| `d3.min.js` | d3 7.9.0 |
| `pixi.min.js` | PixiJS 7.4.2 |
| `anime.min.js` | anime.js 3.2.2（旧版 API：`anime({targets:…})`，不是 v4 的 `animate()`） |
| `gsap.min.js` / `ScrollTrigger.min.js` | GSAP 3.12.5 |
| `globe.gl.min.js` | globe.gl 2.32.0 |
| `vanta.net.min.js` | Vanta 0.5.24（只有 NET 一种效果） |
| `lottie.min.js` | lottie-web 5.12.2 |
| `zdog.min.js` | Zdog 1.1.3 |
| `vanilla-tilt.min.js` | vanilla-tilt 1.8.1 |
| `aos.js` | AOS 2.3.4 |
| `mlp.js` | 自家维护，无版本号 |
| `tf.min.js` | TensorFlow.js 4.22.0（`tf.sequential` / `tf.layers.*` / `model.fit` API） |

### echarts

必须 `{ renderer: 'svg' }`，不是偏好，是硬要求。默认 canvas renderer 会把所有文字画进位图，字号闸查不到。

```js
var c = echarts.init(el, null, { renderer: 'svg' });
c.setOption({
  textStyle: { fontSize: 16 },
  xAxis: { axisLabel: { fontSize: 14 } },
  yAxis: { name: '…', nameTextStyle: { fontSize: 14 } },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { textStyle: { fontSize: 16 } }
});
```

只含数字的刻度可以 12px；带词句的一律 ≥14px。

### Konva

二维场景里的图形用 Konva。Konva 只有 canvas 渲染，`Konva.Text` 默认 12px，而且屏幕检查看不见它。规则：场景上的文字标签用 DOM 元素绝对定位叠在图形上方；只有“画在图形内部、离不开变换”的短标注才用 `Konva.Text`，且必须显式写 `fontSize`。指针换算 Konva 自己会对，不需要再包 `Deck.pt`。

### KaTeX

必须连 `assets/lib/katex.min.css` 一起引。这份 CSS 已把字体 base64 内嵌，`file://` 下零加载失败。基准字号统一 ≥20px；只有简单式才能用 16px，拿不准就按 20px。

### mlp.js

用法按 `assets/lib/LIBS.md`，核心是 `MLP.create({sizes, act, lr, seed})`，逐帧 `net.step(trainSet, batchSize)`，读 `net.predict`、`net.field`、`net.layers[i].a`。`diverged` 只判数值崩了；学习率太大会表现为 `acc` 不动，要看 `net.evaluate().acc`。

### tf.min.js 的边界

两三层小网络在页面上实时训练，不要用 tf.js。实测 `[2,10,10,1]`、200 点、每帧 12 mini-batch、80×80 决策边界：tf.js 每帧 102ms，手写不到 1ms。该用 tf.js 的是：加载别人训练好的模型、在真实图片上跑卷积、矩阵大到 GPU 才算得动。用 tf.js 时每一步都要 `tf.tidy(() => …)` 或手动 `dispose()`，并且留意 `tf.memory().numTensors` 是否一直涨。

### ml-matrix

纯计算。与 `mlp.js` 不重叠；要在页面实时训练小网络仍然用 `mlp.js`，不要用 ml-matrix 重写训练循环。

## 10. 技法文档

`PLAN.md` 中“技法文档清单”里已有的任务，先读完对应文档再动手，不要自己从头摸索，也不要另发明一套。理由和库一样：每页各自重新试一遍，产出不稳定，也慢。清单里没有的，自己写，不必硬凑。

## 11. 交互标准

**真交互**：用户输入会改变页面状态，并且状态变化由真实计算驱动。数字来自 `Lec`，结果来自当前输入，不是预录动画，不是写死结果。例如拖时间线 → 表格数字连续变化；点按钮 → 决策边界重新计算；拖滑块 → 轨道形状立即更新。

**装饰**：与状态无关的视觉动效。自动播放的背景、入场淡入、hover 高亮、指针倾斜、渐变过渡，都是装饰。装饰不能承载必经信息，不能影响可读性，不能干扰阅读。

**任何看起来能点的东西必须真的能点**：有 hover/按下反馈，有 `cursor`，有键盘可达。禁止“假按钮”——一个元素长得像按钮但点击后什么都不变。hover-only 的提示不能承载关键信息，关键信息要直接写在页面上。

每个交互都必须能在 `--after` 自检脚本里被触发，触发后页面状态稳定、无 JS 报错、无越界、字号仍达标。

## 12. 完工前自检

环境已装好 `node`、`python3` 带 numpy、`playwright` + chromium，不需要检查安装。

在 `pages/` 目录下跑：

```bash
python3 assets/selfcheck.py page-NN.html
```

它按 1600×900 真渲染，报告：JS 报错、加载失败的资源、超出画布的元素、被裁掉的元素、字号最小值与中位数、密度（占用比、容器数、文本块数、文字叠压、占比不足 1% 的小容器）。

对页面上每个会改变状态的交互控件，至少给一次：

```bash
python3 assets/selfcheck.py page-NN.html --after "document.querySelector('#my-button').click()"
```

`--after` 可给多次，每次多存一张截图。拖拽类交互用 JS 派发 pointer 事件触发。

判据：

- 0 个 JS 报错。
- 0 个资源加载失败。
- 0 个元素超出 1600×900 画布。
- 0 个元素被裁（.sr-only 和有意隐藏的除外）。
- 0 处文字叠压。
- 字号最小值、中位数满足第 5 节地板。
- 文本块数 ≤ 80，控件数 ≤ 6，正文总量 ≤ 900 字。
- 每个 `--after` 交互触发后，同样满足上述全部判据。

**改到干净为止**。selfcheck 只报告不改文件；有红项就必须改，不许用“就这样吧”带过。测试用的临时文件不要留在 `pages/` 里。

## 13. 交付

交付物只有 `page-NN.html` 一个文件。

不写文档、不写测试、不写总结。不要额外提交 README、设计说明或自检报告。不要把素材文件留在页面目录里，除非页面运行时真正需要。

---

## 附：底盘接口速查（CHASSIS.md 全文）

以下内容来自 `assets/CHASSIS.md`，是从底盘源码抽出的唯一真相；与契约其他部分不一致时，以这一段为准。

# CHASSIS.md —— 底盘接口速查

`base.css` 和 `base.js` 的**全部对外接口都在这一页里**。要用底盘，读这一页就够了，不需要打开那两个源文件（合起来 400 行）。只有在你打算**改写或替换**底盘时才去读源码，那时源码里每一条旁边都写了它各自解决什么问题。

底盘里只有和主题无关的机制：固定画布的整体缩放、canvas 在高分屏和缩放下的适配、指针坐标换算、几个不写就一定出 bug 的布局细节、可访问性地板。**没有任何配色、字体、字号、间距或组件外观** —— 那些是每次生成自己的设计。

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

底盘另外会读 `--stage-w` / `--stage-h`（画布逻辑尺寸，默认 1600 / 900）和 `--focus`（焦点圈颜色）。缩放比由底盘算出后写回 `:root` 的 `--s`，CSS 里可以直接用。

### 结构

页面里要有 `#stage`，它就是那块 1600×900 的逻辑画布；引入 base.css + base.js 之后缩放自动生效，不需要你写任何缩放代码。

### 四个工具类（这是 base.css 提供的全部类）

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | **任何 grid/flex 分栏的子项。** 子项默认不许缩到比内容小，一段长文本或一个宽 canvas 会把整列顶开、被裁掉，表现为「右边内容莫名其妙没了」 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 `<canvas>`。canvas 是替换元素，有 300×150 的默认尺寸，只写 `inset:0` 拉不开它 |
| `.no-pan` | 关掉触摸平移 | 需要拖动的交互区 |
| `.sr-only` | 只给读屏软件 | 图形的文字替代 |

---

## base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。页面里只要有 `#stage`，引入即开始工作（缩放监听在文件末尾自动装好）。

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

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。它靠 `r.width / el.offsetWidth` 反推，**嵌套缩放也对，但元素被 rotate 之后不适用**。

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

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧 `fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；标签页隐藏时自动暂停，回来不会有 dt 跳变。

### 小工具

```
Deck.clamp / Deck.lerp / Deck.fmt
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段
```

---

## 底盘不做的事

顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、版式模板 —— 一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

**如果这一轮另外做了共享文件**（比如统一的顶栏和进度轨、统一的数字格式化、共用的底纹），把它的接口按上面这个格式追加到本文件末尾。多个页面各自 `cat` 一遍源码去认接口，是纯浪费。

---

## 本轮追加：`theme.css` 提供的 token 与 class

```
token   --fs-h1 34       页标题
token   --fs-h2 22       区块小标题
token   --fs-lead 19     导语 / 强调正文
token   --fs-body 18     正文(默认);成句文字只许用 body / lead / sec
token   --fs-sec 16      次级说明、表格正文、图注正文
token   --fs-label 15    控件标签、图例、操作提示
token   --fs-tick 13     纯数字刻度,只有数字和单位时才可以用

版心     内容区 1408×620,页眉 96 / 页脚 88 —— 页面内容放进 #main,照这个尺寸排,不要自己量

骨架     .k-process        把「先后 / 因果」显式化:横向分段 + 段间箭头,
                          当前段高亮,已过的段降饱和
骨架     .k-comparison     把「同一维度上的差异」显式化:对齐的行列 +
                          共同基准轴,差异列加底色;对象列数用 --cmp-cols 设置(默认3)
骨架     .k-classification 把「归属」显式化:嵌套包含框,层级靠缩进和边框粗细
骨架     .k-generalization 把「主张—支撑」显式化:主干居中,分支向外,
                          支撑在视觉上从属于主张
骨架     .k-enumeration    把「同级并列」显式化:统一的项模板,不暗示顺序

组件     .panel            读数面板    .ctl 控件行    .note 图注
```

### 页眉页脚已经由 `Lec.mount()` 生成，页面不要自己再造一套

`Lec.mount()` 会往 `<body>` 里插入下面这些元素（共 13 个类名）：

```html
.lec-header
.lec-footer
.lec-nav
.lec-header-inner
.lec-kicker
.lec-title
.lec-progress
.lec-progress-bar
.lec-footer-inner
.lec-foot
.lec-nav-prev
.lec-nav-next
.is-disabled
```

以 `#main` 定位，重复调用时复用。这些类名是唯一真相，别改名、别另起一套。mount 只生成结构，不带任何外观。

页面**只往 `#stage` 里加内容**，页眉页脚由 `mount()` 负责、`theme.css` 负责它们的外观和占位高度。页面不许重复生成、不许改它们的类名，也不要为了“排得好看”去覆盖它们的样式。页面自己的内容区是 `#stage` 减掉这两条带之后剩下的部分 —— 具体取值看 `theme.css` 里那两个类的高度。

**契约里写死：canvas 一律走 `Deck.fit`/`Deck.autofit`，指针一律走 `Deck.pt`，动画一律走 `Deck.loop`，canvas 取色一律走 `Deck.rgb`/`Deck.rgba`。** 自己写 `getBoundingClientRect` 换算、自己 `devicePixelRatio` 缩放、自己 `requestAnimationFrame` 循环 —— 都是重复实现，不许。

## 页面骨架

harness 已经把每页的骨架建好了，长这样，**只往 `#stage` 里加内容，别动别的**：

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

## 还要写进契约的几条硬约束

- 每个 HTML 自包含：直接在浏览器打开就能显示和交互，资源一律相对路径，不用 CDN。
- **不许删底盘或主题提供的类。** 具体说：不许 `classList.remove(...)` 掉 `lec-root` / `lec-page` / `min0` / `cv-fill` 这类由 `base.css` 或 `theme.css` 提供的类，也不许覆盖它们的定位属性。那些类承载的是“内容避开页眉页脚带”这件事，删掉之后标题会顶穿画布上边界、读数面板会被主画布压住。
- **不许在这块缩放画布里用 `position: fixed`。** 画布整体走 `transform: scale()`，`fixed` 的参照系是视口而不是舞台，它会脱离缩放、压在别的东西上面。要固定就用 `position: absolute` 相对内容容器。
- **默认用 flex 而不是 grid。** 一维流式排布天然不重叠，二维放置放错格子就叠。真正需要二维对齐（矩阵、维度表）时再用 grid。
- **需要靠算坐标才能对齐的地方，改结构，不要算坐标。** 拖拽用 `transform` 偏移、让元素留在正常流里，不要改 `left/top`；刻度和滑块对不齐时把它们拆成上下两个区块，而不是用绝对定位去凑。
- 库的版本按 `assets/lib/LIBS.md` 上写的来，**不要去库文件里查版本** —— 压缩构建里查不到，查也是白烧调用。

### 库：硬约束，不是可选项

**凡是 `assets/lib/` 下已有库能完成的呈现工作，不允许自己从底层重写。** 动手之前先按“要做的事”查一遍 `assets/lib/LIBS.md`。对照关系是明确的：

    坐标轴/刻度/图例/折线柱状散点面积饼热力这类常规图表   echarts
    可拖拽、需要命中检测的二维场景                       konva
    三维                                                three
    下落、碰撞、摆动、堆叠                                matter
    节点连线、数据驱动的矢量图形                          d3
    成千上万元素同时运动                                 pixi
    多个动画按时间线编排                                 gsap
    数学公式                                            katex
    矩阵运算                                            ml-matrix

这一条只管**呈现层**。每个交互背后的**计算**仍然要真算 —— 梯度下降、轨道积分、组合计数、真实物理量，自己算或用 `mlp.js`、`ml-matrix` 都可以，但不允许用预录动画、假数据或写死的数字冒充。

几条会静默失效的：

- `echarts` 一律 `{renderer:'svg'}`。默认的 canvas 渲染器会把所有文字画进位图，自检的字号检查看不见它们 —— 那等于这一页没做过字号自检。
- `katex` 的基准字号 **≥20px**，不是 16。嵌套缩放会复利：分式里带下标的部分在 16px 基准下量出来只有 9.68px。
- 页面里凡是随机生成数据的地方，一律用 `seedrandom` 给定种子。读者每次打开看到的数必须一样，否则讲解里写的数字就成了假话。

### 技法文档：同样的道理

清单里已经有对应技法文档的，**先用 `Skill` 读它，再动手**，不要自己从头摸索或另发明一套。理由和库一样：每一页都自己重新试一遍，产出不稳定、也慢。清单里没有对应的，就自己写，不必硬凑。

- 这台机器上已装好 `node`、`python3` 带 numpy、`playwright` + `chromium`，不需要检查装没装。
- 自检工具是 `python3 assets/selfcheck.py page-NN.html`，在 `pages/` 目录下跑。它按 1600×900 真渲染一遍，报 JS 报错、加载失败的资源、超出画布的元素、被裁掉的元素、字号最小值与中位数，以及**密度**（画面占用比、容器数、文本块数、文字叠压、占比不足 1% 的小容器）。想看**触发交互之后**的样子，用 `--after "<一段 JS>"`（可给多次，每次多存一张截图）。只报告，不改文件。改到干净为止。

## 版面预算要有可算的数，不要只写形容词

「不要太满」这种话是没有效果的 —— 实测同一句话写在四处、连续七轮零改变；而「字号不小于 16px」这种带数的约束一加，不达标率就从 66% 掉到 20%。所以这一节必须给出能数出来的上限，并写明超了怎么办。

实测参考：一页上的文本元素（含坐标刻度、图例、控件标签、读数）中位数约 45 个；超过 80 个的页面，人眼一看就是“太满”。注意其中**只有约 18% 是句子，82% 是标签和刻度** —— 所以“少写几句话”解决不了太满，要减的是元素个数本身（合并读数、去掉冗余图例、把刻度交给库去抽稀）。

`selfcheck` 会报「文本块数」和「画面占用比」，那就是检查这条预算的手段。超了怎么办：**拆页，不是缩字号**。