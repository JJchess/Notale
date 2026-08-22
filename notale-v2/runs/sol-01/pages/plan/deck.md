# 《认识太阳系：一个由共同规律塑造、仍在变化的行星系统》90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

太阳系不是“太阳加八颗行星”的名册，而是一套能用位置、运动、组成和历史共同解释的动态系统。

| 章 | 页 | 这一章要让读者信什么 |
|---|---:|---|
| I 看见系统的骨架 | 01–11 | 尺度、质量分布和空间分区比行星排列顺序更能揭示太阳系结构 |
| II 运动不是沿轨道图走 | 12–22 | 太阳的引力与天体当下的速度共同产生轨道，并统一解释年、季节和会合 |
| III 八颗行星是比较实验 | 23–33 | 行星差异可以沿质量、距离、组成、大气和内部活动追溯，而不是八段孤立故事 |
| IV 碎片保存形成史 | 34–43 | 小天体、撞击坑和陨石记录了太阳系形成、迁移与持续演化 |
| V 从地图走向判断 | 44–50 | 太阳系仍是动态环境；理解规律后才能判断世界、规划探测并识别未知系统 |

E1  太阳系绝大部分质量集中在太阳，行星沿近乎同一平面分区排列，构成有层次的系统骨架。  
E2  轨道是引力持续拉拽与切向速度共同造成的自由落体，少量规律即可解释多种运动现象。  
E3  行星类型和表面环境由初始材料、质量、日照、大气与内部演化共同塑造。  
E4  小天体和撞击记录表明，太阳系由原行星盘形成，并经历过聚积、迁移和持续改造。  
E5  太阳系不是完成品；比较、动力学和时间尺度能够支持探测决策，也能迁移到系外行星判断。

无交互（只承担开场/推进/过渡/收束）：01 02 12 23 34 44 49 50

## 0.5 视觉世界

