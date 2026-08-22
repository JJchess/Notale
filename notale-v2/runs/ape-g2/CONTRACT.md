# CONTRACT.md —— 41 页共用的页面构建契约

## 1. 工作边界

每个页面 agent 只负责一个 `pages/page-NN.html`。

硬约束：

- 只创建或修改自己负责的 `page-NN.html`。
- 绝不读取、比较、复制或修改任何其他 `page-*.html`。
- 不修改 `assets/` 下任何文件。
- 不新建 CSS、JavaScript、图片、数据、测试或说明文件。
- 允许读取的项目材料只有本契约、`PLAN.md`、`assets/theme.css`、`assets/lec.js`，以及本契约明确要求使用的库文档和技法文档。
- 不打开 `base.css`、`base.js` 或压缩库源码研究接口；本契约给出的接口就是唯一依据。
- 页面必须自包含，使用相对路径，直接通过 `file://` 打开即可显示和交互。
- 禁止 CDN、远程字体、远程图片、远程数据和任何运行时网络请求。
- 交付时只交这个 HTML 文件，不写文档、不写测试、不写总结。

## 2. 受众与讲授场景

读者是大学一年级通识课学生，专业背景文理兼有，不假定具备微积分、生物学、天文学、物理学或编程基础。

每页文字必须同时适合课堂讲授和课后独立重看：

- 先说直观含义，再给术语；不得用术语替代解释。
- 不可避免的术语在首次出现处用一句日常语言展开。
- 不使用“显然”“不难看出”“大家都知道”等预设知识的表达。
- 不直接使用未解释的变量、缩写、单位或专业图示惯例。
- 公式出现时，必须就近说明每个符号代表什么，以及公式回答什么问题。
- 不要求学生掌握微积分；涉及变化率、累积、极限等概念时，用图像、比较或逐步变化解释。
- 不要求学生掌握生物学；涉及基因、物种、演化等概念时，先给通识层面的定义。
- 每个文本块最多两句；单句宜不超过 36 个汉字。
- 提示语使用直接、平等的口气，例如“拖动滑块，比较两条轨迹”，不用“请同学们认真观察”。
- 交互提示必须同时说清“做什么”和“看什么”。
- 页面离开教师口头补充后仍应能理解当前问题、操作方法和结论。
- 不把长篇背景、旁支知识或完整推导塞进单页；只保留当前页完成叙事所必需的信息。

## 3. 固定 HTML 骨架

保留 harness 已建立的骨架。除页号、页面元信息、`#stage` 正文和本页确实需要的库引用及初始化代码外，不改变结构。

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="41">
      <div id="stage">
        <!-- 只在这里加入本页正文 -->
      </div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
      <!-- 本页需要的预置库放在这里，按依赖顺序引用 -->
      <script>
        Lec.mount({
          index: NN,
          kicker: "PLAN.md 指定的栏目短句",
          title: "PLAN.md 指定的页面标题",
          take: "本页一句话结论"
        });
        Deck.init({ index: NN, total: 41 });
        // 本页初始化
      </script>
    </body>
    </html>

必须遵守：

- `data-page`、`Lec.mount().index` 和 `Deck.init().index` 必须一致。
- 总页数固定为 `41`。
- 页面只往 `#stage` 里加入内容。
- 页眉和页脚只由 `Lec.mount()` 生成。
- 不手写页眉、页脚、页码、标题栏、结论栏或重复的进度结构。
- 不更改、不复制、不重命名 `.lec-*` 类。
- 不覆盖 `.lec-header`、`.lec-footer` 及其后代的外观、尺寸、位置或间距。
- 页眉页脚的外观和占位高度由 `theme.css` 决定。
- 页面内容区是 `#stage` 扣除页眉页脚占位后的区域；具体高度以 `theme.css` 中 `.lec-header` 和 `.lec-footer` 为准。
- 页面自己的脚本放在依赖库之后。
- 依赖其他库的库必须后引，例如 `globe.gl` 在 `three` 后、`ScrollTrigger` 在 `gsap` 后。
- 不使用 `document.write`，不动态注入远程脚本。

## 4. 1600 × 900 版面预算

