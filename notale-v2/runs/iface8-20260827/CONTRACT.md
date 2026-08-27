必须读取：本契约、`assets/CHASSIS.md`、本页 `pNN.md`。  
不得读取：其他页面的 `pNN.md`、`PLAN.md`、CSS/JS 实现源码。  
实现边界：每个 agent 只构建自己的页面；跨页规则以本契约为准，页面内容以本页 `pNN.md` 为准。

# 1. 这堂课在讲什么

全课主张：神经网络的“学习”，是把错误变成一个数，计算每个可调参数应往哪个方向改变，再沿该方向反复迈小步。

五幕任务：

- I（01–03）把模型看成可由样本检验、修改的预测器。
- II（04–08）建立单个神经元的完整前向过程，并用损失衡量预测有多差。
- III（09–13）比较参数附近的损失，找到下降方向；用学习率决定一步多远。
- IV（14–18）把同一动作扩展到多层网络；反向传播逐层分配改参责任。
- V（19–21）复述并迁移训练循环，同时辨认数据、模型、步长及结论边界。

跨页证据链必须保持以下顺序，不倒置、不跳步：

1. **E1**：输入乘权重、加偏置，再经激活函数得到 0–1 预测；权重和偏置可调。
2. **E2**：损失把预测错误压成可比较的单一数值。
3. **E3**：参数附近的损失变化给出下降方向，学习率把方向变成更新量。
4. **E4**：反向传播从输出错误出发，沿连接反向传递责任，一次得到全网参数的更新方向。
5. **E5**：重复“预测—计错—反传—更新”可降低训练误差并改变决策边界，但不保证理解、因果、公平或样本外表现。

每页只实现本页 `pNN.md` 指定的证据、动作和结论。“不许碰”及未分配内容由别页负责，不提前讲解、复现或总结。01、02、09、14、20、21 为无交互页，不添加可点击、拖拽、输入、悬停揭示或自动训练交互。

# 5. 技术契约

页面固定骨架：

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="21">
      <div id="stage"></div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

- 只修改 `#stage` 内容；`data-page` 保留两位页码，`data-total="21"`，不在画面中显示页码。
- 逻辑画布固定为 1600 × 900，不得滚动。`#stage` 为 flex 列；顶层区块使用固定高度或 flex 份额，主内容区使用 `flex:1`。
- 字号只用主题 token。正文与成句说明 ≥16px；控件标签、图例、图注、提示 ≥14px；纯数字刻度 ≥12px；多行文字行高 ≥1.35。
- 颜色、字体、圆角、阴影和共享组件只取主题接口。语义色仅表达接口声明的概念，并仅用于允许位置；无概念含义的元素使用中性色。单页一次性尺寸可内联，不为其新增公共类。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 机制；缩放画布内禁止 `position:fixed`。
- 默认使用 flex；仅真正的二维对齐使用 grid。页面须在 `file://` 下自包含运行，只引用 `pages/` 内相对路径，不使用 CDN。
- 图表优先调用已安装库，不重复实现成熟能力。ECharts 必须使用 SVG renderer，并显式设置全局、坐标轴、图例、提示文字字号。
- Canvas 使用 `Deck.fit()` / `Deck.autofit()`；手写 Canvas 的指针坐标使用 `Deck.pt()`；动画使用 `Deck.loop()`。
- Konva 主要绘制图形；可脱离图形变换的文字用 DOM 叠放。必须使用 `Konva.Text` 时显式设置合规字号。
- KaTeX 同时引入本地 CSS 与 JS；公式基准字号默认 ≥20px。
- 小型实时二分类网络使用 `mlp.js`；仅在预训练模型、真实图片卷积或 GPU 大矩阵场景使用 TensorFlow.js，并以 `tf.tidy()` 或 `dispose()` 管理张量。

