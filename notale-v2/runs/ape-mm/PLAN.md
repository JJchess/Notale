# 《从猿人到太空人：不是一条升级线》 90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

太空人不是摆脱动物性的“升级人类”，而是一支灵长类用直立身体、累积文化、合作制度与物理知识，把仍然古老的身体送进了太空。

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| I 身体没有按进度条升级 | 01–11 | 人类演化是一棵分支树；直立、双手、脑与行为并非同步升级 |
| II 真正加速的是可传承的文化 | 12–27 | 工具、语言、教学与合作让知识跨越个体寿命并持续累积 |
| III 太空飞行是集体驾驭物理约束 | 28–39 | 火箭与轨道不是“更强壮”的结果，而是计算、分工和系统工程的结果 |
| IV 古老身体进入陌生环境 | 40–50 | 太空仍在检验我们的生物遗产；未来改变的是环境与制度，不是自动出现的新物种 |

E1  人类不是从今天的猿“升级”而来，而是灵长类分支树上一支经历漫长、镶嵌式变化的动物  
E2  直立行走早于大脑显著增大；身体特征并没有沿同一条进度条同步出现  
E3  个体无法独自发明太空时代所需的一切，累积文化与大规模合作才是加速器  
E4  进入太空依靠对推力、质量和轨道约束的计算，以及容错的集体技术系统  
E5  太空人仍携带地球演化塑造的身体；失重、辐射和隔离揭示了“人适合什么环境”  

无交互（只承担开场/推进/过渡/收束）：01 02 12 28 40 49 50

## 0.5 视觉世界

