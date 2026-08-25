# 互动讲义设计哲学

每个标签块都可独立引用。`scope="deck"` 管整套讲义，`scope="page"` 管单页，
`scope="both"` 同时适用。把这些原则转成具体设计决定，不要把术语写进讲义正文。

<learner-centered scope="both">
从学习者要建立的理解出发，而不是从 HTML、组件或动画能力出发。先回答“他此刻需要看懂什么”，
再决定媒介和技术。
</learner-centered>

<knowledge-construction scope="both">
## 1. 学习是知识建构

目标不是覆盖尽可能多的信息，而是帮助学习者形成可使用的心理模型。规划内容时先确定核心主张、
支撑关系和已有知识的连接，再决定页面结构；不要把原始大纲直接改写成标题、段落和卡片。
</knowledge-construction>

<cognitive-architecture scope="both">
## 2. 尊重有限容量

文字、图像、动画和控件都会争夺注意力。每个时刻只保留当前理解所需的信息；复杂材料要分段、
标出重点，并避免让学习者同时理解内容和猜测界面怎么用。
</cognitive-architecture>

<select-organize-integrate scope="both">
## 3. 支持选择、组织和整合

每个场景都应帮助学习者完成三件事：注意相关信息，看见信息之间的结构，把新结构连接到已有知识。
视觉层级、标注和交互必须服务于其中至少一项。
</select-organize-integrate>

<segment-by-scene scope="both">
## 4. 按认知片段推进

一页围绕一个当前可处理的关系或活动展开。内容需要多个认知步骤时拆页；属于同一章节不意味着必须
同时展示。完成当前步骤后再进入下一段。
</segment-by-scene>

<page-rhythm scope="both">
# 页面节奏与内容分配

页面数量由学习过程决定，不由预设模板决定。标题、导览、转场、聚焦解释、探索、综合和迁移页可以有
不同密度；不要为了减少页数合并不同认知任务，也不要因为还有空间就增加知识点。内容较少的页面仍要
让核心对象或关系在画面中占据明确位置，留白应保护注意力，而不是形成失控的死区。
</page-rhythm>

<structure-follows-knowledge scope="page">
## 5. 让知识结构决定视觉结构

先判断学习者要建立的是过程、比较、分类、因果还是主张—支撑关系，再选择相应几何。
card、grid 和左右分栏只是容器，不能替代关系本身；关系必须在画面上直接可见。
</structure-follows-knowledge>

<words-and-pictures-one-model scope="page">
## 6. 让文字与图像共同解释

图像应承担空间、过程、因果或证据表达，不做正文旁的装饰。文字靠近它解释的对象，优先使用局部标签、
图中标注和邻近说明，避免让学习者在分离的图文区域之间反复扫描。
</words-and-pictures-one-model>

<manage-cognitive-load scope="both">
## 7. 管理认知负荷

删除不服务学习目标的加工，分段呈现必要复杂度，并用提示、对齐和比较促进组织与整合。
不要用更多组件制造“内容丰富”的假象。
</manage-cognitive-load>

<interaction-is-cognitive scope="page">
## 8. 交互必须触发认知活动

点击和拖拽本身不等于主动学习。交互应让学习者预测、比较、操纵因果、检验解释或完成迁移；
如果观察一个清晰的静态或动态表征已经足够，就不要强加操作。
</interaction-is-cognitive>

<pedagogical-restraint scope="both">
# 教学必要性与表达克制

同一关系用一种清晰表征讲透即可。删除重复解释、装饰、实现说明和评价教学方式的元评论；
来源与许可放在低干扰信息层。判断每个元素时都问：删掉它会不会损害对核心内容的理解？
</pedagogical-restraint>

<meaningful-learning-standard scope="deck">
## 9. 以理解和迁移为完成标准

完成不等于“看过”或能复述。整套讲义应让学习者形成连贯知识，并能用它解释新的问题；
收束和综合页要检验迁移，而不只是重复摘要。
</meaningful-learning-standard>
