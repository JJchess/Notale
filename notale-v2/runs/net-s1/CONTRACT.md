# CONTRACT.md

阅读边界：动手前必须读完本契约、`assets/CHASSIS.md` 和自己的 `pNN.md`。不要读其他页的 `pNN.md`、`PLAN.md`，也不要翻 CSS/JS 实现源码——接口按下文签名使用即可。

## 1. 这堂课在讲什么

总主张：神经网络的"学习"是一个可看见、可用手拨动的数值下坡过程——预测错了，就沿误差对权重的斜率往下走一步，重复够多次，网络就"会"了。

七章任务：I(01–02) 让"学会"变得可观察；II(03–06) 神经元是加权投票机+压缩函数；III(07–09) 误差是权重的函数，是一张曲面；IV(10–12) 沿斜率走一步，误差下降，学习率定步长；V(13–16) 链式法则把责任逐层分配回去；VI(17–20) 四件事循环起来就是训练；VII(21–22) 边界与迁移。

证据链 E1–E5 逐页递进，见上表映射，每个证据只在其所属页首次成立，后面页引用而不重新论证。

每页只实现自己的 `pNN.md`；本契约点名的"这是别页的事"不得提前重复——尤其是：链式法则的推导只在 13–16 出现，反向传播动画不得提前到 07–12；梯度下降的下坡小人只在 p10；误差曲面/loss 数字从 p07 起才出现。无交互页（01 02 07 13 17 21 22）不加控件，只讲结构与叙事。

## 2. 颜色语义

| token / 色相 | 唯一含义 | 允许出现的位置 |
|---|---|---|
| 中蓝 `#2B5FA6` | 权重/网络结构本身 | 神经元圆圈、连接线默认态 |
| 暖橙 `#E8650A` | 当前正在被讲解的那件事 | 高亮节点、loss 当前值、梯度箭头、焦点虚线框 |
| 深红 `#C0392B` | 负权重 / 误差上升方向 | 只叠加在蓝/橙元素之上做辅助，不独立成块 |
| 深绿 `#27AE60` | 正确预测 / 误差已收敛 | 同上，只做辅助叠加 |
| 米白底 `#F5F0E8` | 无概念含义，画布底色 | 全页背景 |

语义色不得挪作装饰性配色；没有概念含义的辅助元素（网格线、分隔线、卡片边框）用中性灰或既有底色，不借用以上四色。

## 3. 知识结构——骨架约定

容器不是知识关系。卡片网格、左右两栏本身不表达任何逻辑，谁用它们代替下表中的结构，视为未完成。

| 结构 | 必须直接看见的关系 | 最低几何要求 | 失败形态 |
|---|---|---|---|
| process | 先后、因果或状态推进 | 可见方向轴、箭头或连续路径 | 只有并排块 |
| comparison | 同一维度上的差异 | 同行、同尺度、同基线 | 两边各画各的 |
| classification | 上下位或部分—整体 | 嵌套、包含或明确缩进 | 同级平铺 |
| generalization | 主张与支撑 | 主张更重，支撑挂在同一主干 | 主张和证据同权 |

`theme.css` 提供 `.k-*` 原语覆盖以上四种常见摆法；SVG、Canvas、d3、Konva 皆可替代，只要求关系在画面上真正成立，不允许用容器堆叠冒充结构。

## 4. 交互的规矩

- 同一关系只配一种主要交互路径，不用滑块+按钮重复表达同一个结论。
- 教学常量、范围、初值和结果一律来自 `Lec.K` / `Lec.P` 当场计算；不得预录结果、不得写假数据凑图。
- 随机过程固定种子（`seedrandom`）；首屏静止状态本身已经包含可讲的信息，不依赖交互才能读懂。
- 滑块/切换/游标是观察仪器：没有预设目标态时不得编造对错提示；只有分拣、配对、拼装等本来就有正确答案的任务才做判定。
- 每个交互控件配一句明确操作提示（做什么、看什么）。
- 未在 `pNN.md` 规划交互的页面不加任何装饰性可操作元件。

## 5. 技术契约

固定骨架：

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="22">
      <div id="stage"></div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

规则：

- 只改 `#stage` 内部；`data-page`/`data-total` 两位数字保留，不向读者显示页码。
- 逻辑画布 1600×900，禁止滚动。`#stage` 是 flex 列；顶层区块给定固定高度或 flex 份额，主内容区 `flex:1`。
- 字号只用主题 token：正文/成句 ≥16px，控件标签/图例/图注/提示 ≥14px，纯数字刻度 ≥12px，多行行高 ≥1.35。
- 颜色、字体、圆角、阴影、共享组件取自主题接口；一次性尺寸可内联，不为单页新建公共类。
- 不得移除或覆盖 `.min0` `.cv-fill` `.no-pan`；缩放画布内禁止 `position:fixed`。
- 默认 flex，只在真正二维对齐时用 grid。自包含运行，只引用 `pages/` 内相对路径，不用 CDN。
- 优先用已装库，不重复实现成熟能力；ECharts 必须 `renderer:'svg'` 并显式设字号；Canvas 用 `Deck.fit()`/`Deck.autofit()`，指针用 `Deck.pt()`，动画用 `Deck.loop()`。

