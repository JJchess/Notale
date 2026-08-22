# 《从猿人到太空人：身体、文化与宇宙》90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

人类没有摆脱猿类身体才进入太空，而是用累积文化把脆弱的灵长类身体包进工具、组织和人造环境，暂时越过生物与物理边界。

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| I 看见问题 | 01–05 | “猿人”和“太空人”不是两个物种，而是同一条历史上的两个处境 |
| II 身体从哪里来 | 06–17 | 人体是自然选择留下的拼装结果，能适应但不为太空而设计 |
| III 文化怎样接力 | 18–28 | 人类的决定性能力不是单个大脑，而是跨人、跨代累积知识 |
| IV 太空如何反驳幻想 | 29–43 | 火箭、轨道和生命保障把人体限制与集体协作同时暴露出来 |
| V 太空人意味着什么 | 44–52 | 成为太空人不是离开人类条件，而是更自觉地管理这些条件 |

E1 人类是演化而来的灵长类，直立、手、脑和生命史并非同时“升级”，而是分阶段形成的拼装系统。  
E2 这副身体既有广泛适应能力，也带着重力、辐射、能量、繁殖和社会依赖等明确边界。  
E3 工具、语言、合作与跨代传承组成“文化棘轮”，让群体能积累任何个人一生无法独立发明的能力。  
E4 太空飞行受轨道、能量和质量守恒约束；宇航员的生存依靠地面与舱内共同维持的技术系统。  
E5 “太空人”是生物身体、累积文化与制度选择的组合；设计太空生活，也是在重新认识地球生活。  

无交互（只承担开场/推进/过渡/收束）：01 02 06 18 29 44 52

## 0.5 视觉世界

