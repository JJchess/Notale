## 公共执行前缀

```text
你正在仓库 /data1/home/zhuyifan/ws2/Notale/notale-v2 中，为 Notale workflow skill 制作一份完整 sample candidate。直接实现，不要只给方案，不要询问确认。

任务信息位于本 query 末尾的 YAML。严格执行其中的 skill、reference、output、port、axis 和 brief。

上下文隔离：
- 完整读取 YAML 指定的 SKILL.md 和唯一一份 reference。
- 不读取同一 skill 的其他 reference，也不读取 LEARNING_PLAN.md、旧 workflow skills、旧实验输出、GenerativeUI sample 或三个 scrub workflow。
- 不修改任何 SKILL.md、reference、vendor 文件、harness 或其他 candidate。

交付合同：
- 只写入 YAML 指定的绝对 output 目录。
- 创建 output/pages/，把仓库的 vendor/chassis 完整复制为 output/pages/assets/。
- 最终入口必须是 output/pages/index.html；页面自己的媒体放在 output/pages/media/。
- 页面是一个固定 1600×900 逻辑画布的完整 Notale 单页，必须保留 #stage、assets/base.css 和 assets/base.js，不允许页面或舞台滚动。
- 不使用 React、Vite、CDN 或外部运行时网络请求。优先使用 chassis 已有的本地库。
- 当前 chassis 不提供产品主题，因此在页面内集中定义必要的语义 token，但不要修改 base.css。
- 它必须是完整页面，不是孤立 widget、组件陈列、控制面板或 renderer demo。
- 首屏必须已经有信息和视觉完成度，不能依赖 hover、播放或操作后才成立。
- 实现 keyboard、reduced-motion、确定性 reset、resize 和必要的资源清理。

完成后把 `<output>` 替换为 YAML 中的绝对 output 路径。普通页面运行：
python3 <output>/pages/assets/selfcheck.py <output>/pages/index.html --shot --shot-dir <output>/.codex-shots

如果 reference 是 `build-interaction/references/code.md`，页面必须通过 HTTP 加载 Worker 和 Python 文件，改为运行：
python3 <output>/pages/check.py --shot-dir <output>/.codex-shots

修复全部 runtime、资源、overflow、裁切和文字问题，并实际查看截图完成至少一轮视觉修正。

最后检查 YAML 指定端口。若被未知进程占用，不要杀进程，直接报告；否则在 `0.0.0.0:<port>` 启动持久静态服务器，以 `<output>/pages/` 为根目录，把日志和 PID 保存到 `<output>`。最终回复给出预览 URL、截图路径和 selfcheck 结果；回复结束后服务器必须继续运行。
```

## 任务分布

| Reference | 典型模式 | 数量 |
|---|---|---:|
| `build-cover/composition` | 单体材质、场景尺度、排版与材料融合 | 3 |
| `build-cover/motion` | 组装、结构变换、对齐揭示 | 3 |
| `build-cover/generative` | 向量场、局部生长、反应扩散 | 3 |
| `build-page/general` | 机制、受控比较、因果序列、不变量、结构地图 | 5 |
| `build-page/chart` | 时间关系、分布、关系网络 | 3 |
| `build-page/3d` | 嵌套结构、光照视点、球面空间 | 3 |
| `build-interaction/general` | 操纵比较、预测运行、构造测试、诊断决策、学习游戏 | 5 |
| `build-interaction/3d` | 空间构型、平面对齐、三维路径 | 3 |
| `build-interaction/code` | 序列不变量、树变换、图前沿、动态规划、回溯 | 5 |

## build-cover / composition

### Q01 · 单一对象与材质

```yaml
id: cover-composition-prism
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/composition.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/composition/prism-light
port: 43201
axis: 单一对象、真实材质与标题负空间
brief: |
  制作章节封面《解剖一束光》，副标题“折射、色散与我们看见的颜色”。
  以一块具有可信厚度、切面和内部反光的玻璃棱镜为唯一主角；白光进入，连续光谱展开。
  标题与光束、棱镜共同形成构图。代表静帧必须独立成立，不放步骤、公式、解释卡片或控制器。
```

### Q02 · 场景尺度与纵深

