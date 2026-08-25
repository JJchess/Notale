构建本页前，必须且只需阅读本契约、`assets/CHASSIS.md` 与本页 `pNN.md`。  
不要读取其他页面的 `pNN.md`、`PLAN.md`、其他页面成品或 CSS/JS 实现源码。  
每个 agent 只实现自己的页面；跨页一致性以本契约为准，页内内容以本页规格为准。

## 1. 这堂课在讲什么

全课主张：暖海面主要回答台风“能不能变强”，大尺度气流主要回答它“往哪里走”；路径预报必须同时表达观测误差、模型误差与随时间扩大的不确定性。

| 幕 | 页 | 任务 |
|---|---:|---|
| I 先画一条你以为的路径 | 01–03 | 暴露“台风沿固定方向走”的直觉；把增强原因与转弯原因分开。 |
| II 暖海面提供能量，但不掌舵 | 04–08 | 建立暖海面、湿空气、深暖水层到海气能量交换的证据链；同时加入风切变、陆地等限制条件。 |
| III 真正的方向盘在大气里 | 09–15 | 用多层引导风解释平移；用副热带高压边缘与中纬度西风的配置解释转弯。 |
| IV 预报的是一组可能路径 | 16–21 | 从初值差异走向集合路径、概率范围与决策阈值，拒绝把路径锥读成确定轨道。 |

跨页证据链固定为：

- E1：较暖海面、较高湿度和较深暖水层可增大海气能量交换，为维持或增强提供条件；暖海面本身不决定移动方向。
- E2：台风中心的平移主要接近周围多层大气引导风的加权结果，不是被自身旋转“带着走”。
- E3：地球自转塑造大尺度风场；台风沿副热带高压边缘移动并接入中纬度西风时，常由偏西北转向偏北或东北。
- E4：微小初值差异会随时间放大；路径预报应以集合路径、概率范围和决策阈值理解。

每页只实现本页 `pNN.md` 指定的任务、证据与交互。规格中标为“不许碰”或明显由后页承担的概念，不得提前讲解、预演结论或重复制作；前页已经完成的内容只可作为必要前提，不得另起一套表述。

## 2. 颜色语义

| token / 色相 | 唯一含义 | 允许出现的位置 |
|---|---|---|
| `--paper` / 浅暖灰 `#F3F1EA` | 无数据含义的纸面底色 | 全页背景、图表底面 |
| `--flow` / 深青蓝 `#176B78` | 大尺度环境气流，以及由该气流计算得到的移动路径 | 直线环境风箭头、引导风结果、计算路径、对应标签 |
| `--focus` / 橙红 `#E4572E` | 教师当前讲解或学生刚操作的对象 | 当前步骤、当前控件、选中对象、即时反馈；高亮面积受控 |
| 主题中性色 / 深灰、灰、白 | 无概念含义的结构与文字 | 正文、边框、等压线、坐标、背景分层、禁用态 |

语义色不得挪作装饰、章节配色或任意分类色。海温、湿度、风切变、强度、概率等若本页规格未另定编码，使用中性色、纹理、线型、位置或标签区分。实测或给定状态用 6px 圆角实线框，预测状态用同尺寸虚线框；路径中心用实心圆点串联，不确定范围用低密度斜线填充，不得只靠颜色辨认。

环境风只画直线箭头，长度表示速度；台风自身环流只画闭合螺旋线。海洋、低层、中层或高层按水平分带组织，边界为 2px 实线。图内四周至少保留画面宽度 6% 的空白，长说明放在图外就近对齐。

## 3. 知识结构——骨架约定

容器不是知识关系，不以“卡片网格”或“左右两栏”代替结构。

| 结构 | 必须直接看见的关系 | 最低几何要求 | 失败形态 |
|---|---|---|---|
| process | 先后、因果或状态推进 | 可见方向轴、箭头或连续路径 | 只有并排块 |
| comparison | 同一维度上的差异 | 同行、同尺度、同基线 | 两边各画各的 |
| classification | 上下位或部分—整体 | 嵌套、包含或明确缩进 | 同级平铺 |
| generalization | 主张与支撑 | 主张更重，支撑挂在同一主干 | 主张和证据同权 |

