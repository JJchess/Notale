# CONTRACT.md —— 48 页共用的页面构建契约

## 1. 文件边界

- 你只构建 `PLAN.md` 指定的那一页，只写 `pages/page-NN.html`。
- 绝不读取、打开、搜索、复制或比较任何其他 `page-*.html`。
- 只可读取本契约、`PLAN.md`、`assets/theme.css`、`assets/lec.js`、本契约点名的技法文档与库接口文档。
- 不修改任何共享文件，不新建页面专属 CSS、JS、图片、数据、测试或说明文件。
- 每个 HTML 必须自包含，使用相对路径，直接以 `file://` 打开即可显示并交互；禁止 CDN、网络请求和运行时下载。
- 若要求无法在单页预算内完成，明确判定“超出单页预算”，等待拆页；不得擅自缩字号、挤间距或删掉关键解释。

## 2. 受众与授课场景

读者是大学一年级通识课学生，专业背景文理兼有，不假定具备微积分或生物学基础。页面同时服务于：

1. 课堂授课：教师带着讲，页面应让关系、变化和结论一眼可见。
2. 课后重看：没有教师在场时，学生仍能根据页面上的短说明复原核心逻辑。

硬性语言标准：

- 使用现代、直接、具体的中文，不使用论文腔、宣传腔或对读者施压的口气。
- 首次出现的专业术语必须就地用一句短话展开；不可只给缩写或默认学生知道。
- 需要微积分、生物学或其他专业前置知识才能理解的表述，必须改写成直观关系、有限步骤或可操作观察。
- 每个说明句只承担一个主要意思，单句原则上不超过 32 个汉字；确需更长时拆句。
- 操作提示使用平等、明确的动词，如“拖动滑块，观察曲线怎样变化”，不用“显然”“不难发现”“你应该知道”。
- 不用大段定义替代图示，不用比喻替代真实机制；比喻出现时必须说明它对应什么、不能解释什么。
- 结论必须在允许的交互范围内始终成立。不得用固定文案描述只在某个初始状态成立的结果。
- 页面只讲一个中心问题；标题、图示、交互和结论必须围绕同一问题。

## 3. HTML 骨架

照抄以下骨架。只替换 `NN`、标题字段、页内正文与本页确实需要的本地库引用。不得改变既有标签顺序、共享资源路径或基础结构。

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>本页标题</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body data-page="NN" data-total="48">
  <div id="stage">
    <!-- 只在这里加入本页内容 -->
  </div>

  <!-- 只引用本页确实使用的预置库；依赖库必须排在使用者之前 -->

  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>
  <script>
    Lec.mount({
      index: NN,
      kicker: 'PLAN.md 指定的栏目短题',
      title: '本页标题',
      take: '本页唯一核心结论'
    });

    Deck.init({ index: NN, total: 48 });

    // 本页逻辑
  </script>
</body>
</html>
```

- 页面只往 `#stage` 里加内容。
- 页眉页脚由 `Lec.mount()` 负责生成，`theme.css` 负责外观与占位高度。
- `Lec.mount()` 生成的类名只有 `.lec-header`、`.lec-footer`、`.lec-root`、`.lec-page`。不得改名、重复生成或覆盖这些类的样式。
- 页面自己的内容区是 `#stage` 减掉页眉和页脚后剩余的区域。版心按 `theme.css` 给定的内容区 `1408×620`、页眉 `96`、页脚 `88` 排布，不自行测量或发明另一套尺寸。
- 逻辑画布固定为 `1600×900`。

## 4. 版面预算

以下均为硬上限，页眉、页脚、图表、刻度、图例、控件、读数、提示与隐藏后显示的交互状态全部计入。

| 项目 | 硬上限 |
|---|---:|
| 成句正文总量 | 420 个汉字；英文页面对应 260 words |
| 单个正文段落 | 90 个汉字 |
| 正文段落 | 5 段 |
| 同时可见的交互控件 | 4 个 |
| 同时可见的主要读数 | 6 个 |
| 页面文本元素总数 | 64 个 |
| 图例项目 | 6 个 |
| 同一坐标轴可见刻度标签 | 8 个 |
| 并列卡片或同级项目 | 5 个 |