用途→库：

| 用途 | 库 |
|---|---|
| 物理下落/碰撞/拖拽约束 | matter.min.js → `Matter` |
| 三维场景/立体结构 | three.min.js → `THREE` |
| 三维地球 | globe.gl.min.js（需先引 three）→ `Globe` |
| 生成式动画背景 | vanta.net.min.js（需先引 three）→ `VANTA` |
| 坐标轴图表（折线/柱/散点/热力） | echarts.min.js → `echarts`，必须 `renderer:'svg'` |
| 可拖拽二维场景 | konva.min.js → `Konva`（文字标签用 DOM 叠加，不用 `Konva.Text`） |
| 节点连线/精确矢量绑定 | d3.min.js → `d3` |
| 海量元素同时运动 | pixi.min.js → `PIXI` |
| 分步动画/路径描绘 | anime.min.js → `anime`（v3 API：`anime({targets:…})`） |
| 多动画精确编排 | gsap.min.js → `gsap`，滚动绑定加 ScrollTrigger.min.js |
| 矢量动画文件播放 | lottie.min.js → `lottie` |
| 伪三维插画 | zdog.min.js → `Zdog` |
| 指针跟随倾斜 | vanilla-tilt.min.js → `VanillaTilt` |
| 进入视野淡入 | aos.js → `AOS` |
| 数学公式 | katex.min.css + katex.min.js → `katex`，基准字号 ≥20px（分式带上下标时尤其不能低于此） |
| 矩阵运算 | ml-matrix.umd.js → `mlMatrix`（只做计算，不重写 `mlp.js` 的训练循环） |
| 可复现随机 | seedrandom.min.js → `Math.seedrandom`，凡随机采样必须固定种子 |
| 页面实时训练小型二分类网络 | mlp.js → `MLP.create({sizes, act, lr, seed})`，逐帧 `net.step()` |
| 预训练模型/真图卷积/大矩阵 GPU | tf.min.js → `tf`，两三层小网络训练不要用它；用了必须 `tf.tidy` 或手动 `dispose`，盯住 `tf.memory().numTensors` |

`Lec` 公开接口按签名直用，不重复实现：
`Lec.K`: ACT、ACT_RANGES、DEFAULT_LR、EPS、LEAKY_RELU_ALPHA、LOGIC_GATES、LOSS、NUMERIC_GRAD_H、SIGMOID_MAX_DERIV、TANH_MAX_DERIV。
`Lec.P`: activate、activateGrad、bce、bceGrad、layerBackward、layerForward、mse、mseGrad、neuronBackward、neuronForward、numericGradient、sgdUpdate、sgdUpdateVector。

## 6. 图片

优先使用 `assets/img/IMG.md` 已登记素材，按索引填 `<img title="…">`；不重复下载或生成新图。出处与许可信息不进入主画面；AI 生成图的角标不得被任何内容遮挡。

## 7. 文字风格

面向文理混合、无微积分/编程基础的通识学生：术语第一次出现给一句人话解释，不假定先备知识。句子短、讲课口吻，像教师带读时说的话。删除"如图所示""接下来我们将"一类过渡语，删除评价教学设计本身的元评论。给数字配可感换算（比如把学习率类比成步子大小，把 loss 值类比成"离答案还有多远"）。不确定或近似的结论要明确标注（"大约""在这个例子里"）。收束句给出这一页读者该带走的一句主张，不写成"本页小结"，也不预告下一页——推进交给下一页自己开场。

## 8. 自检

完成后用 `Check` 检查本页：JS 错误、资源加载失败、越界、裁切均须为 0，字号符合分层地板。交互页必须覆盖每个主要状态（初始态、拖动中、极端值、完成态）。问题区域先用 `Look` 定位再用 `Patch` 合并修复，不绕过定位直接改。最终只交付本页 HTML，不改公共资源（`assets/` 下任何文件），不新增测试或报告文件。

## 9. 版面密度与常见坑

- 主内容用 `flex:1` 吃满剩余空间，普通内容块不写死高度。
- 画面占用低于 45% 时检查失控的 flex 空隙，把有教学意义的关系放大，不用装饰凑满；高于 85% 时删减内容或在交付说明里报告需要拆页，不许缩字号顶格塞。
- 骨架和包裹层优先靠线条、缩进、层级表达从属关系，不叠多层填色卡片充当结构。
- 照片沿用主题已有边框/圆角/底图规则；所有 Canvas 交互区加 `.no-pan`。