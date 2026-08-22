# CONTRACT.md —— 48 页共用页面构建契约

## 1. 工作边界

1. 你只负责 `pages/page-NN.html`。
2. 只创建或修改这一份 HTML。
3. 绝不读取、比较、复制或修改任何其他 `page-*.html`。
4. 可读取且只应依赖：
   - `CONTRACT.md`
   - `PLAN.md`
   - `assets/theme.css`
   - `assets/lec.js`
   - 本契约指定的底盘、库与技法文档
5. 不修改 `assets/` 下任何共享文件，不新建页面专用 CSS、JS、图片、数据、文档或测试文件。
6. 最终只交付 `page-NN.html`，不写说明、总结、测试报告或其他文档。
7. 每个 HTML 必须自包含，使用相对路径，可由浏览器通过 `file://` 直接打开并完整显示、计算和交互；不得使用 CDN 或依赖静态服务器。

## 2. 固定 HTML 骨架

照抄以下骨架。只替换 `NN`、`TT`、`KICKER`、`TITLE`、`TAKE` 和 `#stage` 内的本页正文；按需在 `lec.js` 之前加入本契约允许的本地库。不得改动标签顺序，不得重建页眉页脚。

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body data-page="NN" data-total="TT">
  <div id="stage">
    <!-- 只在这里加入本页内容 -->
  </div>

  <!-- 按需在这里加入 assets/lib/ 下的库，依赖库在前 -->
  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>
  <script>
    Lec.mount({
      index: NN,
      kicker: "KICKER",
      title: "TITLE",
      take: "TAKE"
    });
    Deck.init({ index: NN, total: TT });
    // 本页初始化
  </script>
</body>
</html>
```

页数固定为 `TT = 48`。页面只往 `#stage` 加内容。页眉页脚由 `Lec.mount()` 负责，`theme.css` 负责外观和占位高度。不得重复生成页眉、页脚、标题、进度或导航，不得改动其类名，不得覆盖其定位、尺寸或外观样式。

`Lec.mount()` 使用的唯一合法类名为：

- `.lec-header`
- `.lec-header-inner`
- `.lec-kicker`
- `.lec-heading`
- `.lec-title`
- `.lec-sub`
- `.lec-progress`
- `.lec-footer`
- `.lec-footer-inner`
- `.lec-take`
- `.lec-foot`
- `.lec-main`

主内容由 `#main` 定位并复用。不得另起同类结构。

## 3. 受众与授课语言

1. 读者是大学一年级通识课学生，专业背景文理兼有。
2. 不假定读者具备微积分、生物学或其他专业先修知识。
3. 首次出现的专业术语必须立即用普通话解释；能用日常词说明时，不堆术语。
4. 不用未解释的缩写。必须使用缩写时，首次写“中文全称（缩写）”。
5. 正文以教师课堂讲解时可直接说出口为准，句子简短、主动、具体：
   - 单句原则上不超过 32 个汉字；
   - 超过 40 个汉字必须拆句；
   - 一句只承担一个主要判断。
6. 先给直观含义，再给术语、公式或机制；公式必须同时说明符号代表什么以及结果如何理解。
7. 不使用“显然”“容易看出”“不难发现”“你应该知道”等压迫性措辞。
8. 提示语使用直接、友好的动作口吻，如“拖动滑块，观察……”“按空格暂停”；不用幼儿化、戏谑化或责备口吻。
9. 页面既要适合教师带讲，也要允许学生课后独立重看：
   - 页面必须自带最短必要上下文；
   - 不写“如老师刚才所说”“见黑板”等脱离课堂即失效的句子；
   - 交互旁必须有可独立理解的操作提示和结果解释。
10. 所有讲解必须在交互允许的全部状态下成立；不得让固定文案描述仅在某个初始状态成立的数字或结论。

## 4. 画布与版面预算

逻辑画布固定为 `1600 × 900`。主题规定的版心为：

- 内容区：`1408 × 620`
- 页眉：`96px`
- 页脚：`88px`

