阅读边界：

- 必须读取本契约、`assets/CHASSIS.md` 和本页 `pNN.md`。
- 不得读取其他页面的 `pNN.md`、`PLAN.md`，也不得读取 CSS/JS 实现源码。
- 每页只实现自己的 `pNN.md`；契约与底盘规定全局一致性，逐页规格决定本页内容与构图。

# 1. 这堂课在讲什么

全课主张：神经网络的“学习”，是先把错误变成一个数，再为每个可调参数找到让错误下降的方向，并沿该方向反复迈小步。它不是凭空获得知识，也不是神秘的类脑活动。

五幕任务：

1. 01–03：把学习建立为“用样本检验并修改预测器”。
2. 04–08：说明一个神经元如何用权重、偏置和激活函数产生预测，并用损失衡量错误。
3. 09–13：通过比较参数附近的损失得到下坡方向，用学习率决定更新步幅。
4. 14–18：把同一动作扩展到多层网络；反向传播逐层分配改参责任。
5. 19–21：复述并迁移训练循环，同时限定结论：误差下降不等于理解、因果或公平。

证据链必须保持 E1→E5：

- E1：输入乘权重、加偏置、经激活函数，得到 0–1 预测。
- E2：损失把“错得多严重”压成可比较的数。
- E3：参数附近的损失变化给出下坡方向；学习率把方向变成实际更新。
- E4：反向传播从输出错误出发，沿连接向后传递责任，一次得到全网参数的更新方向。
- E5：重复“预测—计错—反传—更新”可降低训练误差并改变决策边界，但受数据、模型和步长约束。

本页只承担 `pNN.md` 指定的证据、问题和动作。规格标为“不许碰”或由别页负责的内容，不得提前讲解、补充证明、重复演示或剧透结论。01、02、09、14、20、21 不设置交互控件，也不伪装可点击区域。

跨页视觉语法：

- 数据和观察值用直角薄框；参数用带刻度的圆角旋钮框。
- 前向传播一律使用左→右实线箭头；反向传播一律使用右→左双线箭头。
- 神经元使用带汇合入口和单一输出口的圆角六边形；网络层按竖列分区。
- 页面采用直角分栏；仅按钮和参数旋钮可用圆角。当前步骤用加粗外框，不用阴影建立层级。
- 图表、公式、讲解块之间至少留画面宽度 4% 的空白。
- 整体保持亮色、线性、扁平的工程实验记录本观感；禁用霓虹赛博大脑、暗底发光网络、粉笔黑板推导和代码编辑器界面。
- 衬线体只用于每幕开头的一句主张；无衬线体用于标题、正文、控件和图表；等宽体只用于参数值、更新前后数值及步骤编号。

# 2. 颜色语义

| token / 色相 | 唯一含义 | 允许出现的位置 |
|---|---|---|
| `--paper` / 暖灰 `#F4F1E8` | 实验记录纸底色 | 页面底色、留白区域 |
| `--forward` / 深蓝 `#2457A6` | 模型当前产生的预测或前向信息 | 预测值、前向箭头、当前输出、前向曲线或对应标记 |
| `--focus` / 橙色 `#E56B2F` | 此刻需要观察或操作的位置 | 当前控件、当前步骤、更新落点、教师正在指认的局部 |

语义色不得挪作装饰、章节配色或任意分类色。深蓝不得表示反向信号，橙色不得长期铺满大区块。文字、边框、网格、非当前数据、反向双线箭头及无概念含义元素均使用主题提供的中性色。不得新增与上述语义竞争的高饱和色。

# 5. 技术契约

固定文档骨架：

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

只修改 `#stage` 的内容。`data-page` 必须保留两位页码，`data-total="21"` 不变；不得把页码显示给读者。

逻辑画布固定为 1600×900，不得产生页面或舞台滚动。`#stage` 为 flex 列；顶层区块必须给固定高度或 flex 份额，主内容区使用 `flex:1`。默认使用 flex，只有真正二维对齐才使用 grid。

字号只能使用主题 token：正文及成句说明 ≥16px；控件标签、图例、图注、提示 ≥14px；纯数字刻度 ≥12px；多行文字行高 ≥1.35。KaTeX 基准字号统一 ≥20px。

颜色、字体、圆角、阴影和共享组件取自主题接口。一次性尺寸可写内联样式，不为单页尺寸创建公共类。不得移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制；缩放画布内禁止 `position:fixed`。

页面必须可在 `file://` 下自包含运行，只引用 `pages/` 内相对路径，不用 CDN。用不到的库不加载。用途与库：

