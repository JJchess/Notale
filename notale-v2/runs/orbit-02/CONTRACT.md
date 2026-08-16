# 全套 20 页页面构建契约

## 1. 工作边界

- 只构建分配给自己的 `page-NN.html`。
- 只允许写这一个 HTML 文件；不得新建或修改 CSS、JavaScript、图片、数据、测试、文档及其他资源。
- 不得读取、搜索、比较或引用任何其他 `page-*.html`，包括已经完成的页面。
- 内容依据仅限本契约、`PLAN.md`、`assets/theme.css` 和 `assets/lec.js`；基础机制以本契约转述为准。
- 不检查预置库是否存在，不下载、不复制、不更新库，也不读取压缩库来猜版本。
- 不修改 harness 已建立的页面骨架。页面专有的 HTML、内联样式、库引用和初始化脚本全部放进 `#stage`。
- 契约与 `PLAN.md` 冲突时，以本契约为准；无法在预算内完成时报告超限，不得以缩小字号、压缩间距、裁切或滚动蒙混过关。

## 2. 固定画布与页面编号

- 逻辑画布固定为 `1600 × 900`。
- 文件名固定为 `page-NN.html`，`NN` 使用两位页码 `01`—`20`。
- `<body data-page="NN" data-total="20">` 的页码必须与文件名一致。
- 页面不得产生横向或纵向滚动条。
- 不得修改 `body`、`#stage` 的全局缩放、变换、定位或画布尺寸。
- 不得使用 `zoom`、额外的整体 `transform: scale(...)` 或缩小整个内容来解决溢出。
- `Lec.mount(...)` 每页调用且只调用一次；`index` 必须来自 `data-page`，不得另写一份可能不一致的页码。

## 3. 固定 HTML 骨架

最终文件保持以下结构。只替换 `NN`、页面元信息、正文、页面专有样式、所需库和页面初始化代码；其他标签、顺序及路径不得改动。

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="20">
      <div id="stage">
        <style>
          /* 仅本页布局；颜色、字体、间距等只引用 theme.css 中已有的变量 */
        </style>

        <!-- 本页语义化正文 -->

        <!-- 仅在确有需要时放入预置库；依赖库必须排在使用者之前 -->
        <!-- <script src="assets/lib/xxx.js"></script> -->

        <script>
          window.addEventListener('DOMContentLoaded', function () {
            'use strict';

            const page = Object.freeze({
              index: Number(document.body.dataset.page),
              kicker: '按 PLAN.md 填写',
              title: '按 PLAN.md 填写',
              take: '按 PLAN.md 填写'
            });

            Lec.mount(page);

            /* 本页初始化代码 */
          }, { once: true });
        </script>
      </div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

固定要求：

- 页面专有 DOM、`<style>`、可选库引用和初始化 `<script>` 均位于 `#stage` 内。
- 因 `assets/base.js` 和 `assets/lec.js` 位于 `#stage` 之后，页面初始化必须等待 `DOMContentLoaded`，不得在解析到内联脚本时立即调用 `Deck` 或 `Lec`。
- 可选库使用普通同步 `<script src="..."></script>`，不得添加 `async`，有依赖关系时不得添加 `defer`。
- 不额外引入页面 CSS 或页面 JS；页面专有代码全部内联在本 HTML 中。
- 不使用 CDN、网络请求、远程字体、远程图片、动态 `import()` 或需要服务器才能工作的模块。
- 文件必须能通过 `file://` 直接打开并完整显示、计算和交互。

## 4. 版面硬预算

### 4.1 文字预算

- `kicker`：不超过 16 个中文字符等价量。
- `title`：不超过 24 个中文字符等价量。
- `take`：不超过 48 个中文字符等价量。
- 正文说明文字总量：不超过 300 个中文字符等价量。
- 正文统计包含段落、卡片说明、图注、提示、结论、公式旁注和交互说明。
- 纯数字刻度、单位、控件当前值及由 `Lec` 动态生成的数据不计入正文预算。
- 一个汉字、一个全角标点或一个空格分隔的拉丁单词各计一个字符等价量。