逻辑画布固定为 1600 × 900。任何状态下都不得超出画布或被页眉页脚遮挡。

每页硬上限：

| 项目 | 上限 |
|---|---:|
| 正文 | 240 个汉字，或 160 个英文单词 |
| 独立交互控件 | 5 个 |
| 页面可见文本元素总数 | 64 个 |
| 连续正文段落 | 4 段 |
| 同时出现的主视觉区域 | 2 个 |
| 同时要求学生完成的操作 | 1 个 |

计数规则：

- 正文包括说明、提示、注释、结论、列表项、按钮说明和 tooltip 中的完整句子。
- 标题、页眉、页脚不计入正文字符数，但计入文本元素总数。
- 文本元素总数包括标题、正文块、列表项、按钮文字、输入标签、读数、图例、轴名、刻度、数据标签、tooltip 和图注。
- 同一元素动态切换多段文字时，按文字最多的稳定状态计数。
- 每个按钮、滑块、下拉框、复选框、单选组、可拖拽物或其他独立输入算一个控件。
- 一组单选项按实际可操作项数量计数，不得借容器包装规避。
- ECharts 的 SVG 文字、DOM 覆盖标签和可见 KaTeX 字形都计入文本元素。
- 不得把文字画进 canvas 来规避文本数量或字号检查。
- 坐标刻度应交给库合理抽稀；不要逐点标数。
- 超过任一上限时，必须删减内容、合并读数、减少刻度或拆页。
- 不能拆页时，明确报告“本页内容超过契约预算”，不得缩字号、压行高、缩间距、裁切或隐藏内容硬塞。

## 5. 字号与可读性地板

所有字号按 1600 × 900 逻辑画布中的计算样式检查：

| 文字类型 | 最小字号 |
|---|---:|
| 纯数字刻度、极短量纲刻度 | 12px |
| 标签、图例、轴名、图注、短标注 | 14px |
| 正文、说明、提示、控件文字、tooltip | 16px |
| KaTeX 基准字号 | 20px |

其他硬约束：

- 所有正文行高必须 `≥1.35`。
- 带词句的刻度不是“纯数字刻度”，必须 `≥14px`。
- 按钮、输入标签、动态读数和 tooltip 属于正文档，必须 `≥16px`。
- 不用缩放某个文字容器的方式绕过字号下限。
- 不通过 canvas、图片或 SVG path 把文字藏出检查范围。
- 1366 × 768 屏幕上的舞台缩放系数约为  
  `min(1366 ÷ 1600, 768 ÷ 900) ≈ 0.85`。
- 因此逻辑字号 16px 在常见 1366 屏上实际约为 13.6px；这就是禁止继续降低逻辑字号的原因。
- 字号不足时删内容或拆页，不得通过压缩字体、负字距或降低行高补救。

## 6. 主题是唯一视觉来源

只使用 `assets/theme.css` 提供的设计语言。

硬约束：

- 所有颜色从 `theme.css` 的 token 或已有类取得。
- 所有字体族、字号档位、字重、圆角、阴影和间距从 `theme.css` 取得。
- 不创建第二套颜色变量、字体变量、间距标尺或组件主题。
- 不在页面里写新的十六进制色、`rgb()`、`hsl()` 或具名色。
- 不自行发明与主题不一致的按钮、卡片、面板、标签或装饰体系。
- 页面局部 CSS 只负责本页必需的布局、定位、网格比例和交互状态。
- grid/flex 子项必须按底盘要求加 `.min0`。
- canvas 中不能直接使用 CSS `var()`；必须通过 `Deck.rgb()` 或 `Deck.rgba()` 读取主题颜色。
- 不为了“排得更好看”覆盖页眉、页脚或其他 `.lec-*` 样式。
- `theme.css` 没有提供某种外观时，优先用已有基础样式组合，不另造一套主题。

## 7. 数字、数据和计算

所有教学内容中的数字必须来自 `Lec`，页面不得写死。

必须遵守：