不得自行重新测量、改变或侵占这些区域。

每页硬上限：

- 正文与说明文字：最多 360 个汉字；
- 标题、页眉、页脚、纯数字刻度、单位和按钮短词不计入上述字数；
- 完整说明句：最多 12 句；
- 可操作控件：最多 6 个；
- 控件按独立可聚焦操作件计数；一组单选按钮中的每个选项分别计数；
- 页面文本元素总数：最多 72 个；
- 文本元素包括标题、正文段落、列表项、按钮文字、控件标签、读数、图例、坐标轴名称、刻度、图注和画布内文字；
- 同一 DOM 文本节点或同一 SVG 文本节点计 1 个；
- ECharts SVG 中每个可见文本节点分别计数；
- 页面主要内容面板或独立视觉容器：最多 8 个。

推荐目标是 45 个以内的文本元素；72 个是不可突破的硬上限。

超过任一上限时，必须明确判定“本页超出预算”，删减非必要内容、合并读数、抽稀刻度、去除重复图例，或要求拆页。不得通过缩小字号、压缩行高、缩窄字距、遮挡、滚动或把文字画进 canvas 来塞入。

## 5. 字号与可读性地板

所有字号使用 `theme.css` 的 token：

- `--fs-h1: 34px`：页面唯一主标题；
- `--fs-h2: 22px`：区块或卡片标题；
- `--fs-lead: 19px`：导语、主张、强调正文；
- `--fs-body: 18px`：默认正文；
- `--fs-sec: 16px`：次级说明、表格正文、图注正文；
- `--fs-label: 15px`：控件标签、图例、短操作提示，不得用于成句说明；
- `--fs-tick: 13px`：只含数字和单位的刻度。

绝对地板：

- 纯数字刻度：不小于 `12px`；
- 标签、图例、控件名、短图注：不小于 `14px`；
- 正文和完整说明句：不小于 `16px`；
- 所有成句文字行高：不小于 `1.35`；
- KaTeX 统一基准字号不小于 `20px`。

1366×768 屏幕相对 1600×900 画布的宽高比例分别约为 `1366/1600 = 0.854`、`768/900 = 0.853`，底盘取可容纳画布的比例，因此实际缩放系数约为 `0.85`。逻辑字号会随舞台整体缩小，所以不得再以“小屏适配”为理由降低字号。

## 6. 主题与布局

1. 所有颜色、字体、字号、间距、焦点色和组件外观必须取自 `assets/theme.css`。
2. 不得自创第二套配色、字体比例、阴影体系、圆角体系或间距体系。
3. canvas 颜色必须通过 `Deck.token`、`Deck.rgb` 或 `Deck.rgba` 读取主题 token。
4. 优先使用主题原子类：
   - `.row .col .grow .wrap .center .between .start .end`
   - `.gap-1 .gap-2 .gap-3 .gap-4 .gap-5 .gap-6`
5. 知识关系必须选择匹配的主题骨架：
   - 先后或因果：`.k-process`
   - 同维度比较：`.k-comparison`
   - 上下位归属：`.k-classification`
   - 主张与支撑：`.k-generalization`
   - 同级并列：`.k-enumeration`
6. 可使用主题组件 `.panel`、`.ctl`、`.note`。
7. 默认使用 flex。只有矩阵、维度表等确需二维对齐时才使用 grid。
8. 所有 grid/flex 分栏子项必须加 `.min0`。
9. 不得在缩放舞台内使用 `position: fixed`；需要固定在内容容器内时使用 `position: absolute`。
10. 需要计算坐标才能勉强对齐时，应改结构，不得用硬算 `left/top` 凑齐。
11. 拖拽元素应保留在正常布局流中，以 `transform` 表达偏移。
12. 不许删除底盘或主题提供的类，不许通过 `classList.remove` 删除 `lec-root`、`lec-page`、`min0`、`cv-fill` 等类，也不许覆盖这些类的定位属性。

## 7. 数字与计算