底色      深暗取向；页面底色 `#071018`，内容带底色 `#101B24`，高密度数据区 `#16232D`  
主色相    `#4FC3D7`，代表轨道、距离和可计算的系统关系  
强调色    `#FFD166`，只用于当前观察对象、关键反馈和教师正在推进的步骤  
字体族    标题与正文用无衬线，数字读数与单位用等宽，少量引文和任务情境用衬线  
材质语言  写实照片为主，叠加扁平轨道线、半透明测量标记和少量科学示意图  
母题      深空底上的发光轨道环；带昼夜分界线的行星圆盘；从太阳向外延伸的刻度尺；原行星盘尘埃带；探测器视角中的目标框与遥测读数  

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 必用skill |
|---|---|---:|---:|---|---|---|---|---|---|
| 01 | I | — | 10 | generalization | 无 | 太阳系是一套可解释的动态系统，不是一张成员名单 | 不讲系统证据（p03） | canvas-full | web-media-getter, frontend-design |
| 02 | I | — | 50 | enumeration | 无 | 全课沿骨架、运动、世界、历史、迁移五步推进 | 不展开行星分类（p24–30） | ledger | theme-factory |
| 03 | I | E1 | 115 | comparison | 拨动真实比例尺 | 教科书式排列同时扭曲了行星大小和间距 | 不讲轨道成因（p13–17） | split-tb | web-media-getter |
| 04 | I | E1 | 130 | process | 缩放太阳系镜头 | 从太阳表面退到海王星轨道需要跨越多个尺度层级 | 不重复第一讲的测距方法 | canvas-full | threejs-webgl, gsap-core |
| 05 | I | E1 | 145 | classification | 拖拽成员归区 | 太阳系可分为太阳、内行星区、外行星区和小天体储库 | 不细讲各类成因（p24、p35） | stage-cards | d3-viz |
| 06 | I | E1 | 120 | comparison | 分配千份质量筹码 | 太阳占太阳系总质量的绝对多数，行星并非与它同级 | 不推导引力公式（p13） | focus | matterjs |
| 07 | I | E1 | 125 | generalization | 旋转轨道薄盘 | 八颗行星的轨道接近同一平面，提示共同形成背景 | 不讲原行星盘时间线（p36–39） | canvas-full | threejs-webgl |
| 08 | I | E1 | 110 | enumeration | 点亮行星序列 | 行星顺序是定位索引，不是本讲的知识终点 | 不逐颗介绍环境（p25–30） | ledger | technical-wireframe-info-layout |
| 09 | I | E1 | 140 | comparison | 压缩距离桌面 | 等比例缩到教室后，行星小得难看见且彼此相距很远 | 不重讲角大小与观测尺度 | split-lr | matterjs |
| 10 | I | E1 | 115 | process | 发送光信号 | 光从太阳到各行星也需要可感知的传播时间 | 不讲探测器转移轨道（p46） | split-tb | gsap-timeline |
| 11 | I | E1 | 120 | generalization | 标出地球住址 | 地球只是太阳系骨架中位于内侧的一颗岩石行星 | 不讨论宜居条件（p31–33） | focus | web-media-getter, cobejs |
| 12 | II | — | 40 | enumeration | 无 | 从“东西在哪里”转向“它们为什么这样运动” | 不回顾第一幕的比例尺 | canvas-full | animation-systems |
| 13 | II | E2 | 120 | process | 发射牛顿炮弹 | 足够快的水平抛射会不断下落却始终错过地面，形成轨道 | 不讨论逃逸速度（p18） | split-lr | matterjs |
| 14 | II | E2 | 135 | comparison | 调整速度矢量 | 同一位置上的不同速度可产生坠落、椭圆轨道或逃逸 | 不讲行星际转移（p46） | canvas-full | threejs-webgl |
| 15 | II | E2 | 125 | generalization | 改变中心质量 | 中心天体越重，同一距离上的稳定轨道速度越高 | 不进行代数推导 | split-tb | d3-viz |
| 16 | II | E2 | 145 | process | 扫过等面积 | 行星靠近太阳时更快，但相等时间扫过相等面积 | 不讲近日点季节误解（p21） | canvas-full | threejs-webgl, gsap-scrolltrigger |
| 17 | II | E2 | 110 | comparison | 对齐周期曲线 | 离太阳越远，公转周期增长得比距离更快 | 不讲公式证明 | split-lr | d3-viz |
| 18 | II | E2 | 130 | classification | 试逃逸窗口 | 束缚轨道与逃逸轨迹的区别取决于速度和能量状态 | 不讲火箭质量比 | focus | mini-game, threejs-webgl |
| 19 | II | E2 | 115 | process | 拖动昼夜齿轮 | 自转造成昼夜，公转定义年，两种周期彼此独立 | 不讲季节成因（p20） | stage-cards | matterjs |
| 20 | II | E2 | 140 | comparison | 倾斜地球手电 | 季节主要来自地轴倾斜造成的太阳高度与昼长变化 | 不把近日点当作季节主因（p21） | canvas-full | threejs-webgl |
| 21 | II | E2 | 120 | generalization | 切换南北半球 | 地球在近日点时北半球仍可处于冬季，距离不是季节主因 | 不展开气候系统 | split-tb | cobejs, gsap-core |
| 22 | II | E2 | 130 | classification | 追赶火星会合 | 逆行只是地球超越外行星时产生的视运动投影 | 不重复第一讲的观测史 | canvas-full | threejs-webgl, mini-game |
| 23 | III | — | 45 | enumeration | 无 | 把八颗行星当成受不同条件作用的比较实验 | 不再解释轨道形成 | triptych | web-media-getter |
| 24 | III | E3 | 120 | classification | 拖拽行星分家 | 八颗行星首先分为岩石行星、气态巨行星和冰巨行星 | 不逐颗罗列全部参数（p25–30） | stage-cards | d3-viz, web-media-getter |
| 25 | III | E3 | 135 | comparison | 剥开四类行星 | 岩石世界与巨行星在内部结构和主要材料上根本不同 | 不讲原行星盘温度梯度（p37） | triptych | reveal-hover-effect, web-media-getter |
| 26 | III | E3 | 125 | process | 压缩大气柱 | 表面气压来自上方大气重量，少量或浓厚大气会改写地表条件 | 不展开温室反馈（p28） | split-tb | matterjs |
| 27 | III | E3 | 140 | comparison | 平衡温度实验台 | 距离和反照率先设定行星接收与保留能量的基础条件 | 不把平衡温度等同地表实温（p28） | split-lr | d3-viz |
| 28 | III | E3 | 115 | generalization | 添加温室毯层 | 相近大小的岩石行星也能因大气差异走向完全不同的表面环境 | 不讲地球气候政策议题 | focus | make-illustration, gsap-core |
| 29 | III | E3 | 130 | process | 启动行星冷却 | 行星质量与内部热量影响火山、磁场和地质活动能持续多久 | 不详讲发电机理论 | canvas-full | webgl-3d-object, gsap-timeline |
| 30 | III | E3 | 125 | classification | 配对卫星角色 | 卫星既可能是被捕获碎片，也可能与行星共同形成或由撞击产生 | 不展开每颗卫星名录 | stage-cards | d3-viz, web-media-getter |
| 31 | III | E3 | 145 | comparison | 搭建宜居条件盘 | 宜居性至少同时涉及能量、液态介质、材料和长期稳定性 | 不宣称宜居等于有生命 | canvas-full | mini-game |
| 32 | III | E3 | 110 | generalization | 判读欧罗巴切片 | 宜居环境不只存在于恒星照亮的行星表面，潮汐加热可支持地下海洋 | 不判断是否存在生命 | split-lr | web-media-getter, reveal-hover-effect |
| 33 | III | E3 | 130 | classification | 诊断三颗地球 | 金星、地球、火星展示了相近起点如何演化成不同世界 | 不讲形成期迁移（p39） | triptych | web-media-getter, d3-viz |
| 34 | IV | — | 35 | process | 无 | 从今日行星倒推四十多亿年的形成与改造 | 不重复行星环境比较 | focus | animation-systems |
| 35 | IV | E4 | 120 | classification | 筛分小天体样本 | 小行星、彗星、流星体、矮行星和卫星不是同一种“碎石” | 不讲具体形成顺序（p36–39） | ledger | web-media-getter |
| 36 | IV | E4 | 105 | comparison | 读取陨石证物 | 某些陨石保存了比地球岩石更原始的太阳系材料 | 不重复第一讲的光谱检测方法 | split-lr | web-media-getter, technical-wireframe-info-layout |
| 37 | IV | E4 | 115 | process | 冷却原行星盘 | 原行星盘温度随距离下降，使不同位置可凝结的材料不同 | 不直接决定今日全部行星位置（p39） | canvas-full | threejs-webgl, ambient-section-particles |
| 38 | IV | E4 | 105 | classification | 滚动雪球聚积 | 尘埃经碰撞、黏结和引力聚积成长，但破碎也会同时发生 | 不宣称聚积是单向匀速过程 | stage-cards | matterjs |
| 39 | IV | E4 | 125 | process | 迁移巨行星 | 行星与盘及彼此交换角动量，今日轨道未必就是出生位置 | 不指定唯一迁移历史 | canvas-full | threejs-webgl, gsap-timeline |
| 40 | IV | E4 | 100 | comparison | 调整撞击速率 | 撞击坑数量与保存状况可比较表面年龄，但不是简单日历 | 不讲绝对定年技术 | split-tb | d3-viz, web-media-getter |
| 41 | IV | E4 | 110 | generalization | 改写月面年表 | 缺少风化和板块活动的表面更容易保存早期撞击记录 | 不把月球历史等同地球历史 | split-lr | reveal-hover-effect, web-media-getter |
| 42 | IV | E4 | 140 | process | 防御近地天体 | 行星防御依赖发现时间、轨道预测与微小速度改变的长期累积 | 不渲染近期必然灾难 | canvas-full | mini-game, threejs-webgl |
| 43 | IV | E4 | 110 | comparison | 重排形成证据链 | 盘面、材料梯度、陨石年龄和撞击记录彼此约束同一段历史 | 不提前进行全课迁移任务（p48） | ledger | d3-viz |
| 44 | V | — | 50 | generalization | 无 | 已知规律现在要用于判断、航行和解释未知世界 | 不复述前四幕结论 | canvas-full | web-media-getter |
| 45 | V | E5 | 110 | comparison | 选择探测目标 | 科学问题决定目标、载荷、轨道与任务周期，不能只选“最壮观”的世界 | 不计算转移时间（p46） | stage-cards | mini-game, web-media-getter |
| 46 | V | E5 | 115 | process | 规划霍曼转移 | 去火星不是瞄准火星直飞，而是在合适窗口进入与火星轨道相交的转移椭圆 | 不讲推进器工程细节 | canvas-full | threejs-webgl, mini-game |
| 47 | V | E5 | 80 | classification | 识别陌生行星系 | 用轨道、质量、半径和温度可以初步判断未知行星系统的结构 | 不重复观测手段与误差来源 | split-lr | d3-viz |
| 48 | V | E5 | 90 | generalization | 破解新生系统 | 综合位置、运动、组成和历史证据，为虚构新生行星系提出可辩护解释 | 不要求唯一标准答案 | canvas-full | mini-game, d3-viz, seedrandom |
| 49 | V | — | 55 | enumeration | 无 | 五个问题足以把任何太阳系成员放回系统中理解 | 不增加新天体或新机制 | ledger | technical-wireframe-info-layout |
| 50 | V | — | 25 | generalization | 无 | 认识太阳系，就是学会从一张名单看见一套仍在运行的历史 | 不预讲下一讲内容 | focus | web-media-getter |

