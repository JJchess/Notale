# CONTRACT.md —— 48 页共用页面构建契约

## 1. 工作边界

- 你只构建 `PLAN.md` 指定的那一页，只写对应的 `page-NN.html`。
- 绝不读取、比较、复制或修改任何其他 `page-*.html`。
- 可读取且只依赖：本契约、`PLAN.md`、`assets/theme.css`、`assets/lec.js`、本契约明确要求先读的技法文档与库接口文档。
- 不修改 `assets/` 下任何共享文件。
- 不新建页面专用 CSS、JS、图片、数据、测试或说明文件；页面专用代码全部内嵌在自己的 HTML 中。
- 每个 HTML 必须自包含：直接用 `file://` 打开即可显示和交互；资源一律使用相对路径；禁止 CDN、远程字体、远程图片和网络请求。
- 最终只交付这一个 HTML 文件，不写文档、不写测试、不写总结。

## 2. 固定 HTML 骨架

以下骨架照抄。只允许改 `NN`、页面标题信息、按需增加本地库引用，以及在 `#stage` 中加入正文和页面脚本。不得删除、改名或重排既有元素与共享资源。

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>页面标题</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
  <!-- 按需在这里加入库的 CSS -->
  <style>
    /* 只写本页结构所必需的样式；颜色、字体、字号、间距取自 theme.css */
  </style>
</head>
<body data-page="NN" data-total="48">
  <div id="stage"></div>

  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>
  <!-- 按依赖顺序在这里加入所需本地库 -->
  <script>
    Lec.mount({
      index: NN,
      kicker: "本页眉题",
      title: "本页标题",
      take: "本页带走的一句话"
    });

    Deck.init({ index: NN, total: 48 });

    const stage = document.getElementById("stage");
    /* 只向 stage 添加本页内容并实现本页交互 */
  </script>
</body>
</html>
```

硬约束：

- 页面只往 `#stage` 里加内容。
- 页眉、页脚由 `Lec.mount()` 负责生成，`theme.css` 负责外观和占位高度。
- 不得重复生成页眉、页脚、进度条或导航，不得修改其类名，不得覆盖其定位、尺寸或占位样式。
- 页面自己的内容区是 `#stage` 减去页眉、页脚带之后的区域；使用 `theme.css` 已给出的版心，不自行测量或另设画布。
- 画布逻辑尺寸固定为 1600×900。
- `Lec.mount()` 生成并复用的唯一结构为：
  - `.lec-header__progress`
  - `.lec-progress`
  - `.lec-header`
  - `.lec-footer`
  - `.lec-main`
  - `.lec-stage`
  - `#lec-footer`
  - `#lec-header`
  - `#main`
- 不得删除底盘或主题提供的类；尤其不得对 `lec-root`、`lec-page`、`min0`、`cv-fill` 等执行 `classList.remove()`，也不得覆盖它们的定位属性。
- 不得在缩放画布中使用 `position: fixed`；需要固定在内容区时，使用相对内容容器的 `position: absolute`。

## 3. 受众、语言与教学场景

读者是大学一年级通识课学生，文理专业混合，不假定具备微积分、生物学或相关专业背景。页面同时服务于教师课堂带讲和学生课后独立重看。

每页必须遵守：

- 先给直观意义，再给术语、符号或机制。
- 专业术语首次出现时，用一句日常语言就地解释；不得只给术语不解释，也不得把解释藏进 tooltip。
- 不以微积分、生物学专名或专业公式作为默认前提。必须使用时，先说明符号分别代表什么，再说明式子表达的关系。
- 一句话只承担一个主要判断；正文单句原则上不超过 32 个汉字，确需完整限定时不得超过 46 个汉字。
- 提示语使用直接、合作式口气，如“拖动滑块，比较两种结果”“先选一种情况，再观察变化”。
- 禁止使用责备式、考试式或含糊提示，如“显然”“不难发现”“你应该知道”“随便试试”“点这里”。
- 操作提示必须同时说清“做什么”和“看什么”。
- 页面标题说明问题；`take` 给出学生离开本页后应记住的一句话，不写空泛口号。
- 课堂讲解所需的关键结论必须直接可见；课后复看所需的因果关系、术语解释和操作说明不得只依赖教师口述。
- 图形附近放就地标签和图注，不让学生跨越整页寻找图例。
- 不用长段落代替结构；关系类型必须选用主题提供的相应骨架。

## 4. 版面与密度预算

主题给定版心为内容区 1408×620，页眉 96、页脚 88。照此排布，不自行另量。

每页硬上限：