### 4.2 控件预算

- 每页最多 6 个学习交互控件。
- 每个 `button`、`input`、`select`、`textarea`、单独的单选项、可聚焦自定义控件及可聚焦交互 canvas 各计一个。
- `Lec.mount` 提供的全套共用页面部件不计入本页控件预算。
- 一个滑块及其只读 `<output>` 计一个控件；若 `<output>` 本身可编辑或可聚焦，则另计一个。
- 不得用无障碍性更差的自定义控件规避计数。

### 4.3 超限处理

- 内容或控件超出预算时，先删减重复说明、合并控制维度、简化视觉结构。
- 不得通过压字号、降低行高、减少主题间距、让内容滚动、隐藏内容、裁切内容或只在 hover 后显示来塞入画布。
- 若 `PLAN.md` 的必要内容仍无法满足预算，停止交付并明确报告：
  `超出契约：正文 X/300；控件 Y/6。`

## 5. 字号与可读性下限

以下均指 1600 × 900 逻辑画布中的最终计算字号：

- 坐标轴刻度、表格中的次要数值、微型状态数值：不得小于 `12px`。
- 标签、图例、图注、单位、控件辅助文字：不得小于 `14px`。
- 正文、卡片正文、交互说明、按钮和输入内容：不得小于 `16px`。
- 正文及说明文字的 `line-height` 不得小于 `1.35`。
- 不得把低于下限的文字转成 SVG path、canvas 位图或图片来规避检查。
- canvas 中绘制的文字同样遵守这些下限。
- 重要结论不得只依赖小刻度或微型图注表达。

常见 1366 × 768 屏幕相对逻辑画布的适配比例为：

    min(1366 / 1600, 768 / 900) ≈ 0.853

因此页面通常会以约 `0.85` 的比例显示。逻辑字号 `16px` 在该屏幕上视觉尺寸已接近 `13.6px`；继续缩小会明显损害可读性。字号下限是硬约束，不是建议值。

## 6. 主题使用

- 颜色、字体、字号层级、间距、圆角、边框、阴影和表面层级必须取自 `assets/theme.css` 中实际存在的 CSS 自定义属性。
- 使用变量前读取 `assets/theme.css`，不得猜测变量名。
- 不得新造一套配色、字体系统、间距系统、阴影系统或卡片风格。
- 不得在页面 CSS、HTML、SVG 或 JavaScript 中写死十六进制色、`rgb()`、`hsl()`、命名色或独立的字体族。
- 页面专有 CSS 变量如确有必要，只能作为已有主题变量的别名，不得引入新的视觉值。
- 布局可使用百分比、`fr`、逻辑画布坐标及必要的几何尺寸；组件内外间距必须使用主题间距变量。
- 不覆盖 `assets/base.css` 或 `assets/theme.css` 的全局规则；页面样式必须限定在本页根容器内。
- flex/grid 中可能收缩的内容容器使用 `.min0`，避免内容被静默裁掉。
- canvas 铺满父容器时使用 `.cv-fill`。
- 触摸拖拽区域使用 `.no-pan`。
- 仅供辅助技术读取的文本使用 `.sr-only`。

canvas 不能直接解析 CSS 中的 `var(...)`，因此 canvas 颜色只能通过：

- `Deck.rgb(name)`
- `Deck.rgba(name, alpha)`
- 必要时使用 `Deck.token(name)` 读取字体等原始主题值

不得自行解析 CSS 色值，也不得在 canvas 绘制代码中写死颜色。

## 7. 数字与计算来源

