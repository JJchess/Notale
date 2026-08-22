# 《认识太阳系——天文学通识课第二讲》45 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

太阳系不是“八颗行星排成一列”，而是一个由共同引力组织、在共同历史中形成、至今仍在演化的分区系统。

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| I 定位问题 | 01–06 | 认识太阳系要同时看空间结构、成员类型与运动关系，不能只背行星顺序 |
| II 一张不按比例的旧地图 | 07–11 | 太阳系由太阳主导，真实距离与天体大小跨越完全不同的尺度 |
| III 成员不是八个同类球 | 12–16 | 太阳系有清晰的分区与成员谱系，八颗行星只是其中一类 |
| IV 为什么它没有散架 | 17–21 | 轨道是惯性与引力共同造成的持续下落，距离决定公转节奏 |
| V 八个世界，几条形成线索 | 22–26 | 行星差异不是随机清单，而与形成位置、质量和后续演化相关 |
| VI 边界、例外与活系统 | 27–32 | “行星”是有判据的分类；小天体和持续发现让太阳系保持动态 |

E1  太阳拥有太阳系几乎全部质量，因此整个系统首先是一个以太阳为引力中心的层级结构。  
E2  太阳系成员按成分、位置与动力学环境聚成若干区域，八颗行星不是八个孤立对象。  
E3  轨道不是“被托住的圆环”，而是天体在引力中不断下落却持续错过中心的运动。  
E4  行星性质的系统差异保留了形成位置、物质供应与后续演化的线索。  
E5  行星与矮行星的边界依赖明确判据；太阳系仍有小天体迁移、碰撞与新发现。  

无交互（只承担开场/推进/过渡/收束）：01 02 06 11 16 21 26 31 32

## 0.5 视觉世界

