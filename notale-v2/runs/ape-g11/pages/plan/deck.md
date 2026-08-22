# 《Apeman – Spaceman：从直立行走到离开地球》90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

人类并非沿着一条注定通向太空的阶梯前进；直立身体、协作文化、外置知识与工程系统层层叠加，才让一种普通灵长类获得了暂时离开地球的能力。

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| I　把“进步阶梯”拆掉 | 01–11 | 从猿到人不是直线升级，而是许多特征在不同时间、不同支系上拼接 |
| II　真正起飞的是集体文化 | 12–21 | 单个人的身体变化不足以解释技术跃迁，关键是合作、教学与跨代积累 |
| III　把感官与记忆装到身体外 | 22–31 | 图像、文字、仪器和科学制度使知识能被纠错、复制并跨越个人寿命 |
| IV　离开地球不是“向上飞” | 32–40 | 太空飞行受速度、能量、质量比、轨道和人体极限共同约束 |
| V　谁的太空？为了什么？ | 41–48 | 航天既延伸共同能力，也放大资源、风险、权力与未来选择问题 |

E1　人类演化是一棵分叉的灌木：直立、手、牙齿和大脑并未同步“升级”。

E2　火、工具、语言与照料之所以能变复杂，是因为知识可在群体中协作并跨代累积。

E3　符号、仪器和科学共同体把感官、记忆与纠错能力移到个体身体之外。

E4　进入太空首先是速度与能量问题；火箭方程、轨道运动和人体承受力划定了工程边界。

E5　航天能力属于大型社会技术系统，其价值取决于风险由谁承担、收益如何分配、目标如何选择。

无交互（只承担开场/推进/过渡/收束）：01 02 11 21 31 40 47 48

## 0.5 视觉世界

底色　深暗取向；主背景 `#07111F`，内容面板 `#0E2033`，正文 `#E8F1F7`

主色相　`#35C2B2`，代表生命、协作与从远古延续至今的文化链

强调色　`#FFB547`，只用于当前操作目标、关键证据和越过阈值的瞬间

字体族　标题与正文使用清晰无衬线；年代、测量值、任务参数使用等宽；化石或档案引文少量使用衬线

材质语言　以线性科学示意图为主，关键化石、遗址、人物、航天器和地球视角使用写实照片

