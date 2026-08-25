# CONTRACT.md

阅读边界：开始前必须读本文件、`assets/CHASSIS.md` 和自己的 `pNN.md`。不要读其他页面的 `pNN.md`、`PLAN.md`，也不要读 CSS/JS 实现源码——接口以本契约描述为准。

## 1. 这堂课在讲什么

全课只讲一件事：神经网络的"学习"＝测错多少→看哪边更平坦地下坡→挪一小步，反复执行，被反向传播自动化到每一层。五幕对应五个证据节点：

- I（01–05，E1）一个神经元＝加权求和＋决策开关，对错能换算成一个数。
- II（06–08，E2）误差随参数变化构成地形，沿下坡方向挪参数就是学习的最小动作，步长决定学得快慢。
- III（09–10，E3）单个神经元只能画直线，叠成多层才能拧出复杂边界。
- IV（11–16，E4/E5）反向传播把下坡方向逐层分配到每个权重；学习率与泛化共同决定"学会"是否发生。
- V（17–19）回收全部证据，指出学习始终是同一个"测错—下坡—重复"动作，只是被放大了规模。

01、02、05、09、11、17、18、19 无交互，专注讲清一件事，不要为了"互动感"加装饰性操作。每页只实现自己 `pNN.md` 里指定的内容；`pNN.md` 里没有出现、但属于别的幕/别的证据节点的概念，本页不得提前引入或重复定义，交给对应页面。

## 2. 颜色语义

| token / 色相 | 唯一含义 | 允许出现的位置 |
|---|---|---|
| 底色 `#F7F3EA` | 无概念含义，画布底 | 全部页面背景 |
| 主色 深蓝 `#1B4B6B` | 当前正确/稳定下降的路径 | 等高线主线、下坡轨迹、参数当前值点、正向传播实箭头、直线/曲线分界 |
| 强调色 橙红 `#E8622C` | 当前被关注的那一个焦点 | 正在拖动的滑块、当前样本、正在反向传播的那一层、反向虚箭头 |
| 中性灰（主题给定） | 无概念含义 | 网格线、卡片边框、未激活控件、辅助文字 |

深蓝与橙红全程各只表达一个含义，不得用于装饰性填色、不得反过来（深蓝标当前焦点或橙红标稳定态）。没有概念含义的元素一律用主题中性色，不新增第三种语义色。

## 3. 知识结构——骨架约定

容器不是知识关系：不用卡片网格或左右两栏替代下面四种结构；先想清楚页面要呈现的是哪一种关系，再决定用什么图元画。

| 结构 | 必须直接看见的关系 | 最低几何要求 | 失败形态 |
|---|---|---|---|
| process | 先后、因果或状态推进 | 可见方向轴、箭头或连续路径 | 只有并排块 |
| comparison | 同一维度上的差异 | 同行、同尺度、同基线 | 两边各画各的 |
| classification | 上下位或部分—整体 | 嵌套、包含或明确缩进 | 同级平铺 |
| generalization | 主张与支撑 | 主张更重，支撑挂在同一主干 | 主张和证据同权 |

`theme.css` 的 `.k-*` 原语可用于以上结构，但 SVG、Canvas、Konva、d3 或 echarts 画出的图表同样合法，只要最终画面上关系立得住；硬要求是几何关系而不是使用哪个原语。

## 4. 交互的规矩

- 同一个跨页/页内关系只设一条主要交互路径，不用两个控件重复证明同一结论。
- 教学用的常量、范围、初值和计算结果一律来自 `Lec.K` / `Lec.P` 当场算出；禁止预录数值或伪造数据点。
- 任何随机过程（生成样本、抽样、初始化）必须用 `seedrandom` 固定种子；首屏静止状态本身要能读出教学信息，不能空白等待操作。
- 滑块、切换、拖拽是观察仪器：没有预设目标态时不得判"对/错"；只有分拣、配对、拼装这类本来有标准答案的任务才给出正确性反馈。
- 未在 `pNN.md` 里规划交互的页面不加任何可操作控件。

## 5. 技术契约

固定骨架：

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="19">
      <div id="stage"></div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

规则：