“文本元素”包括标题、正文段落、列表项、按钮文字、控件标签、读数、图注、图例、轴名、每个可见刻度和图形内部标注。一个 DOM 文本节点或 SVG 文本项按一个元素计；不得通过把多个无关标签拼成一个节点规避计数。

超出任一上限时：

1. 先删除重复说明、冗余图例和可由位置直接表达的标签。
2. 再合并读数，并让图表库自动抽稀刻度。
3. 仍超限则判定必须拆页。
4. 禁止通过缩小字号、压缩行高、负间距、裁切、滚动区、悬浮后才显示关键说明等方式塞入单页。

## 5. 字号与可读性地板

- 纯数字或“数字＋单位”的刻度：不得小于 `12px`。
- 标签、图注、图例、控件标签、短提示：不得小于 `14px`。
- 成句正文、按钮中的完整句子、tooltip 中的解释：不得小于 `16px`。
- 正文默认使用主题的 `--fs-body:18px`。
- 标签默认使用 `--fs-label:15px`。
- 纯数字刻度默认使用 `--fs-tick:13px`。
- 所有成句文字行高不得小于 `1.35`。
- KaTeX 基准字号统一不小于 `20px`。
- 不得用 CSS transform 单独缩小文字来绕过字号检查。

画布逻辑尺寸为 `1600×900`。在常见的 `1366×768` 屏幕上，等比缩放系数约为：

`min(1366/1600, 768/900) ≈ 0.853`

因此逻辑字号 `16px` 实际显示约为 `13.6px`。字号地板是在缩放前的逻辑尺寸上规定的，已考虑这一缩放损失，不得再向下压缩。

## 6. 主题与结构

所有颜色、字体、字号、间距、边框、阴影和组件外观必须从 `assets/theme.css` 已有 token 与 class 取得。禁止自创另一套视觉系统，禁止在页面中写与主题竞争的全局样式。

`theme.css` 提供：

```text
token   --fs-body 18      正文(默认);成句文字只许用 body / lead / sec
token   --fs-label 15     控件标签、图例、操作提示
token   --fs-tick 13      纯数字刻度,只有数字和单位时才可以用

版心     内容区 1408×620,页眉 96 / 页脚 88 —— 照这个排,不要自己量

骨架     .k-process        把「先后 / 因果」显式化:横向分段 + 段间箭头,
                            当前段高亮,已过的段降饱和
骨架     .k-comparison     把「同一维度上的差异」显式化:对齐的行列 +
                            共同基准轴,差异列加底色
骨架     .k-classification 把「归属」显式化:嵌套包含框,层级靠缩进和边框粗细
骨架     .k-generalization 把「主张—支撑」显式化:主干居中,分支向外,
                            支撑在视觉上从属于主张
骨架     .k-enumeration    把「同级并列」显式化:统一的项模板,不暗示顺序

组件     .panel            读数面板
组件     .ctl              控件行
组件     .note             图注
```

按信息关系选骨架，不按装饰偏好选：

- 先后或因果：`.k-process`
- 同一维度比较：`.k-comparison`
- 归属和层级：`.k-classification`
- 主张与支撑：`.k-generalization`
- 无顺序的同级并列：`.k-enumeration`

## 7. 数字与计算

- 科学量、计算结果、换算值、比例、时间、距离、速度、能量、百分比与格式化显示一律从 `Lec.P` 取得，页面不得写死计算结果。
- 页面页号、总页数、HTML 尺寸、库配置、无量纲控件边界和数组索引不属于展示结果，可按契约或 `PLAN.md` 写入。
- 输入常量只可来自 `PLAN.md`、用户操作或 `Lec.P` 返回值；不得为了配合文案伪造数据。
- 展示格式优先使用 `Lec.P.formatNumber`、`Lec.P.formatScientific`、`Lec.P.formatDistance`、`Lec.P.formatDuration`。
- 交互改变输入后，所有相关读数、图形与结论必须由同一份真实计算结果更新。
- 随机样本一律引用 `assets/lib/seedrandom.min.js`，使用稳定种子，例如 `new Math.seedrandom('page-NN')`。禁止 `Math.random()`。
- 不得用预录动画、假数据或写死结果冒充计算。
- 小型逐帧二分类神经网络使用 `mlp.js`；不得用 tf.js 重做。
- 只有加载预训练模型、真实图片卷积或必须依靠 GPU 的大矩阵才使用 tf.js；每步必须放入 `tf.tidy()` 或显式 `dispose()`，并检查 `tf.memory().numTensors` 不持续增长。