1. 页面中的派生数字、比例、百分比、物理量、时间、距离、能量、速度、轨道量和资源量一律通过 `Lec` 计算。
2. 页面不得写死可由 `Lec` 得出的结果。
3. 输入常量可以在脚本中命名声明，但展示结果必须由 `Lec` 返回值生成。
4. 格式化可使用 `Deck.fmt`；边界、插值、有限值处理优先使用相应的 `Lec` 接口。
5. 不得复制 `Lec` 已提供公式重新实现。
6. 交互改变输入后，所有相关读数、图形和讲解必须重新由同一计算结果驱动。
7. 随机数据必须引入 `seedrandom`，并使用稳定种子，如 `page-NN`。不得使用无种子的 `Math.random()`。
8. 不得用预录动画、假数据或写死数字冒充计算。
9. 小型实时二分类网络使用 `mlp.js`；矩阵原语使用 `ml-matrix`；只有预训练模型、真实图片卷积或确需 GPU 的大矩阵才使用 TensorFlow.js。
10. 使用 TensorFlow.js 时，每一步必须置于 `tf.tidy()` 中或显式 `dispose()`，并确认 `tf.memory().numTensors` 不持续增长。

## 8. 底盘接口速查

`base.css` 和 `base.js` 的全部对外接口都在本节。不要打开其源码，除非任务明确要求改写或替换底盘。

### base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在自己的样式之前。

必须由主题给出的 token：

```css
:root{
  --bg:        #0b0e14;
  --text:      #e6e6e6;
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

底盘另外读取 `--stage-w`、`--stage-h` 和 `--focus`。缩放比写回 `:root` 的 `--s`。

页面必须有 `#stage`；引入 `base.css` 和 `base.js` 后缩放自动生效，不需要另写缩放代码。

四个工具类：

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | 任何 grid/flex 分栏的子项 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 `<canvas>` |
| `.no-pan` | 关掉触摸平移 | 需要拖动的交互区 |
| `.sr-only` | 只给读屏软件 | 图形的文字替代 |

### base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。

```text
Deck.W / Deck.H
Deck.s
Deck.onResize(fn)
Deck.init(cfg)
```

```js
Deck.init({ index:3, total:14 });
Deck.init({ index:3, total:14, keys:false });
Deck.init({ index:3, total:14, href:n => 'p'+n+'.html' });
```

canvas 与指针：

```text
Deck.fit(cv)
Deck.autofit(cv, draw)
Deck.pt(el, e)
```

`Deck.pt` 是必须用的。外层存在 `transform: scale()` 时，`e.offsetX` 是错误坐标。它兼容缩放、嵌套缩放、触摸和触摸结束，但元素旋转后不适用。

从 CSS 读颜色：

```text
Deck.token(name)
Deck.rgb(name)
Deck.rgba(name, a)
```

动画：

```text
Deck.reduced()
Deck.loop(fn[,opt])
```

`Deck.loop` 在 reduced-motion 下不进入循环，只绘制一帧 `fn(opt.still||0, 0)`；标签页隐藏时自动暂停，恢复时不会产生 `dt` 跳变。

小工具：

```text
Deck.clamp
Deck.lerp
Deck.fmt
Deck.rr(ctx,x,y,w,h,r)
Deck.arrow(ctx,x1,y1,x2,y2,size)
```

底盘不提供顶栏、导航、进度指示、面板、按钮、滑块、卡片、标签、图例、列表或页面叙事外观；本轮统一外观由 `theme.css` 和 `Lec.mount()` 提供。

## 9. canvas 与交互硬约束

