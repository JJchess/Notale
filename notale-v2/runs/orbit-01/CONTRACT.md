# CONTRACT.md

## 1. 适用范围

本契约适用于全套 20 页。每一页由一个独立 agent 构建，agent 只共享：

- `PLAN.md`
- `assets/theme.css`
- `assets/lec.js`
- `assets/base.css`
- `assets/base.js`
- `assets/lib/` 中已经预置的库

页面之间不可互相参考、复制或依赖。

每个 agent 只负责一个文件：

`pages/page-NN.html`

不得读取、修改或引用任何其他 `page-*.html`。不得修改 `PLAN.md`、任何 `assets/*` 文件、其他页面或共享资源。

每个 HTML 必须自包含，直接双击以 `file://` 打开即可显示和交互。所有资源使用相对路径，不使用 CDN，不依赖静态服务器，不依赖网络请求。

## 2. 固定 HTML 骨架

以下文档骨架必须照抄。除页号占位符外，不得改变 `doctype`、语言、meta、样式表、`#stage`、共享脚本的结构和顺序。

`<!doctype html>`

`<html lang="zh">`

`<head>`

`  <meta charset="utf-8">`

`  <link rel="stylesheet" href="assets/base.css">`

`  <link rel="stylesheet" href="assets/theme.css">`

`</head>`

`<body data-page="NN" data-total="TT">`

`  <div id="stage"></div>`

`  <script src="assets/base.js"></script>`

`  <script src="assets/lec.js"></script>`

`</body>`

`</html>`

只向 `#stage` 添加本页内容。不得把页面内容放到 `body` 的其他位置，不得删除或移动已有脚本。

本页自己的页面结构、可选库引用和页面脚本都放在 `#stage` 内。由于 `base.js` 和 `lec.js` 位于 `#stage` 之后，本页脚本必须放在 `DOMContentLoaded` 回调中执行，不能在解析阶段直接调用 `Deck` 或 `Lec`。

`NN` 是本页页号元数据，`TT` 是总页数元数据。它们必须与本页实际页号和 `Lec.K.PAGE_TOTAL` 一致。页号和总页数只是骨架元数据；所有教学内容中的数值、物理量、单位、刻度、结果和读数仍必须从 `Lec` 取得。

## 3. 固定页面结构

所有页面沿用 nn-06 的页面结构，不得自行改成另一套布局：

1. 页面头部：kicker、唯一一个主标题、一个 takeaway。
2. 页面工作区：左侧主视觉，右侧说明和交互区。
3. 页面底部：必要时放一条简短状态、结论或图例。
4. 主视觉只能有一个主叙事焦点。辅助图、标注和状态信息必须服务于同一个概念。
5. 右侧说明区的控件固定放在说明文字之后，不能把控件散落在页面各处。
6. 页面不通过滚动承载正文，不用折叠、裁切或横向滚动隐藏超预算内容。

结构应保持为：

`#stage > main > header + section/work area + footer`

页面必须有唯一一个 `h1`。标题、kicker、takeaway 应由 `Lec.mount()` 统一挂载或填充，不得在不同页面各自发明头部写法。

本页脚本在 `DOMContentLoaded` 中调用一次：

`Lec.mount({index: Number(document.body.dataset.page), kicker: "...", title: "...", take: "..."})`

`kicker`、`title`、`take` 是本页允许变化的标题正文内容。不得绕过 `Lec.mount()` 自己重做页码、总页数或共同头部。

页面专属的视觉 DOM、canvas、说明、控件和事件逻辑放在 `#stage` 内，但不能破坏上述层级和版面职责。

## 4. 版面预算

画布逻辑尺寸为 1600 × 900。每页必须在这个预算内完成，不允许依靠缩小字体、裁掉内容或增加滚动解决溢出。

### 4.1 正文字数上限

每页可见的页面专属正文最多 360 个可见正文字符：

- 中文按汉字计数。
- 英文按字符计数。
- 空白不计。
- 标题、页码、固定 UI 文案、纯动态数值和单位符号不计入正文预算。
- takeaway、段落、说明、提示、图注、图例解释、控件说明、状态解释均计入。
- 不能把本应是正文的内容拆成很多短标签来规避预算。
- 动态数字旁边的解释性文字仍计入。

