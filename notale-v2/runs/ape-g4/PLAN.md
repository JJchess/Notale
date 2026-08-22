# 《从猿人到太空人：同一副身体，两个世界》 90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

人类不是为太空“设计”的物种；从直立行走、协作与技术积累，到在失重、辐射和封闭环境中生存，我们始终在用文化和工程扩展一副由演化留下的身体。

无交互（只承担开场/推进/过渡/收束）：01 02 12 23 34 45 50

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| 一、先看尺度 | 01–11 | “猿人到太空人”不是一条必然上升线，而是身体、环境与工具在不同时间尺度上的共同变化。 |
| 二、身体如何成为人的身体 | 12–22 | 直立、手、脑、饮食与合作是一组相互牵制的折中，没有单一特征独自创造了人类。 |
| 三、文化如何跑得比基因快 | 23–33 | 火、语言、衣物、农业和城市把适应的一部分移到身体之外，也制造了新的脆弱性。 |
| 四、把旧身体送进新环境 | 34–44 | 太空首先是生命支持问题；微重力、真空、辐射和隔离分别攻击不同的人体—环境关系。 |
| 五、太空人会变成另一物种吗 | 45–50 | 短期生理适应、长期技术改造与生物演化必须分开；未来取决于约束、选择与价值判断。 |

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 技法/库 |
|---|---:|---|---|---|---|---|---|
| 01 | 10 | generalization | 无 | 从猿人到太空人，变得最快的未必是身体。 | 不讲时间尺度证据（p03–04） | focus | theme-factory、frontend-design |
| 02 | 45 | enumeration | 无 | 全课沿着“时间—身体—文化—太空—未来”推进。 | 不讲各章结论（p03–50） | ledger | theme-factory |
| 03 | 120 | comparison | 拖动双尺度时间尺 | 数百万年的生物演化与数百年的航天史不在同一时间尺度上。 | 不讲自然选择机制（p07–08） | split-tb | d3-viz、D3 |
| 04 | 130 | process | 压缩人类史长卷 | 把人类史压成一天，航天时代只占最后一瞬。 | 不讲具体人体变化（p13–22） | canvas-full | gsap-scrolltrigger、D3 |
| 05 | 115 | classification | 分拣猿人标签 | “猿人”不是一个严格物种名，而是多个时代与谱系的通俗合称。 | 不背诵物种名单（p06） | stage-cards | d3-viz、Konva |
| 06 | 125 | enumeration | 点亮谱系分叉 | 人类演化像多枝灌木，不像一架逐级向上的梯子。 | 不讲选择如何改变群体（p07–08） | canvas-full | d3-viz、D3 |
| 07 | 100 | generalization | 配对变异与环境 | 演化需要可遗传差异、繁殖差异和许多代积累。 | 不讲基因分子细节（全课不展开） | triptych | mini-game、Konva |
| 08 | 140 | process | 繁殖群体模拟器 | 自然选择改变的是群体中性状的比例，不是个体按需升级。 | 不讲文化传播（p24–30） | split-lr | mini-game、seedrandom、PixiJS |
| 09 | 105 | comparison | 对照适应三义 | 生理调节、学习适应与跨世代演化是三种不同变化。 | 不讲太空实例（p37–44） | triptych | d3-viz、ECharts SVG |
| 10 | 110 | classification | 判断目的论句子 | “为了某目标而演化”常把结果误写成预先计划。 | 不讲未来新人类判断（p46–49） | stage-cards | mini-game、Konva |
| 11 | 95 | generalization | 组装因果链 | 环境不直接命令身体改变，而是筛选既有差异。 | 不讲直立行走的具体因果（p13–15） | focus | d3-viz、D3 |
| 12 | 40 | enumeration | 无 | 接下来不找“人类第一特征”，而看一组彼此牵制的身体变化。 | 不讲文化外置适应（p24–30） | ledger | technical-wireframe-info-layout |
| 13 | 120 | comparison | 旋转骨盆对照体 | 两足行走改变了骨盆、脊柱与下肢的受力关系。 | 不讲分娩折中（p16） | canvas-full | threejs-webgl、Three.js |
| 14 | 130 | process | 步态重心挑战 | 走路不是轮流抬脚，而是不断接住向前跌落的身体。 | 不讲跑步与耐力（p15） | split-lr | matterjs、Matter.js |
| 15 | 115 | comparison | 调节跑步散热赛 | 直立、出汗和耐力活动可能协同，但不存在单一公认起因。 | 不讲脑扩张（p17–18） | split-tb | mini-game、Lec.P |
| 16 | 140 | classification | 拼装骨盆折中 | 骨盆同时承担行走、支撑与分娩，多目标不会产生完美结构。 | 不讲现代产科（全课不展开） | stage-cards | mini-game、Konva |
| 17 | 110 | comparison | 缩放脑与身体 | 更大的脑带来能力，也带来能量、发育和分娩成本。 | 不把脑容量等同智力（p18） | focus | reveal-hover-effect、D3 |
| 18 | 125 | generalization | 配置脑能量预算 | 人脑的意义不只在尺寸，还在连接、发育与高昂能耗。 | 不讲烹饪假说（p25） | ledger | ECharts SVG、Lec.P |
| 19 | 105 | process | 抓握手指实验 | 人手的力量握与精细握来自骨骼、肌肉、感觉和练习的协作。 | 不讲工具文化累积（p26–27） | canvas-full | matterjs、Konva |
| 20 | 135 | classification | 牙齿食谱侦探 | 牙齿能提供饮食线索，却不能单独还原一种固定菜单。 | 不讲火与烹饪（p25） | triptych | mini-game、D3 |
| 21 | 120 | comparison | 调整成长曲线 | 人类漫长童年增加照料成本，也延长了学习窗口。 | 不讲学校制度（全课不展开） | split-lr | ECharts SVG |
| 22 | 110 | generalization | 搭建合作网络 | 人类优势来自共享注意、分工与知识网络，不只来自单个大脑。 | 不讲语言传播机制（p28） | canvas-full | d3-viz、D3 |
| 23 | 35 | process | 无 | 身体改变很慢之后，人类开始让工具、规则与他人替身体适应。 | 不讲太空生命支持（p35–36） | focus | technical-wireframe-info-layout |
| 24 | 125 | classification | 拖拽适应到体外 | 衣物、住所和容器把保温、防护与储存功能移到身体之外。 | 不讲火与食物（p25） | stage-cards | mini-game、Konva |
| 25 | 140 | comparison | 烹饪能量实验台 | 烹饪改变食物的可获取能量、咀嚼成本和安全风险。 | 不宣称烹饪单独造就大脑（p18） | split-tb | matterjs、Lec.P |
| 26 | 110 | process | 打制石器小游戏 | 工具制作把动作顺序、材料反馈和预期目标绑在一起。 | 不讲知识跨代累积（p27） | canvas-full | mini-game、matterjs、Matter.js |
| 27 | 130 | generalization | 传递折纸链 | 文化累积依赖较准确的模仿、教学、修正与保存。 | 不讲语言本身（p28） | split-lr | mini-game、seedrandom |
| 28 | 120 | classification | 拼接协作指令 | 语言能压缩经验、协调缺席对象与安排尚未发生的行动。 | 不讲书写和外部记忆（p29） | stage-cards | mini-game、Konva |
| 29 | 145 | process | 外部记忆接力 | 图像、文字和仪器让知识跨越个人记忆与寿命。 | 不讲制度规模（p30） | canvas-full | mini-game、D3 |
| 30 | 105 | comparison | 调节协作人数 | 规则、角色和记录帮助陌生人大规模协作，也增加系统依赖。 | 不讲城市疾病（p32） | ledger | ECharts SVG |
| 31 | 115 | process | 驯化选择实验 | 人类改造其他物种的同时，也被定居生活重新塑造。 | 不讲现代基因编辑（p48） | split-lr | mini-game、seedrandom、PixiJS |
| 32 | 130 | comparison | 城市接触网络 | 高密度聚居提升交换效率，也扩大传染与资源中断风险。 | 不讲航天隔离（p43） | canvas-full | d3-viz、D3 |
| 33 | 35 | generalization | 技术依赖拔插板 | 文化让我们进入身体原本无法生存之处，同时形成新的脆弱接口。 | 不讲具体航天接口（p35–44） | focus | technical-wireframe-info-layout、Konva |
| 34 | 120 | enumeration | 无 | 进入太空后，先逐项检查空气、压力、温度、水、食物、重力与辐射。 | 不讲解决方案细节（p35–44） | ledger | theme-factory |
| 35 | 135 | process | 密封舱漏气模拟 | 真空的首要危险不是“寒冷”，而是失去外部压力与可呼吸气体。 | 不讲完整生命支持循环（p36） | canvas-full | matterjs、Lec.P |
| 36 | 110 | classification | 连接生命支持回路 | 航天器必须持续管理氧气、二氧化碳、水、废物、热量和电力。 | 不讲微重力人体效应（p37–40） | technical-plate | d3-viz、D3 |
| 37 | 140 | comparison | 切换坠落与漂浮 | 轨道中的“失重”主要是持续自由落体，不是远离了地球引力。 | 不讲轨道速度计算细节（p38） | canvas-full | threejs-webgl、Three.js、Lec.P |
| 38 | 125 | process | 发射轨道投球 | 入轨不是一直向上，而是获得足够横向速度不断错过地面。 | 不讲火箭质量比（p44） | split-lr | mini-game、Three.js、Lec.P |
| 39 | 115 | classification | 分拣失重反应 | 体液转移、平衡错觉与太空运动病发生在不同时间尺度。 | 不讲长期骨肌变化（p40） | stage-cards | mini-game、Konva |
| 40 | 130 | comparison | 训练骨肌负荷器 | 骨与肌肉会响应日常负荷；长期卸载会减少维持它们的刺激。 | 不讲运动处方细节（全课不展开） | split-tb | matterjs、Matter.js |
| 41 | 105 | process | 辐射穿舱蒙特卡洛 | 太空辐射风险取决于粒子、能量、屏蔽、暴露时间和随机命中。 | 不讲遗传后代效应（p47） | canvas-full | pixijs-2d、seedrandom、PixiJS |
| 42 | 145 | comparison | 火星屏蔽建造赛 | 增加屏蔽能降风险，却同时增加质量、结构与发射代价。 | 不讲火箭质量预算（p44） | stage-cards | mini-game、matterjs、Matter.js |
| 43 | 115 | classification | 编排封闭舱冲突 | 隔离风险同时来自空间、单调、延迟、工作负荷与团队关系。 | 不把心理反应归为个人软弱（全课不展开） | split-lr | mini-game、D3 |
| 44 | 100 | generalization | 配平火箭生存账本 | 每增加一份水、屏蔽或备件，都要由推进能力和任务目标买单。 | 不讲未来改造立场（p46–49） | ledger | ECharts SVG、Lec.P |
| 45 | 40 | process | 无 | 最后一章必须先分清：几天内的调节、一生中的改变与多代演化。 | 不回答是否会成为新物种（p49） | focus | technical-wireframe-info-layout |
| 46 | 115 | classification | 三时钟归位 | 宇航员回地球后的恢复不是“逆向演化”，而是可逆或部分可逆的生理变化。 | 不讲遗传选择（p47） | triptych | mini-game、Konva |
| 47 | 105 | process | 多代火星群体模型 | 只有可遗传差异持续影响繁殖，并经历许多代，群体才会发生演化改变。 | 不讲主动基因编辑（p48） | canvas-full | mini-game、seedrandom、PixiJS |
| 48 | 120 | comparison | 比较三条改造路线 | 改环境、改身体和改基因具有不同速度、可逆性、风险与治理问题。 | 不判断哪条路线必然正确（p49） | triptych | d3-viz、D3 |
| 49 | 90 | generalization | 太空人分物种听证会 | 隔离时间、基因交流与繁殖分化比外形差异更能决定是否形成新物种。 | 不把推测写成预测（p50） | stage-cards | mini-game、Konva |
| 50 | 55 | comparison | 无 | 从猿人到太空人不是摆脱自然，而是不断重组身体、文化、技术与环境的边界。 | 不再引入新概念 | focus | theme-factory、frontend-design |