1. canvas 一律使用 `Deck.fit` 或 `Deck.autofit`。
2. 指针坐标一律使用 `Deck.pt`。
3. 动画一律使用 `Deck.loop`。
4. canvas 取色一律使用 `Deck.rgb`、`Deck.rgba` 或 `Deck.token`。
5. 铺满容器的 canvas 必须使用 `.cv-fill`。
6. 可拖动区域必须使用 `.no-pan`。
7. 不得自行实现 `devicePixelRatio` 缩放。
8. 不得自行通过 `getBoundingClientRect`、`offsetX`、`clientX` 等重写指针坐标换算。
9. 不得直接建立 `requestAnimationFrame` 循环。
10. 每个动画必须有 reduced-motion 分支；静止帧必须完整表达核心信息，不得停在空白起始帧。
11. 所有交互必须可用键盘完成：
    - 原生按钮使用 `<button>`；
    - 滑块使用 `<input type="range">`；
    - 自定义操作件必须可聚焦，并提供正确角色、名称及 Enter/Space/方向键行为；
    - 焦点样式不得移除；
    - 拖拽必须提供键盘等价操作。
12. canvas 或纯图形区域必须提供 `.sr-only` 文字替代，说明图形表达的结论及操作方式。
13. 状态变化必须更新可见读数；重要结果应使用可读的状态文本，必要时使用 `aria-live="polite"`。
14. 不得依赖 hover 才能获得必要信息。

## 10. 库的强制使用规则

凡是 `assets/lib/` 已有库能完成的呈现工作，不允许自己从底层重写。动手前先按任务查对应库：

| 任务 | 必用库 |
|---|---|
| 下落、碰撞、摆动、堆叠、拖拽约束 | Matter |
| 三维场景、立体结构、光照材质 | Three |
| 三维地球、球面点、弧线、区块 | Three 后加载 Globe.gl |
| 生成式 NET 背景 | Three 后加载 Vanta |
| 坐标轴、刻度、图例及常规图表 | ECharts |
| 可拖拽、命中检测的二维场景 | Konva |
| 节点连线、数据绑定矢量图形 | D3 |
| 成千上万元素同时运动 | PixiJS |
| 分步动画、路径描绘、形变 | anime.js |
| 多动画时间线 | GSAP |
| 滚动绑定动画 | GSAP 后加载 ScrollTrigger |
| 矢量动画文件 | lottie-web |
| 伪三维插画 | Zdog |
| 指针倾斜 | VanillaTilt |
| 进入视野淡入 | AOS |
| 数学公式 | KaTeX |
| 矩阵运算 | ml-matrix |
| 可复现随机 | seedrandom |
| 小型实时二分类网络 | mlp.js |
| 预训练模型、真实图片卷积、大型 GPU 矩阵 | TensorFlow.js |

引用方式统一为：

```html
<script src="assets/lib/xxx.js"></script>
```

KaTeX 必须同时引用：

```html
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
```

依赖加载顺序：

- `three.min.js` 在 `globe.gl.min.js`、`vanta.net.min.js` 之前；
- `gsap.min.js` 在 `ScrollTrigger.min.js` 之前；
- 其他库先于使用它的本页初始化脚本；
- `base.js` 先于调用 `Deck`；
- `lec.js` 先于调用 `Lec`。

不得为已有能力下载替代库。确实需要未预置库时，只能本地放入 `pages/` 并相对引用，不得使用 CDN。

精确版本以本契约和 `assets/lib/LIBS.md` 为准，不要去压缩库文件中查版本：

- Three r160 / 0.160.1
- Matter.js 0.20.0
- ECharts 6.1.0
- Konva 10.3.1
- D3 7.9.0
- PixiJS 7.4.2
- anime.js 3.2.2
- GSAP / ScrollTrigger 3.12.5
- globe.gl 2.32.0
- Vanta 0.5.24
- lottie-web 5.12.2
- Zdog 1.1.3
- VanillaTilt 1.8.1
- AOS 2.3.4
- KaTeX 0.18.4
- ml-matrix 6.15.0
- seedrandom 3.0.5
- TensorFlow.js 4.22.0
- `mlp.js` 为自家维护版本

### ECharts

必须使用 SVG renderer：

```js
var chart = echarts.init(el, null, { renderer: 'svg' });
```

必须显式设置文字地板：

```js
chart.setOption({
  textStyle: { fontSize: 16 },
  xAxis: { axisLabel: { fontSize: 14 } },
  yAxis: {
    axisLabel: { fontSize: 14 },
    nameTextStyle: { fontSize: 14 }
  },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { textStyle: { fontSize: 16 } }
});
```