## 2. 页间不重复的硬约定

| 概念或形式 | 展开页 | 唯一职责与边界 |
|---|---|---|
| 太阳系真实比例 | p03–04 | p03比较错误图与真实比例；p04只负责连续缩放体验 |
| 太阳系成员与分区 | p05、p08 | p05建立空间分区；p08只建立行星顺序索引 |
| 质量集中于太阳 | p06 | 全套仅此页使用质量筹码隐喻 |
| 轨道共面性 | p07 | 只作为共同形成的结构证据，不在此讲形成过程 |
| 教室尺度模型 | p09 | 只负责同时呈现大小与距离不可兼得 |
| 光行时 | p10 | 只讨论信息传播延迟，不用于行星际航行时间 |
| 地球在系统中的位置 | p11 | 只完成第一幕定位，不展开宜居性 |
| 轨道形成机制 | p13–15 | p13建立持续下落直觉；p14比较速度结果；p15比较中心质量 |
| 开普勒运动规律 | p16–17 | p16处理轨道内速度变化；p17处理不同轨道的周期关系 |
| 逃逸 | p18 | 只区分束缚与非束缚轨迹，不讲火箭推进 |
| 自转、公转、季节 | p19–21 | p19分清两种周期；p20建立倾角机制；p21专门反驳距离误解 |
| 逆行 | p22 | 只从会合运动解释视运动，不回顾历史观测 |
| 行星三分类 | p24–25 | p24分类；p25比较内部材料与结构 |
| 大气与气压 | p26 | 只建立大气柱重量直觉 |
| 行星能量收支 | p27–28 | p27计算日照与反照率；p28只处理大气造成的偏离 |
| 内部演化 | p29 | 只讨论冷却、地质活动与磁场持续性 |
| 卫星起源 | p30 | 只比较捕获、共生形成与巨撞三类角色 |
| 宜居性 | p31–32 | p31构建多条件框架；p32把框架迁移到冰卫星地下海洋 |
| 金星—地球—火星比较 | p33 | 只用于展示分叉演化，不承担行星分类 |
| 小天体术语 | p35 | 名称、位置和行为一次性划清，后页不再重新定义 |
| 陨石证据 | p36 | 只负责原始材料证物，不讲撞击坑计年 |
| 原行星盘 | p37 | 只讲温度梯度和凝结材料 |
| 聚积与破碎 | p38 | 只讲局部碰撞成长机制 |
| 行星迁移 | p39 | 只讲轨道可变化及证据约束，不固定单一历史模型 |
| 撞击坑计年 | p40–41 | p40建立统计逻辑；p41解释不同表面的记录保存偏差 |
| 近地天体防御小游戏 | p42 | 唯一的拦截任务；核心变量为预警时间与速度改变量 |
| 形成证据综合 | p43 | 只重排已学证据，不引入新证据 |
| 探测任务选择小游戏 | p45 | 只匹配科学问题、目标和载荷，不模拟航行 |
| 三维转移轨道 | p46 | 全套唯一的任务航行三维场景；使用霍曼转移实时计算 |
| 系外系统迁移 | p47 | 只做结构分类，不讲观测方法 |
| 新生系统综合小游戏 | p48 | 唯一开放式综合任务；随机案例必须固定种子并允许多条证据路径 |
| 三维太阳系场景 | p04、p07、p14、p16、p20、p22、p37、p39、p42、p46 | 各页分别承担尺度、共面、速度、扫面积、倾角、会合、盘演化、迁移、防御、转移，不复用同一操作机制 |
| 真实天体照片 | p01、p03、p11、p23–25、p30、p32–33、p35–36、p40–41、p44–46、p50 | 照片必须表现真实天体表面、任务目标或实物样本；不得充当无信息背景 |
| 可拖拽分类 | p05、p24、p30、p35 | 分别分类空间区、行星类型、卫星起源、小天体术语；卡片集合与判断维度不得复用 |
| ECharts 图表 | p15、p17、p24、p27、p33、p40、p43、p47–48 | 一律使用 SVG renderer；每页只承载对应证据，不制作重复的行星参数总览 |
| Matter.js 实物隐喻 | p06、p09、p13、p19、p26、p38 | 分别模拟质量筹码、尺度桌面、炮弹、周期齿轮、大气柱、聚积碰撞 |
| 全课总结 | p49–50 | p49给出可复用的五问框架；p50只收束主张 |