```yaml
id: cover-composition-deep-sea
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/composition.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/composition/deep-sea-scale
port: 43202
axis: 场景纵深、尺度关系与受控裁切
brief: |
  制作章节封面《阳光止步之后》，副标题“深海的尺度与生命”。
  用海面余光、垂直水体、海沟、微小潜水器和下沉海雪建立巨大尺度感。
  标题必须处在真正安静的水体区域。这不是解释页，不放深度刻度、知识标签或信息面板。
```

### Q03 · 排版与主题材料融合

```yaml
id: cover-composition-tree-rings
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/composition.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/composition/tree-rings
port: 43203
axis: 排版与主题材料融合
brief: |
  制作章节封面《时间写在树里》，副标题“从年轮读取气候与生命史”。
  以一块被大胆裁切的树干横截面为主视觉，让标题的基线、行距或边缘与年轮节律发生关系。
  只保留一个记忆点，例如火烧痕或异常生长带。使用固定 authored composition，不做程序生长展示。
```

## build-cover / motion

### Q04 · 组装与压印

```yaml
id: cover-motion-movable-type
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/motion.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/motion/movable-type
port: 43204
axis: assemble → imprint → hold
brief: |
  制作章节封面《活字》，副标题“文字第一次可以被重新排列”。
  字模被选择、排列、锁入版框、滚墨，最后一次压印形成稳定标题画面。
  组装与压印是唯一主要动作；最终印迹必须成为可长期停留的代表静帧。
```

### Q05 · 裂开与迁移

```yaml
id: cover-motion-continental-drift
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/motion.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/motion/continental-drift
port: 43205
axis: split → translate → settle
brief: |
  制作章节封面《大陆漂移》，副标题“一颗缓慢重写自己的星球”。
  一体大陆出现应力与裂谷，板块逐渐分离，洋中脊形成，最后标题稳定落位。
  “裂开并漂移”是唯一主运动，不增加无关粒子或炫技镜头。
```

### Q06 · 对齐与揭示

```yaml
id: cover-motion-eclipse
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/motion.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/motion/eclipse-alignment
port: 43206
axis: align → occlude → reveal
brief: |
  制作章节封面《日食》，副标题“当三个天体短暂排成一线”。
  月面进入太阳前方，经过接触、食甚和日冕显现，最终进入稳定 hold。
  对齐、遮挡和日冕揭示承担视觉记忆；reduced motion 直接显示食甚代表帧。
```

## build-cover / generative

### Q07 · 向量场

```yaml
id: cover-generative-magnetic-field
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/generative.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/generative/magnetic-field
port: 43207
axis: 向量场与累积轨迹
brief: |
  制作算法封面《磁场》，副标题“看不见的秩序”。
  从双极磁场关系生成流线和少量沿场运动的轨迹，固定种子为 notale-magnetic-01。
  方向、弯曲和密度必须表达不可见影响，不能退化成通用粒子背景或网络连线。
```

### Q08 · 局部生长

```yaml
id: cover-generative-mycelium
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/generative.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/generative/mycelium-growth
port: 43208
axis: 局部生长、分支与资源竞争
brief: |
  制作算法封面《菌丝》，副标题“地下的生长网络”。
  菌丝尖端从固定孢子点生长，趋向营养源；能量阈值决定分叉，占用资源改变后续路径。
  可见结果应是探索、连接和稠密化，而不是预先画好的随机树枝。固定 seed、节点和创建顺序。
```

### Q09 · 反应扩散

```yaml
id: cover-generative-turing-pattern
skill: experiments/workflow-skills-next/build-cover/SKILL.md
reference: experiments/workflow-skills-next/build-cover/references/generative.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-cover/samples/generative/turing-pattern
port: 43209
axis: 反应扩散、阈值与涌现
brief: |
  制作算法封面《花纹从哪里来》，副标题“简单反应如何产生复杂秩序”。
  实现确定性的 Gray–Scott reaction-diffusion 或等价局部反应模型，使均匀场形成斑点和条纹。
  模型演化就是视觉概念，不能用预制噪声纹理冒充；同时保留稳定标题区域和代表帧。
```

## build-page / general

### Q10 · 机制图

```yaml
id: page-general-escapement
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/general/escapement
port: 43210
axis: intuition mechanism / draw the mechanism
brief: |
  制作解释页《机械钟为什么不会一下走完？》
  主张：擒纵机构把发条的连续释放切成受控的离散步进。
  用可识别的擒纵轮、擒纵叉、摆轮和动力方向表现锁止、释放、换边与再次锁止，不用流程框代替机构。
```

