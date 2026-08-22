# 《认识太阳系——天文学通识课第二讲》45 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

太阳系不是“八颗行星排成一列”，而是一个由共同引力组织、因形成位置而分化、至今仍在演化的系统。

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| I 看见系统的骨架 | 01–08 | 太阳系有明确的中心、尺度层级和分区，常见排排站图不能同时表达真实大小与距离 |
| II 让系统运转起来 | 09–16 | 行星不是被轨道托住，而是在太阳引力下持续下落；距离决定周期、速度与能量输入 |
| III 为什么会有不同的世界 | 17–24 | 岩石行星、巨行星及其卫星的差异，与温度、材料、质量和后续演化有关 |
| IV 边疆、遗迹与我们的坐标 | 25–32 | 小天体保存形成线索，撞击与迁移说明太阳系仍在变化；探测任务把模型变成可检验的问题 |

E1  太阳系具有以太阳为质量中心、由内向外分区且跨越巨大尺度的空间骨架  
E2  同一套引力规律组织所有主要天体的轨道，并产生距离、速度和周期之间的系统关系  
E3  形成位置造成材料差异，质量与能量收支又把相近原料演化成不同类型的世界  
E4  小天体、撞击痕迹与探测任务共同表明太阳系保留历史记录，而且今天仍在演化  

无交互（只承担开场/推进/过渡/收束）：01 02 09 17 25 31 32

## 0.5 视觉世界