- 可见正文：不超过 260 个汉字。
- 其中连续说明性正文：不超过 180 个汉字。
- 单个正文段落：不超过 72 个汉字。
- 可操作控件：不超过 4 个。
- 同屏主要交互任务：只允许 1 个。
- 持续显示的读数：不超过 6 个。
- 图例项：不超过 6 个。
- 页面上的可见文本元素总数：不超过 64 个。
- 文本元素总数包括：标题、正文段落、列表项、按钮文字、滑块标签、输入标签、状态文字、读数、图注、图例、轴名、坐标刻度、节点标签和图形内部文字。
- 纯数字坐标刻度同样计数；由图表库自动抽稀后，以实际渲染数量计数。
- 容器数量不超过 18 个；占比不足页面 1% 的装饰性小容器不超过 4 个。
- 画面占用比以 `selfcheck.py` 报告为准，应在 30%–78% 之间。
- 不允许任何文字叠压、越界、被裁切或被页眉页脚遮挡。

超过任一上限时，必须报告该页内容超出单页预算并请求拆页或删减；不得通过缩小字号、压缩行高、减少间距、隐藏文字、改成 canvas 文字或堆叠浮层塞入本页。

## 5. 字号与可读性地板

- 纯数字或“数字＋短单位”的刻度：不小于 12px。
- 带词句的刻度、控件标签、图例、图注、操作提示、短标注：不小于 14px。
- 正文、按钮文字、tooltip、状态说明、成句文字：不小于 16px。
- 正文默认使用主题的 `--fs-body`。
- 标签使用主题的 `--fs-label`。
- 只有纯数字刻度才可使用主题的 `--fs-tick`。
- 正文行高不小于 1.35。
- KaTeX 基准字号统一不小于 20px。
- 不使用 CSS `transform: scale()` 单独缩小文字。
- 不使用浏览器缩放或截图缩放掩盖字号违规。

1600×900 逻辑画布在 1366×768 屏幕上的缩放系数约为：

- 横向：1366 ÷ 1600 ≈ 0.854
- 纵向：768 ÷ 900 ≈ 0.853
- 实际取较小值，约 0.85

因此逻辑字号 16px 在该屏幕上的视觉尺寸约为 13.6px。上述字号是逻辑画布内的硬地板，不能再降低。

## 6. 主题与结构

所有颜色、字体、字号、间距、圆角、边框和阴影优先从 `assets/theme.css` 的 token 与 class 取得。不得另造一套视觉系统，不得复制共享组件外观。

必须使用的主题信息：

```text
token   --fs-body 18      正文(默认);成句文字只许用 body / lead / sec
token   --fs-label 15     控件标签、图例、操作提示
token   --fs-tick 13      纯数字刻度,只有数字和单位时才可以用

版心     内容区 1408×620,页眉 96 / 页脚 88 —— 照这个排,不要自己量

骨架     .k-process        把「先后 / 因果」显式化:横向分段 + 段间箭头与贯穿主轴,
                           当前段高亮,已过的段降饱和;不能只并排放块
骨架     .k-comparison     把「同一维度上的差异」显式化:维度名与对象列组成对齐行列 +
                           共同基准轴,差异单元加底色;两侧不能各排各的
骨架     .k-classification 把「归属」显式化:下位项放入上位包含框或缩进到层级竖线下,
                           层级靠缩进和边框粗细显现;不能把各级摊成同级卡片
骨架     .k-generalization 把「主张—支撑」显式化:主张重一档,支撑挂在贯穿主干上并向外分支;
                           不能让主张与论据等重并列
骨架     .k-enumeration    把「同级并列」显式化:统一的项模板与编号位,不暗示顺序;
                           这是最弱结构,不应替代前四种关系

组件     .panel            读数面板
组件     .ctl              控件行
组件     .note             图注
```

布局规则：

- 默认使用 flex，而不是 grid。
- 只有矩阵、维度表、严格二维对齐等确需二维关系时才使用 grid。
- 任何 grid/flex 分栏的子项必须加 `.min0`。
- 需要靠计算坐标才能对齐的地方，应改结构，不要计算坐标。
- 拖拽元素使用 `transform` 偏移并尽量保留在正常流中，不修改 `left/top` 凑位置。
- 刻度与滑块难以对齐时，拆成上下两个结构区块，不用绝对定位硬凑。
- 装饰不得抢占信息层级；删除装饰后，页面教学关系仍必须成立。

## 7. 数字与计算