建议正文只保留：

- 一个核心解释段落。
- 一个操作提示。
- 一个 takeaway。
- 必要的图注或状态解释。

超过 360 个字符时，必须认定为超预算。先删减、改写或拆分教学内容，不得压字号、缩放页面、隐藏文字、设置滚动区域或依赖裁切。

### 4.2 控件数量上限

每页最多 6 个可操作控件。

以下全部计入：

- `button`
- `input`
- `select`
- `textarea`
- checkbox、radio、range
- 可触发动作的链接
- 可独立触发动作的 canvas 热区
- 重置、播放、暂停、随机化、切换、添加、删除等动作
- 每一个具有独立行为的交互区域

纯展示图例、静态标签、非交互装饰不计入，但只要可以点击或改变状态，就必须计入。

Canvas 作为一个整体交互面至少计 1 个控件；canvas 内多个独立动作不能通过合并命名规避上限。

每页至少有一个真正改变教学状态的交互。仅自动播放、悬停变色、指针倾斜、背景粒子、淡入淡出、鼠标跟随和装饰动画不算交互。

如果超过 6 个控件，必须合并同类动作或删减，不得把控件缩小、藏进折叠区或改成无障碍不可见元素。

### 4.3 空间规则

- 主视觉占据工作区的主要面积。
- 说明区必须保留清晰的文字和控件间距。
- 不使用大量绝对定位把元素压到边缘。
- 不使用负 margin、负定位或遮挡来制造“放得下”的假象。
- 不允许元素超出 1600 × 900 的逻辑画布。
- 不允许正文、控件或图注被父元素裁掉。
- flex/grid 子项需要允许收缩时，使用 `min0`。
- 页面没有必要的内容时，不添加空白装饰块填充版面。
- 视觉层次优先于信息密度；宁可删内容，不可塞满。

## 5. 字号和可读性

以下是作者字号的硬下限：

- 刻度、坐标轴刻度、极短的数值刻度：`≥12px`
- 标签、图注、图例文字、控件标签：`≥14px`
- 正文、说明、提示、状态解释：`≥16px`
- 所有正文和说明的行高：`≥1.35`

不要用低于这些下限的字号补偿布局不足。不要通过 `transform: scale()` 缩小文字。不要把文字绘制成小于上述下限的 canvas 字体。

1366 屏上缩放系数约为 0.85，来源是逻辑画布宽度与屏幕宽度的比例：

`1366 / 1600 ≈ 0.854`

保持宽高比时，900 的逻辑高度也会按相近比例显示：

`900 × 0.854 ≈ 769`

因此逻辑画布中的 16px 文字在 1366 宽度下会有约 0.85 倍的物理显示尺寸。这个缩放是整个页面适配造成的，不是降低作者字号的理由。不得为了“适应 1366”把 16px 写成 13px 或更小。

文字必须：

- 使用主题提供的字体。
- 保持正常字重和清晰对比度。
- 不依赖颜色作为唯一信息。
- 不把重要解释只写进 canvas 图像。
- 不把重要文本只放在 hover tooltip 中。
- 不让数值、标签或按钮被省略号截断。
- 不通过 `overflow: hidden` 隐藏文字。

## 6. 主题使用规则

所有视觉样式必须来自 `assets/theme.css` 和 `assets/base.css`。

必须遵守：

- 颜色使用主题已有的 CSS 自定义属性或主题类。
- 字体使用主题已有的字体设置。
- 字号、字重、间距、圆角、边框、阴影、背景和控件风格使用主题已有定义。
- canvas 颜色通过 `Deck.rgb()` 或 `Deck.rgba()` 读取主题色。
- canvas 字体通过 `Deck.token()` 读取主题字体 token，不能另造字体栈。
- 页面不得添加 `<style>`。
- 页面不得添加自己的 CSS 文件。
- 页面不得在 `style=""` 中硬编码颜色、字体、间距、圆角或阴影。
- 不得写新的颜色系统、间距系统、字体系统或组件系统。
- 不得使用 hex、`rgb()`、`rgba()`、渐变色或未在主题中定义的字体作为页面专属视觉值。
- CSS 中若已有对应主题类，优先直接使用；不得复制一份近似样式。
- 不得使用 `!important` 覆盖主题。
- 需要 canvas 颜色时，不能把 `var(--token)` 直接赋给 canvas 的 `fillStyle` 或 `strokeStyle`；必须先用 `Deck.rgb()` 或 `Deck.rgba()` 转换。