底色      深暗取向，主背景 `#07111F`，信息面板底色 `#0D1B2D`  
主色相    轨道蓝 `#55B9FF`，代表可计算的结构、轨道和引力关系  
强调色    日光金 `#FFC857`，只用于当前焦点、太阳辐射和作答反馈中的关键证据  
字体族    标题与正文用清晰无衬线；数值、单位、任务参数和时间读数用等宽字体  
材质语言  以线性科学示意图为主，关键天体与探测证据使用写实照片  
母题      深蓝星空中被局部照亮的发光轨道环  
母题      同一对象在“直径尺度”和“距离尺度”之间切换的双尺度标尺  
母题      扁平行星圆盘与沿日照方向展开的金色温度梯度  
母题      从太阳向外延伸、逐渐稀疏的系统剖面  
母题      探测器航迹与落在真实天体照片上的细线标注  

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 必用skill |
|---|---|---|---:|---|---|---|---|---|---|
| 01 | I | — | 10 | generalization | 无 | 太阳系要被理解成一个系统，而不是一张成员名单 | 不讲系统骨架证据（p03–08） | focus | theme-factory, design-taste-frontend |
| 02 | I | — | 45 | enumeration | 无 | 本讲依次回答“在哪里、怎样动、为何不同、如何验证”四个问题 | 不复述第一讲的观测手段与尺度测量方法 | ledger | technical-wireframe-info-layout |
| 03 | I | E1 | 90 | classification | 点亮成员户籍 | “太阳系成员”包括恒星、行星、矮行星、卫星与小天体，不只八颗行星 | 不讲行星分类成因（p18–23） | stage-cards | d3-viz |
| 04 | I | E1 | 120 | comparison | 双尺度太阳系 | 任何一张普通教科书横图都无法同时按真实比例表现直径与轨道距离 | 不讲轨道速度与周期（p12–15） | canvas-full | threejs-webgl |
| 05 | I | E1 | 90 | process | 步行模型换算器 | 把太阳缩成一个可触摸的小球后，地球大小与距离会落入完全不同的直觉尺度 | 不讲真实天文距离的测量方法 | split-lr | make-illustration |
| 06 | I | E1 | 85 | enumeration | 光行程接力 | 即使信息以光速传播，从太阳到各行星仍需要数分钟到数小时 | 不讲无线电测距与通信工程（p28） | split-tb | animejs |
| 07 | I | E1 | 110 | classification | 拖拽分区边界 | 内太阳系、主小行星带、巨行星区与海王星外区域是有物理意义的分区 | 不讲雪线成因（p19） | canvas-full | konva.min.js, technical-wireframe-info-layout |
| 08 | I | E1 | 90 | comparison | 质量份额猜测 | 太阳占据几乎全部质量，因此太阳系的引力骨架高度中心化 | 不讲质心与多体摄动 | triptych | d3-viz, web-media-getter |
| 09 | II | — | 35 | generalization | 无 | 看完空间骨架，下一步是解释这些成员为何不会直线坠入太阳 | 不提前给出轨道速度关系（p11–15） | focus | corner-lasers |
| 10 | II | E2 | 120 | process | 发射轨道炮 | 轨道不是“不下落”，而是横向速度足够大时持续错过中心天体 | 不讲大气阻力与火箭推进 | canvas-full | mini-game, matterjs |
| 11 | II | E2 | 90 | comparison | 速度拨盘 | 同一距离上，速度过低会坠落、合适可成圆轨道、过高可逃逸 | 不讲椭圆轨道各处速度变化（p13） | split-lr | threejs-webgl |
| 12 | II | E2 | 95 | enumeration | 周期排序挑战 | 越远的行星公转周期通常越长，而且增长并非线性 | 不讲开普勒定律的历史发现过程 | ledger | d3-viz |
| 13 | II | E2 | 85 | process | 椭圆扫掠器 | 行星在近日点更快、远日点更慢，但一整圈仍由同一条轨道约束 | 不推导面积定律或使用微积分 | canvas-full | threejs-webgl, gsap-core |
| 14 | II | E2 | 100 | comparison | 轨道圆度体检 | 行星轨道大多接近圆，但“接近圆”不等于太阳位于圆心 | 不把彗星轨道概括成所有小天体轨道（p26） | split-tb | d3-viz |
| 15 | II | E2 | 90 | generalization | 画周期预测线 | 只凭轨道半径就能粗略预测绕日周期，显示八颗行星服从共同规律 | 不做公式推导与单位制转换 | split-lr | echarts.min.js |
| 16 | II | E2 | 85 | classification | 一天一年翻牌 | 自转、公转、昼夜与季节是不同概念，不能用“离太阳更近”解释全部时间现象 | 不展开地球季节机制 | stage-cards | animejs |
| 17 | III | — | 40 | enumeration | 无 | 相同的运动规律之下，太阳系却长出了性质悬殊的世界 | 不提前解释材料分异（p19–23） | focus | webgl-laser |
| 18 | III | E3 | 100 | comparison | 行星属性雷达 | 岩石行星与巨行星在大小、密度、表面和卫星系统上形成成组差异 | 不把“气态”解释为没有内部结构（p22） | triptych | d3-viz, web-media-getter |
| 19 | III | E3 | 95 | process | 原行星盘温度实验 | 距太阳远近改变可凝结材料的种类，为行星家族差异提供初始条件 | 不把雪线说成固定不动的硬边界 | split-lr | threejs-webgl |
| 20 | III | E3 | 90 | classification | 材料凝结卡组 | 高温区主要留下耐高温固体，低温区能保留更多冰和挥发物 | 不讲详细矿物化学与相图 | stage-cards | konva.min.js |
| 21 | III | E3 | 120 | process | 行星积木成长赛 | 局部固体材料越丰富，核心越可能快速长大并捕获大量气体 | 不把模型当作太阳系形成史的唯一细节版本 | canvas-full | mini-game, matterjs, seedrandom.min.js |
| 22 | III | E3 | 85 | enumeration | 剖开巨行星 | “气态巨行星”并非从表面到中心都是普通气体，而是随深度进入高压流体和核心区域 | 不讲高压物态方程 | split-tb | webgl-3d-object, web-media-getter |
| 23 | III | E3 | 90 | comparison | 三个世界能量账 | 金星、地球和火星的温度不能只由日距决定，反照率与大气同样重要 | 不展开气候反馈和生命条件 | ledger | echarts.min.js |
| 24 | III | E3 | 95 | classification | 卫星世界配对 | 卫星也能拥有海洋、火山与稠密大气，“行星”不是复杂世界的唯一容器 | 不逐颗罗列全部卫星 | triptych | web-media-getter, reveal-hover-effect |
| 25 | IV | — | 45 | generalization | 无 | 要追查太阳系历史，应转向未被大行星彻底改造的小天体和撞击记录 | 不提前讲探测任务选择（p28–29） | focus | web-media-getter |
| 26 | IV | E4 | 105 | process | 彗尾方向实验 | 彗尾由太阳辐射与太阳风塑造，方向主要背向太阳，并不等同于运动轨迹 | 不讲等离子体微观机制 | canvas-full | threejs-webgl |
| 27 | IV | E4 | 100 | comparison | 小天体轨道沙盘 | 小行星、彗星与海王星外天体占据不同但可重叠的轨道族群 | 不把每个轨道异常都归因于同一种迁移机制 | split-lr | d3-viz, seedrandom.min.js |
| 28 | IV | E4 | 90 | enumeration | 探测任务配对 | 飞掠、环绕、着陆与采样返回回答的问题不同，代价与信息量也不同 | 不讲火箭方程和任务预算 | ledger | web-media-getter |
| 29 | IV | E4 | 95 | process | 任务路线规划器 | 访问外太阳系通常受时间、能量和行星几何共同约束，不是地图上画一条直线 | 不展开引力助推的矢量推导 | canvas-full | mini-game, threejs-webgl |
| 30 | IV | E4 | 105 | classification | 证据拼图审判 | 陨石成分、撞击坑、轨道分布和探测数据各自约束太阳系历史的不同部分 | 不引入系外行星比较 | stage-cards | konva.min.js, web-media-getter |
| 31 | IV | — | 50 | generalization | 无 | 一张系统图可把空间骨架、共同动力学、世界分化与历史证据连成因果链 | 不增加新天体或新机制 | technical-map | technical-wireframe-info-layout |
| 32 | IV | — | 35 | enumeration | 无 | 离场时应能用四句话重建太阳系，而不是只背出八颗行星名称 | 不布置需要微积分或专业软件的任务 | focus | theme-factory |