底色      明暗取向：深色基底 `#071015`，章节转场可切换为浅色基底 `#F2F4EF`  
主色相    `#35C6B4`，代表生命、循环与跨代延续  
强调色    `#FFCC4D`，只用于当前因果节点、用户选择和必须注视的读数  
字体族    标题用窄体无衬线，正文用高可读无衬线，年代、测量值和系统状态用等宽体  
材质语言  写实照片为主，叠加扁平线性标注和半透明技术剖面  
母题      脚印与靴印成对出现，连接远古行走和舱外行走  
母题      一条不断分叉又汇合的青绿色时间线，表示生物演化与文化累积  
母题      身体轮廓外逐层增加工具、舱体和生态循环环  
母题      地球弧面上方的一层极薄亮线，表示可居住环境的有限性  
母题      黄色约束线连接质量、能量、时间和风险，改变一项会牵动其余各项  

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 必用skill |
|---|---|---|---|---|---|---|---|---|---|
| 01 | I | — | 12 | generalization | 无 | 穿宇航服的人仍带着数百万年形成的灵长类身体 | 不讲演化证据（p07–17） | focus | theme-factory, design-taste-frontend, web-media-getter |
| 02 | I | — | 45 | enumeration | 无 | 全课沿身体、文化、太空约束和选择四步推进 | 不展开具体年代（p08–12） | ledger | theme-factory |
| 03 | I | E5 | 110 | classification | 身份边界投票 | “太空人”可以按地点、职业、身体状态或系统依赖来定义 | 不裁定未来新人种（p46） | stage-cards | — |
| 04 | I | E1 | 125 | comparison | 拖拽压缩时间尺 | 载人航天史在人体演化史上只占近乎看不见的一小段 | 不讲脑容量变化（p12） | canvas-full | d3-viz, gsap-scrolltrigger |
| 05 | I | E5 | 105 | process | 拼装主张链 | 从猿类身体到太空生活必须经过文化与技术系统，而非一次跃迁 | 不验证各环证据（p07–43） | split-tb | d3-viz |
| 06 | II | — | 38 | enumeration | 无 | 第一站先检查宇航服里面那副身体是怎样形成的 | 不讲火箭与轨道（p30–35） | focus | web-media-getter |
| 07 | II | E1 | 115 | classification | 点选灵长类特征 | 人类仍属于灵长类，共享抓握、视觉和社会生活等基本遗产 | 不把现生猿类当祖先（p17） | triptych | d3-viz, web-media-getter |
| 08 | II | E1 | 125 | comparison | 脚印对齐台 | 约 366 万年前的脚印已经显示稳定双足行走 | 不由脚印推断脑容量（p12） | canvas-full | web-media-getter, reveal-hover-effect |
| 09 | II | E1 | 110 | process | 骨盆脊柱装配器 | 双足行走依靠骨盆、脊柱、股骨和足部共同改变 | 不宣称直立只有收益（p10） | split-lr | technical-wireframe-info-layout, web-media-getter |
| 10 | II | E2 | 120 | comparison | 步态代价实验 | 同一种直立结构同时释放双手、提高行走效率并带来承重代价 | 不讲分娩与婴儿依赖（p15） | split-tb | matterjs |
| 11 | II | E1 | 125 | process | 拖动拼图时间线 | 直立、工具、脑容量增长和现代体形并非同时出现 | 不把演化画成单线阶梯（p17） | canvas-full | d3-viz, gsap-scrolltrigger |
| 12 | II | E1 | 105 | comparison | 脑容量散点探针 | 脑容量在较晚阶段总体增大，但重叠与例外反对简单排名 | 不把容量等同智力（p25） | split-lr | d3-viz |
| 13 | II | E2 | 115 | classification | 证据可信度分拣 | 化石、遗物、基因与现代观察回答的问题不同，确定性也不同 | 不重讲具体骨骼结构（p09） | stage-cards | mini-game |
| 14 | II | E2 | 135 | process | 体温收支模拟 | 出汗、体表面积、活动强度和环境共同决定人体能否持续散热 | 不迁移到宇航服热控（p42） | split-tb | animation-systems |
| 15 | II | E2 | 100 | comparison | 成长周期配对 | 人类漫长童年把学习潜力与长期照料需求绑在一起 | 不讲文化棘轮机制（p19–20） | triptych | web-media-getter |
| 16 | II | E1 | 120 | classification | 变异洗牌器 | 演化作用于群体中的可遗传差异，不是个体因需要而主动升级 | 不讲未来定向改造（p46） | stage-cards | d3-viz, mini-game, seedrandom |
| 17 | II | E1 | 110 | generalization | 改写演化阶梯 | 人类演化是一棵有分支和灭绝的树，不是朝宇航员前进的阶梯 | 不进入文化累积算法（p19） | canvas-full | d3-viz |
| 18 | III | — | 42 | enumeration | 无 | 身体变化很慢，人类却能在几代内获得全新的生活能力 | 不讲航天工程实例（p33–43） | focus | make-illustration |
| 19 | III | E3 | 100 | process | 模仿传递链 | 信息在逐人模仿中会丢失，示范质量决定保真度 | 不加入改进累积（p20） | stage-cards | mini-game, seedrandom |
| 20 | III | E3 | 110 | generalization | 文化棘轮工坊 | 保留已有成果并允许下一人改进，才会产生累积文化 | 不讨论语言网络（p23） | split-tb | mini-game, matterjs |
| 21 | III | E3 | 125 | classification | 外置器官配对 | 衣物、容器、文字和计算把身体功能延伸到皮肤、记忆与推理之外 | 不把所有工具都算作复杂文化（p22–27） | triptych | technical-wireframe-info-layout, web-media-getter |
| 22 | III | E3 | 100 | comparison | 工具代际赛 | 单人反复试错与多人继承改进会产生完全不同的工具水平 | 不讲合作激励（p24） | canvas-full | mini-game, seedrandom |
| 23 | III | E3 | 115 | process | 知识网络接龙 | 语言与符号让经验脱离当事人，在群体中重组和远距离传播 | 不讲现代专业分工（p25） | split-lr | d3-viz |
| 24 | III | E3 | 105 | classification | 公共品协作局 | 合作能放大共同收益，但需要处理搭便车、信任与惩罚 | 不讨论航天任务角色（p41） | stage-cards | mini-game, seedrandom |
| 25 | III | E3 | 130 | comparison | 一人造铅笔挑战 | 看似简单的现代物品也依赖无人能够独自掌握的分布式知识 | 不扩展工业能源史（p27） | ledger | d3-viz |
| 26 | III | E3 | 90 | process | 能量阶梯拨盘 | 人类利用体外能源后，单位时间内能改变的物质规模急剧上升 | 不计算火箭能量（p33–35） | split-tb | d3-viz |
| 27 | III | E3 | 115 | enumeration | 航天供应链追踪 | 一次发射背后是材料、计算、组织、法规与全球基础设施 | 不讲舱内生命保障（p38） | canvas-full | d3-viz, web-media-getter |
| 28 | III | E3 | 110 | generalization | 能力归属审计 | “人类会飞向太空”描述的是协作系统能力，不是裸身个体能力 | 不进入轨道物理（p32） | ledger | — |
| 29 | IV | — | 48 | classification | 无 | 离开地表后，物理约束与生物约束会同时变得不可忽略 | 不逐项求解约束（p30–43） | focus | web-media-getter |
| 30 | IV | E2 | 110 | comparison | 大气薄层缩放器 | 可呼吸大气相对地球半径薄得惊人，太空始于生命条件迅速消失之处 | 不讲轨道失重（p32） | canvas-full | threejs-webgl, web-media-getter |
| 31 | IV | E2 | 120 | classification | 重力目的地秤 | 质量不变而重量随当地重力改变，身体负荷也随之改变 | 不解释轨道中的表观失重（p32） | triptych | — |
| 32 | IV | E4 | 100 | process | 横向抛射轨道台 | 轨道不是没有重力，而是物体持续下落却不断错过地面 | 不计算火箭质量比（p34） | canvas-full | threejs-webgl, gsap-scrolltrigger |
| 33 | IV | E4 | 135 | comparison | 速度预算账本 | 入轨困难主要来自必须获得很大的横向速度，而非只要升得足够高 | 不展开多级火箭策略（p35） | ledger | — |
| 34 | IV | E4 | 105 | process | 火箭质量比拨盘 | 所需速度增加时，推进剂比例以非线性方式迅速吞噬载荷 | 不讲发动机工程细节（p35） | split-lr | d3-viz |
| 35 | IV | E4 | 115 | classification | 分级入轨游戏 | 抛弃空贮箱能改善质量预算，但每一级都增加复杂度与风险 | 不讲人体长期失重（p36） | canvas-full | mini-game, matterjs |
| 36 | IV | E2 | 95 | process | 失重身体时钟 | 肌肉、骨骼、体液和平衡系统会在微重力中按不同时间尺度改变 | 不讲辐射剂量（p37） | split-tb | animation-systems, web-media-getter |
| 37 | IV | E2 | 130 | comparison | 辐射屏蔽试验台 | 距离、材料与任务时长共同影响辐射风险，屏蔽也有质量代价 | 不把风险简化成单一安全线（p43） | split-lr | d3-viz |
| 38 | IV | E4 | 110 | process | 舱内循环平衡器 | 长期生存要求持续平衡水、氧、二氧化碳、食物、废物和能量 | 不讨论群体心理（p41） | canvas-full | d3-viz |
| 39 | IV | E4 | 120 | comparison | 通信延迟对话机 | 距离把即时求助变成等待，远行者必须获得更高自主性 | 不讨论火星表面环境（p40） | split-tb | gsap-timeline |
| 40 | IV | E2 | 100 | classification | 火星生存缺口板 | 火星同时缺少合适压力、温度、辐射屏蔽和可直接呼吸的大气 | 不设计完整定居点（p45） | triptych | web-media-getter, technical-wireframe-info-layout |
| 41 | IV | E4 | 120 | generalization | 舱组角色调度 | 封闭任务的可靠性来自角色互补、沟通协议和冲突处理 | 不重讲公共品博弈（p24） | stage-cards | mini-game, seedrandom |
| 42 | IV | E4 | 95 | process | 宇航服热控回路 | 宇航服不是衣服，而是随身携带压力、供氧、排热与通信的微型环境 | 不重讲人体散热机制（p14） | split-lr | technical-wireframe-info-layout, web-media-getter |
| 43 | IV | E4 | 95 | classification | 任务风险配平盘 | 载荷、冗余、时间、人员和风险无法同时无限优化 | 不作伦理选择（p47） | ledger | d3-viz |
| 44 | V | — | 40 | generalization | 无 | 最后的问题不是能否去，而是要把怎样的人类条件带过去 | 不重复约束细节（p30–43） | focus | make-illustration |
| 45 | V | E5 | 110 | process | 定居点闭环沙盘 | 一个可持续定居点必须把栖居、能源、循环、维修和治理连成系统 | 不决定基因改造政策（p46） | canvas-full | mini-game, d3-viz |
| 46 | V | E5 | 125 | classification | 适应方案分诊 | 面对太空限制，可以改变环境、行为或身体，但三者代价与可逆性不同 | 不讨论谁有权决定（p47） | stage-cards | d3-viz |
| 47 | V | E5 | 105 | comparison | 行星保护陪审团 | 探索收益、污染风险、科学价值与后代权益之间不存在纯技术答案 | 不重做生存工程（p45） | split-tb | mini-game |
| 48 | V | E5 | 140 | generalization | 地球飞船系统图 | 地球同样依赖有限的物质循环和可维持的环境，只是边界较大且不显眼 | 不把地球与密闭舱完全等同（p49） | canvas-full | globe-gl, d3-viz |
| 49 | V | E5 | 110 | classification | 类比边界标注器 | “地球飞船”能凸显相互依赖，但会遮蔽开放生态、权力差异与自然演化 | 不提出个人行动清单（p51） | ledger | — |
| 50 | V | E5 | 130 | process | 猿人到太空人接力 | 将身体、文化、物理约束和制度选择排成完整因果链才能解释太空人 | 不新增事实证据（p51） | stage-cards | d3-viz, mini-game |
| 51 | V | E5 | 130 | comparison | 主张压力测试 | 新情境下仍成立的解释是：技术扩大能力，却没有取消身体与集体依赖 | 不展开未来预测（p52） | split-lr | mini-game |
| 52 | V | — | 55 | generalization | 无 | 太空人不是猿人的反面，而是猿类身体借累积文化抵达的新处境 | 不再新增概念、数字或案例 | focus | web-media-getter |