## 7. `Lec` 数值契约

所有教学数字一律从 `Lec` 取得，页面不许写死教学数据。

必须遵守：

- 物理常数、单位换算、天文数据、空气模型、轨道数据、速度、能量、质量、时间、距离、压力、温度、引力等从 `Lec.K` 和 `Lec.P` 取得。
- 公式优先调用 `Lec.P`，不得在页面中重复实现已有公式。
- 数值显示使用 `Lec.P.formatNumber()`、`formatFixed()`、`formatDistance()`、`formatDuration()`、`formatEnergy()`、`formatMass()`、`formatTime()`、`formatVelocity()` 等格式化方法。
- 显示精度使用 `Lec.K.DISPLAY_DECIMALS` 或 `Lec.K.PAGE_DIGITS`，不得自行决定精度。
- 单位从 `Lec.K.UNITS` 或对应的 `Lec.K` 常量取得。
- 图表刻度、坐标范围、默认值、阈值、动画中的教学参数和示例数据不得写成散落的 magic number。
- `Math.PI`、固定比例、单位换算因子和物理量不得直接写死，使用 `Lec.K.PI`、其他 `Lec.K` 常量或 `Lec.P` 方法。
- 任何页面中出现的数字都必须能追溯到 `Lec.K`、`Lec.P`、`Deck.W`、`Deck.H` 或用户操作产生的状态。
- 编程语法所需的数组索引、布尔值和循环控制可以使用语言常量；它们不能作为页面内容、教学数据或显示数字。
- 页面不得复制 `lec.js` 中的常量表或函数实现。
- 页面不得为了方便另建一份物理常数对象。

`Lec.mount({index, kicker, title, take})` 必须调用一次。页号使用 `Number(document.body.dataset.page)`；总页数以 `Lec.K.PAGE_TOTAL` 为准。

## 8. Canvas 统一契约

画布必须使用逻辑坐标 1600 × 900，具体尺寸从 `Deck.W` 和 `Deck.H` 读取。页面不得自行写死 canvas 的物理宽高。

### 8.1 高分屏和缩放

canvas 一律走：

- `Deck.fit(cv)`
- 或 `Deck.autofit(cv, draw)`

禁止：

- 自己设置 `canvas.width = clientWidth * devicePixelRatio`
- 自己设置 `canvas.height = clientHeight * devicePixelRatio`
- 自己读取 `devicePixelRatio` 做缩放
- 自己写 `getBoundingClientRect()` 换算画布坐标
- 自己调用 `ctx.scale()` 代替 `Deck.fit()`
- 假设 CSS 像素等于逻辑画布像素

`Deck.fit(cv)` 会完成高分屏适配，并返回已经设置好 transform 的 2D context。

`Deck.autofit(cv, draw)` 会完成首次 fit、首次绘制，并在缩放变化时重新 fit 和重绘。

canvas 元素优先使用 `.cv-fill`，父级需要收缩时使用 `.min0`。触摸交互的 canvas 使用 `.no-pan`，避免页面平移抢走指针事件。

所有绘制坐标使用逻辑坐标，不直接使用屏幕坐标。

### 8.2 指针坐标

指针、触摸和拖拽事件一律通过：

`Deck.pt(el, e)`

返回值是逻辑坐标 `{x, y}`，已经兼容缩放和触摸。

禁止：

- `e.clientX - rect.left`
- `e.pageX - offsetLeft`
- 直接使用 `offsetX`、`offsetY`
- 自己写 `getBoundingClientRect()` 换算
- 自己分别处理鼠标和触摸坐标

拖拽、点击、画布热区、滑动和指针跟随都必须使用 `Deck.pt()`。

### 8.3 动画循环