- 所有面向学习者显示的科学数据、常量、单位换算结果、图表数据、控件语义范围、默认物理状态和结论数字一律来自 `Lec.K` 或 `Lec.P`。
- 页面不得复制、近似、转录或重新声明 `Lec` 已提供的常量和公式。
- 不得把数字藏在 HTML 文本、`data-*`、SVG 属性、数组、JSON、注释或字符串中规避此要求。
- 格式化优先使用 `Lec.P.formatNumber()`、`formatSI()`、`formatDistance()`、`formatDuration()`、`formatMass()`、`formatPercent()`、`formatSpeed()` 等接口。
- `Lec.P` 已提供的计算不得在页面中自行重写。
- 控件变化后必须重新调用相应的 `Lec.P` 接口计算，不得用预制查表结果伪装实时计算。
- `PLAN.md` 要求的学习数字若没有对应 `Lec.K` 或 `Lec.P` 来源，不得自行硬编码；应报告缺失接口。
- 仅以下实现数字可以写在页面代码中：
  - 页码和总页数；
  - 1600 × 900 画布相关布局坐标；
  - 纯视觉几何、归一化系数、数组索引和动画内部时间参数；
  - 不向学习者宣称为课程事实的库配置。
- 实现数字一旦被显示、成为控件的语义值、出现在公式结论中或影响课程事实，即不再属于例外，必须改由 `Lec` 提供。

`Lec` 的公共接口为：

- `Lec.K`：`EARTH_EQUATORIAL_RADIUS`、`EARTH_MASS`、`EARTH_MU`、`EARTH_RADIUS`、`EARTH_ROTATION_RATE`、`EARTH_SIDEREAL_DAY`、`GEO_ALTITUDE`、`ISS_ALTITUDE`、`KARMAN_ALTITUDE`、`MOON_MASS`、`MOON_MU`、`MOON_RADIUS`、`SUN_MASS`、`SUN_MU`、`SUN_RADIUS`
- `Lec.P`：`altitudeForPeriod()`、`altitudeFromRadius()`、`apsidesFromElements()`、`atmosphericDensity()`、`ballisticCoefficient()`、`biEllipticTransfer()`、`burnTime()`、`celsiusToFahrenheit()`、`celsiusToKelvin()`、`centripetalAcceleration()`、`circularOrbit()`、`circularVelocity()`、`circularVelocityAtRadius()`、`clamp()`、`combinedBurnDeltaV()`、`constantGravityCoastTime()`、`constantGravityPeakAltitude()`、`convert()`、`curvatureDrop()`、`deltaVBudget()`、`dragAcceleration()`、`dragForce()`、`dynamicPressure()`、`effectiveExhaustVelocity()`、`energyPerUnitMassToCircularOrbit()`、`escapeVelocity()`、`escapeVelocityAtRadius()`、`fahrenheitToCelsius()`、`finalMassAfterBurn()`、`formatDistance()`、`formatDuration()`、`formatMass()`、`formatNumber()`、`formatPercent()`、`formatSI()`、`formatSpeed()`、`fuelEnergyEquivalent()`、`geostationaryOrbit()`、`gravitationalForce()`、`gravityAtAltitude()`、`gravityAtRadius()`、`gravityLoss()`、`groundTrackShiftPerOrbit()`、`hillRadius()`、`hohmannTransfer()`、`hohmannTransferByAltitude()`、`horizon()`、`hyperbolicDeparture()`、`impulse()`、`inertialLaunchSpeed()`、`initialMassForDeltaV()`、`inverseLerp()`、`isNumber()`、`isaAtmosphere()`、`kelvinToCelsius()`、`keplerState()`、`kineticEnergy()`、`launchAzimuths()`、`launchInclination()`、`lerp()`、`lightTime()`、`machNumber()`、`massFlow()`、`massRatioForDeltaV()`、`mean()`、`meanMotion()`、`minimumLaunchInclination()`、`momentum()`、`multiStageDeltaV()`、`netVerticalAcceleration()`、`nodalPrecessionRate()`、`nozzleThrust()`、`orbitDecayRate()`、`orbitDecayTime()`、`orbitFromApsides()`、`orbitalPeriod()`、`orbitalPeriodAtRadius()`、`orbitalRadius()`、`pageLabel()`、`payloadForDeltaV()`、`planeChangeDeltaV()`、`planeChangeDeltaVDegrees()`、`potentialEnergyChange()`、`power()`、`powerLimitedThrust()`、`propellantFractionForDeltaV()`、`propellantMassForDeltaV()`、`radiusAtTrueAnomaly()`、`radiusForPeriod()`、`range()`、`reentryHeatingRate()`、`relativeVelocity()`、`rocketDeltaV()`、`rocketDeltaVFromExhaustVelocity()`、`rocketEquation()`、`rotationAssist()`、`round()`、`sample()`、`significant()`、`solveKepler()`、`specificImpulse()`、`specificOrbitalEnergy()`、`speedAtTrueAnomaly()`、`speedOfSound()`、`sphereOfInfluence()`、`stageDeltaV()`、`standardAtmosphere()`、`sum()`、`sunSynchronousInclination()`、`surfaceRotationSpeed()`、`surfaceToCircularSpecificEnergy()`、`synodicPeriod()`、`terminalVelocity()`、`thrustFromMassFlow()`、`thrustToWeight()`、`toDegrees()`、`toRadians()`、`transferPhaseAngle()`、`trueAnomalyFromEccentric()`、`upperAtmosphericDensity()`、`verticalBallisticPeakAltitude()`、`visViva()`、`weight()`
- 页面框架：`Lec.mount({index, kicker, title, take})`

