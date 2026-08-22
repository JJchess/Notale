# 《Apeman – Spaceman》 90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

**一句话主张**：人类身体既不是为爬树而生的，也不是为太空而生的；但数百万年的演化遗产让我们能在地球上跳跃、奔跑，而工程智慧让我们将这些能力带到月球、火星，甚至更远的地方——从猿人到太空人，是同一具身体在不同重力下的新故事。

### 分章表

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| 1. 身体遗产 | 01–14 | 南方古猿、能人、直立人、智人的骨骼结构揭示了一套为直立行走和奔跑而优化的下肢，跳跃能力是这套遗产的直接体现 |
| 2. 地球跳跃实验室 | 15–28 | 跳跃高度取决于初速度和质量，与重力平方成反比；人类在地球上的跳跃极限由骨骼肌肉决定，而非重力 |
| 3. 脱离地球 | 29–40 | 进入微重力后，人类原有的运动模式失效；宇航服显著增加了质量，但低重力让宇航员跳得比地球上更高 |
| 4. 星际跳跃 | 41–52 | 利用同一套物理规律，我们可以计算在其他星球上的跳跃高度，比较不同行星的表面探索体验 |
| 5. 演化与工程 | 53–60 | 演化赋予我们身体，工程赋予我们环境；太空探索不是淘汰身体，而是重新定义身体能做什么 |

### 无交互页名册

无交互（只承担开场/推进/过渡/收束）：01 02 03 15 29 41 53 59 60

## 1. 页表

| # | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 必用skill |
|---|---|---|---|---|---|---|---|
| 01 | 10 | generalization | 无 | 课名与主张：猿人—太空人，同一具身体，不同重力 | 不讲具体证据（p04起） | focus | 无 |
| 02 | 40 | enumeration | 无 | 路线图：五章结构，从化石到星际跳跃 | 不讲细节（各章展开） | ledger | 无 |
| 03 | 30 | generalization | 无 | 章过渡：我们身体从何而来？ | 不讲化石（p04） | focus | 无 |
| 04 | 90 | comparison | 拖拽南方古猿与现代人骨架对齐 | 南方古猿骨盆和股骨与现代人相似，但更粗壮，适合直立行走 | 不讲演化机制（p06） | split-lr | web-media-getter, matterjs |
| 05 | 100 | classification | 点选四种猿人骨骼特征 | 能人、直立人、尼安德特人、智人下肢关键差异（股骨角、足弓） | 不讲跳跃（p09） | triptych | web-media-getter, make-illustration |
| 06 | 120 | process | 滑动时间线看演化树分支 | 下肢演化是对开阔环境的适应，不是线性进步 | 不讲具体基因（不讲） | canvas-full | d3-viz, make-illustration |
| 07 | 110 | classification | 拖拽标签到南方古猿阿法种骨架 | 露西（AL 288-1）的髋关节、膝关节和踝关节已具备现代人直立行走的特征 | 不讲脑容量（p08） | split-lr | web-media-getter, matterjs |
| 08 | 80 | comparison | 点选脑容量与下肢比例对比图 | 脑容量增大与下肢演化是两条独立路径 | 不讲工具（p12） | split-tb | echarts, web-media-getter |
| 09 | 130 | process | 拖拽初始速度滑块看跳跃高度变化 | 跳跃高度由初速度决定，与质量无关（忽略空气阻力） | 不讲重力影响（p10） | split-lr | matterjs, animejs |
| 10 | 120 | process | 切换不同重力值看跳跃高度曲线 | 同一初速度下，重力越小跳得越高，呈反比平方关系 | 不讲具体星球（p41） | split-lr | echarts, matterjs |
| 11 | 100 | comparison | 并排比较猿人跳跃高度柱状图 | 南方古猿约跳0.5m，智人约0.6m，但现代训练有素的运动员可达1.2m | 不讲训练影响（p14） | ledger | echarts, lec-functions |
| 12 | 40 | generalization | 无 | 章小结：身体遗产是工具包，不是限制 | 不讲下一章（p15） | focus | 无 |
| 13 | 80 | enumeration | 点选三种猿人奔跑速度估算 | 基于骨骼推算的奔跑速度：南方古猿慢，直立人快，智人耐力强 | 不讲步态（p14） | stage-cards | echarts, lec-functions |
| 14 | 150 | process | 模拟追逐猎物场景，调整步幅和频率 | 人类演化出持久奔跑能力，散热系统是关键 | 不讲现代马拉松（不讲） | canvas-full | matterjs, pixijs-2d |
| 15 | 30 | comparison | 无 | 章过渡：在地球上，我们能跳多高？ | 不讲公式推导（p16） | focus | 无 |
| 16 | 100 | process | 拖拽初速度、质量滑块看跳跃高度 | 跳跃高度公式 h = v₀²/(2g)，质量不出现在公式中 | 不讲空气阻力（p17） | split-lr | matterjs, echarts |
| 17 | 90 | process | 开启/关闭空气阻力观察差异 | 空气阻力对跳跃高度影响很小（<2%），我们可忽略 | 不讲风阻系数（不讲） | split-lr | matterjs |
| 18 | 120 | comparison | 输入不同运动员垂直跳高度对比 | 篮球运动员垂直跳约0.8m，普通人约0.4m，初速度差异 | 不讲肌肉力量（p19） | ledger | echarts, lec-functions |
| 19 | 110 | process | 拖拽肌肉力量-初速度曲线 | 肌肉力量与初速度的非线性关系，天赋与训练 | 不讲营养（不讲） | split-lr | echarts, matterjs |
| 20 | 150 | process | 模拟跳高比赛，调整起跳角度和初速度 | 最佳跳高角度不是45°，而是约40-42°（人体约束） | 不讲撑杆跳（不讲） | canvas-full | matterjs, pixijs-2d |
| 21 | 80 | classification | 点选不同动物跳跃高度对比 | 人类跳跃能力在哺乳动物中中等，但加上耐力优势 | 不讲昆虫（不讲） | triptych | web-media-getter, echarts |
| 22 | 100 | process | 拖拽重力加速度滑块全球分布 | 地球重力加速度不是常数，赤道9.78，两极9.83，影响跳跃高度约0.5% | 不讲其他星球（p41） | split-lr | echarts, lec-functions |
| 23 | 90 | enumeration | 点选不同纬度跳跃高度列表 | 在赤道跳得稍高，但差异极小，可忽略 | 不讲离心力（不讲） | ledger | echarts, lec-functions |
| 24 | 120 | comparison | 并排比较猿人、现代人、运动员跳跃高度 | 演化没有显著改变跳跃潜力，训练和环境更重要 | 不讲基因（不讲） | split-tb | echarts, web-media-getter |
| 25 | 130 | process | 拖拽体重和腿部力量比值看跳跃高度 | 跳跃高度与力量/体重比成正比，大体型动物跳跃难 | 不讲恐龙（不讲） | split-lr | matterjs, echarts |
| 26 | 100 | comparison | 拖拽不同猿人力量/体重比柱状图 | 南方古猿比值高，但绝对力量小；智人绝对力量大但比值低 | 不讲具体数值（p27） | ledger | echarts, lec-functions |
| 27 | 40 | generalization | 无 | 章小结：地球是基线，重力是常数 | 不讲下一章（p29） | focus | 无 |
| 28 | 90 | process | 拖拽时间线看人类跳跃记录的演化 | 从1950年至今，跳高纪录增长缓慢，接近生理极限 | 不讲药物（不讲） | split-tb | echarts, web-media-getter |
| 29 | 30 | comparison | 无 | 章过渡：离开地球，身体会怎样？ | 不讲微重力生理（p30） | focus | 无 |
| 30 | 120 | process | 播放ISS宇航员移动视频，标记关键动作 | 在微重力下，人类本能地使用手臂爬行，而不是走路 | 不讲骨骼流失（p31） | canvas-full | web-media-getter, lottie-animations |
| 31 | 100 | process | 模拟骨骼受力变化，拖拽重力值 | 微重力下骨骼负荷减少90%，导致骨密度每月下降1-2% | 不讲肌肉（p32） | split-lr | matterjs, echarts |
| 32 | 110 | process | 拖拽时间看肌肉萎缩速度 | 不锻炼，肌肉每周萎缩5%，但抗阻训练可逆转 | 不讲营养（不讲） | split-lr | echarts, matterjs |
| 33 | 100 | classification | 点选宇航服各部分重量 | 现代宇航服总质量约130kg，但微重力下感觉不到重量 | 不讲关节阻力（p34） | split-tb | web-media-getter, make-illustration |
| 34 | 130 | process | 拖拽宇航服质量滑块看跳跃高度 | 增加质量会降低初速度，从而降低跳跃高度，但微重力下跳得仍比地球高 | 不讲具体公式（p35） | split-lr | matterjs, echarts |
| 35 | 120 | process | 切换不同重力，观察宇航服跳跃高度 | 在月球上，即使穿宇航服，跳跃高度仍达1.5m | 不讲其他星球（p41） | split-lr | matterjs, echarts |
| 36 | 80 | comparison | 并排比较地面、ISS、月球跳跃高度 | 月球跳跃高度最大，地球最小，ISS无法跳 | 不讲火星（p37） | triptych | echarts, lec-functions |
| 37 | 130 | process | 拖拽在火星表面跳跃模拟 | 火星重力0.38g，跳跃高度约地球的2.6倍，但宇航服质量会减小这一优势 | 不讲详细计算（p38） | split-lr | matterjs, echarts |
| 38 | 100 | comparison | 输入不同星球跳跃高度对比表 | 月球跳最高，木星跳不动，火星适中 | 不讲土星（不讲） | ledger | echarts, lec-functions |
| 39 | 120 | process | 拖拽初速度、质量、重力，看三维跳跃空间 | 任何星球上，跳跃高度由转移公式 h₂ = (v₀²)/(2g₂) - (m_suit)/m_body * ... | 不讲推导（p40） | canvas-full | threejs-webgl, echarts |
| 40 | 90 | process | 简化公式 h₂ = (g₁/g₂) * h₁（质量不变） | 如果身体质量不变，跳跃高度与重力成反比 | 不讲宇航服（p41） | split-lr | echarts, lec-functions |
| 41 | 30 | enumeration | 无 | 章过渡：在其他星球上，我们能跳多高？ | 不讲具体星球（p42） | focus | 无 |
| 42 | 130 | process | 拖拽星球选择器，看跳跃高度实时变化 | 月球1.62 m/s²跳3.6m，火星3.7 m/s²跳1.6m | 不讲旅行时间（p43） | split-lr | matterjs, echarts, lec-functions |
| 43 | 100 | enumeration | 点选星球列表，显示跳跃高度和飞行时间 | 跳跃飞行时间也由重力决定，月球上空中停留2.2秒 | 不讲轨道（p44） | ledger | echarts, lec-functions |
| 44 | 120 | process | 拖拽小行星重力滑块，看跳跃可能逃逸 | 在小行星上，跳一下就可能达到逃逸速度 | 不讲具体任务（不讲） | split-lr | matterjs, echarts |
| 45 | 150 | process | 模拟小行星表面跳跃，注意安全速度 | 逃逸速度取决于天体质量，跳太高可能再也回不来 | 不讲轨道力学（p46） | canvas-full | matterjs, threejs-webgl |
| 46 | 100 | process | 拖拽不同天体质量，计算逃逸速度 | 人体跳跃初速度约2.5 m/s，小行星半径小于800m可能逃逸 | 不讲火箭（不讲） | split-lr | echarts, lec-functions |
| 47 | 80 | comparison | 并排比较地球、月球、火星、小行星跳跃风险 | 只有在小行星上，跳跃本身有危险 | 不讲太空服破裂（不讲） | triptych | echarts, make-illustration |
| 48 | 110 | process | 拖拽时间观察不同星球跳跃动作慢放 | 低重力下动作变慢，但肌肉力量不变，可能翻跟头 | 不讲平衡（p49） | split-lr | matterjs, animejs |
| 49 | 100 | process | 模拟低重力下翻跟头，调整身体姿态 | 角动量守恒，但视觉参照不同，容易失去方向 | 不讲前庭（不讲） | canvas-full | matterjs, pixijs-2d |
| 50 | 90 | enumeration | 点选不同星球探索移动方式 | 月球跳跃前进，火星慢跑，谷神星爬行 | 不讲车辆（p51） | stage-cards | web-media-getter, make-illustration |
| 51 | 120 | comparison | 并排比较猿人、现代人、宇航员跳跃能力 | 宇航员在月球上跳得比任何地球人都高，但猿人祖先提供了基础 | 不讲未来（p53） | ledger | echarts, web-media-getter |
| 52 | 120 | process | 拖拽演化时间线，看跳跃能力与重力关系 | 演化没有“预见”低重力，但身体意外胜任 | 不讲基因工程（不讲） | canvas-full | d3-viz, lec-functions |
| 53 | 30 | generalization | 无 | 章过渡：演化与工程如何对话？ | 不讲具体技术（p54） | focus | 无 |
| 54 | 100 | classification | 点选不同太空服技术发展 | 从阿波罗到SpaceX，宇航服质量减轻，灵活性增加 | 不讲成本（不讲） | triptych | web-media-getter, make-illustration |
| 55 | 130 | process | 拖拽宇航服质量、关节阻力，看跳跃效率 | 未来宇航服可能让跳跃更接近裸露身体 | 不讲材料（p56） | split-lr | matterjs, echarts |
| 56 | 90 | process | 拖拽外骨骼助力，看跳跃高度提升 | 外骨骼可增加有效初速度，但增加质量，需要权衡 | 不讲动力（p57） | split-lr | matterjs, echarts |
| 57 | 120 | comparison | 并排比较自然演化、训练、装备对跳跃的提升 | 演化提升小，训练提升中，装备提升大，但三者结合最优 | 不讲基因编辑（不讲） | triptych | echarts, make-illustration |
| 58 | 100 | generalization | 拖拽三要素比重圆饼图 | 基因40%，训练30%，装备30% 决定跳跃能力 | 不讲具体百分比（p59） | split-tb | echarts, make-illustration |
| 59 | 40 | generalization | 无 | 章总结：身体是产品，也是平台 | 不讲下一章（p60） | focus | 无 |
| 60 | 10 | generalization | 无 | 结语：猿人—太空人，同一具身体，无尽的故事 | 不讲新内容 | focus | 无 |