- 页面显示的数字、单位换算结果和派生值一律通过 `Lec` 接口计算或规范化，不得把结果写死在 HTML、CSS、SVG path、canvas 绘制代码、图表配置或提示文字中。
- 页号与总页数只通过 `data-page`、`data-total`、`Lec.mount()` 和 `Deck.init()` 提供。
- 常量进入显示前，至少经过 `Lec.finiteNumber()`；需要范围限制时使用 `Lec.clamp()`；需要展示小数时使用 `Lec.round()`。
- 秒与天、年的换算必须使用 `Lec.secondsPerDay()`、`Lec.secondsPerYear()`。
- 交互改变后，显示数字必须由当前状态重新计算，不能切换预先写好的答案字符串。
- 随机数据必须使用 `seedrandom` 和稳定种子；种子采用页面号，如 `page-NN`。同页每次打开必须得到相同结果。
- 不得使用预录动画、假数据、固定读数或隐藏答案冒充真实计算。

允许使用的 `Lec` 接口只有：

```text
Lec.clamp(value, minimum, maximum)
Lec.finiteNumber(value, fallback)
Lec.round(value, decimalPlaces)
Lec.secondsPerDay()
Lec.secondsPerYear()
Lec.mount({index, kicker, title, take})
```

## 8. 底盘接口

### base.css

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