- 天体、时间、演化、人类、火箭、单位和格式常量从 `Lec.K(...)` 取得。
- 派生量通过 `Lec.P(...)` 计算。
- 页面显示的数字、图表数据、轴范围、比较结果、结论读数和交互输出都必须由 `Lec.K` 或 `Lec.P` 产生。
- 不把 `Lec` 中已有常量复制成页面局部常量。
- 不在 HTML 文案、`data-*` 属性、图表配置或 JavaScript 数组里写死教学数字。
- 交互改变输入后，相关结果必须重新计算，不得只替换标签或播放预录动画。
- 格式化优先使用 `Lec.P('round')`、`Lec.P('significant')`、`Lec.P('formatCompact')` 等接口，不自行复制格式化规则。
- 页号、总页数、画布尺寸、数组索引、动画时间参数等纯实现数字不属于教学数据，但不得显示成教学结论。
- 若需要的教学数字无法从现有 `Lec.K` 或 `Lec.P` 合法得到，不得自行补一个“差不多”的值；应报告接口缺失。
- 所有随机数据必须引用 `seedrandom`，并使用稳定种子，例如 `page-NN`。
- 同一页面每次打开必须得到相同样本、同一初始状态和同一结论。
- 禁止假数据、预录结果、装饰性随机数冒充真实计算。

`Lec` 公共接口以本契约给出的 `Lec.K`、`Lec.P` 和 `Lec.mount` 清单为准，不需要再读 `lec.js` 源码确认。

## 8. 库的选择、引用和加载

### 8.1 总原则

凡是 `assets/lib/` 下已有库能完成的呈现工作，不允许自己从底层重写。

动手前先按任务查表。已有库覆盖的工作，不得手写替代：

| 要做的事 | 必须使用 |
|---|---|
| 下落、碰撞、摆动、堆叠、约束 | Matter.js |
| 三维场景、立体结构、光照材质 | Three.js |
| 三维地球、球面点、弧线、区块 | Three.js + globe.gl |
| 生成式 NET 背景 | Three.js + Vanta |
| 坐标轴、刻度、图例、折线、柱状、散点、面积、饼、热力 | ECharts |
| 可拖拽、可命中检测的二维场景 | Konva |
| 节点连线、数据绑定、精确矢量图形 | D3 |
| 成千上万元素同时运动 | PixiJS |
| 分步动画、路径描绘、依次出现、形变 | anime.js |
| 多动画时间线编排 | GSAP |
| 动画进度绑定滚动 | GSAP + ScrollTrigger |
| 播放矢量动画文件 | lottie-web |
| 伪三维插画 | Zdog |
| 元素跟随指针倾斜 | Vanilla Tilt |
| 进入视野淡入 | AOS |
| 数学公式 | KaTeX |
| 矩阵运算 | ml-matrix |
| 可复现随机 | seedrandom |
| 页面内实时训练小型二分类网络 | `mlp.js` |
| 预训练模型、真实图片卷积、大型 GPU 矩阵 | TensorFlow.js |

呈现层必须用库；交互背后的计算必须真实执行。不得用假数据、写死结果或预录动画代替计算。

### 8.2 引用方式

页面直接使用相对路径：

    <script src="assets/lib/xxx.js"></script>

不下载、不复制、不检查文件是否存在，不使用 CDN。

依赖顺序：

- `three.min.js` 在 `globe.gl.min.js` 或 `vanta.net.min.js` 之前。
- `gsap.min.js` 在 `ScrollTrigger.min.js` 之前。
- KaTeX 必须同时引用 CSS 和脚本。
- 页面初始化代码必须放在所有依赖之后。
- 用不到的库不要引用。
- 不因方便而给全部页面加载 `tf.min.js`。

KaTeX：

    <link rel="stylesheet" href="assets/lib/katex.min.css">
    <script src="assets/lib/katex.min.js"></script>

### 8.3 精确版本

版本只以 `assets/lib/LIBS.md` 和下表为准，不去压缩库源码里查：