### Q11 · 受控比较

```yaml
id: page-general-vacuum-fall
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/general/vacuum-fall
port: 43211
axis: aligned controlled comparison
brief: |
  制作解释页《羽毛和钢球，什么时候一起落地？》
  主张：真空中两者具有相同重力加速度；空气中的差异来自阻力。
  并列比较空气与真空，保持共享高度、时间、基线和初始条件，只改变空气阻力。
```

### Q12 · 因果序列

```yaml
id: page-general-whale-fall
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/general/whale-fall
port: 43212
axis: authored causal sequence
brief: |
  制作解释页《鲸落之后，谁接住了能量？》
  主张：同一具鲸体随着可利用资源变化，依次供养不同深海群落。
  沿同一海床和鲸体组织软组织消耗、沉积富集、骨脂分解与硫化物生态，保持身份和因果连续，不做阶段卡片行。
```

### Q13 · 不变量

```yaml
id: page-general-triangle-invariant
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/general/triangle-invariant
port: 43213
axis: multiple examples converging on one invariant
brief: |
  制作解释页《三角形变了，内角和为什么不变？》
  展示几个形状明显不同的三角形，保持三个角的身份稳定，并把角移动到共享基线拼成平角。
  多个案例必须收敛到同一关系；决定性状态无需记住动画也能理解。
```

### Q14 · 结构地图

```yaml
id: page-general-neuron-map
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/general/neuron-map
port: 43214
axis: labelled structural reference view
brief: |
  制作结构页《一颗神经元的方向感》。
  用一条完整、具有功能轮廓的神经元建立稳定地图，标明树突、胞体、轴丘、轴突、髓鞘和突触。
  标签精确指向对象，一条克制信号轨迹提示通常的输入、整合与输出方向；不把部件拆成卡片。
```

## build-page / chart

### Q15 · 时间序列错位

```yaml
id: page-chart-solar-storage
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/chart.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/chart/solar-storage
port: 43215
axis: time-series mismatch and decisive annotation
brief: |
  制作数据页《太阳落山后，电从哪里来？》
  主张：光伏高峰与需求高峰错位，储能转移能量而不制造能量。
  使用教学示意数据：hour=[0,2,4,6,8,10,12,14,16,18,20,22,24]；demand=[36,33,31,34,43,55,62,64,60,63,78,66,44]；solar=[0,0,0,2,22,52,76,88,81,57,25,2,0]，单位 GW。
  共享尺度并直接标出中午富余、傍晚缺口与时间转移关系，不做 dashboard。
```

### Q16 · 分布差异

```yaml
id: page-chart-same-mean
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/chart.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/chart/same-mean-distribution
port: 43216
axis: distribution, spread and statistical truth
brief: |
  制作数据页《平均数相同，班级真的一样吗？》
  使用合成教学数据 A=[48,49,49,50,50,50,51,51,52] 与 B=[30,35,40,45,50,55,60,65,70]。
  两组均值都是 50，但离散程度不同。使用共享轴的分布图让 spread 承担证据，均值只作为共同基准。
```

### Q17 · 关系网络

```yaml
id: page-chart-pollinator-network
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/chart.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/chart/pollinator-network
port: 43217
axis: relational network with encoded connection strength
brief: |
  制作关系数据页《谁连接了两个授粉群落？》
  构造一份固定、明确标为教学示意的植物—传粉者二部网络；节点类型表示角色，边宽表示访花次数。
  让少数广食性传粉者成为两个植物群落之间的桥梁。布局必须确定性 settle 并停止，初始状态直接看得出桥接关系。
```

## build-page / 3d

### Q18 · 嵌套方向结构

```yaml
id: page-3d-gimbal
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/3d.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/3d/gimbal
port: 43218
axis: nested orientation and exploded spatial structure
brief: |
  制作 3D 解释页《陀螺仪为什么能保持方向？》
  主张：三层互相垂直的万向环允许外壳改变姿态，同时转子轴保持空间方向。
  构建外环、中环、内环和转子，并提供能分别揭示嵌套、轴向与独立姿态关系的命名视角。
```

### Q19 · 光照与视点

