必须阅读本契约、`assets/CHASSIS.md` 和本页 `pNN.md`。  
不要读取其他页面、`PLAN.md`，也不要读取 CSS/JS 实现源码。  
每个 agent 只构建自己负责的页面；最终仅交付该页 HTML。

## 1. 这堂课在讲什么

全课主张：人类扩展生存边界的主导方式，从身体缓慢适应，转向文化累积，再转向以工程技术构造“体外生理系统”；环境约束、代价与失败风险始终存在。

- 01–04：定义生存包络，即环境压力、身体能力与外部工具共同决定的可生存范围。
- 05–12：用化石、脚印与环境证据说明早期人族是分支式、镶嵌式演化，不是线性阶梯。
- 13–23：用石器、火、合作和跨代学习说明适应如何外置，并超过遗传演化的速度。
- 24–28：统一为“约束—方案—代价—筛选”，比较基因、文化与工程技术。
- 29–43：以压力、氧气、热、辐射、重力和废物回路说明太空人如何携带一个“小地球”。
- 44–45：落到结论：技术扩大可居住范围，却把人体边界转化成耦合系统及其失效风险。

证据链必须服务于 E1–E5：环境只设置约束；身体适应具有收益与代价；文化把适应移到体外；太空移除人体默认条件；生命支持扩大包络，同时增加质量、能量、维护与单点失效代价。

每页只实现本页 `pNN.md` 指定的主张、证据、交互和收束。标为其他页负责的定义、案例、计算、反转或结论均属“不许碰”：不得提前讲解、重复展开或替别页收束。01、02、05、23、28、45 不添加交互。

## 2. 颜色语义

| token / 色相 | 唯一含义 | 允许出现的位置 |
|---|---|---|
| `life-envelope` / 深青 `#245B63` | 可维持生命的包络或已闭合回路 | 生存区域、包络边界、已闭合的空气/水/热回路及其直接标签 |
| `focus-limit` / 橙红 `#D85B35` | 当前讲解焦点、超限值或正在拖动的变量 | 单一焦点、越界读数、活动拖拽物；单页面积不超过 8% |
| `paper` / 暖明 `#F4F0E6` | 博物馆标签纸式底面，无知识分类含义 | 页面底色与必要的中性承托面 |
| `neutral` / 主题中性色 | 无概念含义 | 正文、边框、坐标、未激活控件、器物框和辅助线 |

语义色不得互换或用作装饰。猿人与太空人的可生存区域统一使用 `life-envelope`，不得各设阵营色。环境约束、身体能力和外部技术分别靠实线边界、人体轮廓、可拆卸矩形模块区分，不靠颜色区分。

## 3. 知识结构——骨架约定

容器不是知识关系，不以“卡片网格”或“左右两栏”代替结构。

| 结构 | 必须直接看见的关系 | 最低几何要求 | 失败形态 |
|---|---|---|---|
| process | 先后、因果或状态推进 | 可见方向轴、箭头或连续路径 | 只有并排块 |
| comparison | 同一维度上的差异 | 同行、同尺度、同基线 | 两边各画各的 |
| classification | 上下位或部分—整体 | 嵌套、包含或明确缩进 | 同级平铺 |
| generalization | 主张与支撑 | 主张更重，支撑挂在同一主干 | 主张和证据同权 |

优先使用 `theme.css` 提供的 `.k-*` 知识结构原语。SVG、Canvas 或图表可以替代这些原语，但关系必须在画面上直接成立。比较页必须共享中央尺度；因果只用单向直箭头，虚线只表示假说、不确定连接或未闭合回路。

## 4. 交互的规矩