| 文件 | 版本 |
|---|---|
| `echarts.min.js` | ECharts 6.1.0 |
| `konva.min.js` | Konva 10.3.1 |
| `katex.min.js` | KaTeX 0.18.4 |
| `ml-matrix.umd.js` | ml-matrix 6.15.0 |
| `seedrandom.min.js` | seedrandom 3.0.5 |
| `three.min.js` | three r160 / 0.160.1 |
| `matter.min.js` | Matter.js 0.20.0 |
| `d3.min.js` | D3 7.9.0 |
| `pixi.min.js` | PixiJS 7.4.2 |
| `anime.min.js` | anime.js 3.2.2 |
| `gsap.min.js` / `ScrollTrigger.min.js` | GSAP 3.12.5 |
| `globe.gl.min.js` | globe.gl 2.32.0 |
| `vanta.net.min.js` | Vanta 0.5.24 |
| `lottie.min.js` | lottie-web 5.12.2 |
| `zdog.min.js` | Zdog 1.1.3 |
| `vanilla-tilt.min.js` | vanilla-tilt 1.8.1 |
| `aos.js` | AOS 2.3.4 |
| `tf.min.js` | TensorFlow.js 4.22.0 |
| `mlp.js` | 自家维护，无版本号 |

Three.js 使用 `outputColorSpace`，不得使用旧版 `outputEncoding`。

anime.js 使用 3.2.2 API：

    anime({ targets: target })

不得使用 v4 的 `animate()`。

### 8.4 ECharts 硬约束

ECharts 一律使用 SVG renderer：

    var chart = echarts.init(el, null, { renderer: 'svg' });

最低文字配置：

    chart.setOption({
      textStyle: { fontSize: 16 },
      xAxis: { axisLabel: { fontSize: 14 } },
      yAxis: {
        axisLabel: { fontSize: 12 },
        nameTextStyle: { fontSize: 14 }
      },
      legend: { textStyle: { fontSize: 14 } },
      tooltip: { textStyle: { fontSize: 16 } }
    });

规则：

- 纯数字刻度可为 12px。
- 带词句的刻度必须至少 14px。
- 图例、轴名和标签至少 14px。
- tooltip 至少 16px。
- 不得使用默认 canvas renderer。
- 尺寸变化时调用库的 `resize()`；通过 `Deck.onResize()` 注册。
- 不手写坐标轴、刻度、图例、折线、柱状、散点、面积、饼图或热力图。

### 8.5 Konva 硬约束

- 图形、拖拽、变换和命中检测使用 Konva。
- `stage.getPointerPosition()` 已处理外层缩放，不再自行换算。
- 场景文字优先使用绝对定位的 DOM 标签。
- 不用默认 12px 的 `Konva.Text`。
- 只有必须随图形一起变换的短标注可以使用 `Konva.Text`，并显式设置合规字号。
- 不手写拖拽和命中检测系统。

### 8.6 KaTeX 硬约束

- 必须同时引用预置的 `katex.min.css` 和 `katex.min.js`。
- 不下载官方字体目录，不替换预置 CSS。
- 公式基准字号统一为至少 20px。
- 使用 `throwOnError:false`。
- 公式旁必须有通俗说明。
- 不用普通 HTML 字符串拼装复杂公式。
- 不把公式画进 canvas。

### 8.7 随机和机器学习

随机：

    var rng = new Math.seedrandom('page-NN');

- 所有抽样、随机点、初始权重和随机排列都必须使用固定种子。
- 不使用无种子的 `Math.random()`。

小型实时二分类网络使用 `mlp.js`：

    var net = MLP.create({
      sizes: [2, 10, 10, 1],
      act: 'tanh',
      lr: 0.3,
      seed: 1
    });

- `mlp.js` 只用于单个 sigmoid 输出的二分类。
- 收敛情况必须看 `evaluate().acc` 和 `evaluate().loss`。
- `diverged` 只表示数值崩溃，不表示模型已经学会。
- 不用 TensorFlow.js 重写两三层的小网络。
- 不用 ml-matrix 重写 `mlp.js` 已提供的训练循环。

TensorFlow.js 只用于：

- 加载预训练模型。
- 在真实图片上执行卷积。
- 大到需要 GPU 的矩阵计算。

使用 TensorFlow.js 时，每一步必须放进 `tf.tidy()` 或手动 `dispose()`，并检查 `tf.memory().numTensors` 不持续增长。

## 9. 技法文档

清单中存在对应技法文档时，必须先通过 `Skill` 读取，再开始实现。

硬约束：