- 只能修改 `#stage` 内部；`data-page`、`data-total` 保留两位数字，不向读者显示页码。
- 逻辑画布固定 1600×900，不滚动。`#stage` 是 flex 列；顶层区块给固定高度或 flex 份额，主内容区 `flex:1`。
- 字号只用主题 token：正文/成句说明 ≥16px，控件标签/图例/图注/提示 ≥14px，纯数字刻度 ≥12px，行高 ≥1.35。
- 颜色、字体、圆角、阴影、共享组件取自主题接口；一次性尺寸可写内联，不为单页新造公共类。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan`；缩放画布内禁止 `position:fixed`。
- 默认 flex，只有真二维对齐时用 grid。自包含运行，只引用 `pages/` 内相对路径，不用 CDN。
- 图表优先用已装库，不重复实现。ECharts 必须 `renderer:'svg'` 且显式设文字大小（轴名/图例/tooltip ≥14px，仅数字刻度可到 12px）。Konva 场景里的文字用 DOM 绝对定位叠加，不用 `Konva.Text`（除非画在图形内部随变换移动的短标注）。KaTeX 引官方以外那份内嵌字体的 CSS，简单式基准 16px 够用，一旦公式出现分式带上下标，基准 ≥20px。Canvas 用 `Deck.fit()`/`Deck.autofit()`，指针坐标用 `Deck.pt()`，动画用 `Deck.loop()`。

用途→库：

| 用途 | 库 |
|---|---|
| 物体下落/碰撞/拖拽/约束 | matter.min.js → `Matter` |
| 三维场景/立体结构 | three.min.js → `THREE` |
| 三维地球 | three 后接 globe.gl.min.js → `Globe` |
| 生成式动画背景 | three 后接 vanta.net.min.js → `VANTA` |
| 坐标轴图表(折线/柱/散点/热力) | echarts.min.js → `echarts`(须 svg renderer) |
| 可拖拽二维场景 | konva.min.js → `Konva` |
| 节点连线/精确矢量图 | d3.min.js → `d3` |
| 海量元素同时运动 | pixi.min.js → `PIXI` |
| 分步动画/依次出现 | anime.min.js → `anime`(v3 API) |
| 多动画时间线编排 | gsap.min.js(+ScrollTrigger) → `gsap` |
| 矢量动画文件播放 | lottie.min.js → `lottie` |
| 伪三维插画 | zdog.min.js → `Zdog` |
| 指针跟随倾斜 | vanilla-tilt.min.js → `VanillaTilt` |
| 进入视野淡入 | aos.js → `AOS` |
| 数学公式排版 | katex.min.js+css → `katex` |
| 矩阵运算 | ml-matrix.umd.js → `mlMatrix` |
| 可复现随机 | seedrandom.min.js → `Math.seedrandom` |
| 页面实时训练小网络/画决策边界 | mlp.js → `MLP` |
| 加载预训练模型/真图卷积/大矩阵GPU | tf.min.js → `tf`(须 `tf.tidy`/`dispose`) |

`mlp.js`：`MLP.create({sizes,act,lr,seed})`，`net.step(set,batch)`、`net.predict(x)`、`net.evaluate(set)→{loss,acc}`、`net.field(x0,y0,x1,y1,nx,ny)`、`net.layers[i].a`、`net.activationLevels()`、`net.reset()`、`net.diverged`。二分类+交叉熵，无 softmax/回归/卷积/动量。两三层小网络实时训练用它，不用 tf.js。

`Lec.K`：DEFAULT_LEARNING_RATE、EPS、LEAKY_RELU_DEFAULT_ALPHA、NUM_GRAD_H、RELU_DERIVATIVE_NEG/POS、SIGMOID_DERIVATIVE_MAX、SIGMOID_VALUE_AT_ZERO、TANH_DERIVATIVE_MAX。

`Lec.P`：activate、activateDerivative、backwardNetwork→{grads,dInput}、bceGradient、binaryCrossEntropy、dot、forwardNetwork→{output,caches}、gradientDescentTrace、layerBackward→{dZ,dW,db,dX}、layerForward→{z,a}、leakyRelu(Derivative)、mse、mseGradient、neuronForward→{z,a}、numericalGradient、relu(Derivative)、sgdUpdate、sigmoid(Derivative)、tanh(Derivative)、weightedSum。参数名、返回键按此签名使用，不重新实现同名逻辑。

## 6. 图片

优先使用 `assets/img/IMG.md` 已登记素材，不重复下载或生成。按登记索引填 `<img title="…">`；出处与许可信息不进入主画面；生成插画的"AI生成"角标不得被正文或控件遮挡。

## 7. 文字风格

读者是无编程/无微积分基础的文理混合大一学生，课堂由教师带讲、课后自看。术语第一次出现给一句话解释，不堆积未解释的行话；句子短、动词在前，像老师站着讲课时说的话，不写书面论文腔。删除"如图所示""接下来我们将"和评价教学设计本身的元评论。关键数字给出可感换算（如"误差从 0.8 降到 0.1，相当于十次判断错九次变成错一次"）；不确定或简化处理的结论明确标注"这里做了简化"。收束句给出读者该带走的一句主张，不写成"本页讲了什么"的摘要，下一问的钩子留给下一页开场，不在本页抢先给答案。

## 8. 自检

完成后用 `Check` 检查本页：JS 报错、资源加载失败、元素越界、内容裁切均须为 0，字号符合分层地板。有交互的页面要覆盖每个主要状态（初始态、拖动中、极端值、完成态）。发现问题先用 `Look` 定位区域，再用 `Patch` 合并修复，不整页重写。最终只交付本页 HTML，不修改 `assets/` 下公共资源，不新增测试或报告文件。

## 9. 版面密度与常见坑

主内容区用 flex 吃满剩余空间，不给正文块写死高度。画面占用低于 45% 时检查是否有失控的 flex 空隙，优先放大有教学意义的图形/关系，不用装饰元素填充；高于 85% 时删减内容或在交付说明里提出拆页，不靠缩小字号硬塞。结构和层级优先靠线条、缩进、留白表达，不堆叠多层纯装饰性填色卡片。照片沿用主题已有边框、圆角、底图规则；所有 Canvas 交互区加 `.no-pan`。