## 2. 页间不重复的硬约定

| 概念或形式 | 展开页 | 唯一职责与边界 |
|---|---|---|
| 全课核心主张 | p01、p05、p50–52 | p01 提出，p05 拼出待验证链条，p50 重建，p51 迁移检验，p52 收束；中间各页不重复宣讲全文 |
| 演化时间尺度 | p04、p11 | p04 比较航天史与演化史的数量级；p11 只比较身体与行为特征出现的先后 |
| 灵长类共同祖先 | p07 | 只建立分类与共同特征，不在其他页复述“人来自猴子”的纠错 |
| 拉埃托利脚印 | p08 | 只用于双足行走证据，不推断物种智力、语言或现代行为 |
| 双足身体结构 | p09–10 | p09 讲结构联动，p10 讲收益与代价；p14 不再解释步态 |
| 脑容量 | p12 | 只讲总体趋势、重叠与“容量不等于能力”，不在文化章节重新画脑容量图 |
| 证据类型与确定性 | p13 | 只在此页显式比较化石、遗物、基因和现代观察 |
| 散热与体温 | p14、p42 | p14 讲人体热收支；p42 只讲宇航服如何接管排热 |
| 漫长童年与依赖 | p15 | 只建立学习窗口与照料成本，不在合作页重新展开生命史 |
| 自然选择与个体适应的区别 | p16 | 只在此页纠正“因为需要所以进化”的误解 |
| 演化树与阶梯误区 | p17 | 只在此页呈现完整分支树，后续时间线不得再采用上升阶梯构图 |
| 文化传递、棘轮与创新 | p19–20、p22 | p19 只测传递损失，p20 加入保留机制，p22 比较个人试错与代际改进 |
| 工具作为身体外延 | p21 | 只做功能分类，不在火箭页把任何技术泛称为“外置器官” |
| 语言和符号网络 | p23 | 只讲信息脱离个体并重组，不讲合作奖惩 |
| 合作机制 | p24、p41 | p24 是抽象公共品机制；p41 是封闭航天任务的角色与沟通，不重复博弈规则 |
| 分布式知识 | p25、p27 | p25 用日常物品证明无人全知；p27 追踪航天供应链，不重复铅笔案例 |
| 体外能源 | p26 | 只讲能力规模改变，不展开能源史或环境政策 |
| “系统能力”结论 | p28 | 只总结文化章，不提前讲太空环境参数 |
| 三维地球 | p30、p48 | p30 放大大气薄层和高度；p48 展示全球循环与边界，镜头和数据层不得复用 |
| 重量与质量 | p31 | 只在此页比较目的地重力，其他页直接沿用术语 |
| 轨道三维场景 | p32 | 全套唯一可操纵轨道场景，只解释持续下落，不兼做发射游戏 |
| 速度预算、质量比与分级 | p33–35 | p33 建速度账本，p34 操作质量比，p35 用分级完成挑战；三页不重复同一图 |
| 微重力生理变化 | p36 | 只按时间尺度展示身体变化，不扩展临床治疗 |
| 辐射风险 | p37 | 只比较时长、材料和质量，不给出虚假的绝对安全阈值 |
| 闭环生命保障 | p38、p45 | p38 是单舱物质流平衡；p45 将其作为定居点子系统，不重教各流量 |
| 通信延迟 | p39 | 只在此页运行距离与往返延迟计算 |
| 火星环境 | p40 | 只列生存缺口，不在此页设计基地或讨论改造行星 |
| 宇航服剖面 | p42 | 全套唯一宇航服技术剖面，其他照片不得再次逐件标注组件 |
| 多约束任务权衡 | p43 | 只做工程预算，不处理道德权利与行星保护 |
| 定居点沙盘 | p45 | 全套唯一综合定居模拟，必须运行资源守恒、故障与冗余算法 |
| 生物改造、行为改变与环境工程 | p46 | 只做分类和代价比较，不预测新人种 |
| 行星保护伦理 | p47 | 全套唯一规范性陪审任务，结果不得标成唯一正确答案 |
| “地球飞船”类比 | p48–49 | p48 展示类比的解释力，p49 专门标出类比失效处 |
| 综合接力机制 | p50 | 只允许调用前页已经建立的四类节点，不加入新卡片或新数据 |
| 迁移测验 | p51 | 使用陌生情境检验核心主张，不复刻任何前页交互 |
| 脚印与靴印照片对照 | p01、p52 | p01 只制造问题，p52 才完成意义闭合；中间页面不再使用同一对图 |
| 随机生成 | p16、p19、p22、p24、p41 | 各页使用独立固定种子；随机结果只服务本页机制，不跨页引用具体一次结果 |