- 先找与当前任务直接对应的 Skill。
- 找到后先读完整接口、限制和推荐模式。
- 不在已有技法覆盖的领域另发明一套实现。
- 清单中没有对应技法时才自行实现。
- 不检查 `node`、`python3`、numpy、Playwright 或 Chromium 是否安装；它们已经可用。

## 10. 真交互标准

只有同时满足以下条件才算交互：

1. 学生能通过按钮、滑块、选择、拖动、键盘或其他输入改变状态。
2. 输入会改变真实数据、模型参数或计算过程。
3. 页面会根据新状态重新计算并更新视觉结果。
4. 页面立即给出可观察反馈。
5. 学生能从变化中回答本页明确的问题。
6. 交互有清楚的初始状态。
7. 需要反复比较时提供重置或回到初始状态的方法。
8. 鼠标、触摸和键盘均可完成核心任务。

以下不算真交互：

- hover 变色。
- 发光、漂浮、粒子背景。
- 自动播放动画。
- 指针跟随倾斜。
- 只切换说明文字而不改变计算。
- 点击后播放预录轨迹。
- 拖动一个物体，但结果与位置无关。
- 装饰性视差。
- 仅有 tooltip。
- 与本页学习目标无关的小游戏。

PLAN.md 要求交互时，必须实现真交互。装饰效果不能冒充交互，也不能占用主要视觉或控件预算。

## 11. 可访问性与输入

- 优先使用原生 `<button>`、`<input>`、`<select>`。
- 每个输入都有可见标签或明确的 `aria-label`。
- 不用不可聚焦的 `<div>` 冒充按钮。
- 自定义控件必须可聚焦，并具备正确的 role、当前值和键盘操作。
- 滑块支持方向键。
- 拖拽物必须提供键盘等价操作；方向键应能移动或调整它。
- 焦点样式不得移除，使用主题提供的 `--focus`。
- 不能只靠颜色表达类别或状态；同时使用文字、形状、线型或位置。
- canvas、WebGL 和复杂图形必须提供 `.sr-only` 的文字替代，说明图中对象、当前状态和主要结论。
- 操作后需要读屏器获知的关键结果使用合适的 live region。
- 触摸拖动区加 `.no-pan`。
- 页面核心内容不能依赖 hover 才出现。
- 动画停止后仍须保留完整信息。

## 12. canvas、缩放、指针和动画

以下规则没有例外：

- canvas 一律使用 `Deck.fit()` 或 `Deck.autofit()`。
- 指针坐标一律使用 `Deck.pt()`。
- 动画一律使用 `Deck.loop()`。
- canvas 取色一律使用 `Deck.rgb()` 或 `Deck.rgba()`。
- 铺满容器的 canvas 必须加 `.cv-fill`。
- 不自己读取 `devicePixelRatio`。
- 不自己设置高分屏 backing store。
- 不使用 `e.offsetX`、`e.offsetY`、`clientX` 或 `clientY` 直接当逻辑坐标。
- 不自己写 `getBoundingClientRect()` 指针换算。
- 不自己建立 `requestAnimationFrame` 循环。
- 不在缩放舞台内用未经换算的屏幕坐标。
- 交互元素被旋转时，不得假定 `Deck.pt()` 能处理旋转后的局部坐标；应避免旋转交互命中区域或交给 Konva。
- 所有持续动画必须有 `prefers-reduced-motion` 分支。
- reduced-motion 下不能只显示无信息起始帧；必须用 `Deck.loop` 的 `still` 状态显示有意义的定格结果。
- 页面隐藏后动画应暂停，返回后不得因累积 `dt` 跳变；使用 `Deck.loop()` 已处理这一点。
- Three.js、PixiJS、Konva、ECharts 等库自己的渲染尺寸也必须在 `Deck.onResize()` 中更新。

## 13. 底盘接口原文

