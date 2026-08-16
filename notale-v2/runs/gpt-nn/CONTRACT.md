# 页面构建契约

## 1. 工作边界

- 只创建或修改自己负责的 `pages/page-NN.html`。
- 不读取、不搜索、不比较任何其他 `page-*.html`；不得用其他页面作为模板。
- 只以 `CONTRACT.md`、`PLAN.md`、`assets/theme.css`、`assets/lec.js` 及本契约转述的 `base.css` / `base.js` 接口为依据。
- 不修改 `PLAN.md`、`assets/`、公共脚本、公共样式或库文件。
- 不创建页面专用 CSS、JS、JSON、图片、字体、测试、截图、说明或其他资源；页面专用样式和逻辑全部内联在这一份 HTML 中。
- 每个 HTML 必须能通过 `file://` 直接打开并完整显示、交互。所有资源使用相对路径，禁止 CDN、网络字体、远程图片和网络请求。
- `PLAN.md` 与本契约冲突时，以本契约为准；无法在预算内完成时明确报告超出项，不得偷偷压缩字号、裁切内容或改变公共结构。

## 2. 固定画布与公共结构

- 逻辑画布固定为 `1600 × 900`。
- 页面不得产生横向或纵向滚动。
- harness 已创建固定骨架。只能向 `#stage` 内添加页面内容，不得移动、删除、替换或重排骨架中的节点、属性及两个公共脚本。
- 不自行制作页眉、标题栏、页码、总页数、进度、页脚或导航；这些统一交给 `Lec.mount`。
- `Lec.mount` 每页只调用一次，只使用其实际提供的接口，不猜测未公开 API，不依赖其返回值。
- `data-page` 使用两位页号 `NN`；`Lec.mount` 的 `index` 使用不带前导零的十进制页号 `N`；`data-total` 固定为 `24`。

每页必须照抄以下骨架，只替换页号、`kicker`、标题、`take`、正文、必要的库引用及页面内部逻辑：

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="24">
      <div id="stage">
        <style>
          /* 页面专用规则；选择器必须限定在 #stage 下 */
        </style>

        <main id="page-content" class="min0" aria-label="本页正文">
          <!-- 只在这里放本页正文、图形、控件和可访问说明 -->
        </main>

        <!-- 仅按需加入本地库；必须使用 defer，并遵守依赖顺序 -->
        <!-- <script defer src="assets/lib/xxx.js"></script> -->

        <script>
          (function () {
            'use strict';

            function boot() {
              Lec.mount({
                index: N,
                kicker: 'KICKER',
                title: 'TITLE',
                take: 'TAKE'
              });

              /* 本页初始化逻辑 */
            }

            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', boot, { once: true });
            } else {
              boot();
            }
          }());
        </script>
      </div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

## 3. 版面预算

以下为硬上限，不是建议：

- `kicker`：最多 14 个汉字等价字符。
- 标题：最多 22 个汉字等价字符，最多两行。
- `take`：最多 50 个汉字等价字符，最多两行。
- 正文总量：最多 300 个汉字等价字符。
- 正文中的拉丁文字按“一个单词等于两个汉字等价字符”计算；标点计入字符数。
- 正文预算包括段落、说明、提示、结论、卡片文案和控件帮助文字；不包括标题、`kicker`、`take`、坐标刻度、单位及简短图例。
- 同时可见的可操作控件最多 6 个。
- 每个可聚焦按钮、链接、滑块、输入框、选择框、复选框、单个单选按钮及可交互画布各计一个控件；非聚焦的只读数值输出不另计。
- 只允许一个主要交互任务。多个控件必须共同解释同一个教学关系，不得并列堆放互不相关的小组件。
- 核心结论不得藏在滚动区、悬停提示、折叠层或页面外。
- 超出预算时，先删减、合并和改写；仍无法满足时报告“超出版面预算”及具体超出项。
- 禁止通过减小字号、减小行高、负间距、整体 `transform: scale()`、浏览器缩放、裁切、遮盖或 `overflow: hidden` 把超量内容塞入页面。
- Flex/Grid 中可能收缩的子项必须加 `.min0`。不得用裁切掩盖缺少 `.min0` 导致的溢出。