动画一律通过：

`Deck.loop(fn[, opt])`

`Deck.loop()` 返回 `stop()`，页面不再需要动画时必须停止循环。

禁止：

- 自己调用 `requestAnimationFrame`
- 自己调用 `setInterval`
- 自己调用 `setTimeout` 驱动连续动画
- 多个动画循环重复绘制同一个 canvas
- 让第三方动画库另起一个无法停止的自动循环

`Deck.loop()` 已经处理：

- `requestAnimationFrame`
- reduced-motion
- 标签页隐藏时暂停
- 页面恢复时避免出现异常的大 dt
- reduced-motion 下只绘制一帧

循环回调必须使用 `Deck.loop()` 提供的参数，不能自行推算页面时间。

静态 canvas 也必须至少使用 `Deck.autofit()` 进行适配；不需要动画时不要创建循环。

### 8.4 颜色和主题 token

canvas 取色一律使用：

- `Deck.token(name)`：读取 CSS 自定义属性的原始字符串。
- `Deck.rgb(name)`：读取为 `[r, g, b]`。
- `Deck.rgba(name, a)`：读取为 `rgba(r,g,b,a)`。

canvas 不得直接使用 hex、裸 `rgb()`、裸 `rgba()` 或 CSS `var()` 作为颜色值。

### 8.5 尺寸变化

需要响应尺寸变化时使用：

`Deck.onResize(fn)`

不要重复写 resize 监听、重复做 fit 或重复做 DPR 处理。若已经使用 `Deck.autofit()`，不得再实现一套相同的 resize 适配逻辑。

## 9. Reduced-motion 契约

页面必须检查并尊重减少动态的系统设置：

`Deck.reduced()`

在 reduced-motion 状态下：

- 不播放连续运动、粒子、闪烁、呼吸、镜头摇摆或路径动画。
- 直接显示稳定且信息完整的静态状态。
- 不把关键结论只放在动画过程里。
- 交互仍然可用，用户操作后可以立即重绘结果。
- 第三方动画库的 autoplay、loop 和过渡必须关闭或改为即时状态切换。
- 不因为关闭动画而删除说明、结果或控件。
- `Deck.loop()` 会只绘制一帧，但页面逻辑仍必须保证初始画面可读。

动画不是交互的替代品。用户即使关闭动态，也必须能通过控件或键盘获得全部核心信息。

## 10. 键盘可达和无障碍

所有真实交互必须键盘可达。

必须遵守：

- 优先使用原生 `button`、`input`、`select`、`label`。
- 每个控件有可见文字或有效的 `aria-label`。
- 输入控件必须有对应 `label`。
- 按钮必须能用 Enter 或 Space 激活。
- range、checkbox、radio 和 select 必须使用浏览器原生键盘行为。
- canvas 不能只通过鼠标使用。
- canvas 上的每个核心操作必须提供等价的键盘控件。
- 不能只给 canvas 加 `tabindex` 就声称键盘可达。
- 所有可聚焦元素必须有清晰的主题 focus 样式。
- 不得以颜色、hover、拖拽速度或动画作为唯一反馈。
- 动态结果区域必要时使用 `aria-live="polite"`，不要让每帧数值都触发屏幕阅读器播报。
- 交互状态、选中状态和禁用状态必须能被非视觉方式识别。
- 不使用 `onclick` 作为唯一事件入口；使用事件监听并保留键盘路径。

## 11. 交互标准

### 11.1 真交互

以下条件同时满足时，才算真交互：

1. 用户有明确可识别的操作入口。
2. 操作会改变页面内部状态、参数、视图或计算结果。
3. 改变会在页面上产生可观察的反馈。
4. 反馈与教学内容有关，而不是只改变装饰。
5. 操作可重复，并且初始状态确定。
6. 操作有键盘等价路径。
7. 必要时提供重置或恢复初始状态的方式。

例如：

- 拖动物体改变位置并重新计算碰撞或轨迹。
- 修改参数后图形、结果和说明同步变化。
- 点击步骤按钮推进到下一教学状态并显示新的因果关系。
- 切换观测量后坐标轴、数值和图形同步更新。
- 训练按钮推进模型并更新损失、准确率或决策边界。