## 2. 页间不重复的硬约定

| 概念或形式 | 展开页 | 唯一职责与边界 |
|---|---|---|
| 生物演化与航天史的时间尺度 | p03–04 | p03比较两个尺度；p04把尺度压缩成可感知的一天，不在后页重复完整时间轴。 |
| “猿人”的含义与谱系灌木 | p05–06 | p05处理名称分类；p06处理分叉结构，不把谱系画成进步阶梯。 |
| 自然选择机制 | p07–08 | p07给出必要条件；p08运行跨代群体模拟。后页只调用，不重新定义。 |
| 三种“适应” | p09、p45–47 | p09首次区分生理、学习与演化；p45复现为三时钟；p46–47分别展开生理恢复与多代演化。 |
| 目的论误区 | p10 | 只在此页集中纠正；其余页面直接采用非目的论表述。 |
| 人体特征不是单因果 | p11–22 | p11建立因果链；p13–22分别处理受力、能量、发育、操作与合作，不竞争“第一特征”。 |
| 直立与运动 | p13–15 | p13讲结构；p14讲步态动力学；p15讲耐力与散热证据的不确定性。 |
| 骨盆折中 | p16 | 只处理多目标约束，不扩展现代产科或性别本质论。 |
| 脑的大小、能耗与能力 | p17–18 | p17拆除“越大越聪明”；p18只做人体能量预算。 |
| 手与工具 | p19、p26 | p19只讲抓握的身体条件；p26只讲工具制作的动作序列与材料反馈。 |
| 饮食证据与烹饪 | p20、p25 | p20讲牙齿证据的能力边界；p25讲加工食物的能量和风险。 |
| 漫长童年与文化学习 | p21、p27 | p21讲生命周期；p27讲知识跨代累积，不重复成长曲线。 |
| 合作网络、语言与制度 | p22、p28、p30 | p22讲共享认知；p28讲符号指令；p30讲陌生人大规模协作。 |
| 外置适应 | p24–30 | p24给出分类框架；p25–30分别承担食物、工具、传承、语言、记忆、制度。 |
| 外部记忆 | p29 | 只在此页讨论文字、图像与仪器跨越个人寿命。 |
| 驯化与定居 | p31–32 | p31讲双向选择；p32讲高密度接触网络。 |
| 技术依赖与系统脆弱性 | p33、p44 | p33提出一般接口；p44落实为航天质量与资源账本。 |
| 太空生命支持 | p34–36 | p34列检查项；p35只讲压力与漏气；p36只讲闭环资源管理。 |
| 轨道微重力三维场景 | p37–38 | p37以自由落体解释失重；p38让学生用横向速度入轨；不在其他页复用轨道场景。 |
| 微重力人体反应 | p39–40 | p39处理短期体液与感觉；p40处理长期骨肌卸载。 |
| 辐射模拟 | p41–42 | p41运行粒子随机穿透；p42将屏蔽效果转为建造与质量决策。 |
| 封闭环境心理与团队 | p43 | 只在此页出现，不将心理风险混入生理分类页。 |
| 火箭与任务质量预算 | p44 | 唯一完整账本；其他页只显示本页所需的局部质量结果。 |
| 宇航员恢复 | p46 | 只讲个体生理变化，不使用“退化”或“逆向演化”。 |
| 火星多代群体模拟 | p47 | 唯一跨代遗传模拟；与p08共享演化原则，但环境、性状和输出不同。 |
| 人体、环境与基因三条路线 | p48 | 只比较速度、可逆性、风险和治理，不宣布最佳路线。 |
| 物种形成判据 | p49 | 唯一讨论基因交流、繁殖隔离与时间，不以外貌直接判定物种。 |
| 三维人体骨架 | p13 | 只出现一次可旋转骨盆—脊柱—下肢结构。 |
| 三维地球轨道 | p37–38 | 连续两页共用同一世界模型，但p37观察、p38操作，其他页不用。 |
| Matter.js物理隐喻 | p14、p25、p26、p35、p40、p42 | 各自只承担重心、加工成本、敲击反馈、压差、负荷、堆叠屏蔽，不复用皮肤和胜负条件。 |
| 蒙特卡洛随机 | p41、p47 | p41模拟粒子命中；p47模拟遗传与繁殖；均使用固定种子并允许显式换种子。 |
| 小游戏胜负条件 | p14、p26、p38、p42、p49 | 分别以稳定步态、完成石器、稳定入轨、满足屏蔽预算、论证一致性判定，不设置通用积分榜。 |
| 图表 | p03、p09、p15、p18、p21、p30、p44 | 每页只保留支持当前判断的一张主图；ECharts一律使用SVG renderer。 |
| 无交互页 | p01、p02、p12、p23、p34、p45、p50 | 分别承担开场、路线、身体章转场、文化章转场、太空章转场、未来章转场与收束。 |