## 3. 数字口径

| 数值 | 全套统一口径 | 调用方式 |
|---|---|---|
| 太阳系年龄 | 约 45.67 亿年；涉及形成时间线时统一使用同一参考年龄 | 从 `Lec.K.TIME` 或 `Lec.K.REFERENCE` 取值，时间压缩用 `Lec.P.compressTimeline` |
| 天文单位 | 1 AU 为地球轨道半长轴对应的标准长度，约 1.496 亿千米 | 从 `Lec.K.UNITS` 取值；转换用 `Lec.P.auToKm`、`Lec.P.auToM`、`Lec.P.kmToAU` |
| 光速与光行时 | 使用真空光速；日地单程约 8.3 分钟 | 常量从 `Lec.K.PHYSICS` 取；计算用 `Lec.P.lightTimeSeconds`、`lightTimeMinutesFromAU`、`lightTimeHoursFromAU` |
| 太阳质量占比 | 表述为约占太阳系总质量的 99.86%，页面计算以常量数据为准 | 太阳数据从 `Lec.K.SUN`，行星数据从 `Lec.K.PLANETS` 汇总计算 |
| 行星数量 | 8 颗行星；冥王星归入矮行星，不与八颗行星并列计数 | 行星从 `Lec.K.PLANETS`，矮行星从 `Lec.K.DWARF_PLANETS` |
| 行星顺序 | 水星、金星、地球、火星、木星、土星、天王星、海王星 | 使用 `Lec.K.PLANETS` 的统一顺序，不在页面另建数组 |
| 行星分类 | 岩石行星：水、金、地、火；气态巨行星：木、土；冰巨行星：天王、海王 | 使用 `Lec.P.planetsByType` 和行星类型字段 |
| 行星直径 | 一律使用直径比较，不把半径误标为直径 | 使用 `Lec.P.planetDiameterKm` |
| 行星质量 | 页面统一使用千克，必要时同时给地球质量倍数 | 使用 `Lec.P.planetMassKg`、`Lec.P.ratio` |
| 表面重力 | 使用标准表面重力；巨行星取参考半径处的定义值 | 使用 `Lec.P.surfaceGravity` 或 `Lec.P.weightOnPlanet` |
| 公转距离 | 比较轨道使用半长轴；近日点、远日点另行明确标注 | 行星对象取半长轴；端点用 `Lec.P.perihelionAU`、`Lec.P.aphelionAU` |
| 公转周期 | 默认使用恒星周期，不与会合周期混用 | 使用 `Lec.P.orbitalPeriodYears`、`Lec.P.keplerPeriodDays` |
| 自转周期 | 逆行自转保留方向符号；展示“日长”时明确是恒星日还是太阳日 | 使用 `Lec.P.rotationPeriodDays`、`Lec.P.rotationDirection` |
| 轨道位置 | 椭圆轨道按开普勒方程实时求解，不用匀速圆周动画代替 | 使用 `Lec.P.solveKepler`、`Lec.P.orbitPosition`、`Lec.P.trueAnomaly` |
| 轨道速度 | 圆轨道直觉页使用圆轨道速度；椭圆轨道页使用 vis-viva 速度 | 使用 `Lec.P.orbitalSpeed`、`Lec.P.visVivaSpeed`、`Lec.P.planetOrbitalSpeedKmS` |
| 逃逸速度 | 使用指定天体质量和参考半径计算，不与轨道速度混称 | 使用 `Lec.P.escapeSpeed` |
| 地轴倾角 | 地球约 23.4°；季节页以当前数据常量为准 | 从 `Lec.K.EARTH` 取值，角度转换用 `Lec.P.degToRad` |
| 太阳辐照 | 地球轨道处为 1 倍；其他距离按距离平方反比 | 使用 `Lec.P.solarFlux`、`Lec.P.solarFluxRatio` |
| 平衡温度 | 必须同时给出距离、反照率和热量再分配假设；不得标作实测表面温度 | 使用 `Lec.P.equilibriumTemperature` |
| 密度 | 平均密度由质量和半径计算；统一使用 SI 后再转换显示单位 | 使用 `Lec.P.density`、`Lec.P.sphereVolume` |
| 日地月尺寸比例 | 直径、距离分别按同一缩放因子计算，不混合两套比例 | 使用 `Lec.P.scaleSolarSystem`、`Lec.P.scaleValue` |
| 月球数据 | 月球质量、半径、距离和周期统一来自月球常量 | 使用 `Lec.K.MOON` |
| 会合周期 | 地球与目标行星的会合周期不得写成目标行星公转周期 | 使用 `Lec.P.planetSynodicPeriodDays` 或 `Lec.P.synodicPeriodDays` |
| 霍曼转移 | 使用两条近圆共面轨道之间的理想转移；结果必须标明是简化模型 | 使用 `Lec.P.hohmannTransfer`、`Lec.P.planetHohmannTransfer` |
| 地火转移时间 | 由当页轨道数据实时计算，典型结果约 259 天，不写死为固定航程 | 使用 `Lec.P.planetHohmannTransfer` 后以 `Lec.P.secondsToDays` 转换 |
| 行星间距离 | “最近”和“最远”均按轨道几何近似并明确不是实时星历距离 | 使用 `Lec.P.minimumOrbitalSeparationAU`、`Lec.P.maximumOrbitalSeparationAU` |
| 旅行时间 | 匀速估算必须同时显示假设速度，不与真实任务航程混用 | 使用 `Lec.P.travelTimeDays`、`Lec.P.travelTimeSeconds` |
| 洛希极限 | 只在需要解释潮汐破坏时使用，并明确刚体或流体假设 | 使用 `Lec.P.rocheLimit` |
| 希尔球 | 只用于描述天体引力支配范围的近似，不画成硬边界 | 使用 `Lec.P.hillRadius` |
| 质心 | 双体绕共同质心运动；距离按两者质量和间距实时计算 | 使用 `Lec.P.barycenterDistance` |
| 小行星与彗星尺寸 | 不给“典型尺寸”单值；按具体对象或区间表达 | 具体对象优先从 `Lec.K.REFERENCE` 取值 |
| 撞击坑年龄 | 坑密度只支持相对年龄判断；没有标定数据时不输出绝对年龄 | 页面仅做相对比较，不生成伪精确年份 |
| 太阳系形成顺序 | 原行星盘、尘埃聚积、微行星、原行星、晚期改造按证据支持的阶段表达 | 时间比例统一用 `Lec.P.ageFraction`、`Lec.P.compressTimeline` |
| 百分比与比值 | 百分比统一用同一分母口径；行星倍数统一相对地球 | 使用 `Lec.P.percent`、`Lec.P.ratio`、`Lec.P.percentDifference` |
| 舍入 | 课堂读数通常保留 2–3 位有效数字；交互内部保持原始精度 | 使用 `Lec.P.significant`、`Lec.P.round` |
| 随机案例 | p48 的未知系统每次打开必须得到同一组初始案例，重置后也必须复现 | 引用 `seedrandom.min.js`，固定种子 `solar-system-lecture-p48` |