- 同一个关系只使用一种主要交互路径，不用多个控件重复同一结论。
- 教学常量、范围、初值和结果来自 `Lec.K` / `Lec.P`，并在页面运行时计算；禁止预录结果、硬编码结果或展示假数据。
- 随机过程必须使用固定种子；同一输入必须复现同一输出。
- 首屏静止状态必须已经包含可讲信息，不能依赖先点击、播放或拖动才能理解页面。
- 交互页必须给出就近、明确的操作提示。
- 滑块、切换和游标是观察仪器；没有目标态时不得编造正确、错误、得分或成功提示。
- 只有分拣、配对、拼装等本来存在答案的任务才判定正确性，并应允许重试。
- 一次操作只改变其声明控制的变量；相关数值、图形和结论同步更新。
- 未规划交互的页面不得添加轮播、悬停翻面、装饰拖拽、自动播放等操作。

## 5. 技术契约

固定骨架：

    <!doctype html>
    <html lang="zh">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="assets/base.css">
      <link rel="stylesheet" href="assets/theme.css">
    </head>
    <body data-page="NN" data-total="45">
      <div id="stage"></div>
      <script src="assets/base.js"></script>
      <script src="assets/lec.js"></script>
    </body>
    </html>

- 只修改 `#stage` 内容。`data-page` 保留两位数字，`data-total="45"`；不得把页码显示给读者。
- 逻辑画布固定为 1600 × 900，不得滚动。`#stage` 为 flex 列；顶层区块给固定高度或 flex 份额，主内容区使用 `flex:1`。
- 字号只用主题 token。正文与成句说明 ≥16px；控件标签、图例、图注和提示 ≥14px；纯数字刻度 ≥12px；多行文字行高 ≥1.35。
- 颜色、字体、圆角、阴影和共享组件取自主题接口。一次性尺寸可内联，不为单页尺寸新增公共类。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制；缩放画布内禁止 `position:fixed`。
- 默认使用 flex；只有真正二维对齐时使用 grid。
- 页面须在 `file://` 下自包含运行，只引用 `pages/` 内相对路径，不使用 CDN。
- 图表优先使用已安装库，不重复实现成熟能力。ECharts 必须使用 SVG renderer，并显式设置全局、坐标轴、图例和 tooltip 的合规字号。
- Canvas 使用 `Deck.fit()` / `Deck.autofit()`；手写 Canvas 指针坐标使用 `Deck.pt()`，动画使用 `Deck.loop()`。Canvas 交互区添加 `.no-pan`。
- Konva 图形可用于拖拽和命中检测；文字标签优先使用 DOM 叠加。必须使用 `Konva.Text` 时显式设置字号。
- KaTeX 同时引入 CSS 与 JS；复杂分式、上下标公式基准字号 ≥20px。
- tf.js 仅用于预训练模型、卷积或需 GPU 的大矩阵；小型逐帧二分类训练使用 `mlp.js`。tf.js 每步须 `tf.tidy()` 或显式 `dispose()`。

| 用途 | 库 |
|---|---|
| 碰撞、约束、物理拖拽 | Matter.js |
| 三维场景；三维地球 | Three.js；Globe.gl |
| 常规坐标图表 | ECharts，`renderer:'svg'` |
| 二维拖拽与命中 | Konva |
| 矢量关系图与数据绑定 | D3 |
| 大量运动元素 | PixiJS |
| 分步或时间线动画 | anime.js / GSAP |
| 矢量动画、伪三维 | lottie / Zdog |
| 数学排版、矩阵计算 | KaTeX / ml-matrix |
| 固定种子随机 | seedrandom |
| 小型实时二分类网络 | `mlp.js` |
| 预训练、卷积、大矩阵 GPU | tf.js |