## 2. 页间不重复的硬约定

| 概念或形式 | 唯一展开页 | 职责边界 |
|---|---|---|
| 太阳系成员分类 | p03 | 只建立“有哪些类型”；不解释形成原因 |
| 天体直径与轨道距离不能同尺展示 | p04–05 | p04揭示失真，p05把比例落到课堂可感尺度 |
| 光行时间 | p06 | 只建立通信与尺度直觉；不重复第一讲的测距方法 |
| 太阳系空间分区 | p07 | 只建立区域地图；各类小天体轨道在p27处理 |
| 太阳的质量主导地位 | p08 | 只讲质量份额与中心化；不展开质心或多体问题 |
| “轨道是持续下落” | p10–11 | p10建立核心直觉，p11区分坠落、成轨与逃逸 |
| 公转周期与距离 | p12、p15 | p12先做经验排序，p15再形成可预测的一般关系 |
| 椭圆轨道 | p13–14 | p13讲速度沿轨道改变，p14纠正常见形状误解 |
| 自转、公转、昼夜、季节 | p16 | 仅作概念拆分，不展开地球季节教学 |
| 岩石行星与巨行星比较 | p18 | 只呈现成组差异；因果解释留给p19–23 |
| 原行星盘与雪线 | p19 | 只说明温度梯度改变可凝结材料 |
| 凝结材料分类 | p20 | 把p19的温度梯度转成可操作材料分类 |
| 核心增长与捕获气体 | p21 | 作为形成机制简化模型，不承担完整形成史叙述 |
| 巨行星内部结构 | p22 | 纠正“整颗都是普通气体”的误解 |
| 行星温度与能量收支 | p23 | 只比较日照、反照率和温室增温，不讲气候反馈 |
| 复杂卫星世界 | p24 | 只用少数代表性卫星打破“卫星都像月球”的印象 |
| 彗尾 | p26 | 只讲方向和形成因素；不与p27共享轨道操作 |
| 小天体轨道族群 | p27 | 比较轨道分布；不重复p03的成员定义 |
| 探测方式分类 | p28 | 比较飞掠、环绕、着陆、采样返回的信息能力 |
| 外太阳系任务规划小游戏 | p29 | 唯一涉及任务路线、飞行时间与能量权衡的页面 |
| 多证据重建历史 | p30 | 汇合已有证据，不增加新的形成机制 |
| 三维太阳系场景 | p04、p11、p13、p19、p26、p29 | p04尺度切换；p11速度状态；p13椭圆运动；p19盘温度；p26彗尾；p29任务路线，操作目标不得复用 |
| 小游戏机制 | p10、p21、p29 | p10命中稳定轨道；p21成长为可捕气核心；p29在约束下抵达目标，三页胜负条件不同 |
| 真实天体照片 | p08、p18、p22、p24–25、p28、p30 | p08太阳质量视觉锚点；p18行星家族；p22巨行星证据；p24卫星地貌；p25小天体转场；p28任务实物；p30证据来源 |
| 全课综合 | p31–32 | p31连接因果链，p32只给离场记忆框架 |

## 3. 数字口径