## 4. 字号与行高下限

所有数值均为 `1600 × 900` 逻辑画布上的 CSS 像素：

- 坐标轴刻度、表格刻度、微型数值刻度：不得小于 `12px`。
- 标签、图例、图注、单位、状态说明：不得小于 `14px`。
- 正文、控件文字、按钮文字、输入值：不得小于 `16px`。
- 正文及连续说明文字的 `line-height` 不得小于 `1.35`。
- SVG `<text>`、Canvas 绘制文字及库生成文字同样受以上下限约束。
- 标题、`kicker`、`take` 使用主题既定字号，不得自行缩小。
- 隐藏文字必须使用 `.sr-only`，不得用极小字号规避检查。

典型 `1366 × 768` 屏幕显示整张逻辑画布时，缩放比为：

`min(1366 / 1600, 768 / 900) = min(0.85375, 0.85333) ≈ 0.85`

因此上述字号下限是在缩放前为 1600 逻辑画布预留的最低值；不得因为开发机较大而继续降低。

## 5. 主题使用

- 所有颜色、字体、字号层级、圆角、阴影、边框和间距必须取自 `assets/theme.css` 已定义的 CSS 自定义属性或公共类。
- 编写页面前先读取 `assets/theme.css` 中实际存在的 token；不得猜测 token 名。
- 禁止在页面中另建一套颜色、字体或间距体系。
- 禁止写死十六进制色、`rgb()`、`hsl()`、命名颜色或页面私有调色板。
- 禁止写死 `font-family`。
- 页面局部变量只能引用主题变量，例如 `--page-accent: var(--已有主题变量)`；不得在局部变量中放入新的颜色值。
- CSS 变量不得使用硬编码颜色或字体作为 fallback。
- 几何计算所需的百分比、网格比例和 Canvas 坐标不属于主题间距；视觉留白、组件内边距和组件间距仍必须使用主题 token。
- 页面专用 CSS 的选择器必须以 `#stage` 开头，避免污染公共结构。
- Canvas 不能直接解析 `var(...)`，必须通过 `Deck.rgb`、`Deck.rgba` 或 `Deck.token` 读取主题。

## 6. 数字与内容数据

- 所有具有教学语义、会显示给读者或会影响教学结论的数字，一律从 `Lec` 提供的数据或接口取得；页面不得在 HTML、CSS、JS、SVG 路径标签或 Canvas 文本中另写一份。
- 页码、总页数和进度只由固定 `data-page`、`data-total` 与 `Lec.mount({ index })` 驱动，不得手写可见页码。
- 不得把指标值、样本量、百分比、阈值、刻度值、初始参数、单位值或答案直接写成字符串。
- 格式化显示值时使用公共格式化能力，例如 `Deck.fmt`；不得为同一数值维护“计算值”和“显示字符串”两份来源。
- `index: N`、`data-page="NN"`、`data-total="24"` 是模板元数据例外。
- Canvas 坐标、数组索引、透明度、插值系数和内部循环次数等没有教学语义、不会直接显示的实现常量可以写在页面逻辑中。
- `assets/lec.js` 未提供 PLAN 所需的教学数字时，不得自行补写或猜测；报告缺失数据。

## 7. `base.css` 与 `base.js` 公共能力

`assets/base.css` 已提供：

- `.min0`：允许 Flex/Grid 子项收缩，防止内容被静默裁掉。
- `.cv-fill`：Canvas 铺满父容器。
- `.no-pan`：触摸交互时禁止页面平移。
- `.sr-only`：只对辅助技术可见。

`assets/base.js` 已提供：