底色      深色取向；主背景 `#071018`，内容面板 `#0D1B26`  
主色相    `#59C3C3`，代表跨越地质时间仍延续的生命与知识链  
强调色    `#FFB547`，只用于当前因果、当前选择、当前轨道或当前结论  
字体族    标题用窄体无衬线，正文用高可读无衬线，年代、测量值与任务参数用等宽字体  
材质语言  线性科学图为主，关键化石、遗物、航天器与宇航员使用写实照片  
母题      深色地层切面与发光年代刻度  
母题      从足迹延伸为轨道的单条青绿色路径  
母题      骨骼关节点、工具刃缘与火箭结构共用的细线标注  
母题      代表文化传递的琥珀色节点与接力连线  
母题      页面边缘持续出现的地球弧面与薄层大气  

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 必用skill |
|---|---|---:|---:|---|---|---|---|---|---|
| 01 | I | — | 10 | generalization | 无 | 太空人并不是猿人的终极升级版 | 不讲演化证据（p03） | focus | theme-factory |
| 02 | I | — | 45 | enumeration | 无 | 全课沿身体、文化、物理、环境四段路径推进 | 不解释具体机制（p03–48） | ledger | technical-wireframe-info-layout |
| 03 | I | E1 | 120 | comparison | 拖动深时压缩尺 | 人类历史在地质时间中只是极薄的一层 | 不讲直立证据（p04） | canvas-full | d3-viz、web-media-getter |
| 04 | I | E1 | 130 | process | 测量足迹步幅 | 366 万年前的足迹已显示稳定的双足行走 | 不讲骨骼机制（p06） | split-tb | web-media-getter、reveal-hover-effect |
| 05 | I | E1 | 125 | classification | 重建分支谱系树 | 演化像分叉树，不像猿到人的单行阶梯 | 不讲自然选择算法（p10） | stage-cards | d3-viz |
| 06 | I | E2 | 140 | comparison | 调整骨盆与股骨角 | 两足行走来自多处结构协同，不是单一“直立基因” | 不讲行走能耗（p07） | split-lr | threejs-webgl |
| 07 | I | E2 | 115 | process | 试走能耗赛道 | 步态、速度和体形共同影响移动成本 | 不讲手部结构（p08） | canvas-full | mini-game、animation-systems |
| 08 | I | E2 | 135 | enumeration | 对齐骨架关节点 | 直立改变脊柱、骨盆、膝与足，也带来新的代价 | 不讲脑容量（p09） | triptych | web-media-getter、reveal-hover-effect |
| 09 | I | E2 | 105 | generalization | 探索脑体散点图 | 脑大小必须结合体形与物种差异解读 | 不把脑大等同聪明（p11） | split-lr | d3-viz |
| 10 | I | E1 | 145 | process | 存活繁殖挑战 | 自然选择改变群体中特征的比例，不替个体制定升级目标 | 不讲文化传递（p17） | canvas-full | mini-game |
| 11 | I | E2 | 110 | comparison | 诊断升级论断 | 直立、脑、工具与物种出现时间彼此错开 | 不展开累积文化（p20） | stage-cards | mini-game |
| 12 | II | — | 35 | enumeration | 无 | 身体变化很慢，知识传递开始改变速度 | 不重复自然选择（p10） | focus | container-lines |
| 13 | II | E3 | 120 | classification | 工具用途配对台 | 石器把手的动作扩展成可重复的外部结构 | 不讲石片形成过程（p14） | split-lr | web-media-getter、konva |
| 14 | II | E3 | 135 | process | 敲出合格刃缘 | 制作石片需要控制撞击点、角度与力度 | 不讲火的能量收益（p15） | canvas-full | mini-game、konva |
| 15 | II | E3 | 110 | comparison | 分配生食熟食预算 | 烹饪改变获得能量所需的咀嚼与消化时间 | 不宣称火有单一起源日期（p26） | triptych | d3-viz |
| 16 | II | E3 | 145 | generalization | 隔屏指令挑战 | 语言的价值在于让他人重建未直接看见的行动 | 不讲模仿误差（p17） | stage-cards | mini-game |
| 17 | II | E3 | 125 | process | 运行模仿接力 | 传递会产生误差，但示范、纠正与重复能提高保真度 | 不讲正式教学分类（p19） | split-tb | d3-viz |
| 18 | II | E3 | 130 | comparison | 调整群体连线密度 | 更大的交流网络提高知识保存和重新组合的机会 | 不讲合作困境（p21） | split-lr | d3-viz |
| 19 | II | E3 | 100 | enumeration | 选择教学策略 | 示范、指点、纠错和语言说明解决不同学习障碍 | 不运行累积模型（p20） | ledger | konva |
| 20 | II | E3 | 140 | process | 转动文化棘轮 | 改进只有被可靠继承，才会形成跨世代累积 | 不讲基因—文化反馈（p22） | canvas-full | mini-game、d3-viz |
| 21 | II | E3 | 115 | classification | 公共物品协作局 | 合作能产生个人无法独自取得的收益，也会遭遇搭便车 | 不讲制度网络（p24） | stage-cards | mini-game |
| 22 | II | E3 | 130 | comparison | 拼接基因文化回路 | 生物演化与文化环境可以相互影响，但速度和机制不同 | 不预测未来新人种（p47） | split-lr | d3-viz |
| 23 | II | E3 | 105 | process | 安排一天能量账 | 工具、食物处理和分工重新分配有限的时间与能量 | 不讲公共物品规则（p21） | split-tb | konva |
| 24 | II | E3 | 145 | generalization | 拆除知识网络节点 | 复杂技术依赖分散在许多人和机构中的知识 | 不讲航天系统失效（p37） | canvas-full | d3-viz、mini-game |
| 25 | II | E3 | 120 | comparison | 推演迁徙路线 | 进入不同环境依赖身体适应，也依赖衣物、火、路线与社会信息 | 不讲全球单一路线（p26） | split-lr | globe-gl |
| 26 | II | E3 | 135 | enumeration | 检视证据工作台 | 化石、工具、颜料和遗址只能支持有边界的推断 | 不把推断画成确定剧情（p27） | triptych | web-media-getter、reveal-hover-effect |
| 27 | II | E3 | 110 | process | 校准猿人标签尺 | “猿人”混合了分类、年代与进步想象，不能当作严谨阶段名 | 不讲火箭历史（p29） | stage-cards | konva |
| 28 | III | — | 50 | generalization | 无 | 从扔石头到入轨，改变的是可累积的控制能力 | 不讲推力公式（p31） | focus | technical-wireframe-info-layout |
| 29 | III | E4 | 145 | enumeration | 排列火箭证据链 | 火箭由长期分散的燃烧、材料、制导与组织知识汇合而成 | 不讲动量机制（p30） | ledger | web-media-getter、konva |
| 30 | III | E4 | 120 | comparison | 反冲质量交换台 | 投掷、喷气与火箭都通过交换动量改变运动 | 不讲火箭方程（p33） | split-lr | matterjs |
| 31 | III | E4 | 135 | process | 调节喷流推力台 | 推力取决于单位时间喷出的质量与喷流速度 | 不讲分级选择（p32） | canvas-full | mini-game、matterjs |
| 32 | III | E4 | 110 | classification | 组装火箭级段 | 结构、推进、制导和载荷承担不同职责，分级用于丢弃无用质量 | 不计算质量比（p33） | triptych | konva |
| 33 | III | E4 | 150 | process | 燃料质量堆叠局 | 追求更大速度增量会让推进剂需求非线性上升 | 不讲轨道形状（p34） | stage-cards | mini-game、matterjs |
| 34 | III | E4 | 125 | comparison | 发射牛顿大炮 | 入轨不是升到高处停住，而是持续落下却不断错过地面 | 不讲轨道高度参数（p35） | canvas-full | mini-game、threejs-webgl |
| 35 | III | E4 | 140 | generalization | 旋转轨道实验球 | 轨道半径同时改变速度、周期和地表覆盖方式 | 不讲转移轨道（p36） | split-lr | globe-gl、threejs-webgl |
| 36 | III | E4 | 115 | process | 点火转移轨道 | 改变轨道需要在合适位置改变速度，而不是朝目标直线飞行 | 不讲任务组织（p37） | split-tb | d3-viz、gsap-timeline |
| 37 | III | E4 | 130 | enumeration | 追踪故障传播树 | 航天器是相互依赖的系统，局部失效可能沿接口扩散 | 不讲岗位协作（p38） | ledger | d3-viz |
| 38 | III | E4 | 105 | comparison | 拼合任务岗位网 | 一次载人飞行凝结了远多于宇航员个人掌握的专业知识 | 不运行完整任务（p39） | triptych | d3-viz、web-media-getter |
| 39 | III | E4 | 145 | process | 完成一次入轨任务 | 成功入轨需要同时满足速度、方向、燃料、结构和时机约束 | 不讲人体失重反应（p42） | canvas-full | mini-game、threejs-webgl |
| 40 | IV | — | 40 | generalization | 无 | 飞船过了边界，身体并没有变成另一种生物 | 不提前讲失重过程（p42） | focus | container-lines |
| 41 | IV | E5 | 90 | comparison | 辨认漂浮姿势线索 | 宇航员的漂浮来自共同自由落体，而不是附近没有重力 | 不讲长期生理变化（p42） | split-lr | web-media-getter、reveal-hover-effect |
| 42 | IV | E5 | 95 | process | 推进失重身体时钟 | 缺少日常负重会逐步改变肌肉、骨骼、体液与平衡感 | 不讲辐射（p43） | split-tb | animation-systems、gsap-timeline |
| 43 | IV | E5 | 85 | classification | 配置辐射屏蔽层 | 不同辐射和屏蔽材料之间不存在简单的“越厚越安全”规则 | 不讲地球观看效应（p44） | triptych | mini-game |
| 44 | IV | E5 | 100 | comparison | 揭开地球影像层 | 太空照片把地球呈现为有限、相连且只有薄层大气的环境 | 不把心理感受说成人人相同（p48） | canvas-full | web-media-getter、reveal-hover-effect |
| 45 | IV | E5 | 90 | process | 切换火星重力身体 | 较低重力会改变动作与负重，却不会立即重写人体的演化结构 | 不预测遗传适应（p47） | split-lr | threejs-landscape、mini-game |
| 46 | IV | E5 | 95 | generalization | 维持世代飞船社会 | 长期离开地球首先是人口、资源、知识保存与治理问题 | 不宣称模型能预测真实社会（p47） | stage-cards | mini-game、d3-viz |
| 47 | IV | E5 | 80 | comparison | 选择未来分支条件 | 生理调节、技术改造与遗传演化是三种不同时间尺度的变化 | 不作必然的人类未来预言（p48） | canvas-full | d3-viz、konva |
| 48 | IV | E5 | 95 | process | 迁移判断卡组 | 面对新案例，应分别追问身体、文化、物理与制度约束 | 不重新讲各章案例（p49） | ledger | mini-game |
| 49 | IV | — | 55 | enumeration | 无 | 足迹、工具、网络、火箭与漂浮身体构成同一条证据链 | 不增加新证据（p50） | focus | technical-wireframe-info-layout |
| 50 | IV | — | 25 | generalization | 无 | 太空人仍是动物，但成为了能共同保存并重组知识的动物 | 不展开课后议题 | canvas-full | make-illustration |