- 天体顺序、类别、名称、质量、半径、直径、轨道半长轴、自转周期与公转周期统一取 `Lec.K.bodies`、`Lec.K.bodyOrder`、`Lec.K.planetOrder`、`Lec.K.categories`。
- 太阳、八颗行星、矮行星及代表性卫星的展示顺序统一取 `Lec.K.bodyOrder` 与 `Lec.K.planetOrder`，页面不得自行重排后暗示物理顺序。
- 天文单位与千米的换算统一使用 `Lec.P.auToKm`、`Lec.P.kmToAU`、`Lec.K.units`。
- 缩尺太阳系中地球直径、地球距离、木星直径和海王星距离统一使用 `Lec.P.solarSystemScaleFromSunDiameter`；单一天体模型尺寸与距离使用 `Lec.P.modelBodyDiameter`、`Lec.P.modelOrbitDistance`。
- 天体直径统一通过 `Lec.P.bodyDiameterKm` 取得；半径比、质量比、体积比统一使用 `Lec.P.bodyRadiusInEarths`、`Lec.P.bodyMassInEarths`、`Lec.P.bodyVolumeInEarths`。
- 两天体属性比值统一使用 `Lec.P.compareBodies` 或 `Lec.P.ratio`，不得在页面中另写一套四舍五入结果。
- 光从太阳到各轨道位置的传播时间统一使用 `Lec.P.lightTravelTimeFromAU`；拆成日、时、分、秒统一使用 `Lec.P.lightTravelTimeParts`。
- 无线电信号往返时间统一使用 `Lec.P.signalRoundTripSeconds`，单程与往返必须明确标注。
- 圆轨道速度统一使用 `Lec.P.circularOrbitSpeedKmSAtAU`；椭圆轨道指定位置速度统一使用 `Lec.P.visVivaSpeedKmSAtAU`。
- 逃逸速度统一使用 `Lec.P.escapeVelocityKmS`，不得把圆轨道速度与逃逸速度混为同一阈值。
- 轨道周期统一使用 `Lec.P.keplerPeriodDays` 或无量纲近似 `Lec.P.keplerPeriodYearsApprox`；不得在不同页面混用恒星日、太阳日与地球年而不标单位。
- 由周期反推半长轴统一使用 `Lec.P.semimajorAxisAUFromPeriodYears`。
- 椭圆几何统一使用 `Lec.P.orbitEllipse`；近日点、远日点距离统一使用 `Lec.P.periapsisDistance`、`Lec.P.apoapsisDistance`。
- 轨道上的位置统一使用 `Lec.P.orbitPoint` 或 `Lec.P.orbitDistanceAtTrueAnomaly`，动画不得用手绘圆代替计算轨道。
- 行星平均轨道位置演化统一使用 `Lec.P.meanOrbitalLongitudeDeg` 与 `Lec.P.normalizeAngleDeg`。
- 行星会合周期如在任务规划中出现，统一使用 `Lec.P.planetSynodicPeriodDays` 或 `Lec.P.synodicPeriodDays`。
- 太阳辐射通量与距离关系统一使用 `Lec.P.solarFluxAtAU`、`Lec.P.solarFluxRatio`、`Lec.P.inverseSquareRatio`。
- 行星平衡温度统一使用 `Lec.P.equilibriumTemperature`；摄氏与开尔文换算统一使用 `Lec.P.celsiusToKelvin`、`Lec.P.kelvinToCelsius`。
- 温室增温的课堂比较量统一使用 `Lec.P.greenhouseWarming`，并明确它是“表面温度减平衡温度”的简化指标。
- 表面重力与地球重力之比统一使用 `Lec.P.bodyGravityInEarths`；体重情境统一使用 `Lec.P.weightOnBody`。
- 密度统一使用 `Lec.P.density`，体积统一使用 `Lec.P.sphereVolume`；不得仅由大小图目测密度。
- 行星扁率如用于巨行星外形，统一使用 `Lec.P.flatteningForBody`。
- 日、年、秒换算统一使用 `Lec.P.daysToSeconds`、`Lec.P.daysToYears`、`Lec.P.yearsToDays`、`Lec.P.secondsToDays`。
- 探测器飞行时间统一使用 `Lec.P.travelTimeDays` 或 `Lec.P.travelTimeSeconds`；必须同时展示所采用的速度假设。
- 任务路线页的轨道和飞行时间是教学简化模型，不得标成真实任务导航解。
- 百分比、进度与排名统一使用 `Lec.P.percent`、`Lec.P.progressPercent`、`Lec.P.rankBodies`。
- 所有显示值统一用 `Lec.P.significantFigures` 或 `Lec.P.roundTo` 控制精度；课堂读数一般保留 2–3 位有效数字。
- 极大或极小数统一使用 `Lec.P.scientificParts`；同一页不得混用中文万亿记法与科学计数法而不作换算。
- 所有随机生成的小天体轨道与材料样本必须使用 `seedrandom.min.js` 固定页级种子，且基础物理量仍从 `Lec.K` / `Lec.P` 获取。