## 2. 页间不重复的硬约定

| 概念 | 所在页 | 说明 |
|---|---|---|
| 南方古猿阿法种（露西）骨骼 | 04, 07 | 04 整体骨架对齐，07 细节标注 |
| 猿人下肢特征比较 | 05, 11 | 05 四种猿人，11 跳跃高度比较 |
| 跳跃高度公式 h = v₀²/(2g) | 09, 10, 16 | 09 初速度作用，10 重力作用，16 综合 |
| 初速度与肌肉力量关系 | 19, 25 | 19 力量-速度曲线，25 力量/体重比 |
| 地球重力加速度变化 | 22, 23 | 22 全球分布，23 纬度影响 |
| 宇航服质量影响 | 33, 34, 35, 55 | 33 重量分布，34 质量滑块，35 月球跳跃，55 未来技术 |
| 微重力生理效应 | 30, 31, 32 | 30 动作变化，31 骨骼，32 肌肉 |
| 其他星球跳跃计算 | 37, 38, 39, 40, 42, 43 | 37 火星，38 对比表，39 三维空间，40 简化公式，42 实时选择器，43 飞行时间 |
| 小行星逃逸 | 44, 45, 46 | 44 滑块，45 模拟，46 逃逸速度计算 |
| 演化时间线 | 06, 52 | 06 古猿演化，52 跳跃能力与重力 |
| 装备与提升 | 54, 56, 57, 58 | 54 宇航服技术，56 外骨骼，57 比较，58 比重 |