以上 token 的实际值必须来自 `theme.css`；页面不得用示例值覆盖主题。

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
Deck.init({ index:3, total:14 });
Deck.init({ index:3, total:14, keys:false });
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
Deck.rr(ctx,x,y,w,h,r)
Deck.arrow(ctx,x1,y1,x2,y2,size)
```

底盘强制条款：

- canvas 一律使用 `Deck.fit()` 或 `Deck.autofit()`。
- 指针坐标一律使用 `Deck.pt()`。
- 动画循环一律使用 `Deck.loop()`。
- canvas 取色一律使用 `Deck.rgb()` 或 `Deck.rgba()`。
- 禁止自行使用 `devicePixelRatio` 缩放 canvas。
- 禁止自行用 `getBoundingClientRect()`、`offsetX` 或客户端坐标换算指针。
- 禁止自行调用 `requestAnimationFrame()` 建立动画循环。
- 起始帧没有完整信息时，必须给 `Deck.loop()` 设置有意义的 `still` 定格状态。
- 铺满父容器的 canvas 必须使用 `.cv-fill`。
- 拖动区域必须使用 `.no-pan`。
- 纯图形信息必须提供 `.sr-only` 文字替代。

## 9. 库使用契约

凡是 `assets/lib/` 下已有库能完成的呈现工作，不允许自己从底层重写。动手前必须先按任务查看 `assets/lib/LIBS.md`。库版本以该文档为准，不去压缩文件中查询。

引用规则：

- 所有库从 `pages/` 相对引用：`assets/lib/xxx.js`。
- CSS 库放在 `theme.css` 后、页面样式前。
- JS 顺序为：`base.js`、`lec.js`、基础依赖库、依赖其全局对象的扩展库、页面代码。
- `globe.gl` 必须在 `three` 之后。
- `vanta.net` 必须在 `three` 之后。
- `ScrollTrigger` 必须在 `gsap` 之后。
- KaTeX 必须同时引用本地 CSS 与 JS。
- 不使用的库不引用。
- 如确实需要清单外库，可下载到 `pages/` 下本地引用；禁止 CDN。加入前必须确认现有库不能完成同一工作。

任务对照：

| 要做的事 | 必须使用 |
|---|---|
| 物体下落、碰撞、摆动、堆叠、拖拽、约束 | Matter.js |
| 三维场景、可旋转立体结构、光照材质 | Three.js |
| 三维地球、球面点、弧线、区块 | Three.js 后加载 globe.gl |
| 生成式动画背景 | Three.js 后加载 Vanta NET |
| 坐标轴、刻度、图例、折线、柱、散点、面积、饼、热力 | ECharts |
| 可拖拽、需命中检测的二维场景 | Konva |
| 节点连线、精确矢量图形、数据绑定 | D3 |
| 成千上万元素同时运动 | PixiJS |
| 分步动画、依次出现、路径描绘、形变 | anime.js |
| 多动画时间线编排 | GSAP |
| 动画进度绑定滚动 | GSAP 后加载 ScrollTrigger |
| 播放矢量动画文件 | lottie-web |
| 伪三维插画 | Zdog |
| 元素随指针倾斜 | vanilla-tilt |
| 进入视野淡入 | AOS |
| 数学公式 | KaTeX |
| 矩阵乘法、行列式、求逆、特征分解 | ml-matrix |
| 可复现随机 | seedrandom |
| 页面实时训练小型二分类网络 | `mlp.js` |
| 预训练模型、真实图片卷积、GPU 大矩阵 | TensorFlow.js |

精确版本：

| 文件 | 版本 |
|---|---|
| `echarts.min.js` | ECharts 6.1.0 |
| `konva.min.js` | Konva 10.3.1 |
| `three.min.js` | Three r160 / 0.160.1 |
| `matter.min.js` | Matter.js 0.20.0 |
| `d3.min.js` | D3 7.9.0 |
| `pixi.min.js` | PixiJS 7.4.2 |
| `anime.min.js` | anime.js 3.2.2 |
| `gsap.min.js`、`ScrollTrigger.min.js` | GSAP 3.12.5 |
| `globe.gl.min.js` | globe.gl 2.32.0 |
| `vanta.net.min.js` | Vanta 0.5.24 |
| `lottie.min.js` | lottie-web 5.12.2 |
| `zdog.min.js` | Zdog 1.1.3 |
| `vanilla-tilt.min.js` | vanilla-tilt 1.8.1 |
| `aos.js` | AOS 2.3.4 |
| `katex.min.js` | KaTeX 0.18.4 |
| `ml-matrix.umd.js` | ml-matrix 6.15.0 |
| `seedrandom.min.js` | seedrandom 3.0.5 |
| `tf.min.js` | TensorFlow.js 4.22.0 |
| `mlp.js` | 自家维护，无版本号 |

特殊硬约束：

### ECharts

必须使用 SVG renderer：

```js
const chart = echarts.init(el, null, { renderer: "svg" });
chart.setOption({
  textStyle: { fontSize: 16 },
  xAxis: {
    axisLabel: { fontSize: 14 }
  },
  yAxis: {
    nameTextStyle: { fontSize: 14 },
    axisLabel: { fontSize: 12 }
  },
  legend: {
    textStyle: { fontSize: 14 }
  },
  tooltip: {
    textStyle: { fontSize: 16 }
  }
});
```

- 纯数字刻度可为 12px。
- 带词句的刻度必须不小于 14px。
- 图例、轴名不小于 14px。
- tooltip 不小于 16px。
- 禁止使用默认 canvas renderer。

### Konva

- 场景图形使用 Konva。
- 场景文字标签优先使用绝对定位的 DOM 元素叠加，不使用 `Konva.Text`。
- 只有必须随图形内部变换的短标注可使用 `Konva.Text`，并显式设置不低于所属文字档位的 `fontSize`。
- 指针位置使用 `stage.getPointerPosition()`，不得再自行换算。

### KaTeX

```html
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
```

```js
katex.render(expression, el, { throwOnError: false });
```

- 只使用预置的本地 CSS 和 JS。
- 基准字号不小于 20px。
- 不下载官方字体目录，不替换本地 CSS。

### 随机

```html
<script src="assets/lib/seedrandom.min.js"></script>
```

```js
const rng = new Math.seedrandom("page-NN");
```

所有随机样本、随机点、抽样和初始状态都必须使用固定种子。

### 小型神经网络

- 页面实时训练两三层小型二分类网络时使用 `mlp.js`。
- 不用 TensorFlow.js 重写同一量级的训练。
- `mlp.js` 只用于单个 sigmoid 输出的二分类，不冒充多分类、回归或卷积。
- 必须同时检查 `net.diverged` 和 `net.evaluate(...).acc`；未数值崩溃不等于学会。
- TensorFlow.js 仅用于预训练模型、真实图片卷积或 GPU 才适合的大矩阵。
- 使用 TensorFlow.js 时，每一步必须置于 `tf.tidy()` 中或手动 `dispose()`，并检查 `tf.memory().numTensors` 不持续增长。

## 10. 技法文档

- 清单中已有对应技法文档时，必须先用 `Skill` 阅读，再开始实现。
- 不得跳过已有技法文档自行重做一套。
- 清单中没有对应文档时，才自行实现。
- 页面仍必须服从本契约；技法文档与本契约冲突时，以本契约为准。

## 11. 交互标准

真交互必须同时满足：

1. 用户能通过按钮、滑块、选择、拖拽、键盘或指针改变一个明确变量。
2. 页面根据当前输入执行真实计算、模拟或数据变换。
3. 至少一个主要图形、读数或结论随输入发生有意义的变化。
4. 变化与本页学习目标直接相关。
5. 页面给出当前状态、结果或因果反馈，而不是只播放效果。
6. 使用键盘可完成与指针等价的核心任务。
7. 焦点可见，控件有可访问名称，状态变化可被读屏器获取。
8. reduced-motion 下仍保留完整信息和操作能力。

以下只算装饰，不算交互：

- hover 变色、发光、倾斜或视差。
- 点击后只播放预录动画。
- 自动循环但不能改变变量。
- 拖动物体却不改变任何计算或解释。
- 切换预先写死的图片、答案或数字。
- 只显示 tooltip。
- 背景粒子跟随指针。
- 点击卡片展开同一句说明。

控件规则：

- 原生控件优先。
- 图标按钮必须有可见文字或 `aria-label`。
- 自定义可点击元素必须有正确角色、`tabindex="0"`，并处理 Enter 与 Space。
- 滑块必须有 `<label>`、当前值和单位。
- 拖拽交互必须提供键盘替代，如方向键移动或等价的滑块、按钮。
- 动态状态使用 `aria-live="polite"`，但不得在连续动画每帧播报。
- 不以颜色作为唯一区分；同时使用文字、形状、线型或位置。
- reduced-motion 分支不得只停止在空白起始帧，必须呈现具有教学意义的静态状态。
- 自动动画应可暂停；非必要动画不得无限抢夺注意力。

## 12. canvas、缩放与高分屏

- 所有 canvas 必须放在有明确逻辑尺寸的容器内。
- 铺满容器时使用 `.cv-fill`。
- 初始化与重绘使用 `Deck.fit()` 或 `Deck.autofit()`。
- canvas 内坐标统一使用 1600×900 舞台下的逻辑坐标或其容器逻辑坐标。
- 指针统一使用 `Deck.pt()`；Konva 场景使用 `stage.getPointerPosition()`。
- 不读取 `offsetX`、`offsetY` 作为逻辑坐标。
- 不自行乘除 `devicePixelRatio`。
- 不自行处理外层 `transform: scale()`。
- canvas 颜色使用 `Deck.rgb()`、`Deck.rgba()` 从主题 token 获取。
- canvas 中不得绘制可由 DOM 承担的正文、标签、图例或操作说明。
- canvas 图形必须有可见 DOM 图注，并提供 `.sr-only` 文字替代。
- 动画只使用 `Deck.loop()`；必须提供 reduced-motion 下的静态结果。
- 元素旋转后 `Deck.pt()` 不适用；不得旋转承担指针交互的 canvas 容器。

## 13. 完工前自检

工作目录为 `pages/`。必须运行：

```bash
python3 assets/selfcheck.py page-NN.html
```

有交互状态时，还必须用 `--after` 检查至少以下状态：

- 初始状态。
- 每个主要控件的一个中间状态。
- 每个主要控件的边界状态。
- 拖拽后的代表状态。
- 动画的有意义定格状态。
- 错误、无数据或数值异常状态，如页面存在这些分支。

形式：

```bash
python3 assets/selfcheck.py page-NN.html \
  --after "<触发中间状态的 JS>" \
  --after "<触发边界状态的 JS>"