## 3. 数字口径

| 键/计算 | 统一口径 | 使用页 |
|---|---|---|
| `Lec.K.courseDurationSeconds` | 5400；全套页表停留总和必须严格等于此值。 | 全套 |
| `Lec.K.earthAgeYears` | 约45.4亿年；作为背景尺度，不暗示生命或人类与地球同时出现。 | p03–04 |
| `Lec.K.homininEarliestYearsAgo` | 约700万年；表示目前常用的人族早期时间量级，页面同时显示证据与分类存在争议。 | p03–06 |
| `Lec.K.australopithecusLucyYearsAgo` | 约320万年。 | p04–06、p13 |
| `Lec.K.genusHomoEarliestYearsAgo` | 约280万年；使用“目前已知化石记录约”措辞。 | p03–06 |
| `Lec.K.homoSapiensEarliestYearsAgo` | 约30万年。 | p03–06 |
| `Lec.K.controlledFireEvidenceYearsAgo` | 采用约40万年作为较稳妥、广泛使用的控制用火证据量级；更早争议证据另列范围，不合并成单点。 | p04、p25 |
| `Lec.K.agricultureYearsAgo` | 约1.2万年；注明不同地区并非同时发生。 | p04、p31–32 |
| `Lec.K.firstHumanSpaceflightYear` | 1961。 | p03–04、p34 |
| `Lec.K.firstMoonLandingYear` | 1969。 | p03–04 |
| `Lec.K.humanGenerationYears` | 教学模拟默认25年；提供20–30年敏感性范围，不作为所有历史人群的固定事实。 | p08、p47 |
| `Lec.P.logTimelineFraction(...)` | 人类深时轴统一使用对数位置计算；线性时间轴只用于局部放大。 | p03、p06 |
| `Lec.P.timelineFraction(...)` | “人类史压成一天”与局部年代轴统一使用线性比例。 | p04 |
| `Lec.K.earthMassKg` | 5.9722×10²⁴ kg。 | p37–38 |
| `Lec.K.earthMeanRadiusM` | 6,371,000 m；轨道演示统一采用平均半径，不混用赤道半径。 | p37–38 |
| `Lec.K.standardGravityMS2` | 9.80665 m/s²。 | p14–15、p35、p38、p40、p44 |
| `Lec.K.issNominalAltitudeM` | 400,000 m，作为教学用近似轨道高度；不宣称轨道高度恒定。 | p37–38 |
| `Lec.P.gravityAtAltitude(...)` | 计算指定高度的引力加速度，用于说明轨道高度仍有显著地球引力。 | p37 |
| `Lec.P.circularOrbitSpeedAtAltitude(...)` | 计算教学轨道的圆轨道速度。 | p37–38 |
| `Lec.P.orbitalPeriodAtAltitude(...)` | 计算教学轨道周期，不写死“约90分钟”。 | p37–38 |
| `Lec.P.escapeVelocityAtAltitude(...)` | 仅在对比“入轨”与“逃逸”时调用，不把两者混为一谈。 | p38 |
| `Lec.K.seaLevelPressurePa` | 101,325 Pa。 | p35 |
| `Lec.K.cabinPressurePa` | 默认采用101,325 Pa的课堂舱体基线；低压高氧方案作为可切换情景，不与基线混算。 | p35–36 |
| `Lec.K.cabinTemperatureK` | 默认295 K，约22°C。 | p36 |
| `Lec.K.humanOxygenUseRestLPerMin` | 默认0.25 L/min作为静息教学情景；活动状态由控件切换。 | p18、p36 |
| `Lec.P.oxygenUse(...)` | 按流量和时间计算耗氧量。 | p18、p36 |
| `Lec.K.humanMetabolicPowerRestW` | 默认100 W作为静息代谢功率量级，不等同总食物热量。 | p18、p36 |
| `Lec.P.metabolicEnergy(...)` | 统一计算给定功率与时间对应的能量。 | p18、p25、p36 |
| `Lec.K.brainRestingEnergyFraction` | 约0.20，指成人静息状态的量级；不用于婴幼儿。 | p17–18 |
| `Lec.K.bodyMassReferenceKg` | 70 kg仅作可调参考人物，不称“标准人”。 | p14–18、p35–44 |
| `Lec.P.weight(...)` | 统一区分质量与近地表重量。 | p14、p38、p40、p44 |
| `Lec.P.weightAtAltitude(...)` | 只计算引力作用下的重量量级，不用它表示轨道舱内秤读数。 | p37 |
| `Lec.K.waterDensityKgM3` | 1000 kg/m³，教学近似。 | p24、p36、p44 |
| `Lec.K.waterDailyPerPersonKg` | 不设唯一事实值；按饮用、卫生、回收率组成情景参数，由`Lec.K.missionScenarios`提供。 | p36、p44 |
| `Lec.K.lifeSupportRecoveryScenarios` | 使用低、中、高三档回收率情景；所有显示值由库存与回收循环计算，不写死页面结论。 | p36、p44 |
| `Lec.K.microgravityBoneLossMonthlyRange` | 采用约0.5%–1.5%/月的部位与个体差异教学范围，不显示为全身统一线性损失。 | p40 |
| `Lec.K.microgravityMuscleChange` | 不设单一百分比；按肌群、任务时长与训练情景展示范围。 | p40 |
| `Lec.K.radiationDoseScenarios` | 分别存储近地轨道、深空转移与行星表面情景及不确定范围；不得用一个剂量代表“太空”。 | p41–42 |
| `Lec.K.radiationShieldMaterials` | 水、聚乙烯、铝、月壤/火星土壤使用独立密度与简化衰减参数；明确模拟只用于比较直觉。 | p41–42 |
| `Lec.P.density(...)` | 由屏蔽质量和体积计算平均密度。 | p42、p44 |
| `Lec.K.specificImpulseScenariosS` | 化学推进情景采用多个可选比冲，不设一种“火箭比冲”。 | p44 |
| `Lec.P.rocketMassRatio(...)` | 由任务所需Δv和比冲计算质量比。 | p44 |
| `Lec.P.propellantFraction(...)` | 统一计算推进剂质量分数。 | p44 |
| `Lec.P.rocketDeltaV(...)` | 学生调整初始质量、末质量与比冲时实时反算Δv。 | p44 |
| `Lec.K.signalDistanceScenariosM` | 近地轨道、月球、火星最近/典型/最远情景分别保存，不把火星延迟写成单一值。 | p43 |
| `Lec.P.signalRoundTripTime(...)` | 统一计算通信往返延迟。 | p43 |
| `Lec.K.culturalTransmissionErrorDefault` | 课堂模拟默认每步骤5%失真，并提供0%–20%范围；只作模型参数，不称考古测量值。 | p27–29 |
| `Lec.K.populationSimulationSeed` | 固定为课程级种子；页面子种子分别为`p08-selection`、`p31-domestication`、`p41-radiation`、`p47-mars`。 | p08、p31、p41、p47 |
| `Lec.K.populationSimulationSize` | 默认500个体；允许切换100、500、2000以观察随机漂变，不把模拟比例直接当现实人口。 | p08、p47 |
| `Lec.K.mutationRateTeaching` | 仅为抽象性状模型参数，不映射到整个人类基因组突变率。 | p47 |
| `Lec.K.geneFlowScenarios` | 设为开放、低交流、完全隔离三档，用于比较物种形成条件。 | p47、p49 |
| `Lec.K.speciationGenerationScenarios` | 使用10²、10³、10⁴代作为探索档位，不给出“人类必在某年形成新物种”的预测。 | p47、p49 |
| `Lec.P.yearsToSeconds(...)`、`Lec.P.daysToSeconds(...)`、`Lec.P.hoursToSeconds(...)` | 所有年代、任务日与小时统一换算后再进入模型。 | p04、p36、p41、p43–44、p47 |
| `Lec.P.percent(...)`、`Lec.P.ratio(...)` | 全套百分比和比例统一由函数生成，并在分母为零时阻止显示误导结果。 | p08、p18、p27、p30–32、p36、p40–44、p47 |
| `Lec.P.formatNumber(...)`、`Lec.P.formatDuration(...)` | 数值显示统一控制有效位数；时间按场景自动显示秒、小时、天或年。 | 全套计算页 |
| `Lec.P.finite(...)`、`Lec.P.clamp(...)` | 所有滑块、随机模拟和物理计算先做有限值检查与范围限制。 | 全套交互页 |
| `Lec.K.evidenceLabels` | 统一使用“较确定”“有支持但仍争议”“模型推测”三级证据标签。 | p05–06、p15、p20、p25、p31、p47–49 |
| `Lec.K.courseReferenceYear` | 年代换算统一采用讲义构建时写入的参考年，不在页面散落当前年份。 | p03–04 |
| `Lec.P.ageAtYear(...)`、`Lec.P.yearsAgo(...)` | 涉及历史年份与距今年数时统一调用，避免把公元纪年直接相减后遗漏口径。 | p03–04 |