只有纯数字和单位刻度可降至 12px；带词句的刻度一律不小于 14px。不得使用默认 canvas renderer。

### Konva

图形、拖拽和命中检测使用 Konva。文字标签优先用绝对定位的 DOM 叠加，不使用 `Konva.Text`。只有必须随图形变换的短标注才可使用 `Konva.Text`，且必须显式设置不低于相应档位的 `fontSize`。

Konva 的 `stage.getPointerPosition()` 已处理舞台缩放，不得重复换算。

### KaTeX

统一使用不小于 20px 的基准字号：

```js
katex.render(source, el, { throwOnError: false });
```

公式必须有普通语言解释和读屏文本。不得使用图片代替公式。

## 11. 技法文档

开始编码前，先检查任务清单中是否有对应技法文档。

- 有对应文档：必须先用 `Skill` 读取，再按文档实现；
- 不得跳过文档自行摸索或另发明一套；
- 没有对应文档：才可自行设计；
- 技法文档与本契约冲突时，以本契约为准；
- 库版本以 `assets/lib/LIBS.md` 为准，不读取压缩库查版本。

## 12. 真交互标准

满足以下全部条件才算真交互：

1. 用户能改变至少一个有意义的输入、状态、参数、视角或分类选择；
2. 改变后由真实计算或真实数据驱动结果；
3. 至少一个图形、读数、结论或结构随状态同步变化；
4. 页面给出明确操作提示；
5. 变化帮助学生比较、预测、验证或解释课程概念；
6. 可通过键盘完成；
7. reduced-motion 下仍可操作并获得同等信息；
8. 重置后恢复确定的初始状态；
9. 同一输入始终得到一致结果。

以下不算真交互：

- 仅 hover 发光、倾斜、视差、粒子跟随；
- 仅淡入、循环动画、自动播放；
- 点击后只切换装饰颜色；
- 没有计算关系的假滑块；
- 预录动画冒充模拟；
- 随机变化却无法复现；
- 只能拖拽、没有键盘等价操作；
- 控件变化但结论、读数和图形不随之更新。

装饰不得抢占主要交互、不得持续制造运动、不得成为理解内容的必要条件。

## 13. 完工前自检

在 `pages/` 目录运行：

```bash
python3 assets/selfcheck.py page-NN.html
```

需要检查交互后状态时，使用：

```bash
python3 assets/selfcheck.py page-NN.html --after "<一段 JS>"
```

可多次使用 `--after`，至少覆盖：

- 初始状态；
- 每类控件的一个非默认状态；
- 极小值与极大值；
- 重置后的状态；
- 动画或训练的稳定状态；
- 会改变布局、标签或图例的状态。

通过判据：

- 无 JavaScript 报错；
- 无资源加载失败；
- 无元素超出 1600×900 画布；
- 无元素被裁切；
- 无文字叠压；
- 无占比不足 1% 的无意义小容器；
- 字号最小值满足本契约地板；
- 文本元素总数不超过 72；
- 正文字数、句数、控件数和容器数均不超预算；
- 画面占用合理，核心内容不是过空或过满；
- 1366×768 缩放下交互坐标、tooltip、拖拽和焦点位置正确；
- 键盘可遍历并操作全部控件；
- reduced-motion 下核心信息完整；
- 随机结果可复现；
- 所有展示数字来自 `Lec` 或真实计算；
- ECharts 使用 SVG renderer；
- canvas、指针、动画和取色分别使用规定的 `Deck` 接口。

只要报告或人工检查仍有一项不干净，就继续修改同一个 HTML 并重新运行。必须改到干净为止，不得以“基本可用”“浏览器里看起来没问题”作为交付标准。

## 14. 交付

只交付 `pages/page-NN.html`。

不得附带：

- README；
- 说明文档；
- 测试文件；
- 截图；
- 自检报告；
- 总结；
- 新增共享资源；
- 对其他页面或共享文件的修改。