### 11.2 装饰

以下只能算装饰，不能作为页面唯一交互：

- 自动播放的背景动画。
- hover 时改变颜色或轻微放大。
- 指针跟随倾斜。
- 无状态变化的闪烁、粒子、渐变或噪声。
- 只改变视觉皮肤、不改变教学信息。
- 只在加载时淡入。
- 只提供鼠标 tooltip。
- 只播放一次的入场动画。

页面可以有装饰，但装饰不能占用主要布局预算，也不能代替真实交互。

## 12. 库的使用和加载顺序

库已经预置在 `assets/lib/`，不需要下载、复制或检查。页面直接使用 UMD 脚本，相对 `pages/` 引用。

可选库脚本放在 `#stage` 内页面脚本之前。页面脚本必须在所有需要的库之后。页面代码在 `DOMContentLoaded` 中初始化，确保 `base.js` 和 `lec.js` 已经加载。

引用格式统一为：

`<script src="assets/lib/xxx.js"></script>`

只加载本页实际使用的库，不为了“备用”加载全部库。

依赖顺序必须遵守：

- `three.min.js` 必须先于 `globe.gl.min.js`。
- `three.min.js` 必须先于 `vanta.net.min.js`。
- `gsap.min.js` 必须先于 `ScrollTrigger.min.js`。
- 其他库按自身单文件依赖执行；不得改变 UMD 文件内容。
- 页面自己的初始化脚本最后执行。

版本以 `assets/lib/LIBS.md` 的记录和本契约为准，不要到压缩后的库文件里查版本号。尤其不要在 `three.min.js` 中搜索版本。不要使用 CDN、远程模块或未预置的在线资源。

库与版本：

| 用途 | 引用 | 全局对象 | 版本 |
|---|---|---|---|
| 物体下落、碰撞、摆动、堆叠、拖拽、约束 | `assets/lib/matter.min.js` | `Matter` | Matter.js 0.20.0 |
| 三维场景、立体结构、光照材质 | `assets/lib/three.min.js` | `THREE` | three r160 / 0.160.1 |
| 三维地球、球面点、弧线、区块 | `assets/lib/globe.gl.min.js` | `Globe` | globe.gl 2.32.0 |
| 生成式动画背景 | `assets/lib/vanta.net.min.js` | `VANTA` | Vanta 0.5.24 |
| 节点连线图、矢量图形、数据绑定 | `assets/lib/d3.min.js` | `d3` | d3 7.9.0 |
| 大量元素同时运动 | `assets/lib/pixi.min.js` | `PIXI` | PixiJS 7.4.2 |
| 分步动画、路径描绘、形变 | `assets/lib/anime.min.js` | `anime` | anime.js 3.2.2 |
| 多动画时间线 | `assets/lib/gsap.min.js` | `gsap` | GSAP 3.12.5 |
| 动画进度绑定滚动位置 | `assets/lib/ScrollTrigger.min.js` | `ScrollTrigger` | GSAP 3.12.5 |
| 播放矢量动画文件 | `assets/lib/lottie.min.js` | `lottie` | lottie-web 5.12.2 |
| 伪三维插画 | `assets/lib/zdog.min.js` | `Zdog` | Zdog 1.1.3 |
| 指针倾斜 | `assets/lib/vanilla-tilt.min.js` | `VanillaTilt` | vanilla-tilt 1.8.1 |
| 进入视野淡入 | `assets/lib/aos.js` | `AOS` | AOS 2.3.4 |
| 页面实时训练小型二分类网络 | `assets/lib/mlp.js` | `MLP` | 自家维护，无版本号 |
| 预训练模型、卷积、GPU 大矩阵 | `assets/lib/tf.min.js` | `tf` | TensorFlow.js 4.22.0 |

three r160 使用 `outputColorSpace`，不是 `outputEncoding`。

anime.js 使用 3.2.2 API：

`anime({targets: ...})`

不要使用 anime.js v4 的 `animate()` API。

### 12.1 `MLP` 使用边界

`mlp.js` 适用于页面内实时训练的小型二分类网络：