## 8. 底盘接口

`base.css` 和 `base.js` 的**全部对外接口都在这一页里**。要用底盘，读这一页就够了，
不需要打开那两个源文件（合起来 400 行）。只有在你打算**改写或替换**底盘时才去读源码，
那时源码里每一条旁边都写了它各自解决什么问题。

底盘里只有和主题无关的机制：固定画布的整体缩放、canvas 在高分屏和缩放下的适配、
指针坐标换算、几个不写就一定出 bug 的布局细节、可访问性地板。
**没有任何配色、字体、字号、间距或组件外观** —— 那些是每次生成自己的设计。

### base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在你自己的样式之前。

#### 必须由你给出的三个 token（底盘不给默认值，缺了页面会明显不对）

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

### base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。
页面里只要有 `#stage`，引入即开始工作（缩放监听在文件末尾自动装好）。

### 尺寸与缩放

```text
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

```text
Deck.fit(cv)             高分屏适配,返回已 setTransform 的 2d ctx
Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸/触摸结束都兼容)
```

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。
它靠 `r.width / el.offsetWidth` 反推，**嵌套缩放也对，但元素被 rotate 之后不适用**。

### 从 CSS 读颜色（canvas 里写不了 `var()`）

```text
Deck.token(name)         读成原始字符串
Deck.rgb(name)           读成 [r,g,b]
Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'
```

### 动画

```text
Deck.reduced()           系统是否要求减少动态
Deck.loop(fn[,opt])      rAF 循环,返回 stop()
```

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧
`fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；
标签页隐藏时自动暂停，回来不会有 dt 跳变。

### 小工具

```text
Deck.clamp / Deck.lerp / Deck.fmt
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段
```

### 底盘不做的事

顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、
版式模板 —— 一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

**如果这一轮另外做了共享文件**（比如统一的顶栏和进度轨、统一的数字格式化、
共用的底纹），把它的接口按上面这个格式追加到本文件末尾。多个页面各自
`cat` 一遍源码去认接口，是纯浪费。

## 9. Canvas、交互与动画硬约束

- canvas 一律走 `Deck.fit` 或 `Deck.autofit`。
- 指针坐标一律走 `Deck.pt`。
- 动画一律走 `Deck.loop`。
- canvas 取色一律走 `Deck.rgb` 或 `Deck.rgba`。
- 自己写 `getBoundingClientRect` 换算、自己做 `devicePixelRatio` 缩放、自己写 `requestAnimationFrame` 循环，均属重复实现，禁止。
- 铺满父容器的 canvas 必须使用 `.cv-fill`。
- 拖动区域必须使用 `.no-pan`。
- grid/flex 分栏的每个子项必须使用 `.min0`。
- 图形必须有可供读屏软件理解的文字替代；只读替代使用 `.sr-only`。
- 所有持续动画必须有 reduced-motion 分支。使用 `Deck.loop` 时必须提供信息完整的静止帧；静止帧不得停在空白、全零或尚未呈现结论的状态。
- 原生按钮、滑块、选择框优先于自制控件。
- 所有交互必须可用键盘完成，焦点顺序符合视觉顺序，焦点状态清晰可见。
- 自制可点击元素必须具备正确语义、`tabindex`、键盘触发和可访问名称；能用原生 `<button>` 时不得自制。
- 拖拽交互必须提供键盘等价操作；方向键应小步调整，必要时 Shift＋方向键大步调整。
- 交互后的状态变化必须通过可见读数或适当的 ARIA 状态表达，不能只依赖颜色变化。
- 不得把必读信息只放在 hover 中。

## 10. 库的使用契约