# CHASSIS.md —— 底盘接口速查

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

    :root{
      --bg:        #0b0e14;      /* 页面底色 */
      --text:      #e6e6e6;      /* 默认文字色 */
      --font-sans: "Noto Sans SC", system-ui, sans-serif;
    }

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

    Deck.W / Deck.H          逻辑画布尺寸(读自 --stage-w / --stage-h)
    Deck.s                   当前缩放比(同 :root 上的 --s)
    Deck.onResize(fn)        注册尺寸变化回调,返回注销函数
    Deck.init(cfg)           可选,只做键盘翻页和 document.title,不生成任何外观

    Deck.init({ index:3, total:14 });                 // 通常只需要这一行
    Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页
    Deck.init({ index:3, total:14, href:n => 'p'+n+'.html' });

### canvas 与指针

    Deck.fit(cv)             高分屏适配,返回已 setTransform 的 2d ctx
    Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
    Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸/触摸结束都兼容)

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。
它靠 `r.width / el.offsetWidth` 反推，**嵌套缩放也对，但元素被 rotate 之后不适用**。

### 从 CSS 读颜色（canvas 里写不了 `var()`）

    Deck.token(name)         读成原始字符串
    Deck.rgb(name)           读成 [r,g,b]
    Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'

### 动画

    Deck.reduced()           系统是否要求减少动态
    Deck.loop(fn[,opt])      rAF 循环,返回 stop()

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧
`fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；
标签页隐藏时自动暂停，回来不会有 dt 跳变。

### 小工具

    Deck.clamp / Deck.lerp / Deck.fmt
    Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
    Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段

---

## 底盘不做的事

顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、
版式模板 —— 一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

**如果这一轮另外做了共享文件**（比如统一的顶栏和进度轨、统一的数字格式化、
共用的底纹），把它的接口按上面这个格式追加到本文件末尾。多个页面各自
`cat` 一遍源码去认接口，是纯浪费。

### 页眉页脚已经由 `Lec.mount()` 生成,页面不要自己再造一套

`Lec.mount()` 会往 <body> 里插入下面这些元素(共 14 个类名):
  .lec-header
  .lec-footer
  .lec-page
  .lec-header__inner
  .lec-header__meta
  .lec-header__index
  .lec-header__kicker
  .lec-header__title
  .lec-main
  .lec-footer__inner
  .lec-footer__index
  .lec-footer__take
  .lec-footer__take-label
  .lec-footer__take-text

**这些类名是唯一真相,别改名、别另起一套。** mount 只生成结构,不带任何外观。

契约里要写明:页面**只往 `#stage` 里加内容**,页眉页脚由 `mount()` 负责、
`theme.css` 负责它们的外观和占位高度。页面不许重复生成、不许改它们的类名,
也不要为了"排得好看"去覆盖它们的样式。页面自己的内容区是 `#stage`
减掉这两条带之后剩下的部分 —— 具体取值看 `theme.css` 里那两个类的高度。

契约里要写死:**canvas 一律走 `Deck.fit`/`Deck.autofit`,指针一律走 `Deck.pt`,
动画一律走 `Deck.loop`,canvas 取色一律走 `Deck.rgb`/`Deck.rgba`。**
自己写 `getBoundingClientRect` 换算、自己 `devicePixelRatio` 缩放、自己
`requestAnimationFrame` 循环 —— 都是重复实现,不许。

## 页面骨架

harness 已经把每页的骨架建好了,长这样,**只往 `#stage` 里加内容,别动别的**:

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

## 还要写进契约的几条硬约束

- 每个 HTML 自包含:直接在浏览器打开就能显示和交互,资源一律相对路径,不用 CDN。
- 库的版本按 `assets/lib/LIBS.md` 上写的来,**不要去库文件里查版本** ——
  压缩构建里查不到,查也是白烧调用。

### 库:硬约束,不是可选项

**凡是 `assets/lib/` 下已有库能完成的呈现工作,不允许自己从底层重写。**
动手之前先按「要做的事」查一遍 `assets/lib/LIBS.md`。对照关系是明确的:

    坐标轴/刻度/图例/折线柱状散点面积饼热力这类常规图表   echarts
    可拖拽、需要命中检测的二维场景                       konva
    三维                                                three
    下落、碰撞、摆动、堆叠                                matter
    节点连线、数据驱动的矢量图形                          d3
    成千上万元素同时运动                                 pixi
    多个动画按时间线编排                                 gsap
    数学公式                                            katex
    矩阵运算                                            ml-matrix