## 2. 页间不重复的硬约定

| 概念或形式 | 展开页 | 各页唯一职责 |
|---|---|---|
| 地质深时 | p03 | 只建立时间尺度直觉；其余页沿用年代，不再重做压缩尺 |
| 拉埃托利足迹 | p04 | 只从真实足迹读取双足行走证据 |
| 分支演化与“进化阶梯” | p05 | 只建立树状共同祖先模型 |
| 双足行走结构 | p06–08 | p06关节几何，p07步态与成本，p08全身收益和代价 |
| 脑容量与体形 | p09 | 只处理脑—体比较及其解释边界 |
| 自然选择 | p10 | 唯一运行繁殖与频率变化算法的页面 |
| “同步升级”误解 | p11 | 汇总时间错位，不再介绍新化石 |
| 石器 | p13–14 | p13用途与外部功能，p14断裂和制作技能 |
| 火与烹饪 | p15 | 只讨论时间、能量预算及证据不确定性 |
| 语言 | p16 | 只处理远程重建行动，不讨论语言起源年代 |
| 传递保真度 | p17–19 | p17误差链，p18网络规模，p19教学策略 |
| 累积文化 | p20 | 唯一使用“文化棘轮”模型的页面 |
| 合作 | p21–24 | p21公共物品，p22基因—文化反馈，p23日常资源分配，p24分布式知识 |
| 史前迁徙 | p25 | 唯一使用全球三维地球迁徙场景的页面 |
| 史前证据边界 | p26 | 只训练从遗物到结论的推断强度 |
| “猿人”一词 | p27 | 只拆解标签，不承担物种谱系教学 |
| 火箭技术史照片 | p29 | 只建立多技术汇流的历史结构 |
| 动量与反冲 | p30–31 | p30定性质量交换，p31计算推力 |
| 火箭分级与质量比 | p32–33 | p32部件职责，p33火箭方程与推进剂惩罚 |
| 轨道 | p34–36 | p34自由落体直觉，p35圆轨道参数，p36霍曼转移 |
| 航天系统与组织 | p37–39 | p37故障传播，p38岗位知识网，p39整合任务 |
| 轨道三维场景 | p34–35、p39 | p34只演示“错过地面”，p35比较稳定圆轨道，p39执行有成败条件的任务 |
| 反冲物理模拟 | p30–31 | p30允许自由拖放质量，p31只调质量流率和喷流速度 |
| 燃料堆叠小游戏 | p33 | 唯一把推进剂质量做成可坍塌实物隐喻的页面 |
| 完整任务小游戏 | p39 | 唯一同时检查速度、方向、燃料、结构与点火时机的页面 |
| 微重力 | p41–42 | p41解释共同自由落体，p42解释长期人体变化 |
| 太空辐射 | p43 | 只做类型与屏蔽取舍，不扩展为核物理课 |
| 地球影像 | p44 | 只使用 Earthrise、Blue Marble 等真实影像讨论有限环境 |
| 火星身体 | p45 | 只模拟即时运动与负重，不模拟数代遗传变化 |
| 世代飞船 | p46 | 只作为资源、人口、知识与治理的简化系统模型 |
| 未来人类变化 | p47 | 严格区分生理调节、技术改造、遗传演化 |
| 迁移练习 | p48 | 只使用未出现过的新案例检验四类约束 |
| 综合证据链 | p49 | 只回接 E1–E5，不添加数字或案例 |
| 真实化石、遗物照片 | p03、p04、p08、p13、p26 | 每页使用不同对象；不把生成图当作实物证据 |
| 航天真实照片 | p29、p38、p41、p44 | p29技术史，p38协作现场，p41失重姿态，p44地球整体影像 |
| 随机群体模拟 | p10、p17、p20、p21、p46 | 全部使用 `seedrandom`；种子分别固定为页号，算法和胜负条件不得复用 |
| 公共物品小游戏 | p21 | 每轮按投入总量计算公共收益，再均分并反馈搭便车结果 |
| 世代飞船小游戏 | p46 | 按出生、死亡、资源、技能遗失和培训容量逐代更新，不复用公共物品算法 |
| 自然选择小游戏 | p10 | 特征影响环境中的存活或繁殖概率；个体在一轮内不“进化” |
| 文化棘轮小游戏 | p20 | 每代先复制再尝试改进；低保真会丢失，高保真才可能累积 |
| 轨道计算 | p34–36、p39 | 统一使用逆平方引力或 `Lec.P` 轨道函数，不使用预录路径 |
| 页面随机性 | p10、p17、p20、p21、p24、p39、p46 | 使用 `Math.seedrandom('page-NN')`，重置后复现实验初始状态 |