## 3. 数字口径

全套统一的关键数值，从 `Lec.K` 和 `Lec.P` 获取：

- 地球重力加速度：`Lec.K.EARTH_GRAVITY` = 9.8 m/s²
- 月球重力加速度：`Lec.K.MOON_GRAVITY` = 1.62 m/s²
- 火星重力加速度：`Lec.K.MARS_GRAVITY` = 3.7 m/s²
- 人类垂直跳跃初速度典型值：`Lec.K.HUMAN_JUMP_INITIAL_VELOCITY` ≈ 2.5 m/s
- 人类地球垂直跳跃高度典型值：`Lec.K.HUMAN_VERTICAL_JUMP_EARTH` ≈ 0.4 m
- 宇航服质量（含生命支持）：`Lec.K.EVA_SUIT_MASS` ≈ 130 kg
- 宇航员身体质量：`Lec.K.ASTRONAUT_MASS` ≈ 70 kg
- 总出舱活动质量：`Lec.K.TOTAL_EVA_MASS` = 200 kg
- 空气密度（海平面）：`Lec.K.AIR_DENSITY_SEA_LEVEL` = 1.225 kg/m³
- 标准大气压：`Lec.K.STANDARD_ATMOSPHERE_PA` = 101325 Pa
- 水密度：`Lec.K.WATER_DENSITY` = 1000 kg/m³
- 英寸到米：`Lec.K.INCH_TO_M` = 0.0254
- 英尺到米：`Lec.K.FOOT_TO_M` = 0.3048
- 千克到磅：`Lec.K.KG_TO_LB` = 2.20462
- 磅到千克：`Lec.K.LB_TO_KG` = 0.453592
- 猿人数据：通过 `Lec.P.getHominidData(key)` 获取，键可指定（如 `'australopithecus'`）
- 跳跃高度计算：`Lec.P.jumpHeightFromVelocity(v0, gravity)` 返回高度
- 初速度反推：`Lec.P.initialVelocityForJumpHeight(height, gravity)` 返回速度
- 跳跃高度转移：`Lec.P.transferJumpHeight(fromHeight, fromGravity, toGravity)` 返回新高度
- 动能：`Lec.P.kineticEnergy(mass, velocity)`
- 势能：`Lec.P.potentialEnergy(mass, height, gravity)`
- 终端速度：`Lec.P.terminalVelocity(mass, gravity, crossSectionArea, fluidDensity)`

所有页面涉及这些数值时，必须使用 `Lec.K` 或 `Lec.P`，不得在代码中硬编码数字。