凡是 `assets/lib/` 下已有库能完成的呈现工作，不允许自己从底层重写。动手前先按“要做的事”查对应关系。

| 要做的事 | 引用 | 全局对象 |
|---|---|---|
| 下落、碰撞、摆动、堆叠、拖拽、约束 | `<script src="assets/lib/matter.min.js"></script>` | `Matter` |
| 三维场景、立体结构、光照材质 | `<script src="assets/lib/three.min.js"></script>` | `THREE` |
| 三维地球、球面点线区块 | three 后引 `<script src="assets/lib/globe.gl.min.js"></script>` | `Globe` |
| 生成式动画背景 | three 后引 `<script src="assets/lib/vanta.net.min.js"></script>` | `VANTA` |
| 常规坐标图表 | `<script src="assets/lib/echarts.min.js"></script>` | `echarts` |
| 可拖拽、可命中检测的二维场景 | `<script src="assets/lib/konva.min.js"></script>` | `Konva` |
| 节点连线、数据驱动矢量图形 | `<script src="assets/lib/d3.min.js"></script>` | `d3` |
| 成千上万元素同时运动 | `<script src="assets/lib/pixi.min.js"></script>` | `PIXI` |
| 分步动画、路径描绘、形变 | `<script src="assets/lib/anime.min.js"></script>` | `anime` |
| 多动画时间线编排 | `<script src="assets/lib/gsap.min.js"></script>` | `gsap` |
| 滚动绑定动画进度 | gsap 后引 `<script src="assets/lib/ScrollTrigger.min.js"></script>` | `ScrollTrigger` |
| 播放矢量动画文件 | `<script src="assets/lib/lottie.min.js"></script>` | `lottie` |
| 伪三维插画 | `<script src="assets/lib/zdog.min.js"></script>` | `Zdog` |
| 指针倾斜 | `<script src="assets/lib/vanilla-tilt.min.js"></script>` | `VanillaTilt` |
| 进入视野淡入 | `<script src="assets/lib/aos.js"></script>` | `AOS` |
| 数学公式 | KaTeX CSS 与 JS | `katex` |
| 矩阵运算 | `<script src="assets/lib/ml-matrix.umd.js"></script>` | `mlMatrix` |
| 可复现随机 | `<script src="assets/lib/seedrandom.min.js"></script>` | `Math.seedrandom` |
| 实时训练小型二分类网络 | `<script src="assets/lib/mlp.js"></script>` | `MLP` |
| 预训练模型、真实图片卷积、大型 GPU 矩阵 | `<script src="assets/lib/tf.min.js"></script>` | `tf` |

加载规则：

- 库脚本放在使用它的页面脚本之前。
- three 必须在 globe.gl 或 Vanta 之前。
- gsap 必须在 ScrollTrigger 之前。
- KaTeX 必须同时引入：

```html
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
```

- 用不到的库不得引用。
- 需要清单外库时，只能放在 `pages/` 下本地引用，不得使用 CDN。
- 库版本以 `assets/lib/LIBS.md` 为准，不得去压缩库文件里搜索版本号。

精确版本：

| 文件 | 版本 |
|---|---|
| `three.min.js` | r160 / 0.160.1 |
| `matter.min.js` | 0.20.0 |
| `d3.min.js` | 7.9.0 |
| `pixi.min.js` | 7.4.2 |
| `anime.min.js` | 3.2.2 |
| `gsap.min.js`、`ScrollTrigger.min.js` | 3.12.5 |
| `globe.gl.min.js` | 2.32.0 |
| `vanta.net.min.js` | 0.5.24 |
| `lottie.min.js` | 5.12.2 |
| `zdog.min.js` | 1.1.3 |
| `vanilla-tilt.min.js` | 1.8.1 |
| `aos.js` | 2.3.4 |
| `echarts.min.js` | 6.1.0 |
| `konva.min.js` | 10.3.1 |
| `katex.min.js` | 0.18.4 |
| `ml-matrix.umd.js` | 6.15.0 |
| `seedrandom.min.js` | 3.0.5 |
| `tf.min.js` | 4.22.0 |
| `mlp.js` | 自家维护，无版本号 |

