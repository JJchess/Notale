# 阅读边界

必须阅读本契约、`assets/CHASSIS.md` 和本页 `pNN.md`。不得读取其他页面规格、`PLAN.md`，也不得读取 CSS/JS 实现源码。每页只实现自己的 `pNN.md`；契约与逐页规格冲突时，先满足本契约。

# 1. 这堂课在讲什么

全课只建立一个主张：神经网络的“学习”，是用当前参数预测，把错误计成损失，反向求出各参数应改变的方向，再按合适步长反复更新。

四章各承担一项不可替代的任务：

- 01–06：拆开单个神经元。输入是题目给的信息；权重调节各项证据的分量；偏置调节整体倾向；输出是 0 到 1 的预测。
- 07–11：把“答错”变成可比较的损失，并用当前位置附近的小试探说明方向、敏感程度与梯度。
- 12–15：说明多层网络如何沿计算链倒着分配责任，一次得到全部参数的修改方向。
- 16–21：把预测、计分、反传、更新组成训练循环，并以新样本表现区分“记住训练题”和“学到可迁移规律”。

证据链必须保持 E1→E2→E3→E4→E5：参数产生预测；预测与目标产生损失；局部试探产生梯度；链式局部影响把责任传回各层；合适步长下的重复更新降低误差，并接受新样本检验。不得把后续结论提前当作已知，也不得在本页重复由其他页负责的推导、案例、交互或收束。

01、02、03、06、11、20、21 无交互；其余页面是否交互及交互目标只按本页 `pNN.md`。无交互页不得伪装滑块、按钮、拖拽柄或可点击图形。

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

- 只修改 `#stage` 内容。`data-page` 保留两位页码，`data-total="21"`；不得把页码显示给读者。
- 逻辑画布固定为 1600×900，不得滚动。`#stage` 为 flex 列；顶层区块使用固定高度或 flex 份额，主内容区使用 `flex:1`。
- 字号只用主题 token。正文与成句说明不小于 16px；控件标签、图例、图注、提示不小于 14px；纯数字刻度不小于 12px；多行文字行高不小于 1.35。
- 颜色、字体、圆角、阴影和共享组件取自主题接口。语义色只能表达接口指定概念并出现在允许位置；无概念含义的元素使用中性色。单页尺寸可内联，不为一次性尺寸创建公共类。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制；缩放画布内禁止 `position:fixed`。
- 默认使用 flex；仅真正二维对齐时使用 grid。页面须在 `file://` 下自包含运行，只引用 `pages/` 内相对路径，不使用 CDN。
- 图表优先采用已安装库，不重复实现成熟能力。ECharts 必须以 `echarts.init(el,null,{renderer:'svg'})` 初始化，并显式设置文字：全局正文≥16px，标签/图例/轴名≥14px，纯数字刻度≥12px。
- Konva 主要绘制图形；文字优先用 DOM 覆盖。必须使用 `Konva.Text` 时显式设置合规字号。
- KaTeX 同时引用 CSS 与 JS；公式基准字号统一不小于 20px。
- Canvas 使用 `Deck.fit()` / `Deck.autofit()`；指针坐标使用 `Deck.pt()`；动画使用 `Deck.loop()`。Konva 指针坐标使用其自身接口。
- 页面随机生成、抽样或初始化必须使用 `seedrandom` 固定种子。首屏保持静止且已包含可讲信息，不得依赖动画开始后才出现核心证据。
- 实时训练两三层小网络使用 `mlp.js`，不用 TensorFlow.js 或 ml-matrix 重写；`net.diverged` 只代表数值崩溃，是否学会须看 `evaluate()`。TensorFlow.js 仅用于预训练模型、真实图像卷积或确需 GPU 的大矩阵，并用 `tf.tidy()` 或 `dispose()` 管理张量。

| 用途 | 库 |
|---|---|
| 物理、碰撞、约束 | `matter.min.js` |
| 三维场景；地球；生成背景 | `three.min.js`；其后可接 `globe.gl.min.js`、`vanta.net.min.js` |
| 常规图表 | `echarts.min.js` |
| 可拖拽二维场景；矢量连线 | `konva.min.js`；`d3.min.js` |
| 大量运动元素 | `pixi.min.js` |
| 分步动画；时间线；滚动绑定 | `anime.min.js`；`gsap.min.js`；其后可接 `ScrollTrigger.min.js` |
| 矢量动画；伪三维；指针倾斜；淡入 | `lottie.min.js`；`zdog.min.js`；`vanilla-tilt.min.js`；`aos.js` |
| 公式；矩阵原语 | `katex.min.css`+`katex.min.js`；`ml-matrix.umd.js` |
| 可复现随机；小网络实时训练 | `seedrandom.min.js`；`mlp.js` |
| 预训练、卷积、大型 GPU 计算 | `tf.min.js` |

教学常量、范围、初值和结果必须来自 `Lec.K` / `Lec.P` 并在页面当场计算；禁止预录结果、硬编码计算结论或制造假数据。

`Lec.K`：`BINARY_CLASSIFICATION_THRESHOLD`、`FINITE_DIFFERENCE_STEP`、`GRADIENT_CHECK_RELATIVE_TOLERANCE`、`PROBABILITY_EPSILON`、`RELU_DERIVATIVE_AT_ZERO`。

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

优先使用 `assets/img/IMG.md` 已登记素材，不重复下载或生成。按素材索引填写 `<img title="…">`；出处与许可不进入主画面。生成插画的“AI生成”角标必须完整可见，不得被内容、裁切或控件遮挡。

# 7. 文字风格

- 术语深度：可直接使用“输入、权重、偏置、预测、目标、损失、参数、更新、训练样本、新样本”。“激活函数、梯度、学习率、前向传播、反向传播、泛化”首次出现时用一句人话就地解释。可展示导数符号，但先解释为“当前位置附近，参数稍微变化会让损失怎样变化”。整门课不引入雅可比矩阵、海森矩阵、计算图形式化、自动微分实现、优化器家族、反向传播的生物学类比。
- 表述禁忌：不得说网络“思考、理解、知道、想要、犯错后反省”；不得把权重叫“记忆”、把梯度叫“答案”、把损失叫“准确率”、把反向传播说成数据或错误原样倒流；不得说一次下降就“学会”，也不得把训练集下降等同于新样本有效。
- 记号口径：预测写 `ŷ` 并紧邻“预测”，目标写 `y` 并紧邻“正确目标”，损失写 `L`，权重写 `w`，偏置写 `b`，学习率写 `η` 并标“步长”。更新统一写成“新参数 = 当前参数 − 步长 × 梯度”；梯度与更新量必须分开标记。首次出现的符号必须同时给出人话含义。概率写为 0–1 小数；无实际量纲的权重、偏置、梯度和损失不附单位。
- 数字换算：概率同时给小数与百分比，如“0.72（72%）”；损失保留 2–3 位小数，参数与梯度通常保留 2 位，极小变化可用 3 位。方向优先写“增大/减小”，再给正负号。估算值加“约”，舍入值用“≈”；只对当前样本、当前参数或当前步长成立的结论必须就近标“当前样本”“当前位置”或“本次更新”，不得写成普遍规律。