优先使用 `theme.css` 提供的 `.k-*` 知识结构原语。SVG、Canvas、图表或语义化 DOM 可以替代原语，但替代后仍必须直接呈现相同关系；不能用标题文字声称有关系，而画面只有若干容器。

## 4. 交互的规矩

- 同一个知识关系只设一种主要交互路径，不用滑块、按钮、拖拽等多个控件重复导向同一结论。
- 教学常量、范围、初值来自 `Lec.K`；计算结果当场调用 `Lec.P` 得出。禁止硬编码预录结果、伪造观测、为配合讲解制造假数据。
- 随机过程必须使用固定种子，同页每次打开产生相同序列。首屏保持静止，并且在未操作时已经包含可讲的信息。
- 交互页必须给出明确、就近的操作提示。滑块、切换和游标是观察仪器；没有目标态时不得显示“正确/错误”。只有分拣、配对、拼装等本来存在标准答案的任务才判定正确性。
- 任何状态下，说明都必须对当前计算结果成立；不得写只对默认值成立的结论。
- 01、03、09、12、14、16、20、21 为无交互页，不添加装饰性点击、悬停、自动播放或伪控件。其余页面是否交互仍以本页 `pNN.md` 为准。

## 5. 技术契约

固定骨架：

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

只修改 `#stage` 的内容；按需增加本地库引用，但不改骨架资源。`data-page` 保持两位数字，`data-total="21"`；页码只供系统识别，不显示给读者。

逻辑画布固定为 1600×900，不得滚动。`#stage` 是 flex 列；顶层区块使用固定高度或 flex 份额，主内容区使用 `flex:1`。默认用 flex，只有真正二维对齐才用 grid。主内容不得依赖页面滚动或浏览器视口单位。

字号只用主题 token：正文与成句说明 ≥16px；控件标签、图例、图注、提示 ≥14px；纯数字刻度 ≥12px；多行文字行高 ≥1.35。颜色、字体、圆角、阴影和共享组件均取主题接口。一次性尺寸可内联，不为单页尺寸新造公共类。

不得移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制；缩放画布内禁止 `position:fixed`。页面必须自包含运行，只引用 `pages/` 内相对路径，不使用 CDN。

| 用途 | 库 |
|---|---|
| 碰撞、约束、拖拽物理 | Matter |
| 三维场景；球面地球 | Three；Globe.gl |
| 常规图表 | ECharts |
| 可命中、可拖拽二维场景 | Konva |
| 矢量与数据绑定 | D3 |
| 海量二维元素 | PixiJS |
| 分步或时间线动画 | anime.js；GSAP |
| 矢量动画、伪三维 | Lottie；Zdog |
| 数学公式 | KaTeX |
| 矩阵计算 | ml-matrix |
| 可复现随机 | seedrandom |
| 实时小型二分类网络 | `mlp.js` |
| 预训练模型、卷积或大型 GPU 矩阵 | TensorFlow.js |

不用的库不引用。图表优先使用已安装库，不重复实现成熟能力。ECharts 必须以 `echarts.init(el, null, {renderer:'svg'})` 初始化，并显式设置全局 16px、标签与图例至少 14px、纯数字刻度至少 12px。Konva 主要绘图形，文字优先用 DOM 叠加；必须使用 `Konva.Text` 时显式设置合规字号。

Canvas 使用 `Deck.fit()` / `Deck.autofit()`；指针坐标使用 `Deck.pt()`；动画使用 `Deck.loop()`；交互画布加 `.no-pan`。KaTeX 同时引用本地 CSS 与 JS，公式基准字号统一不低于 20px。所有随机样本用 `new Math.seedrandom('page-NN')` 或本页规格给定种子。TensorFlow.js 每一步置于 `tf.tidy()` 中或显式 `dispose()`。