```yaml
id: page-3d-moon-phases
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/3d.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/3d/moon-phases
port: 43219
axis: illumination, viewpoint and occlusion
brief: |
  制作 3D 解释页《月相不是地球的影子》。
  构建太阳、地球、倾斜约 5°的月球轨道和受光半球；同一 phase state 派生 3D 月球位置与地球观察者看到的月面。
  首屏显示太阳方向、受光半球和观察结果，并提供系统、地球与轨道侧视等命名视角。
```

### Q20 · 球面地理

```yaml
id: page-3d-great-circle
skill: experiments/workflow-skills-next/build-page/SKILL.md
reference: experiments/workflow-skills-next/build-page/references/3d.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-page/samples/3d/great-circle-route
port: 43220
axis: spherical geography
brief: |
  制作 3D 地理页《最短航线为什么在地图上是弯的？》
  比较纽约约 40.7128,-74.0060 与东京约 35.6762,139.6503 之间的大圆路径及其在平面投影中的外观。
  地球曲率必须承担决定性证据；提供 globe overview、route plane 和 map comparison 等命名视角。
```

## build-interaction / general

### Q21 · 操纵与比较

```yaml
id: interaction-general-convex-lens
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/general/convex-lens
port: 43221
axis: manipulate and compare
brief: |
  制作互动《把像移到屏幕上》。
  学习目标：根据物距、焦距和像距预测凸透镜能否形成清晰实像。
  学习者移动发光物、透镜或屏幕；同一状态派生主光线、交点、倒立像、清晰度和 1/f=1/u+1/v 的数值证据。
  成功由真实成像误差容差判断，并提供改变条件后的再次尝试。
```

### Q22 · 预测、运行与检查

```yaml
id: interaction-general-wave-interference
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/general/wave-interference
port: 43222
axis: predict, run and inspect
brief: |
  制作互动《把安静点找出来》。
  学习者先把探针放到预测的相消位置并保留承诺，再运行测量。
  同一模型显示两列波、传播路径、r1、r2、Δr/λ、局部振幅和预测—结果对照；随后改变间距或初相位进行迁移尝试。
```

### Q23 · 构造、测试与修复

```yaml
id: interaction-general-truss
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/general/truss-bridge
port: 43223
axis: construct, test and locally repair
brief: |
  制作互动《为什么桥梁喜欢三角形？》
  给学习者一个含矩形跨格、有限杆件和明确载荷点的桥架；学习者连接节点、添加斜撑并执行 load test。
  显示受拉/受压、节点位移、最大挠度和失稳位置。失败保留变形证据，并允许局部修复后再次测试。
```

### Q24 · 诊断与决策

```yaml
id: interaction-general-greenhouse-diagnosis
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/general/greenhouse-diagnosis
port: 43224
axis: decide and diagnose
brief: |
  制作互动《土是湿的，植物为什么还在萎蔫？》
  初始存在缺水、盐胁迫和过热蒸腾三个合理假设。学习者选择土壤湿度、EC、叶温或根区水势等测量，再选择灌水、冲盐或遮阴。
  测量与干预必须来自同一潜在模型，并允许根据证据修正诊断和处理方案。
```

### Q25 · 学习游戏

```yaml
id: interaction-general-floodgate-game
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/general.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/general/floodgate-game
port: 43225
axis: play through the concept
brief: |
  制作学习游戏《在洪峰到来前调度水库》。
  玩家调节闸门开度，在上游库容、入流洪峰、下游安全流量和闸门变化速率之间权衡。
  压力来自真实库容与下游承载，不使用任意倒计时；溢流或下游超限是可检查的模型失败，并支持快速重试。
```

## build-interaction / 3d

### Q26 · 空间构型

```yaml
id: interaction-3d-chirality
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/3d.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/3d/chirality-builder
port: 43226
axis: spatial configuration and non-superimposability
brief: |
  制作 3D 互动《镜像分子：旋转能让它们重合吗？》
  学习者交换四面体中心四个不同取代基的键位，构造镜像并尝试通过旋转重合。
  使用排列奇偶性或带符号四面体体积判断 handedness，并用 ghost alignment 显示镜像为何不能靠旋转消除。
```

### Q27 · 晶面对齐

```yaml
id: interaction-3d-miller-plane
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/3d.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/3d/miller-plane
port: 43227
axis: plane alignment, intercepts and angular evidence
brief: |
  制作 3D 互动《切出指定的晶面》。
  在立方晶格中给出目标 Miller index，例如 (1 1 1) 或 (1 1 0)。
  学习者改变切割平面；模型实时派生截距、法向量、角误差和被平面穿过的晶格点，成功由几何容差判断。
```