底色      深暗取向，主背景 `#07111F`，信息面板 `#0D1B2E`  
主色相    轨道蓝 `#4DB6FF`，代表尺度、轨道和系统关系  
强调色    日光金 `#FFC857`，只用于当前观察对象、关键反馈与结论落点  
字体族    标题与正文用无衬线；数值、单位、轨道参数用等宽；不用装饰性衬线  
材质语言  以线性科学示意图为主，关键天体外观使用写实照片  
母题      深蓝星空中的稀疏定向星点；围绕太阳展开的发光轨道环；按区域切分的扁平行星圆盘；从太阳向外延伸的对数距离尺；日光金高亮的“当前观察窗口”  

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 必用skill |
|---|---|---:|---:|---|---|---|---|---|---|
| 01 | I | — | 10 | generalization | 无 | 太阳系应被认识为一个有结构、有历史、仍在变化的系统 | 不展开系统证据（p03 起） | focus | theme-factory, frontend-design |
| 02 | I | — | 50 | enumeration | 无 | 本讲沿“结构—成员—运动—形成—边界”五步前进 | 不复述第一讲的观测手段与尺度测量方法 | ledger | design-taste-frontend |
| 03 | I | E1 | 75 | comparison | 估一估太阳份额 | 行星体积醒目，但太阳占太阳系绝大部分质量 | 不讲引力公式（p17–20） | split-lr | d3-viz |
| 04 | I | E2 | 100 | classification | 把成员拖进抽屉 | “太阳系成员”至少包括恒星、行星、矮行星、卫星和小天体 | 不讲行星判据（p27–29） | stage-cards | d3-viz |
| 05 | I | E2 | 90 | process | 拼出你的太阳系地图 | 有用的太阳系地图必须同时表达顺序、分区和运动 | 不追求大小与距离同时按比例（p07–10） | canvas-full | konva.min.js对应二维拖拽自行实现 |
| 06 | I | — | 45 | generalization | 无 | 先拆掉“八颗球等距排开”的教科书错觉 | 不列各行星性质（p22–25） | focus | animation-systems |
| 07 | II | E1 | 95 | comparison | 切换大小或距离比例 | 同一张图无法同时清楚呈现太阳大小、行星大小与行星距离 | 不解释轨道速度（p19–20） | split-tb | d3-viz |
| 08 | II | E1 | 100 | process | 滚动十亿倍模型 | 若把太阳缩成一只球，地球会小得多且远得多 | 不引入光年尺度 | canvas-full | gsap-scrolltrigger |
| 09 | II | E1 | 120 | comparison | 拖动太阳直径 | 改变模型比例不会改变“直径尺度”和“距离尺度”的巨大落差 | 不把行星画成真实相对亮度 | split-lr | d3-viz |
| 10 | II | E1 | 85 | enumeration | 点亮光程站牌 | 从太阳到各行星的光行时间比背诵千米数更容易形成距离直觉 | 不重复第一讲的光速测量方法 | ledger | d3-viz |
| 11 | II | — | 45 | generalization | 无 | 太阳系不是紧凑摆件，而是一座由巨大空旷分隔的系统 | 不讨论太阳系外缘定义（p30） | focus | css-alpha-masking |
| 12 | III | E2 | 95 | classification | 圈选四大区域 | 内行星区、小行星带、巨行星区和海王星外区具有不同成员密度 | 不把区域边界说成硬墙（p30） | canvas-full | d3-viz |
| 13 | III | E2 | 105 | comparison | 行星卡片配对 | 四颗类地行星小而致密，四颗巨行星大且富含轻物质 | 不解释差异成因（p22–25） | triptych | web-media-getter |
| 14 | III | E2 | 100 | enumeration | 展开卫星家族 | 卫星并非行星附属注脚，它们本身包含海洋、火山和复杂地质世界 | 不逐一讲卫星探测史 | stage-cards | web-media-getter, reveal-hover-effect |
| 15 | III | E2 | 85 | classification | 小天体分拣台 | 小行星、彗星与海王星外天体可由轨道区域和物质特征区分 | 不讲冥王星判据（p27–29） | split-lr | konva.min.js对应二维拖拽自行实现, web-media-getter |
| 16 | III | — | 45 | generalization | 无 | 八颗行星只是太阳系成员谱系的主干，不是全部 | 不讲形成机制（p22） | focus | technical-wireframe-info-layout |
| 17 | IV | E3 | 95 | process | 发射横向炮弹 | 横向速度不足会坠落，合适时会持续绕行，过大则逃逸 | 不推导牛顿方程 | canvas-full | matterjs, mini-game |
| 18 | IV | E3 | 100 | comparison | 切换惯性与引力 | 只有惯性会直飞，只有指向中心的运动会坠落，轨道来自两者共同作用 | 不讨论椭圆轨道细节（p19） | split-tb | animation-systems |
| 19 | IV | E3 | 120 | process | 拖拽轨道初速度 | 初始速度和方向改变轨道形状，圆轨道只是许多可能轨道中的一种 | 不引入轨道倾角与摄动 | canvas-full | threejs-webgl |
| 20 | IV | E3 | 85 | comparison | 改变轨道半径 | 离太阳越远，公转速度通常越慢，公转周期增长得更快 | 不做开普勒第三定律代数推导 | split-lr | d3-viz |
| 21 | IV | — | 50 | generalization | 无 | 行星不是被轨道线托着，而是在共享引力规则下各自持续下落 | 不讲行星形成（p22–25） | focus | gsap-timeline |
| 22 | V | E4 | 95 | process | 冷却盘时间轴 | 太阳与行星形成于旋转的气体尘埃盘，盘内温度由内向外总体降低 | 不把简化模型说成完整形成理论 | canvas-full | animation-systems, make-illustration |
| 23 | V | E4 | 100 | classification | 越过雪线取材 | 不同温度区域允许凝结的材料不同，影响了可用于造行星的原料 | 不声称雪线位置恒定不变 | split-tb | d3-viz |
| 24 | V | E4 | 120 | process | 吸积碰撞实验 | 微粒聚集、碰撞与引力吸积可逐步形成更大的天体，但增长并非一路平顺 | 不模拟完整数十亿年演化 | canvas-full | matterjs |
| 25 | V | E4 | 110 | comparison | 世界属性雷达 | 大小、密度、大气和温度的组合比“行星排名表”更能解释世界差异 | 不把相关性直接说成单一因果 | triptych | echarts需SVG渲染, web-media-getter |
| 26 | V | — | 45 | generalization | 无 | 今天的八个世界是共同起源与各自经历叠加后的结果 | 不进入行星宜居性讨论 | focus | technical-wireframe-info-layout |
| 27 | VI | E5 | 110 | classification | 三问判行星 | IAU 行星判据依次要求绕太阳、近圆形、清空轨道邻域 | 不先宣布冥王星答案（p28） | stage-cards | mini-game |
| 28 | VI | E5 | 120 | comparison | 冥王星陪审团 | 冥王星满足前两项，但未在其轨道邻域取得动力学主导地位 | 不把“清空”解释成附近绝对没有物体 | split-lr | web-media-getter, d3-viz |
| 29 | VI | E5 | 120 | classification | 改写分类规则 | 改变判据会改变成员名单，分类服务于比较而不是自然界贴好的标签 | 不争论哪套定义具有唯一真理 | ledger | d3-viz |
| 30 | VI | E5 | 100 | comparison | 拖动太阳系边界 | 行星区、柯伊伯带、日球层和奥尔特云给出的“边界”回答不同问题 | 不把奥尔特云画成已逐体测绘区域 | canvas-full | threejs-webgl |
| 31 | VI | — | 50 | enumeration | 无 | 用质量中心、分区、轨道、形成与分类五个镜头可以重建太阳系全景 | 不添加新的天体清单 | ledger | theme-factory |
| 32 | VI | — | 35 | generalization | 无 | 迁移问题：面对新发现的天体，先问它在哪里、如何运动、由什么构成、按何种规则分类 | 不预告后续课程的具体答案 | focus | frontend-design |