## 3. 数字口径

| 数值或口径 | 全套统一值 | 页面取值方式 |
|---|---:|---|
| 地球年龄 | 约 45.4 亿年 | `Lec.K` 地球年龄常量；显示时用 `Lec.P.formatYearsAgo` |
| 人类与黑猩猩谱系最近共同祖先 | 约 600万–700 万年前，作为估计区间 | `Lec.K` 谱系分化区间；不得显示成精确事件日期 |
| 拉埃托利足迹年代 | 约 366 万年前 | `Lec.K` 拉埃托利年代 |
| 南方古猿阿法种年代 | 约 390万–290 万年前 | `Lec.P.speciesById('australopithecus-afarensis')` |
| 最早期人属记录 | 约 280 万年前 | `Lec.K` 早期人属记录年代；标注“目前证据约为” |
| 智人出现 | 约 30 万年前 | `Lec.P.speciesById('homo-sapiens')` |
| 物种存续与重叠 | 不把相邻物种画成无缝接替 | `Lec.P.speciesDurationYears`、`Lec.P.speciesOverlapYears` |
| 脑容量或脑质量 | 按物种数据展示，不用单一数值代表“智力” | `Lec.P.speciesById`；比较时调用 `Lec.P.brainToBodyRatio` 或 `Lec.P.encephalizationQuotient` |
| 受控用火年代 | 证据随地点与判据变化；采用约 100万–40 万年前的讨论区间 | `Lec.K` 用火证据区间；页面不得写成单一发明日 |
| 一代时长 | 25 年，作为课堂模型参数而非史实常数 | `Lec.K` 教学模型代长；代数用 `Lec.P.generationsInYears` |
| 食物能量换算 | 1 千卡 = 4184 焦耳 | `Lec.P.foodCaloriesToJoules`、`Lec.P.joulesToFoodCalories` |
| 推力 | 质量流率 × 喷流速度 | `Lec.P.exhaustVelocity`、`Lec.P.thrust` |
| 速度增量 | 由比冲与初末质量比决定 | `Lec.P.rocketDeltaV`；不得在页面写死计算结果 |
| 质量比与推进剂比例 | 随目标速度增量和比冲动态计算 | `Lec.P.rocketMassRatio`、`Lec.P.rocketPropellantFraction` |
| 地球平均半径 | 约 6371 千米 | `Lec.K` 地球半径；格式化用 `Lec.P.formatDistance` |
| 海平面重力加速度 | 约 9.81 m/s² | `Lec.K` 标准重力；高度变化用 `Lec.P.earthGravityAtAltitude` |
| 卡门线 | 100 千米，明确标注为常用约定边界 | `Lec.K` 卡门线高度 |
| 近地轨道课堂示例高度 | 400 千米 | `Lec.K` 近地轨道示例高度 |
| 400 千米高度的重力 | 约为地表的 89%，不是零 | `Lec.P.earthGravityAtAltitude(400000)` 与海平面值求比 |
| 400 千米圆轨道速度 | 约 7.7 km/s | `Lec.P.earthOrbitSpeed(400000)` |
| 400 千米圆轨道周期 | 约 92 分钟 | `Lec.P.earthOrbitPeriod(400000)`、`Lec.P.formatDuration` |
| 地球逃逸速度 | 约 11.2 km/s | `Lec.P.escapeSpeed`；不得与入轨速度混为一谈 |
| 轨道速度与周期 | 均从地心半径计算，不直接用离地高度代替半径 | `Lec.P.circularOrbitSpeed`、`Lec.P.orbitalPeriod` |
| 霍曼转移 | 课堂默认理想二体、瞬时点火模型 | `Lec.P.hohmannTransfer`；地月示例用 `Lec.P.earthMoonHohmannTransfer` |
| 地月平均距离 | 约 384400 千米 | `Lec.K` 地月平均距离；显示用 `Lec.P.formatDistance` |
| 地月单程光时 | 约 1.28 秒 | `Lec.P.lightTravelTime` |
| 火星表面重力 | 约 3.71 m/s²，约为地球的 38% | `Lec.K` 火星参数；体重用 `Lec.P.weightOnBody` |
| 月球表面重力 | 约 1.62 m/s²，约为地球的 16.5% | `Lec.K` 月球参数；体重用 `Lec.P.weightOnBody` |
| 微重力人体变化 | 使用任务时长和变化范围，不给所有人同一确定结果 | `Lec.K` 人体适应范围；页面必须显示个体差异与任务条件 |
| 近地轨道辐射剂量 | 使用任务与太阳活动相关的范围，不写单一固定剂量 | `Lec.K` 任务辐射范围；页面标注“估计范围” |
| 火星往返辐射风险 | 只作数量级比较，不作为医学个体预测 | `Lec.K` 火星任务辐射估计范围 |
| 年代显示 | 距今超过一万年统一写“约 X 万/百万年前” | `Lec.P.formatYearsAgo` |
| 日历年份 | 公元前后统一格式，不混用负号与“公元前” | `Lec.P.formatCalendarYear` |
| 百分比 | 概率与比例统一保留 0–1 位小数 | `Lec.P.formatPercent` |
| 距离、速度、能量和质量 | 自动选择合适量级与单位 | `Lec.P.formatDistance`、`Lec.P.formatSpeed`、`Lec.P.formatEnergy`、`Lec.P.formatMass` |
| 随机实验 | 同页每次首次打开结果一致，点击重置回到同一初态 | `Math.seedrandom('page-NN')` |
| 参考年份 | 全套使用 `Lec.K` 统一参考年份 | 年份互换用 `Lec.P.yearFromYearsAgo`、`Lec.P.yearsAgoFromYear` |