这一条只管**呈现层**。每个交互背后的**计算**仍然要真算 —— 梯度下降、轨道积分、
组合计数、真实物理量,自己算或用 `mlp.js`、`ml-matrix` 都可以,
但不允许用预录动画、假数据或写死的数字冒充。

几条会静默失效的:

- `echarts` 一律 `{renderer:'svg'}`。默认的 canvas 渲染器会把所有文字画进位图,
  自检的字号检查看不见它们 —— 那等于这一页没做过字号自检。
- `katex` 的基准字号 **≥20px**,不是 16。嵌套缩放会复利:分式里带下标的部分
  在 16px 基准下量出来只有 9.68px。
- 页面里凡是随机生成数据的地方,一律用 `seedrandom` 给定种子。读者每次打开
  看到的数必须一样,否则讲解里写的数字就成了假话。

### 技法文档:同样的道理

清单里已经有对应技法文档的,**先用 `Skill` 读它,再动手**,不要自己从头摸索
或另发明一套。理由和库一样:每一页都自己重新试一遍,产出不稳定、也慢。
清单里没有对应的,就自己写,不必硬凑。
- 这台机器上已装好 `node`、`python3` 带 numpy、`playwright` + `chromium`,
  不需要检查装没装。
- 自检工具是 `python3 assets/selfcheck.py page-NN.html`,在 `pages/` 目录下跑。
  它按 1600×900 真渲染一遍,报 JS 报错、加载失败的资源、超出画布的元素、
  被裁掉的元素、字号最小值与中位数,以及**密度**(画面占用比、容器数、文本块数、
  文字叠压、占比不足 1% 的小容器)。想看**触发交互之后**的样子,用
  `--after "<一段 JS>"`(可给多次,每次多存一张截图)。只报告,不改文件。改到干净为止。

## 14. 完工前自检

在 `pages/` 目录运行：

    python3 assets/selfcheck.py page-NN.html

交互页还必须覆盖每个关键稳定状态：

    python3 assets/selfcheck.py page-NN.html \
      --after "<触发第一个关键状态的 JS>" \
      --after "<触发第二个关键状态的 JS>"

至少检查：

- 初始状态。
- 每个控件的代表性状态。
- 最小值和最大值。
- 拖动后的状态。
- 动画完成或暂停状态。
- 重置后的状态。
- reduced-motion 状态。
- 键盘操作可达性。
- 随机内容刷新后仍可复现。

通过判据：

- 0 个 JavaScript 错误。
- 0 个资源加载失败。
- 0 个超出 1600 × 900 画布的元素。
- 0 个被裁掉的可见元素。
- 0 个文字叠压。
- 0 个低于相应字号地板的可见文字。
- 正文行高全部 `≥1.35`。
- 可见文本元素总数 `≤64`。
- 正文不超过 240 个汉字或 160 个英文单词。
- 独立控件不超过 5 个。
- 不存在无意义的占比不足 1% 小容器。
- 不存在因图例、刻度或标签造成的密度超标。
- 所有 canvas、WebGL 和图表在缩放后尺寸正确。
- 指针、触摸和键盘操作与视觉位置一致。
- reduced-motion 下信息完整。
- ECharts 确认为 SVG renderer。
- 随机结果使用固定种子。
- 教学数字全部来自 `Lec`。
- 页面直接通过 `file://` 打开可用。
- 页面没有远程请求。
- 页面没有复制页眉页脚。
- 页面没有覆盖 `.lec-*` 外观。
- 页面没有手写已有库负责的呈现工作。

自检只报告问题，不会替页面修复。每次发现问题都必须修改 HTML 后重新运行，直到初始状态和全部 `--after` 状态都干净为止。

不得以“只是警告”“肉眼看不明显”“课堂上不会点到”为理由保留问题。

## 15. 最终交付

- 只交付自己负责的 `page-NN.html`。
- 不交付截图。
- 不交付测试脚本。
- 不交付说明文档。
- 不交付总结。
- 不修改共享资源。
- 不修改其他页面。
- 若内容无法在预算内完成，报告超限，不得以缩字号、压行高、隐藏文字或绕过自检的方式交付。