- 任意层数。
- 任意输入维度。
- 单个 sigmoid 输出。
- 交叉熵损失。
- `act` 只能是 `tanh`、`relu`、`sigmoid`。
- 不支持多分类、softmax、回归、卷积、动量或 Adam。

小网络实时训练优先使用 `MLP`，不要因为代码更短就加载 TensorFlow.js。

`net.diverged` 只表示 NaN、Inf 或权重超过上限的数值崩溃，不代表学习率太大却没有学会。学习效果必须通过 `net.evaluate(...).acc` 等结果判断。

### 12.2 TensorFlow.js 使用边界

两三层的小网络实时训练禁止使用 `tf.min.js`。这类任务优先使用 `MLP`。

只有以下情况才使用 TensorFlow.js：

- 加载预训练模型。
- 在真实图片上运行卷积网络。
- 矩阵规模确实需要 GPU。
- 手写实现明显不可行或明显过慢。

使用 TensorFlow.js 时：

- 每一步使用 `tf.tidy(() => ...)` 或手动 `dispose()`。
- 通过 `tf.memory().numTensors` 检查张量数量不会持续增长。
- 不要在每帧大量 `dataSync()` 把结果读回 CPU。
- 不要把 TensorFlow.js 用作小型演示网络的默认方案。

## 13. 页面脚本规则

页面脚本必须：

- 只操作本页 `#stage` 内的节点。
- 不查询、读取或依赖其他页面。
- 不覆盖 `window` 上的共享对象。
- 不修改 `Deck`、`Lec` 或主题 token。
- 不将页面状态写入全局污染其他模块。
- 初始化一次，不重复绑定事件。
- 有确定的初始状态。
- 用户输入、计算、绘制和状态文本保持同步。
- 对非法输入、空值、NaN、Infinity 和越界值做处理。
- 使用 `Lec.P.isFinite()`、`isNonNegative()`、`isPositive()` 或 `Lec.P.clamp()` 等已有方法时优先使用已有方法。
- 不复制共享工具函数；可以使用 `Deck.clamp`、`Deck.lerp`、`Deck.fmt`、`Deck.rr`、`Deck.arrow`。

数字格式、单位、计算和边界判断必须集中使用 `Lec` 或 `Deck`，不得散落页面自定义实现。

## 14. 页面交付限制

交付物只有：

`pages/page-NN.html`

不得交付：

- README
- 说明文档
- 测试文件
- 截图
- 总结
- 额外 CSS
- 额外 JS
- 新下载的库
- 资源副本
- CDN 地址
- 其他页面文件

页面专属代码必须内嵌在本页 HTML 中。页面专属图片、数据或字体不应新增；优先使用已有主题、canvas 绘制和 `Lec` 数据。

## 15. 完工前自检

在 `pages/` 目录执行：

`python3 assets/selfcheck.py page-NN.html`

该工具会在 1600 × 900 的真实浏览器渲染环境中检查并报告：

- JavaScript 错误。
- 资源加载失败。
- 元素超出画布。
- 元素被父级裁掉。
- 字号最小值。
- 字号中位数。

判定标准：

- JavaScript 错误为 0。
- 资源加载失败为 0。
- 超出画布的元素为 0。
- 被裁掉的元素为 0。
- 刻度字号不得低于 12px。
- 标签和图注字号不得低于 14px。
- 正文字号不得低于 16px。
- 正文及说明行高不得低于 1.35。
- 正文文本的中位字号不得低于 16px；不得通过增加大量小字号标签稀释报告。
- 所有控件在 1600 × 900 和约 1366 宽度缩放下均可见、可操作。
- 所有核心交互均有键盘路径。
- reduced-motion 下页面仍显示完整、稳定、可操作的状态。
- 页面没有依赖控制台警告、网络资源或其他页面才能工作。

自检工具只报告，不会改文件。出现任何问题时必须修改自己的 `page-NN.html`，重新运行同一命令，并持续修改到结果干净为止。

超出正文或控件预算也视为未完成，即使 `selfcheck.py` 没有报告该项。不得以压字号、压间距、裁切、遮挡、滚动、折叠或隐藏来规避契约。