特殊硬约束：

- ECharts 一律使用 `echarts.init(el, null, {renderer:'svg'})`。
- ECharts 全局成句文字不小于 `16px`；标签、轴名和图例不小于 `14px`；只有纯数字或数字加单位的刻度可到 `12px`。
- Konva 用于图形、拖拽和命中检测。场景文字优先使用绝对定位的 DOM 标签，不使用 `Konva.Text`。
- 只有必须跟随图形内部变换的短标注才可用 `Konva.Text`，且必须显式设置合规字号。
- KaTeX 基准字号不小于 `20px`。
- Three r160 使用 `outputColorSpace`，不得使用旧的 `outputEncoding`。
- anime.js 使用 3.2.2 API：`anime({targets:…})`，不得使用 v4 的 `animate()`。

## 11. 技法文档

- 清单中存在对应技法文档时，必须先用 `Skill` 读取，再开始实现。
- 不得跳过已有技法文档后自行从头试验另一套方案。
- 清单中没有对应文档时才自行实现，不必硬套无关技法。
- 已安装 `node`、带 numpy 的 `python3`、`playwright` 和 `chromium`，不得浪费时间检查是否安装。
- 技法文档不能覆盖本契约；两者冲突时以本契约为准。

## 12. 真交互标准

真交互必须同时满足：

1. 学生能通过按钮、滑块、选择、拖拽或键盘改变一个有教学意义的输入。
2. 页面根据该输入重新进行真实计算、模拟、筛选或数据变换。
3. 图形或结构发生可观察变化。
4. 至少一个读数、标签或结论同步更新。
5. 学生能比较改变前后的结果，或能通过重置回到明确的初始状态。
6. 交互范围内的解释始终真实。
7. 操作有键盘等价方式，并在 reduced-motion 下保留完整信息。

以下不算真交互：

- hover 发光、卡片倾斜、鼠标视差。
- 只播放预设动画。
- 点击后仅显示或隐藏原本固定的答案。
- 没有改变数据或模型的轮播、翻卡、装饰性拖拽。
- 图形变化但没有可读反馈。
- 数值变化但计算结果实际写死。
- 必须依赖教师口头补充才知道操作后发生了什么。

装饰效果不得抢占主要视觉层级，不得成为理解页面的必要条件，也不得消耗本页有限的控件预算。

## 13. 完工前自检

在 `pages/` 目录运行：

```text
python3 assets/selfcheck.py page-NN.html
```

存在交互时，还必须用一个或多个 `--after` 覆盖所有代表性状态，包括：

- 初始状态。
- 每个控件的最小值或第一选项。
- 每个控件的最大值或最后选项。
- 典型中间状态。
- 拖拽后的边界状态。
- 重置后的状态。
- 动画的有信息静止状态。

形式：

```text
python3 assets/selfcheck.py page-NN.html --after "<一段 JS>"
```

可重复添加 `--after`。

交付前判据：

- JavaScript 报错：0。
- 资源加载失败：0。
- 超出画布元素：0。
- 被裁掉元素：0。
- 文字叠压：0。
- 占比不足 1% 的异常小容器：0。
- 字号低于所属档位：0。
- 页面文本元素总数：不超过 64。
- 成句正文：不超过 420 个汉字。
- 同时可见控件：不超过 4。
- 所有交互状态均满足以上判据。
- 画面占用合理，不靠大片无意义装饰抬高占用比，也不靠缩小核心内容制造空白。
- 键盘可到达所有控件，焦点可见，操作结果可读。
- reduced-motion 下内容完整，不出现空白或缺失结论。
- 随机结果可复现。
- 页面在 `file://` 下可直接显示和交互。

自检只报告，不会修改文件。发现任何问题必须修改页面并重新运行，循环到报告干净为止。不得在已知有报错、裁切、叠压、字号违规或预算超限时交付。

## 14. 交付

- 只交付 `pages/page-NN.html`。
- 不提交文档、测试、截图、报告、资源副本或总结。
- 不修改其他页面或共享文件。
- 不解释实现过程。
- 不报告“基本完成”或遗留问题；未达到全部判据即不算完成。