| 用途 | 库 |
|---|---|
| 常规坐标图表 | ECharts |
| 可拖拽二维场景 | Konva |
| 矢量节点连线与数据绑定 | d3 |
| 分步动画 / 时间线 | anime / GSAP |
| 数学排版 | KaTeX |
| 可复现随机 | seedrandom |
| 小型二分类网络实时训练、决策边界 | `mlp.js` |
| 矩阵原语 | ml-matrix |
| 真实图片卷积、预训练模型或大 GPU 矩阵 | TensorFlow.js |
| 物理模拟 / 三维场景 | Matter.js / three.js |

图表优先使用已安装库，不重复实现成熟能力。ECharts 必须以 `echarts.init(el, null, {renderer:'svg'})` 初始化，并显式设置全局、坐标轴、图例和提示字号；带词句的刻度 ≥14px，纯数字刻度可为 12px。Konva 主要绘图形，标签优先用 DOM 叠加；必须使用 `Konva.Text` 时显式设置合规字号。

Canvas 使用 `Deck.fit()` 或 `Deck.autofit()`；指针坐标用 `Deck.pt()`；动画用 `Deck.loop()`。Konva 自带缩放后的指针换算，不重复换算。随机生成样本、抽样或初始化必须加载 seedrandom 并使用固定且页级稳定的种子。

教学常量、范围、初值和结果必须来自 `Lec.K` / `Lec.P` 并在页面运行时当场计算。禁止预录结果、硬编码计算结论或展示假数据。首屏必须静止且已包含可讲信息；动画与交互只是改变或检验状态，不能用空白首屏等待播放。

`Lec.K`：

- `BINARY_CLASSIFICATION_THRESHOLD`
- `FINITE_DIFFERENCE_STEP`
- `GRADIENT_CHECK_RELATIVE_TOLERANCE`
- `PROBABILITY_EPSILON`
- `RELU_DERIVATIVE_AT_ZERO`

`Lec.P` 公开接口；调用时保留签名和返回字段：

- `activationDerivative(name, preActivation, output)` → 数值
- `activationValue(name, value)`
- `applyGradients(layers, layerGradients, learningRate)`
- `binaryCrossEntropy(probabilities, targets)` → `{value, dProbabilities}`
- `binaryCrossEntropyWithLogits(logits, targets)` → `{value, probabilities, dLogits}`
- `denseBackward(upstreamGradients, cache)` → `{dInputs, dWeights, dBiases}`
- `denseForward(inputs, weights, biases, activationName)` → `{outputs, cache}`
- `dot(left, right)`
- `finiteDifferenceGradient(valueFunction, values, step)`
- `gradientRelativeError(analytic, numeric)` → `{maximumRelativeError, passes}`
- `meanSquaredError(predictions, targets)` → `{value, dPredictions}`
- `networkBackward(outputGradients, cache)` → `{dInputs, layerGradients}`
- `networkForward(inputs, layers)` → `{outputs, cache}`
- `neuronForward(inputs, weights, bias, activationName)` → `{preActivation, output}`
- `sigmoid(value)` → 数值
- `softmax(logits)`
- `softmaxCrossEntropy(logits, targetIndex)` → `{value, probabilities, dLogits}`

使用 `mlp.js` 时只用于任意层数、单 sigmoid 输出的二分类。学习率过大但准确率停在 0.5 不等同于 `net.diverged`；必须分别检查性能与数值崩溃。小型实时网络优先使用 `mlp.js`，不得改用 TensorFlow.js；使用 TensorFlow.js 时每步必须 `tf.tidy()` 或手动 `dispose()`。

# 6. 图片

优先使用 `assets/img/IMG.md` 已登记素材，不重复下载、生成或另存同一素材。按索引填写 `<img title="…">`，`title` 必须与登记信息对应。出处与许可不进入主画面。带“AI生成”角标的插画不得裁掉角标，也不得被文字、控件、遮罩或其他内容覆盖。

# 7. 文字风格

面向无微积分、线性代数和编程基础的大学通识课学生。先用可观察动作和数值关系，再给术语；术语首次出现时用一句人话界定，不用代码语法代替解释。公式只承担本页不可替代的数量关系，不连续推导，不引入逐页规格未要求的符号。

使用适合课堂口述的短句，一句只推进一个判断。按钮写动作，提示写“调什么、看哪里”，反馈说明“数值怎样变、这支持什么判断”。不用居高临下的“很简单”“显然”“只需”，不用评价教学设计的元评论。

删除“如图所示”“接下来我们将”“这一页介绍”等空转句。关键数字给可感换算，例如“损失从 0.80 降到 0.40，约减半”；不要把微小变化写成“明显改善”。受样本、随机性或阈值影响的结论必须注明适用条件；无法由当前数据支持的结论明确标为“不确定”。

交互提示不得假定学生会编程，不出现“运行代码”“修改变量”。使用“拖动权重”“把学习率调到”“比较更新前后”等直接动作。收束句只写本页要带走的主张；下一问负责推进到后页，不把收束写成本页摘要，也不得提前回答下一页。