需要时直接按 `assets/lib/…` 本地引用；不用的库不加载。`Lec.P` 的公开签名如下，不改名、不改参数顺序、不复制实现，返回字段按公开对象原样读取：

    alleleSelection(initialAlleleFrequencyA, fitnessAA, fitnessAa, fitnessaa, generations)
    artificialGravity(radiusM, rotationsPerMinute)
    compoundChange(initialValue, fractionalChangePerPeriod, periods)
    evaporativeCooling(heatToRemoveW, durationSeconds, latentHeatJPerKg)
    gravity(centralMassKg, distanceFromCenterM)
    hardyWeinberg(alleleFrequencyA)
    orbit(centralMassKg, orbitalRadiusM)
    oxygenPressures(ambientPressurePa, oxygenFraction, waterVaporPressurePa, arterialCarbonDioxidePressurePa, respiratoryQuotient)
    radiativeEquilibrium(incidentFluxWPerM2, albedo, emissivity, absorptionToEmissionAreaRatio)
    rocketDeltaV(specificImpulseSeconds, initialMassKg, finalMassKg)
    shieldedRadiationDose(doseRateSvPerHour, durationHours, shieldingArealDensityKgPerM2, halfValueArealDensityKgPerM2)
    standardAtmosphere(altitudeM)
    thermalExchange(bodyTemperatureK, environmentTemperatureK, areaM2, emissivity, convectionCoefficientWPerM2K)

## 6. 图片

优先使用 `assets/img/IMG.md` 已登记的素材，不重复下载或生成。按索引给每个 `<img>` 填写准确的 `title="…"`；出处和许可不进入主画面。证据图片置于直角薄框内，框外留白至少为画面宽度的 4%，并提供尺度或尺度参照及简短标签。照片遵循主题已有边框、圆角和底图规则。生成插画的“AI生成”角标必须完整可见，不得被裁切、覆盖或弱化。

## 7. 文字风格

面向无古人类学、航天工程和编程基础的大学通识课学生。首次出现的必要术语用一句人话解释；不用术语堆叠，也不把严谨概念改成“更高级”“更原始”等线性价值判断。

使用适合教师口述的短句：一句优先只承担一个判断，标签优先为名词短语，操作提示用直接动词。删除“如图所示”“显而易见”“接下来我们将”和评价教学设计的元评论。

关键数字必须带单位，并给出不夸张的可感换算。估计值、模型结果、争议解释和证据缺口明确标注“约”“模型值”“一种解释”或相应不确定性。不得把相关性写成因果，也不得把单件化石写成人类共同祖先。

收束句给出本页应带走的主张；下一问只负责推进到后续问题，不写成本页摘要，不提前回答下一页。

## 8. 自检

完成后使用 `Check` 棦查本页，必须满足：

- JavaScript 错误为 0。
- 资源加载失败为 0。
- 元素越界为 0。
- 文字与关键图形裁切为 0。
- 字号符合正文、标签、刻度的分层地板。
- 首屏可讲，交互计算来自 `Lec.K` / `Lec.P`，固定种子可复现。
- 交互页覆盖每个主要状态，包括初始态、边界态、切换态、完成态或错误尝试态中实际存在的部分。
- 无交互页不存在装饰性操作。

发现问题时，先用 `Look` 查看问题区域，再用 `Patch` 合并修复；修复后重新 `Check`。最终只交付本页 HTML，不修改公共资源，不新增测试、截图、报告或说明文件。

## 9. 版面密度与常见坑

- 主内容使用 flex 吃满剩余空间，不给普通内容块写死高度。
- 画面占用低于 45% 时，先检查失控的 flex 空隙，再放大证据、共享尺度或关键关系；不得添加装饰撑满。
- 画面占用高于 85% 时，删减非必要文字与重复证据；仍无法容纳则报告需要拆页，不缩字号。
- 骨架和包裹层优先用线、缩进、包含和层级表达，不堆叠多层填色卡片。
- 证据本体与推论分开；尺度、单位和标签不得藏在长段正文中。
- 比较对象不得各用一套比例；图表不得用面积、透视或装饰尺寸暗示不存在的数量差异。
- 不用黑底 HUD、电影海报式对决、演化阶梯或儿童绘本语言。
- 卡片使用 4px 小圆角且无浮夸投影；只有可拖动物体使用 3px 下投影。
- 照片使用主题规则；Canvas 交互区添加 `.no-pan`。