母题　
- 一条由脚印逐渐变成发光轨道点的路径
- 青绿色分叉谱系线与橙色“当前证据”节点
- 身体轮廓外逐层增加工具、符号、仪器和飞船的同心外骨骼
- 地平线弧线：从草原地平线过渡为地球弧面
- 同一枚手掌尺度标记：石器、书页、仪器面板与航天手套反复并置

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 表征形式 | 必用skill |
|---|---|---:|---:|---|---|---|---|---|---|---|
| 01 | I | — | 10 | generalization | 无 | 从一枚远古脚印到月球脚印，课题不是“升级”，而是能力如何叠加 | 不讲演化证据（p03） | focus | 静态：双脚印标题构图 | theme-factory, design-taste-frontend |
| 02 | I | — | 50 | enumeration | 无 | 全课沿身体、文化、知识、火箭、选择五层追问“人如何走到太空” | 不讲各层因果（p03–46） | ledger | 静态：五层路线图 | technical-wireframe-info-layout |
| 03 | I | E1 | 120 | comparison | 拖拽拆开进化队列 | 教科书式猿到人队列把分支、共存和灭绝误画成单线接力 | 不讲具体谱系年代（p04） | stage-cards | 交互：拆解经典队列并重排 | konva.min.js；mini-game |
| 04 | I | E1 | 130 | process | 缩放人族时间灌木 | 多种人族曾同时存在，现代人只是仍存活的一支 | 不讲特征先后（p05–07） | canvas-full | 交互：可缩放分叉时间树 | d3.min.js；d3-viz |
| 05 | I | E1 | 145 | classification | 化石证据分拣台 | 科学家依据骨盆、股骨、牙齿和颅骨分别推断运动、饮食与脑容量 | 不讲脑容量趋势（p07） | stage-cards | 交互：拖拽化石证据到推断类别 | konva.min.js；web-media-getter |
| 06 | I | E1 | 125 | comparison | 骨盆步态操纵器 | 两足行走需要骨盆、股骨和足部共同改变，不是简单“站直” | 不讲两足行走成因争论（p08） | split-lr | 交互：调节骨盆与膝角观察重心线 | three.min.js；threejs-webgl |
| 07 | I | E1 | 135 | process | 特征时间错位尺 | 两足行走明显早于大脑快速增大，身体特征并不同步出现 | 不讲文化积累（p12） | split-tb | 交互：拖动时间尺对齐四项特征 | d3.min.js；d3-viz |
| 08 | I | E1 | 140 | generalization | 假说证据天平 | 环境变化、能量效率、携带与散热都是可检验假说，没有单一确定答案 | 不讲自然选择机制细节（p09） | canvas-full | 交互：给证据加权比较假说支持度 | d3.min.js；seedrandom.min.js |
| 09 | I | E1 | 110 | classification | 变异筛选小游戏 | 自然选择筛选已有差异，并不会预先知道“太空人”这一目标 | 不讲遗传分子机制（全课不展开） | focus | 交互：在变化环境中选择可繁殖个体 | mini-game；seedrandom.min.js |
| 10 | I | E1 | 130 | comparison | 亲缘相似度透镜 | 与其他猿类的亲缘关系说明共同祖先，不表示现代猿会“变成人” | 不讲文化为何加速（p12–20） | triptych | 交互：切换外形、DNA与分支三种相似度 | echarts.min.js（SVG）；Lec.P |
| 11 | I | — | 40 | generalization | 无 | 第一幕结论：我们不是从灌木底端爬到顶端，而是站在一根仍存活的枝条上 | 不讲文化机制（p12） | focus | 静态：谱系枝条收束为火光 | make-illustration |
| 12 | II | E2 | 125 | process | 接力做石器 | 单人反复试错很慢，观察、模仿和教学能保留有效步骤 | 不讲语言起源年代（p17） | stage-cards | 交互：玩家与虚拟世代接力制作石器 | mini-game；web-media-getter |
| 13 | II | E2 | 140 | comparison | 模仿误差传声链 | 只靠观察会逐代丢失细节，示范加纠错能显著提高保真度 | 不讲群体网络（p18） | split-lr | 交互：比较观察、示范、纠错三种传递 | seedrandom.min.js；echarts.min.js（SVG） |
| 14 | II | E2 | 130 | classification | 火的收益分配盘 | 火同时改变食物、安全、社交时间与环境利用，不能只归为“烹饪工具” | 不讲熟食与脑演化的确定因果（全课不作定论） | radial-board | 交互：分配燃料并观察多项收益 | d3.min.js；d3-viz |
| 15 | II | E2 | 145 | process | 合作狩猎角色局 | 共享目标需要分工、沟通、信任和对他人行动的预测 | 不把狩猎说成人类合作的唯一来源（p16） | canvas-full | 交互：三角色协作围堵移动目标 | mini-game；pixi.min.js |
| 16 | II | E2 | 115 | comparison | 照料成本交换器 | 长童年提高照料成本，也给学习复杂技能留下更长窗口 | 不讲人口规模效应（p18） | split-tb | 交互：调节成长期与学习收益 | echarts.min.js（SVG） |
| 17 | II | E2 | 135 | generalization | 指令压缩挑战 | 语言让群体能传递不在眼前的对象、步骤和规则 | 不声称知道最早语言的确切日期（全课不作断言） | focus | 交互：用有限符号指导同伴复原图形 | mini-game；konva.min.js |
| 18 | II | E2 | 120 | process | 创新网络扩散器 | 创新能否存活取决于群体连接、迁徙与重复学习，而非只看发明者聪明程度 | 不讲文字记录（p23） | canvas-full | 交互：改变网络连边观察技能保存率 | d3.min.js；d3-viz；seedrandom.min.js |
| 19 | II | E2 | 140 | classification | 文化棘轮组装台 | 模仿、教学、规范与记录分别阻止不同类型的知识倒退 | 不讲科学纠错制度（p27） | stage-cards | 交互：拖拽四种机制修补知识链 | konva.min.js |
| 20 | II | E2 | 130 | comparison | 世代能力叠层器 | 太空技术不是某位天才独自掌握的本事，而是无数世代留下的模块组合 | 不讲现代航天组织（p41） | triptych | 交互：比较孤立者、小群体与累积社会的技术上限 | d3.min.js；seedrandom.min.js |
| 21 | II | — | 45 | generalization | 无 | 第二幕结论：生物演化给出可学习的身体，文化演化把学习结果留给后来者 | 不讲外置记忆媒介（p22） | focus | 动态：火光变为符号链 | anime.min.js；animejs |
| 22 | III | E3 | 135 | comparison | 记忆容量实验 | 口头记忆擅长意义与故事，却难以稳定保存长数字、精确表格和复杂步骤 | 不讲文字历史（p23） | split-lr | 交互：短时记忆与外部记录对照测试 | mini-game |
| 23 | III | E3 | 125 | process | 符号存档机 | 文字让信息脱离说话者而跨越距离、权力更替与个人寿命 | 不讲印刷传播（p24） | canvas-full | 交互：把口述规则编码、存档并在多年后解码 | konva.min.js |
| 24 | III | E3 | 145 | generalization | 复制误差印刷台 | 大规模标准化复制降低了知识传播成本，也让错误能更快扩散 | 不讲科学验证（p27） | stage-cards | 交互：调节复制速度、校对率与传播范围 | seedrandom.min.js；echarts.min.js（SVG） |
| 25 | III | E3 | 130 | classification | 感官外骨骼工具架 | 望远镜、显微镜、钟与传感器分别扩展尺度、分辨率、时间和可测量性 | 不讲望远镜具体发现（p26） | triptych | 交互：把仪器匹配到人眼无法回答的问题 | konva.min.js；web-media-getter |
| 26 | III | E3 | 120 | comparison | 裸眼望远镜切换镜 | 仪器不是简单“看得更远”，而是改变可观察对象和可比较证据 | 不讲实验重复制度（p27） | split-lr | 交互：切换裸眼与望远镜视野并标记差异 | reveal-hover-effect；web-media-getter |
| 27 | III | E3 | 140 | process | 可重复实验流水线 | 科学可靠性来自公开方法、测量、重复与批评，而非科学家从不犯错 | 不讲火箭实验史（p33） | technical-plate | 交互：找出实验链中无法复现的环节 | technical-wireframe-info-layout；konva.min.js |
| 28 | III | E3 | 110 | classification | 证据主张配对器 | 观察、模型、推断和价值判断回答不同问题，不能混作同一种“事实” | 不讲航天价值判断（p42–46） | stage-cards | 交互：将句子分类为数据、模型、推断或价值 | mini-game |
| 29 | III | E3 | 135 | comparison | 单脑团队计算赛 | 分工、记号、清单与交叉检查能让团队完成超出任何单人工作记忆的任务 | 不讲任务控制中心案例（p41） | split-tb | 交互：比较个人计算与团队流水线的错误率 | seedrandom.min.js；echarts.min.js（SVG） |
| 30 | III | E3 | 125 | process | 知识外骨骼搭建器 | 图书馆、学校、实验室、标准和计算机共同构成人类的认知基础设施 | 不讲基础设施的政治分配（p43） | canvas-full | 交互：连接机构形成可运行的知识系统 | d3.min.js；d3-viz |
| 31 | III | — | 40 | generalization | 无 | 第三幕结论：Spaceman 的“大脑”不只在颅骨里，也在纸张、仪器、标准和他人之间 | 不讲轨道工程（p32） | focus | 静态：人体外扩为知识系统同心层 | make-illustration |
| 32 | IV | E4 | 140 | comparison | 高度速度猜想板 | 到达高空不等于进入轨道；轨道要求足够大的横向速度 | 不讲火箭质量比（p35） | split-lr | 交互：分别预测气球、跳跃与轨道器的高度和速度 | matter.min.js；matterjs |
| 33 | IV | E4 | 125 | process | 牛顿炮台 | 轨道可理解为持续下落但不断错过地面 | 不讲逃逸速度（p34） | canvas-full | 交互：改变水平初速度发射炮弹 | three.min.js；threejs-webgl；Lec.P |
| 34 | IV | E4 | 135 | classification | 轨道状态地图 | 亚轨道、圆轨道、椭圆轨道和逃逸对应不同速度区间与轨迹 | 不讲推进剂需求（p35） | radial-board | 交互：拖动速度点探索轨迹类别 | three.min.js；threejs-webgl；Lec.P |
| 35 | IV | E4 | 115 | generalization | 火箭质量比扳手 | 想获得更多速度就要携带更多推进剂，而推进剂本身也必须被加速 | 不讲多级火箭（p36） | ledger | 交互：调节排气速度与质量比计算速度增量 | Lec.P；echarts.min.js（SVG） |
| 36 | IV | E4 | 145 | process | 多级火箭搭建局 | 抛掉空结构能缓解质量惩罚，因此多级火箭不是外形偏好而是工程策略 | 不讲任务预算（p39） | canvas-full | 交互：组装级数并尝试把载荷送入轨道 | mini-game；matter.min.js；matterjs；Lec.P |
| 37 | IV | E4 | 130 | comparison | 重力身体实验室 | 微重力不是“没有重力”，而是飞船与身体一起自由落体 | 不讲长期健康后果（p38） | split-tb | 交互：切换地面、抛物线与轨道观察物体相对运动 | matter.min.js；matterjs；Lec.P |
| 38 | IV | E4 | 120 | classification | 人体风险仪表盘 | 辐射、骨量流失、肌肉衰减、隔离和再入过载属于不同时间尺度的风险 | 不讲风险伦理分配（p44） | technical-plate | 交互：点选任务阶段查看风险累积 | d3.min.js；d3-viz；web-media-getter |
| 39 | IV | E4 | 140 | process | 月球任务预算台 | 一次任务必须同时闭合速度增量、质量、时间、通信与生命保障预算 | 不讲“是否值得”价值判断（p42） | ledger | 交互：配置月球任务并通过五项预算检查 | mini-game；Lec.P |
| 40 | IV | — | 45 | generalization | 无 | 第四幕结论：火箭没有战胜自然定律，而是在定律允许的狭窄通道中工作 | 不讲航天治理（p41） | focus | 静态：橙色轨道通道穿过约束网格 | technical-wireframe-info-layout |
| 41 | V | E5 | 105 | classification | 航天系统角色网 | 一名航天员背后是制造、软件、医学、气象、通信、政策与公众共同组成的系统 | 不讲收益分配（p43） | canvas-full | 交互：点选角色查看依赖与失效传播 | d3.min.js；d3-viz |
| 42 | V | E5 | 115 | comparison | 航天目标排序盘 | 探索、科学、国家竞争、商业、地球服务和生存备份是不同目标，不能用一个指标裁决 | 不讲预算分配（p43） | radial-board | 交互：排序目标并查看价值冲突 | konva.min.js |
| 43 | V | E5 | 110 | process | 十亿预算分配会 | 航天投资既有机会成本，也可能通过通信、观测、导航和科研产生公共收益 | 不讲人员风险（p44） | ledger | 交互：分配预算并查看短期与长期后果 | echarts.min.js（SVG）；mini-game |
| 44 | V | E5 | 100 | classification | 风险同意审议台 | 自愿承担风险不等于所有风险都私人化，失败可能影响家庭、公众与环境 | 不讲殖民叙事（p45） | stage-cards | 交互：给四类风险指定知情、承担与补偿主体 | konva.min.js |
| 45 | V | E5 | 110 | comparison | 火星殖民词语审判 | “殖民”“定居”“基地”和“前哨”携带不同历史联想与政治假设 | 不判断火星移民必然可行或不可行（全课不作断言） | triptych | 交互：切换措辞观察同一方案的评价变化 | web-media-getter；reveal-hover-effect |
| 46 | V | E5 | 110 | generalization | 未来任务议会 | 值得追求的任务必须同时说明目标、证据、成本、风险与受益者 | 不复讲轨道计算（p32–39） | split-lr | 交互：组成任务提案并接受同伴五项质询 | mini-game |
| 47 | V | — | 55 | enumeration | 无 | 回看五层证据：分叉身体、累积文化、外置知识、工程约束与共同选择缺一不可 | 不引入新案例 | ledger | 静态：五层证据链总账 | technical-wireframe-info-layout |
| 48 | V | — | 35 | generalization | 无 | 从 Apeman 到 Spaceman 不是命运的阶梯，而是一项仍由我们共同决定方向的集体工程 | 不布置新操作 | focus | 静态：脚印路径越过地球弧面 | make-illustration |