- `Deck.W` / `Deck.H`：逻辑画布尺寸。
- `Deck.s`：当前缩放比。
- `Deck.fit(cv)`：Canvas 高分屏适配，返回已执行 `setTransform` 的 2D context。
- `Deck.autofit(cv, draw)`：执行 fit、首次绘制，并在缩放变化时重新 fit 和重绘。
- `Deck.pt(el, e)`：把指针或触摸事件转换为逻辑坐标 `{x, y}`。
- `Deck.token(name)`：读取 CSS 自定义属性原始字符串。
- `Deck.rgb(name)`：读取主题颜色为 `[r, g, b]`。
- `Deck.rgba(name, a)`：读取主题颜色为 `rgba(r,g,b,a)`。
- `Deck.reduced()`：读取系统减少动态偏好。
- `Deck.loop(fn[, opt])`：统一的 `requestAnimationFrame` 循环，返回 `stop()`；减少动态时只调用一帧 `fn(opt.still || 0, 0)`；标签页隐藏时自动暂停，恢复后不会产生异常 `dt`。
- `Deck.onResize(fn)`：注册尺寸变化回调并返回注销函数。
- `Deck.clamp`、`Deck.lerp`、`Deck.fmt`、`Deck.rr`、`Deck.arrow`：公共数学和绘图工具。

以下四条没有例外：

- Canvas 一律走 `Deck.fit` 或 `Deck.autofit`。
- 指针坐标一律走 `Deck.pt`。
- 动画循环一律走 `Deck.loop`。
- Canvas 取色一律走 `Deck.rgb`、`Deck.rgba` 或 `Deck.token`。

禁止：

- 自己读取 `devicePixelRatio` 并设置 Canvas 像素尺寸。
- 自己用 `getBoundingClientRect()` 换算指针坐标。
- 自己调用 `requestAnimationFrame` 建立循环。
- 用 `setInterval` 或递归 `setTimeout` 驱动视觉动画。
- 在 Canvas 中写死颜色。
- 用普通 `window.resize` 监听代替 `Deck.autofit` 或 `Deck.onResize`。

## 8. Canvas 与图形适配

- Canvas 默认同时使用 `.cv-fill` 和 `.no-pan`。
- 绘图使用逻辑坐标，不把设备像素比混入模型、命中区域或标签位置。
- 静态或按事件重绘的 Canvas 优先使用 `Deck.autofit(cv, draw)`。
- 连续动画 Canvas 在初始化和尺寸变化时调用 `Deck.fit`，帧更新和绘制由 `Deck.loop` 驱动。
- 缩放变化后必须重新计算依赖可视尺寸的布局、命中区域和文字排版。
- 命中测试使用 `Deck.pt` 返回的逻辑坐标，不混用 `clientX`、`offsetX`、设备像素和逻辑像素。
- 使用 Pointer Events，不分别维护互相偏离的鼠标与触摸逻辑。
- 拖拽应使用 `setPointerCapture` / `releasePointerCapture`，并处理 `pointercancel`。
- Canvas 标签、刻度和图注必须满足字号下限，且在 1600 × 900 渲染时不重叠、不越界。
- 不得通过降低 Canvas 内部字体或省略必要标签来通过版面检查。

## 9. 动画与减少动态

- 页面状态更新和持续渲染统一由 `Deck.loop` 驱动。
- 调用动画库不豁免 `Deck.loop`；禁止让库启动无法暂停、无法感知可见性或无限自启的独立循环。
- 事件触发的有限 DOM 过渡可以使用动画库，但必须提供 `Deck.reduced()` 分支。
- `Deck.reduced()` 为真时：
  - 不播放装饰性循环、粒子漂移、抖动、自动旋转、视差或连续镜头运动。
  - 不使用闪烁和快速缩放。
  - 直接绘制稳定的初始态或最终态。
  - 所有教学信息和交互结果仍然可见。
  - CSS 动画与过渡通过 `prefers-reduced-motion: reduce` 禁用或立即完成。
- 不得以“减少动态”为由删除内容、禁用关键控件或让图形空白。
- 标签页隐藏和恢复由 `Deck.loop` 处理，不再自行实现暂停逻辑。

## 10. 指针与键盘可达性