## 3. 数字口径

| 常量或口径 | 统一值 | 页面取值方式 |
|---|---|---|
| 现代人和黑猩猩谱系分开时间 | 约 `6–7 Ma`，只作范围，不写成精确时刻 | `Lec.K.homininChimpSplitMinYears`、`Lec.K.homininChimpSplitMaxYears` |
| 拉埃托利 G 点位脚印年代 | `3.66 Ma` | `Lec.K.laetoliFootprintsYearsAgo` |
| 最早期 Homo 化石口径 | 约 `2.8 Ma`，注明分类仍可讨论 | `Lec.K.earliestHomoYearsAgo` |
| Homo sapiens 出现时间 | 约 `300 ka` | `Lec.K.homoSapiensYearsAgo` |
| 首次载人航天年份 | `1961` | `Lec.K.firstHumanSpaceflightYear` |
| 首次载人登月年份 | `1969` | `Lec.K.firstCrewedMoonLandingYear` |
| 参照年份 | 构建时固定为 `2025`，不得读取系统年份后改变讲义结果 | `Lec.K.referenceYear` |
| 航天史持续时间 | 参照年份减首次载人航天年份 | `Lec.P.elapsedYears(Lec.K.firstHumanSpaceflightYear, Lec.K.referenceYear)` |
| 时间线位置 | 年代越久远越靠左，按统一最老年代归一化 | `Lec.P.timelineFraction(yearsAgo, Lec.K.timelineOldestYearsAgo)` |
| 对数时间线位置 | 仅 p04 用于跨数量级压缩 | `Lec.P.logTimelineFraction(yearsAgo, Lec.K.timelineMinimumYearsAgo, Lec.K.timelineOldestYearsAgo)` |
| Australopithecus afarensis 脑容量展示范围 | 约 `375–550 cm³`，显示范围而非单一物种分数 | `Lec.K.afarensisBrainVolumeMinCm3`、`Lec.K.afarensisBrainVolumeMaxCm3` |
| Homo erectus 脑容量展示范围 | 约 `600–1100 cm³` | `Lec.K.erectusBrainVolumeMinCm3`、`Lec.K.erectusBrainVolumeMaxCm3` |
| 现代人脑容量展示范围 | 约 `1000–1800 cm³`，不得转写为智力等级 | `Lec.K.sapiensBrainVolumeMinCm3`、`Lec.K.sapiensBrainVolumeMaxCm3` |
| 成人平均体温演示基准 | `37 °C` 仅作教学基准，不作为个人医学判断 | `Lec.K.humanReferenceBodyTemperatureC` |
| 水的每日演示需求 | `3.0 kg/person/day` 的系统预算基准，包含口径须在页内标明 | `Lec.K.lifeSupportWaterPerPersonDayKg` |
| 氧气每日消耗演示值 | `0.84 kg/person/day` | `Lec.K.lifeSupportOxygenPerPersonDayKg` |
| 二氧化碳每日产生演示值 | `1.0 kg/person/day` | `Lec.K.lifeSupportCarbonDioxidePerPersonDayKg` |
| 地球质量 | `5.9722 × 10²⁴ kg` | `Lec.K.earthMassKg` |
| 地球平均半径 | `6,371,000 m` | `Lec.K.earthMeanRadiusM` |
| 海平面标准重力 | `9.80665 m/s²` | `Lec.K.earthStandardGravityMps2` |
| 月球表面重力 | `1.62 m/s²` | `Lec.K.moonSurfaceGravityMps2` |
| 火星表面重力 | `3.71 m/s²` | `Lec.K.marsSurfaceGravityMps2` |
| 不同目的地重量 | 以质量乘当地重力计算，不改写质量 | `Lec.P.weight(mass, gravitationalAcceleration)` |
| 相对地球重量 | 目的地重力除以地球重力 | `Lec.P.relativeWeight(destinationGravity, Lec.K.earthStandardGravityMps2)` |
| 卡门线教学口径 | 海拔 `100 km`，只作为常用约定边界，不称为物理突变线 | `Lec.K.karmanLineAltitudeM` |
| 国际空间站典型高度 | 约 `400 km`，页面显示“典型值” | `Lec.K.issTypicalAltitudeM` |
| 高度处重力 | 用地球质量、半径和高度实时计算 | `Lec.P.gravityAtAltitude(Lec.K.earthMassKg, Lec.K.earthMeanRadiusM, altitude)` |
| 高度处圆轨道速度 | 用地球质量、半径和高度实时计算 | `Lec.P.circularOrbitVelocityAtAltitude(Lec.K.earthMassKg, Lec.K.earthMeanRadiusM, altitude)` |
| 高度处轨道周期 | 用地球质量、半径和高度实时计算 | `Lec.P.orbitalPeriodAtAltitude(Lec.K.earthMassKg, Lec.K.earthMeanRadiusM, altitude)` |
| 近地轨道典型速度 | 约 `7.7 km/s`，只作由模型计算后的四舍五入显示 | `Lec.P.kilometresFromMetres(Lec.P.circularOrbitVelocityAtAltitude(...))` |
| 地球表面逃逸速度 | 约 `11.2 km/s`，明确说明不等于实际火箭所需 delta-v | `Lec.P.kilometresFromMetres(Lec.P.escapeVelocity(Lec.K.earthMassKg, Lec.K.earthMeanRadiusM))` |
| 近地轨道发射 delta-v 教学预算 | `9.4 km/s`，包含重力与阻力损失的任务级近似 | `Lec.K.leoLaunchDeltaVMetresPerSecond` |
| 化学火箭演示比冲 | `450 s` 作为高性能氢氧发动机数量级示例，不代表所有发动机 | `Lec.K.demoRocketSpecificImpulseSeconds` |
| 排气速度 | 由比冲计算 | `Lec.P.exhaustVelocityFromSpecificImpulse(Lec.K.demoRocketSpecificImpulseSeconds)` |
| 火箭质量比 | 由目标 delta-v 和排气速度计算 | `Lec.P.rocketMassRatio(deltaV, exhaustVelocity)` |
| 推进剂质量分数 | 由质量比计算 | `Lec.P.propellantFraction(massRatio)` |
| 地月平均距离 | `384,400 km` | `Lec.K.earthMoonMeanDistanceM` |
| 地火距离 | 不设单一固定值；演示近距 `54.6 million km`、远距 `401 million km` | `Lec.K.earthMarsDistanceMinM`、`Lec.K.earthMarsDistanceMaxM` |
| 光行时间 | 距离除以光速 | `Lec.P.lightTravelTime(distance)` |
| 往返通信延迟 | 光行时间的两倍 | `Lec.P.roundTripSignalDelay(distance)` |
| 火星质量 | `6.4171 × 10²³ kg` | `Lec.K.marsMassKg` |
| 火星平均半径 | `3,389,500 m` | `Lec.K.marsMeanRadiusM` |
| 火星平均地表温度教学值 | 约 `−63 °C`，明确实际随地点和时间大幅变化 | `Lec.P.celsiusFromKelvin(Lec.K.marsMeanSurfaceTemperatureK)` |
| 火星平均地表气压 | 约 `610 Pa`，只作数量级展示 | `Lec.K.marsMeanSurfacePressurePa` |
| 地球海平面标准气压 | `101,325 Pa` | `Lec.K.earthSeaLevelPressurePa` |
| 火星与地球气压比 | 两者相除后转百分比 | `Lec.P.percent(Lec.K.marsMeanSurfacePressurePa, Lec.K.earthSeaLevelPressurePa)` |
| 辐射页剂量口径 | 只比较任务时长、屏蔽面密度和相对风险，不给出统一“安全剂量” | `Lec.K.radiationDemoBaseRate`、`Lec.K.radiationDemoShieldHalfValueKgM2` |
| 闭环回收率 | 水、氧、废物分别计算，不使用单一“系统回收率” | `Lec.P.percent(recoveredAmount, inputAmount)` |
| 定居点物质结余 | 输入减消耗再加回收，逐资源独立守恒 | `Lec.P.difference(inputAmount + recoveredAmount, consumedAmount)` |
| 随机种子 | p16 `variation-16`；p19 `transmission-19`；p22 `tool-22`；p24 `public-goods-24`；p41 `crew-41` | `new Math.seedrandom(Lec.K.pageSeedXX)` |