| 用途 | 库 |
|---|---|
| 物理、碰撞、约束 | `matter.min.js` → `Matter` |
| 三维场景；球面可视化；生成背景 | `three.min.js` → `THREE`；其后 `globe.gl.min.js` → `Globe` / `vanta.net.min.js` → `VANTA` |
| 常规图表 | `echarts.min.js` → `echarts` |
| 可拖拽二维场景 | `konva.min.js` → `Konva` |
| 节点连线、矢量数据绑定 | `d3.min.js` → `d3` |
| 大量元素动画 | `pixi.min.js` → `PIXI` |
| 分步动画；时间线 | `anime.min.js` → `anime`；`gsap.min.js` → `gsap` |
| 滚动绑定动画 | GSAP 后引 `ScrollTrigger.min.js` → `ScrollTrigger` |
| 矢量动画；伪三维；指针倾斜；淡入 | `lottie.min.js` → `lottie`；`zdog.min.js` → `Zdog`；`vanilla-tilt.min.js` → `VanillaTilt`；`aos.js` → `AOS` |
| 数学排版 | `katex.min.css` + `katex.min.js` → `katex` |
| 矩阵原语；可复现随机 | `ml-matrix.umd.js` → `mlMatrix`；`seedrandom.min.js` → `Math.seedrandom` |
| 小网络实时训练 | `mlp.js` → `MLP` |
| 预训练模型、卷积、大矩阵 | `tf.min.js` → `tf` |

教学常量、范围、初值和结果必须来自 `Lec.K` / `Lec.P` 并在页面运行时计算；禁止预录结果、硬编码输出或展示假数据。随机生成、抽样和初始化必须使用固定种子。首屏保持静止，且不操作也已包含本页可讲信息。

`Lec.K`：

`BINARY_CLASSIFICATION_THRESHOLD`、`FINITE_DIFFERENCE_STEP`、`GRADIENT_CHECK_RELATIVE_TOLERANCE`、`PROBABILITY_EPSILON`、`RELU_DERIVATIVE_AT_ZERO`

`Lec.P`：

- `activationDerivative(name, preActivation, output) → 数值`
- `activationValue(name, value)`
- `applyGradients(layers, layerGradients, learningRate)`
- `binaryCrossEntropy(probabilities, targets) → {value, dProbabilities}`
- `binaryCrossEntropyWithLogits(logits, targets) → {value, probabilities, dLogits}`
- `denseBackward(upstreamGradients, cache) → {dInputs, dWeights, dBiases}`
- `denseForward(inputs, weights, biases, activationName) → {outputs, cache}`
- `dot(left, right)`
- `finiteDifferenceGradient(valueFunction, values, step)`
- `gradientRelativeError(analytic, numeric) → {maximumRelativeError, passes}`
- `meanSquaredError(predictions, targets) → {value, dPredictions}`
- `networkBackward(outputGradients, cache) → {dInputs, layerGradients}`
- `networkForward(inputs, layers) → {outputs, cache}`
- `neuronForward(inputs, weights, bias, activationName) → {preActivation, output}`
- `sigmoid(value) → 数值`
- `softmax(logits)`
- `softmaxCrossEntropy(logits, targetIndex) → {value, probabilities, dLogits}`

# 6. 图片

优先使用 `assets/img/IMG.md` 已登记素材，不重复下载或生成。按索引填写 `<img title="…">`；出处与许可不进入主画面。生成插画的“AI生成”角标必须完整可见，不得被裁切、覆盖或弱化。

# 7. 文字风格

- **术语深度**：可直接使用“样本、输入、预测、参数、权重、偏置、误差、损失、学习率、训练”。“激活函数、梯度、反向传播、决策边界”首次出现时各配一句动作解释；梯度先说“参数轻微变化时，损失变化的方向和快慢”。整门课不引入极限、偏导、雅可比矩阵、海森矩阵、计算图形式化、优化器族谱、正则化证明、通用逼近定理。
- **表述禁忌**：不说网络“思考、理解、意识到、想修正、知道答案”；不把反向传播说成信息倒放、答案沿网络倒流或神经元互相责备；不把梯度下降说成总能找到最低点；不把损失称为真实世界错误的完整度量；不把准确率、低训练损失或漂亮边界等同于智能、公平、因果或泛化。
- **记号口径**：输入写 `x₁, x₂…`，权重写 `w₁, w₂…`，偏置写 `b`，加权和写 `z`，预测写 `ŷ`，目标写 `y`，损失写 `L`，学习率写 `η`。首次出现时把符号与人话并列，如“`w₁`（输入 1 的权重）”。更新统一写“新参数 = 旧参数 − 学习率 × 下降方向”，再按本页需要给符号式。概率写为 0–1 小数；百分比仅用于准确率等比例展示。无单位的模型量不擅自添加单位。
- **数字换算**：参数变化优先写“更新前 → 更新后”；损失变化写“下降了多少”并保留必要的小数位；概率可并列为 `0.73（约 73%）`；学习率解释为单次改参步幅，不换算成速度或时间。近似值加“约”；由有限差分得到的方向标“数值近似”；仅对当前样本、当前批次或训练集成立的结论，必须就近标明适用范围。