- 优先使用原生 `<button>`、`<input>`、`<select>`、`<fieldset>`、`<legend>` 和 `<output>`。
- 每个控件必须有可读名称；使用可见 `<label>`，必要时补充 `aria-label` 或 `aria-describedby`。
- 不得用 `<div>` 或 Canvas 区域模拟按钮而不给键盘等价操作。
- 可交互 Canvas 必须：
  - 可聚焦，通常使用 `tabindex="0"`。
  - 提供准确的 `role` 和 `aria-label`。
  - 提供与指针操作等价的键盘操作。
  - 用方向键调整连续位置或参数。
  - 用 Enter/Space 执行主要动作、切换或确认。
  - 提供明显的主题化焦点样式。
  - 在 Canvas 外提供可读的当前状态或结果；动态状态使用适当的 `<output>` 或 `aria-live`。
- 拖拽不是唯一操作方式；必须同时提供键盘移动、原生范围控件或等价按钮。
- Hover 不能承载唯一信息；提示必须能通过键盘焦点和触摸获得。
- 状态差异不能只依赖颜色，还应使用文字、形状、线型、位置或图案。
- 禁止移除焦点轮廓而不提供等价的主题化焦点指示。

## 11. 什么算真实交互

真实交互必须同时满足：

- 用户通过指针、触摸或键盘主动改变一个有教学意义的输入或模型状态。
- 主图、模型、关系、结果或解释立即随状态改变。
- 页面清楚显示当前状态及其影响。
- 操作可重复，且有明确的恢复、重置或反向操作方式。
- 交互直接服务于 `PLAN.md` 指定的本页学习目标。

以下不算真实交互：

- 自动播放动画。
- 纯装饰粒子、漂浮背景、呼吸光、闪烁或循环转动。
- 只有 Hover 才出现的装饰效果。
- 元素随指针倾斜但不改变教学状态。
- 点击后只改变颜色、阴影或大小。
- 与内容无关的拖拽、碰撞或小游戏。
- 无反馈、死按钮、伪滑块或无法改变结果的控件。
- 只能观看、不能操纵的时间线。

静态页面若 `PLAN.md` 未要求交互，不得为了“看起来互动”添加无意义控件。

## 12. 本地库引用

- 只引用页面实际需要的库，不得把所有库全部加载。
- 引用形式固定为：

  `<script defer src="assets/lib/文件名.js"></script>`

- 相对路径以 `pages/` 为起点。
- 库引用放在 `#stage` 内、页面初始化脚本之前，并使用 `defer`。
- 依赖库必须先写，依赖它的库后写：
  - `three.min.js` 在 `globe.gl.min.js` 之前。
  - `three.min.js` 在 `vanta.net.min.js` 之前。
  - `gsap.min.js` 在 `ScrollTrigger.min.js` 之前。
- 页面初始化只在 `DOMContentLoaded` 后执行，确保固定的 `base.js`、`lec.js` 和所有 defer 库均已可用。
- 禁止 CDN。
- 禁止修改、复制或重新打包已有库。
- 本任务只允许交付一个 HTML，因此页面 agent 不得自行下载额外库或创建额外文件。确需额外库时先报告，由公共环境统一提供。

按用途选择：

| 用途 | 文件 | 全局对象 |
|---|---|---|
| 下落、碰撞、摆动、堆叠、拖拽、约束 | `assets/lib/matter.min.js` | `Matter` |
| 三维场景、立体结构、光照材质 | `assets/lib/three.min.js` | `THREE` |
| 三维地球、球面点、弧线、区块 | `assets/lib/globe.gl.min.js` | `Globe` |
| 生成式 NET 背景 | `assets/lib/vanta.net.min.js` | `VANTA` |
| 节点连线、矢量图形、数据绑定 | `assets/lib/d3.min.js` | `d3` |
| 大量元素同时运动 | `assets/lib/pixi.min.js` | `PIXI` |
| 分步动画、路径描绘、形变 | `assets/lib/anime.min.js` | `anime` |
| 多动画时间线 | `assets/lib/gsap.min.js` | `gsap` |
| 滚动绑定动画 | `assets/lib/ScrollTrigger.min.js` | `ScrollTrigger` |
| 播放矢量动画文件 | `assets/lib/lottie.min.js` | `lottie` |
| 伪三维插画 | `assets/lib/zdog.min.js` | `Zdog` |
| 指针倾斜 | `assets/lib/vanilla-tilt.min.js` | `VanillaTilt` |
| 进入视野淡入 | `assets/lib/aos.js` | `AOS` |
| 实时训练小型二分类网络 | `assets/lib/mlp.js` | `MLP` |
| 预训练模型、卷积、大型 GPU 矩阵 | `assets/lib/tf.min.js` | `tf` |