## 8. `Deck` 基础机制

`assets/base.js` 已统一提供以下机制，页面不得重写：

    Deck.W / Deck.H          逻辑画布尺寸
    Deck.s                   当前缩放比
    Deck.fit(cv)             canvas 高分屏适配，返回已 setTransform 的 2d ctx
    Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
    Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}，缩放/触摸均兼容
    Deck.token(name)         读取 CSS 自定义属性原始字符串
    Deck.rgb(name)           读取为 [r,g,b]
    Deck.rgba(name, a)       读取为 rgba(r,g,b,a)
    Deck.reduced()           系统是否要求减少动态
    Deck.loop(fn[,opt])      rAF 循环，返回 stop()
                             reduced-motion 下只绘制一帧：
                             fn(opt.still||0, 0)
                             标签页隐藏时自动暂停，恢复时无 dt 跳变
    Deck.onResize(fn)        尺寸变化回调，返回注销函数
    Deck.clamp
    Deck.lerp
    Deck.fmt
    Deck.rr                  圆角矩形
    Deck.arrow               带箭头线段

`assets/base.css` 已统一提供：

    .min0
    .cv-fill
    .no-pan
    .sr-only

以下四条没有例外：

- canvas 一律使用 `Deck.fit` 或 `Deck.autofit`。
- 指针坐标一律使用 `Deck.pt`。
- 动画循环一律使用 `Deck.loop`。
- canvas 取色一律使用 `Deck.rgb` 或 `Deck.rgba`。

禁止：

- 自己读取 `devicePixelRatio` 并设置 canvas 像素尺寸。
- 自己用 `getBoundingClientRect()`、`clientX`、`offsetX` 等换算逻辑坐标。
- 自己调用 `requestAnimationFrame()`、`setInterval()` 或递归 `setTimeout()` 实现动画循环。
- 自己监听窗口 resize 后重复实现缩放适配。
- 在 canvas 中直接使用 CSS `var(...)` 作为颜色。
- 将低分辨率 canvas 拉伸到显示尺寸。

## 9. Canvas 与交互适配

### 9.1 高分屏和缩放