## 2. 页间不重复的硬约定

| 概念或形式 | 唯一展开页 | 职责边界 |
|---|---|---|
| 全课总框架 | p01–02 | p01 只提出主张；p02 只给路线，不提前解释证据 |
| 太阳质量主导 | p03 | 只建立质量份额直觉；引力如何产生轨道留给 p17–20 |
| 太阳系成员总分类 | p04 | 给出顶层类别；区域分类在 p12，小天体细分在 p15，行星判据在 p27–29 |
| 学生先备概念暴露 | p05 | 只让学生拼地图并显露误区，不在此纠错到细节 |
| 大小比例与距离比例冲突 | p07–09 | p07 说明不可兼得；p08 建立走入模型的距离感；p09 允许连续改比例验证 |
| 光行时间 | p10 | 只作为太阳系内部距离表征，不重讲光速如何测得 |
| 太阳系区域结构 | p12 | 只做空间分区总览；各类成员性质由 p13–15 展开 |
| 类地行星与巨行星对照 | p13 | 只比较成分、密度、体量；成因留给 p22–25 |
| 卫星世界 | p14 | 只证明卫星具有独立研究价值，不形成卫星百科 |
| 小行星、彗星、海王星外天体 | p15 | 按位置与物质特征分拣；不承担矮行星定义 |
| “持续下落”的轨道直觉 | p17–18 | p17 用发射游戏获得直觉；p18 隔离惯性和引力作因果对照 |
| 轨道形状 | p19 | 唯一可操作三维轨道页；不在其他页重复调初速度 |
| 距离与周期关系 | p20 | 只给定性及数据验证，不进行微积分或完整公式推导 |
| 原行星盘 | p22 | 只交代共同起源和温度梯度；材料凝结在 p23，吸积在 p24 |
| 雪线与材料 | p23 | 只建立凝结材料差异，不将雪线当作固定硬边界 |
| 吸积模拟 | p24 | 唯一碰撞增长模拟；明确它是机制模型而非历史录像 |
| 行星属性综合比较 | p25 | 汇总大小、密度、大气、温度，不重新讲行星顺序 |
| IAU 三项判据 | p27 | 只建立判定流程；冥王星个案在 p28，规则反思在 p29 |
| 冥王星个案 | p28 | 只应用判据，重点澄清“清空轨道邻域”的动力学含义 |
| 分类规则的工具性 | p29 | 只讨论改变规则如何改变名单，不重复冥王星生平或发现史 |
| 太阳系外缘 | p30 | 区分行星区、柯伊伯带、日球层、奥尔特云；不宣称单一终极边界 |
| 三维交互场景 | p19、p30 | p19 操作单个天体轨道；p30 比较不同边界尺度，两者不共用控制机制 |
| Matter.js 物理模拟 | p17、p24 | p17 模拟发射与引力运动；p24 模拟碰撞、聚集与增长 |
| 拖拽分类 | p04、p15、p27 | p04 分顶层成员；p15 分小天体；p27 依判据决策，卡片集合与反馈均不复用 |
| 真实天体照片 | p13–15、p25、p28 | p13 行星类型对照；p14 卫星表面证据；p15 小天体外观；p25 属性综合；p28 冥王星个案 |
| 全课综合 | p31–32 | p31 回收五个镜头；p32 只给迁移提问框架 |