## 13. 库版本

版本信息只以 `assets/lib/LIBS.md` 为准。不要打开或搜索压缩库来推断版本；压缩构建中经常没有可检索版本号。

| 文件 | 固定版本 |
|---|---|
| `three.min.js` | three r160 / 0.160.1，使用 `outputColorSpace`，不使用 `outputEncoding` |
| `matter.min.js` | Matter.js 0.20.0 |
| `d3.min.js` | d3 7.9.0 |
| `pixi.min.js` | PixiJS 7.4.2 |
| `anime.min.js` | anime.js 3.2.2，使用 `anime({ targets: ... })`，不是 v4 `animate()` |
| `gsap.min.js` | GSAP 3.12.5 |
| `ScrollTrigger.min.js` | GSAP ScrollTrigger 3.12.5 |
| `globe.gl.min.js` | globe.gl 2.32.0 |
| `vanta.net.min.js` | Vanta 0.5.24，仅 NET |
| `lottie.min.js` | lottie-web 5.12.2 |
| `zdog.min.js` | Zdog 1.1.3 |
| `vanilla-tilt.min.js` | vanilla-tilt 1.8.1 |
| `aos.js` | AOS 2.3.4 |
| `mlp.js` | 自家维护，无版本号 |
| `tf.min.js` | TensorFlow.js 4.22.0 |

## 14. `mlp.js` 与 TensorFlow.js 边界

- 两三层、少量样本、页面内逐帧训练的小型二分类网络优先使用 `mlp.js`，不得为此加载 `tf.min.js`。
- `mlp.js` 支持任意层数、任意输入维度、单个 sigmoid 输出的二分类；不支持多分类、回归、卷积、动量或 Adam。
- 样本格式固定为 `{ x: […], t: 0|1 }`，输入长度必须等于 `sizes[0]`。
- `net.diverged` 只表示 NaN、Inf 或权重超过上限等数值崩溃；学习率过大但准确率停在随机水平不一定会触发它。学习是否成功必须检查 `net.evaluate(...).acc` 和损失。
- `tf.min.js` 只用于预训练模型、真实图片卷积或足够大的 GPU 矩阵。
- 使用 TensorFlow.js 时，每一步必须放入 `tf.tidy(() => …)` 或显式 `dispose()`。
- 必须检查 `tf.memory().numTensors` 不会持续增长。
- 不得为了少写几十行代码而牺牲帧预算。

## 15. 完工前自检

环境已安装 `node`、带 NumPy 的 `python3`、`playwright` 和 `chromium`。不得花时间检查是否安装，也不得安装替代品。

在 `pages/` 目录运行：

`python3 assets/selfcheck.py page-NN.html`

该工具会按 `1600 × 900` 真实渲染并报告：

- JavaScript 错误。
- 资源加载失败。
- 元素超出画布。
- 元素被裁掉。
- 字号最小值。
- 字号中位数。

通过判据：

- JavaScript 错误为零。
- 资源加载失败为零。
- 超出画布的元素为零。
- 被裁掉的元素为零。
- 所有字体满足本契约分类下限。
- 无内容重叠、遮挡、不可读或依赖滚动。
- 控件可由指针、触摸和键盘完成主要操作。
- 可交互 Canvas 可聚焦且有键盘等价操作。
- `Deck.reduced()` 分支能显示完整稳定状态。
- 页面通过 `file://` 直接打开时可显示并交互。
- 浏览器控制台无错误、未处理 Promise rejection 和无意义调试输出。

`selfcheck.py` 只报告，不修改文件。发现任何问题后必须修改 HTML、重新运行，并重复到结果干净为止。不得把警告、裁切或字号问题解释为“可接受”。

## 16. 交付

- 只交付 `pages/page-NN.html`。
- 不交付 README、说明文档、测试文件、截图、报告、变更记录或总结。
- 不修改任何其他文件。
- 不附带实现说明或验收说明。