- canvas 的显示尺寸由布局容器决定，像素缓冲区由 `Deck.fit` 或 `Deck.autofit` 管理。
- 静态或按状态重绘的 canvas 优先使用 `Deck.autofit(cv, draw)`。
- 动态 canvas 仍须先完成 `Deck.fit`/`Deck.autofit`，再由 `Deck.loop` 驱动绘制。
- 缩放变化后必须重新适配并重绘，不能留下模糊、拉伸、偏移或旧像素。
- 绘图坐标始终使用逻辑坐标，不将 `Deck.s` 手工重复乘入绘图坐标。
- canvas 所在 flex/grid 子项必须允许收缩，通常使用 `.min0`；铺满时使用 `.cv-fill`。

### 9.2 指针

- 使用 Pointer Events，不分别维护互相分叉的 mouse/touch 实现。
- 每次按下、移动和释放所需坐标均通过 `Deck.pt(element, event)` 获取。
- 拖拽时使用 `setPointerCapture()`/`releasePointerCapture()` 保持连续性。
- 触摸拖拽区域使用 `.no-pan`，不得因页面滚动手势导致交互中断。
- 指针离开、取消、失焦时必须结束拖拽状态。
- 点击目标和拖拽手柄的有效命中区域不得小于 `44 × 44` 逻辑像素。

### 9.3 键盘与辅助技术

- 优先使用原生 `button`、`input`、`select`，不得用可点击 `<div>` 代替。
- 自定义交互 canvas 必须可聚焦，并提供准确的 `role`、`aria-label` 和可见焦点。
- canvas 拖拽必须有键盘等价操作；至少支持方向键调整，适用时支持 `Home`、`End`、`Enter`、空格和重置。
- 键盘操作与指针操作必须更新同一份状态和同一组结果。
- 每个输入必须有可感知的标签、单位及当前值。
- 动态结果使用邻近可见文本；需要播报时使用克制的 `aria-live`，不得逐帧播报。
- canvas 必须配有可见图注或 `.sr-only` 文本，说明图中含义和当前关键结果。
- 信息不得只靠颜色区分；同时使用文字、形状、线型、位置或图案。
- hover 可以补充信息，但不得是获取必要信息或完成操作的唯一方式。

### 9.4 Reduced motion

- 所有持续动画通过 `Deck.loop` 运行，使其在 reduced-motion 下只绘制稳定的一帧。
- 页面初始化时可用 `Deck.reduced()`选择静止状态、最终状态或无位移替代效果。
- reduced-motion 下不得自动旋转、漂移、闪烁、弹跳、持续缩放或自动播放时间线。
- 交互触发后可以立即更新状态，但不得依赖长动画才能看到结果。
- CSS 动画和过渡必须提供 `@media (prefers-reduced-motion: reduce)` 分支，将非必要运动禁用或近乎即时完成。
- 动画不得承载唯一的教学信息；静止画面必须保留结论和状态差异。

## 10. 可用库、路径与版本

版本以本表及 `assets/lib/LIBS.md` 为准。不要去压缩库中查询版本号。