## 2. 页间不重复的硬约定

| 概念或形式 | 只在哪些页展开 | 各页职责边界 |
|---|---|---|
| “进化阶梯”误解 | 03–04 | p03 拆除线性图像；p04 建立分叉、共存与灭绝模型 |
| 化石如何成为证据 | 05–07 | p05 证据与推断分类；p06 聚焦两足结构；p07 只讲特征出现时间错位 |
| 自然选择 | 08–09 | p08 比较多种可检验假说；p09 只建立无预定目标的筛选直觉 |
| 人与其他猿类的关系 | 10 | 只在此页澄清共同祖先、相似度与现代猿不会“变成人” |
| 石器与技能传递 | 12–13 | p12 体验跨代接力；p13 测量不同传递方式的误差 |
| 火的多重作用 | 14 | 只在此页展开，不把火写成脑演化的单一原因 |
| 合作与长童年 | 15–16 | p15 聚焦同步行动与角色预测；p16 聚焦学习窗口与照料成本 |
| 语言 | 17 | 只讲符号对缺席对象和步骤的压缩，不断言起源日期 |
| 群体网络与文化棘轮 | 18–20 | p18 讲扩散和保存；p19 讲防倒退机制；p20 讲世代累积上限 |
| 外置记忆 | 22–24 | p22 口头记忆限制；p23 文字跨时空；p24 标准复制的收益与风险 |
| 仪器扩展感官 | 25–26 | p25 按功能分类；p26 用望远镜案例体验观察范围变化 |
| 科学可靠性 | 27–28 | p27 讲公开、重复与批评过程；p28 区分数据、模型、推断和价值 |
| 团队认知与知识基础设施 | 29–30 | p29 聚焦分工和交叉检查；p30 聚焦机构与标准之间的连接 |
| 轨道三维场景 | 33–34 | p33 只建立持续下落直觉；p34 才比较亚轨道、轨道与逃逸状态 |
| 火箭方程与多级火箭 | 35–36 | p35 只讲质量比惩罚；p36 用多级设计解决部分惩罚 |
| 微重力与人体风险 | 37–38 | p37 解释共同自由落体；p38 分类长期生理与心理风险 |
| 航天任务预算游戏 | 39 | 唯一综合速度、质量、时间、通信和生命保障的工程预算页 |
| 航天社会系统 | 41 | 只画角色依赖和失效传播，不在此页评价目标优先级 |
| 航天目标与公共预算 | 42–43 | p42 比较价值目标；p43 才进行资金取舍与后果反馈 |
| 风险伦理 | 44 | 只处理知情、承担和补偿，不重复 p38 的医学机理 |
| “殖民”语言 | 45 | 只审视措辞和历史框架，不预测火星定居技术可行性 |
| 任务提案综合活动 | 46 | 唯一要求学生同时提交目标、证据、成本、风险和受益者的迁移页 |
| 真实化石与遗址照片 | 05、12 | p05 用于证据观察；p12 用于展示真实石器加工痕迹，不作装饰背景 |
| 真实仪器与航天照片 | 25、26、38、45 | p25 仪器分类；p26 视野对比；p38 人体风险情境；p45 比较叙事框架 |
| 可玩小游戏 | 09、12、15、17、28、36、39、43、46 | 每页目标与胜负条件不同，不复用“点完即过”的机制 |
| 拖拽卡片 | 03、05、19、25、44 | 分别承担拆图、证据分类、机制修补、仪器匹配、责任分配 |
| ECharts 图表 | 10、13、16、24、29、35、43 | 一律使用 SVG renderer；分别服务亲缘、误差、成长、复制、团队、质量比、预算 |
| 随机模拟 | 08、13、18、20、24、29 | 一律使用 `seedrandom.min.js` 和固定页号种子，课堂与课后结果可复现 |
| 总结与收束 | 47–48 | p47 对账五层证据；p48 只给最终主张与迁移问题，不复述案例 |