### Q28 · 三维路径规划

```yaml
id: interaction-3d-terrain-route
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/3d.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/3d/terrain-route
port: 43228
axis: route through terrain under spatial constraints
brief: |
  制作 3D 互动《穿过山谷，但别耗尽电池》。
  学习者在三维山谷中放置有限航点；同一模型计算地形净空、水平距离、爬升能耗、逆风代价和剩余电量。
  危险路段直接在路径上编码，错误路线保留可检查后果，并允许移动局部航点修复。
```

## build-interaction / code

这些任务先运行 `build-interaction/scripts/generate_template.py` 生成固定工作台，再只编辑生成结果的 `pages/lesson/`。不要把 Monaco、Worker、trace player 或超时恢复重新写进课程模块。

### Q29 · 序列与循环不变量

```yaml
id: interaction-code-partition
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/code.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/code/partition-invariant
port: 43229
axis: sequence invariant, pointers and writes
brief: |
  制作代码互动《partition 之后，基准值到底保证了什么？》。
  学习者补全原地 partition 的循环条件或交换逻辑；运行实际 Python 后，同一 trace 显示数组、low/i/j/high、基准位置、读取和写入。
  测试必须区分“样例刚好正确”和“左右分区不变量对重复值、负数仍成立”，失败时保留第一个破坏不变量的帧。
```

### Q30 · 树旋转与身份保持

```yaml
id: interaction-code-avl-rotation
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/code.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/code/avl-rotation
port: 43230
axis: tree identity, balance factor and rotation
brief: |
  制作代码互动《一次 AVL 旋转改了什么，没改什么？》。
  学习者修复 left_rotate；右侧以稳定 node id 显示父子边、子树高度和平衡因子，旋转前后节点身份与中序序列必须保持。
  测试覆盖 LL/RR/LR/RL 中本题声明的情形，并把断开的子树或错误 parent 指针定位到实际源码帧。
```

### Q31 · 图搜索前沿

```yaml
id: interaction-code-bfs-frontier
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/code.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/code/bfs-frontier
port: 43231
axis: graph frontier, visited timing and predecessor evidence
brief: |
  制作代码互动《BFS 应该在入队时还是出队时标记？》。
  学习者修改 visited 更新位置；运行后同步显示图、队列、frontier、visited、predecessor 和重复入队次数。
  使用含环、汇合路径与不连通节点的确定性图；失败证据必须指出重复工作或错误最短层，而不只显示目标距离。
```

### Q32 · 动态规划依赖

```yaml
id: interaction-code-knapsack-dp
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/code.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/code/knapsack-dependency
port: 43232
axis: table dependency, update order and provenance
brief: |
  制作代码互动《一维背包为什么必须倒着更新？》。
  学习者改变容量循环方向；右侧显示当前物品、dp 单元、两个候选来源、采用值及同一物品是否被非法重复使用。
  测试既检查最优值，也检查 0/1 约束；保留第一处被本轮新值污染的依赖帧。
```

### Q33 · 回溯、剪枝与恢复

```yaml
id: interaction-code-nqueens-backtracking
skill: experiments/workflow-skills-next/build-interaction/SKILL.md
reference: experiments/workflow-skills-next/build-interaction/references/code.md
output: /data1/home/zhuyifan/ws2/Notale/notale-v2/experiments/workflow-skills-next/build-interaction/samples/code/nqueens-restore
port: 43233
axis: call tree, pruning and state restoration
brief: |
  制作代码互动《回溯返回时，哪些状态必须撤销？》。
  学习者修复 N 皇后的撤销步骤；右侧同步棋盘、调用栈/搜索树、当前选择、冲突集合和被剪枝分支。
  测试覆盖可解、边界和连续调用，专门暴露一次运行残留状态污染下一分支的问题。
```

## 收录原则

- 这些是候选，不表示 33 份都会进入正式 sample 库。
- 专门类别最终保留最有迁移价值的 2–3 份；`page/general` 与 `interaction/general` 可以更多。
- sample index 按 `axis` 和可迁移机制匹配，不按题材关键词匹配。
- 一次生成最多加载一份与所选 reference 同类别的 sample。