| 用途 | 引用 | 全局对象 | 版本 |
|---|---|---|---|
| 物理、碰撞、摆动、堆叠、约束 | `<script src="assets/lib/matter.min.js"></script>` | `Matter` | 0.20.0 |
| 三维场景、光照、材质 | `<script src="assets/lib/three.min.js"></script>` | `THREE` | r160 / 0.160.1 |
| 三维地球、球面点线区块 | `<script src="assets/lib/globe.gl.min.js"></script>` | `Globe` | 2.32.0 |
| 生成式 NET 背景 | `<script src="assets/lib/vanta.net.min.js"></script>` | `VANTA` | 0.5.24 |
| 节点连线、矢量图形、数据绑定 | `<script src="assets/lib/d3.min.js"></script>` | `d3` | 7.9.0 |
| 大量元素同时绘制 | `<script src="assets/lib/pixi.min.js"></script>` | `PIXI` | 7.4.2 |
| 分步动画、路径、形变 | `<script src="assets/lib/anime.min.js"></script>` | `anime` | 3.2.2 |
| 精确时间线 | `<script src="assets/lib/gsap.min.js"></script>` | `gsap` | 3.12.5 |
| 滚动绑定动画 | `<script src="assets/lib/ScrollTrigger.min.js"></script>` | `ScrollTrigger` | 3.12.5 |
| 矢量动画文件 | `<script src="assets/lib/lottie.min.js"></script>` | `lottie` | 5.12.2 |
| 伪三维插画 | `<script src="assets/lib/zdog.min.js"></script>` | `Zdog` | 1.1.3 |
| 指针倾斜 | `<script src="assets/lib/vanilla-tilt.min.js"></script>` | `VanillaTilt` | 1.8.1 |
| 进入视野淡入 | `<script src="assets/lib/aos.js"></script>` | `AOS` | 2.3.4 |
| 页面内实时训练小型二分类网络 | `<script src="assets/lib/mlp.js"></script>` | `MLP` | 自家维护，无版本号 |
| 预训练模型、卷积、大型 GPU 矩阵 | `<script src="assets/lib/tf.min.js"></script>` | `tf` | 4.22.0 |

依赖顺序：

- `three.min.js` 必须先于 `globe.gl.min.js`。
- `three.min.js` 必须先于 `vanta.net.min.js`。
- `gsap.min.js` 必须先于 `ScrollTrigger.min.js`。
- 所有页面使用的库必须先于本页初始化代码。
- 未使用的库不得引用。
- three r160 使用 `outputColorSpace`，不得使用旧版 `outputEncoding`。
- anime.js 使用 3.x API：`anime({ targets: ... })`，不得使用 v4 的 `animate()`。
- 所有库均为 UMD 构建，使用表中的全局对象，不使用 ESM 导入。
- 由于本契约只允许写一个 HTML，不得自行下载或新增其他库。

第三方库不得绕过 `Deck.loop`：

- Matter.js：由 `Deck.loop` 调用 `Matter.Engine.update()`；不得使用 `Runner.run()` 或自建循环。
- Three.js：由 `Deck.loop` 调用 `renderer.render()`；不得使用 `renderer.setAnimationLoop()`。
- PixiJS：停用内部 ticker，由 `Deck.loop` 更新并渲染。
- anime.js：使用 `autoplay: false`，由 `Deck.loop` 调用 `seek()`。
- GSAP：创建暂停时间线，由 `Deck.loop`推进时间或进度。
- Lottie：关闭 autoplay 和 loop，由 `Deck.loop`调用 `goToAndStop()`。
- Zdog：由 `Deck.loop`调用 `updateRenderGraph()`。
- 内部持续循环无法关闭或无法由 `Deck.loop`接管的效果不得使用。
- 页面固定为单画布，不应依赖滚动；无真实滚动语义时不得使用 ScrollTrigger。

### 10.1 `mlp.js` 与 TensorFlow.js 的边界

- 两三层的小型网络、少量样本、逐帧训练、决策边界或神经元激活可视化使用 `mlp.js`。
- `mlp.js` 只用于任意层数、任意输入维度、单个 sigmoid 输出的二分类；不用于多分类、回归、卷积或 Adam。
- `net.diverged` 只表示数值崩溃，不代表模型已经学会；学习结果必须同时检查 `net.evaluate(...).acc` 和损失。
- 只有加载预训练模型、真实图片卷积或大到必须使用 GPU 的矩阵运算才使用 TensorFlow.js。
- 使用 TensorFlow.js 时，每一步必须放在 `tf.tidy(() => ...)` 中或显式 `dispose()`。
- 必须检查 `tf.memory().numTensors` 不会随运行持续增长。
- 不得为了少写少量代码而让小网络使用 TensorFlow.js。

## 11. 真交互标准

一项交互只有同时满足以下条件才算教学交互：