## 3. 数字口径

- 全套年代、人体、天文、任务、火箭和物理常量一律优先读取 `Lec.K.timeline`、`Lec.K.human`、`Lec.K.astronomy`、`Lec.K.missions`、`Lec.K.rocket`、`Lec.K.physics`、`Lec.K.units`，页面不得另建同名常量。
- 人族时间线的显示位置统一通过 `Lec.P.logTimelineFraction` 或 `Lec.P.timelineFractionYearsAgo` 计算；不得用等距横轴暗示百万年与千年具有相同尺度。
- 年代差统一通过 `Lec.P.yearsBetween` 计算；代数估算统一通过 `Lec.P.generationCount` 计算。
- DNA 相似度与差异只在 p10 使用；差异比例调用 `Lec.P.dnaDifferenceFraction`，差异碱基数量调用 `Lec.P.dnaDifferentBasePairs`。页面必须同时提醒“百分比取决于比较口径”，不得把单一百分比当作完整亲缘模型。
- 身体质量、体积和密度换算如需使用，统一调用 `Lec.P.bodyMassFromVolume`；BMI 不是本课的人体健康指标，不调用 `Lec.P.bmi`。
- 距离显示统一由 `Lec.P.formatDistance` 格式化；米与千米换算调用 `Lec.P.kilometresFromMetres` 或 `Lec.P.metresFromKilometres`。
- 时间显示统一由 `Lec.P.formatDuration` 格式化；秒、分钟、小时、天、年之间分别调用 `Lec.P.secondsFromMinutes`、`secondsFromHours`、`secondsFromDays`、`secondsFromYears`、`minutesFromSeconds`、`hoursFromSeconds`、`daysFromSeconds`、`yearsFromSeconds`。
- 速度、距离和时间关系只使用 `Lec.P.distance`、`Lec.P.averageSpeed`、`Lec.P.travelTime`；不在页面写死换算结果。
- 地球表面及不同高度的重力统一调用 `Lec.P.earthGravityAtAltitude`；一般天体重力调用 `Lec.P.gravityAtAltitude` 或 `Lec.P.gravityAtDistance`。
- 地球、月球、火星体重比较统一调用 `Lec.P.weightOnEarth`、`Lec.P.weightOnMoon`、`Lec.P.weightOnMars`；必须区分质量与重量。
- g 值统一由 `Lec.P.gForce` 计算，人体风险页不得把加速度直接标成“重量增加倍数”。
- 圆轨道速度统一调用 `Lec.P.earthOrbitVelocity`；一般天体圆轨道速度调用 `Lec.P.circularOrbitVelocityAtAltitude`。
- 轨道周期统一调用 `Lec.P.earthOrbitPeriod`；一般轨道周期调用 `Lec.P.orbitalPeriod`，每日轨道圈数调用 `Lec.P.orbitsPerDay`。
- 地球逃逸速度统一调用 `Lec.P.earthEscapeVelocity`；其他天体调用 `Lec.P.escapeVelocityAtAltitude`。页面必须区分逃逸速度与进入近地轨道所需速度。
- p33–34 的轨迹分类必须由当前速度和位置实时计算，不得用预录轨迹冒充模拟。
- 动能统一调用 `Lec.P.kineticEnergy`；近地表重力势能调用 `Lec.P.potentialEnergyNearSurface`。不引入微积分推导。
- 推力统一调用 `Lec.P.thrust`，推力产生的加速度调用 `Lec.P.accelerationFromThrust`，推重比调用 `Lec.P.thrustToWeightRatio`。
- 排气速度与比冲换算统一调用 `Lec.P.exhaustVelocityToSpecificImpulse` 或 `Lec.P.specificImpulseToExhaustVelocity`。
- 火箭速度增量统一调用 `Lec.P.rocketDeltaV`；给定速度增量反求质量比调用 `Lec.P.rocketMassRatio`，推进剂比例调用 `Lec.P.rocketPropellantFraction`。
- p35–36 所有火箭结果必须由输入即时重算；不得把示例结果写死在标签中。
- 地月通信延迟统一调用 `Lec.P.moonSignalDelay` 或 `Lec.P.moonRoundTripSignalDelay`；一般距离的延迟调用 `Lec.P.signalDelay` 或 `Lec.P.roundTripSignalDelay`。
- 天文单位与光年换算分别调用 `Lec.P.astronomicalUnitsFromMetres`、`Lec.P.metresFromAstronomicalUnits`、`Lec.P.lightYearsFromMetres`、`Lec.P.metresFromLightYears`。
- 地球半径和人体身高尺度比较分别调用 `Lec.P.earthRadiiInDistance`、`Lec.P.humanHeightsInDistance`；模型缩尺调用 `Lec.P.scaleDistance` 或 `Lec.P.scaleSize`。
- 百分比统一调用 `Lec.P.percent` 或 `Lec.P.formatPercent`；进度统一调用 `Lec.P.progress` 或 `Lec.P.progressPercent`。
- 大数统一调用 `Lec.P.formatCompact` 或 `Lec.P.formatScientific`；普通小数调用 `Lec.P.formatFixed`，避免各页自行决定有效位数。
- 所有随机群体、传播网络、实验误差和任务事件均使用 `seedrandom.min.js`，种子格式固定为 `apeman-spaceman-pNN`。
- 预算页使用归一化相对单位并由 `Lec.P.ratio`、`Lec.P.percent` 计算占比；若 `Lec.K.missions` 提供对应真实任务口径，则只从该常量读取。
- 页面中的数值结论必须在允许的滑块范围内保持成立；若结论只对部分区间成立，必须显示阈值并用 `Lec.P.clamp`、`Lec.P.inverseLerp` 或 `Lec.P.mapRange` 控制状态。