```

通过判据：

- 0 个 JavaScript 错误。
- 0 个资源加载失败。
- 0 个超出画布的元素。
- 0 个被裁切元素。
- 0 个文字叠压。
- 0 个正文小于 16px。
- 0 个标签、图例、图注、操作提示小于 14px。
- 0 个纯数字刻度小于 12px。
- 正文行高全部不小于 1.35。
- KaTeX 基准字号不小于 20px，嵌套最小字形不低于 12px。
- 文本元素总数不超过 64。
- 控件总数不超过 4。
- 容器总数不超过 18。
- 画面占用比在 30%–78%。
- 不存在占比不足 1% 且无教学作用的小容器。
- 1366×768 等比缩放后，指针命中、tooltip、拖拽和键盘操作仍正确。
- reduced-motion 模式下页面信息完整、无空白首帧、无必要信息丢失。
- 所有主要交互可用键盘完成。
- 随机结果每次打开一致。
- 显示数字来自当前真实计算，不是写死结果。
- 页面直接用 `file://` 打开可显示和交互。
- 页面未使用 CDN 或外部请求。
- 页面未读取、修改或依赖其他 `page-*.html`。

任何一项不通过，都必须修改页面并重新运行自检；重复到报告干净为止。不得以“浏览器看起来正常”代替自检，不得通过隐藏元素、缩小字号、改用 canvas 文字或删除检测目标绕过报告。

## 14. 交付

- 只交付 `page-NN.html`。
- 不修改共享文件。
- 不提交资源副本。
- 不提交测试、截图、日志、说明、README 或总结。