- 学习者能主动改变一个与本页目标有关的变量、状态、结构或观察条件。
- 操作会立即改变模型、图形、计算结果或比较关系。
- 变化结果清楚可见，并有数值、标签或结论解释其含义。
- 操作与结果之间存在可理解的因果关系，而不是随机装饰。
- 指针、触摸和键盘都能完成核心操作。
- 提供明确的初始状态；复杂交互还需提供重置方式。
- 不要求学习者猜测可操作区域。

以下不算教学交互：

- 自动播放但学习者不能改变模型。
- 只有 hover 发光、视差、倾斜、粒子跟随或背景响应。
- 点击后仅播放同一段动画。
- 点击“显示答案”但不改变推理条件。
- 纯装饰的拖拽、旋转、弹跳或物理碰撞。
- 只能开始、暂停或重播固定动画。
- 只有页面导航或共用框架控件。
- 控件存在但没有可解释的输出变化。

装饰效果可以存在，但必须：

- 不占用核心教学控件预算之外的注意力。
- 不遮挡文字、图表、焦点或命中区域。
- 不降低对比度和可读性。
- reduced-motion 下关闭。
- 不冒充页面的主要交互。

## 12. 性能与状态

- 页面加载后不得有未处理异常、Promise rejection 或持续增长的资源。
- 每帧只更新确实变化的内容；静态背景和昂贵数据应缓存。
- 不在每帧创建大量对象、DOM 节点、canvas、纹理或张量。
- 昂贵计算应降低更新频率，但交互反馈必须及时。
- 页面隐藏时依赖 `Deck.loop` 自动暂停，不另建后台定时器。
- 状态必须有单一来源；DOM、canvas、数值输出和无障碍文本从同一状态更新。
- 重置必须恢复初始状态、控件值、图形和文本结果。
- 不在控制台输出调试日志。
- 不保留注释掉的大段代码、临时占位符、调试边框或性能面板。

## 13. 完工前自检

机器已安装 `node`、带 numpy 的 `python3`、`playwright` 和 `chromium`，无需检查安装状态。

在 `pages/` 目录运行：

    python3 assets/selfcheck.py page-NN.html

该工具会按 `1600 × 900` 实际渲染并报告：

- JavaScript 错误；
- 加载失败的资源；
- 超出画布的元素；
- 被裁掉的元素；
- 字号最小值；
- 字号中位数。

通过判据：

- JavaScript 错误为 0。
- 未处理异常和资源加载失败为 0。
- 超出 1600 × 900 画布的元素为 0。
- 被父容器、画布或 overflow 静默裁掉的元素为 0。
- 页面没有横向或纵向滚动条。
- 刻度类文字最小字号不低于 `12px`。
- 标签和图注最小字号不低于 `14px`。
- 正文及控件文字最小字号不低于 `16px`。
- 正文行高不低于 `1.35`。
- 报告中没有其他错误或警告项。

还必须完成以下操作检查：

- 用 Tab 能依次到达所有交互控件，顺序符合视觉顺序。
- 每个可操作元素都有清晰的可见焦点。
- 只用键盘可以完成核心交互和重置。
- 指针拖拽在画布缩放后仍与视觉位置一致。
- 触摸指针不会触发错误的页面平移。
- 控件变化后数值、图形、结论和辅助文本同步更新。
- reduced-motion 下无持续运动，静止状态仍能表达教学结论。
- 重置后所有状态完全回到初始值。
- 直接通过 `file://` 打开时无网络依赖且功能完整。

每次修改后都重新运行自检。发现任何错误、加载失败、溢出、裁切或字号违规，必须修改 HTML 并重跑；循环执行，直到结果干净为止。自检工具只报告问题，不会替页面修改文件。

## 14. 交付

- 只交付分配到的 `page-NN.html`。
- 不交付其他页面。
- 不修改或交付 `assets/` 下任何文件。
- 不新增资源、测试、截图、日志、说明文档或总结。
- 不附带实现说明、自检说明、变更记录或交付总结。