`Lec.P` 公开接口只按以下签名调用，不读取或复制实现：

    advancePosition(latitudeDeg, longitudeDeg, eastVelocityMps, northVelocityMps, durationHours)
    airSpecificHumidity(temperatureC, relativeHumidityPct, pressureHpa)
    coriolis(latitudeDeg)
    coriolisAcceleration(eastVelocityMps, northVelocityMps, latitudeDeg)
    geostrophicWind(pressureGradientEastPaPerM, pressureGradientNorthPaPerM, latitudeDeg, airDensityKgPerM3)
    greatCircle(startLatitudeDeg, startLongitudeDeg, endLatitudeDeg, endLongitudeDeg)
    intensificationRate(initialWindMps, finalWindMps, durationHours)
    moistEnthalpy(temperatureC, specificHumidityKgPerKg)
    oceanHeatContent(profile, thresholdC)
    potentialIntensity(seaSurfaceTemperatureC, airTemperatureC, relativeHumidityPct, pressureHpa, outflowTemperatureC, exchangeCoefficientRatio)
    saturationSpecificHumidity(temperatureC, pressureHpa)
    saturationVaporPressure(temperatureC)
    steeringWind(layers)
    surfaceEnthalpyFlux(windSpeedMps, surfaceEnthalpyDifferenceJPerKg, exchangeCoefficient, airDensityKgPerM3)
    verticalWindShear(lowerEastMps, lowerNorthMps, upperEastMps, upperNorthMps)

不得改参数顺序、返回字段或单位。输入输出展示使用等宽字体；单位必须可见。

## 6. 图片

优先使用 `assets/img/IMG.md` 已登记素材，不重复下载、抓取或生成同类图片。引用时按索引原样填写 `<img title="…">`，并提供准确 `alt`；出处与许可不进入主画面。照片只用于建立真实台风或观测设备场景，数据关系仍用锐利的矢量图表达。图片采用主题已有的边框、圆角和底图规则，不拉伸变形。生成插画的“AI生成”角标必须完整可见，不得被裁切、遮挡或覆盖。

## 7. 文字风格

面向学过基础地理和简单力学、但没有气象学基础的高中生。先用熟悉语言建立现象，再引入“海气能量交换、垂直风切变、引导气流、副热带高压、西风带、初值误差、集合预报”等术语；术语首次出现时用一句短解释，不堆定义。

使用适合教师口讲和投影扫读的短句，一句尽量只承担一个判断。提示使用直接动词，如“拖动风速”“比较两条路径”“先看箭头长度”。删除“如图所示”“接下来我们将”“本页旨在”等空话，以及评价教学设计的元评论。

关键数字给可感换算，并保留单位；例如把速度补充为“一节课内大约移动多少千米”。近似、条件性和概率性结论明确写“约”“在这些条件下”“更可能”，不得把相关关系写成唯一因果。收束句写学生应带走的主张；推进内容用下一问提出，不把收束句写成本页摘要。

## 8. 自检

完成后使用 `Check` 检查本页：JS 错误为 0、资源失败为 0、越界为 0、裁切为 0，字号全部满足分层地板。交互页必须覆盖默认态、操作中、边界值、重置后及每个主要结果状态；固定种子下结果可复现。

发现问题区域时，先用 `Look` 查看实际画面与状态，再用 `Patch` 合并修复；不得凭猜测反复覆盖。最终只交付本页 HTML，不修改公共资源，不增加测试、截图、日志或报告文件。

## 9. 版面密度与常见坑

- 主内容使用 flex 吃满剩余空间，不给普通内容块写死高度。
- 画面占用低于 45% 时，先检查失控的 flex 空隙，再放大有教学意义的关系；不得增加装饰撑满。
- 画面占用高于 85% 时删减内容，或报告需要拆页；不得缩小字号规避。
- 骨架与包裹层优先用线、缩进、包含和层级表达，不堆叠多层填色卡片。
- 照片使用主题已有边框、圆角和底图规则；Canvas 交互区必须加 `.no-pan`。
- 不在地图或轨迹上压长句；说明移到图外并与对象就近对齐。
- 不用大面积黑底、闪电、浪墙等灾难电影海报语言；不使用拟人台风、眼睛或方向盘。
- 不使用连续彩虹气象图。同一色相不得跨海温、风速、概率等不同变量复用。
- 不把台风螺旋当作移动箭头，不把路径锥画成台风实体尺寸，也不把锥边界说成“安全线”或确定边界。