## 3. 数字口径

- 太阳、行星、矮行星、卫星与区域数据一律从 `Lec.K.sun`、`Lec.K.planets`、`Lec.K.dwarfPlanets`、`Lec.K.moon`、`Lec.K.regions` 读取。
- 天体分类与 IAU 判据一律从 `Lec.K.classification`、`Lec.K.iauPlanetCriteria` 读取。
- 物理常量与单位换算一律从 `Lec.K.constants`、`Lec.K.units` 读取，不在页面脚本内另建常量表。
- “太阳占太阳系绝大部分质量”的具体比例由 `Lec.P.totalPlanetMassKg()` 与太阳质量计算；页面按有效数字显示，不写死百分比。
- 行星质量份额使用 `Lec.P.planetMassFraction(key)`。
- 行星近日点、远日点与距离范围使用 `Lec.P.perihelionAU()`、`Lec.P.aphelionAU()`、`Lec.P.distanceRangeAU()`。
- 千米、米与天文单位换算使用 `Lec.P.auToKm()`、`Lec.P.auToM()`、`Lec.P.kmToAU()`、`Lec.P.mToAU()`。
- 比例模型中的天体直径使用 `Lec.P.scaleBodyDiameterForSunDiameter()`，距离使用 `Lec.P.scaleDistanceForSunDiameter()`；两种比例不得混用为同一比例。
- 光行时间使用 `Lec.P.lightTravelTimeFromAUMinutes()` 或 `Lec.P.lightTravelTimeFromAUSeconds()`。
- 圆轨道速度使用 `Lec.P.circularOrbitalVelocity()`；一般椭圆轨道瞬时速度使用 `Lec.P.visVivaVelocity()`。
- 公转周期使用 `Lec.P.orbitalPeriod()`；以太阳质量和 AU/年单位进行教学比较时使用 `Lec.P.keplerPeriodYears()`。
- 逃逸速度使用 `Lec.P.escapeVelocity()`，不得以经验倍数代替。
- 表面重力使用 `Lec.P.surfaceGravity()`；相对地球重力使用 `Lec.P.gravityRelativeToEarth()`。
- 天体密度使用 `Lec.P.density()`；体积比较使用 `Lec.P.sphereVolume()` 或 `Lec.P.volumeRatioFromRadii()`。
- 行星平衡温度使用 `Lec.P.equilibriumTemperatureK()`；摄氏与开尔文换算使用 `Lec.P.celsiusToKelvin()`、`Lec.P.kelvinToCelsius()`。
- 太阳辐照通量使用 `Lec.P.solarFluxAtAU()`；页面必须注明这是随距离变化的模型量，不等同于地表温度。
- 自转与公转时长统一分别以小时、地球日或地球年呈现，转换使用 `Lec.P.hoursToDays()`、`Lec.P.daysToYears()`、`Lec.P.yearsToDays()`。
- 顺行、逆行方向由 `Lec.P.rotationDirection()` 判断；周期绝对值由 `Lec.P.rotationPeriodMagnitudeHours()` 取得。
- 图表显示值统一使用 `Lec.P.significantFigures()`、`Lec.P.round()` 或 `Lec.P.formatScientific()`；不得在不同页面自行选择互相冲突的舍入规则。
- 对数距离尺的归一化使用 `Lec.P.normalizedLog()`；线性属性比较使用 `Lec.P.normalizedLinear()`。
- 随机碰撞或初始粒子配置必须引用 `seedrandom.min.js`，并为每页使用固定页号种子；讲解中的结果只陈述固定种子和允许扰动下都成立的趋势。