# Slides 内容规划：可借鉴段落摘录与取舍

状态：整合版已获用户批准，已接入 Planner 的 `prompts/deck.md`。更新日期：2026-09-08。尚未进行接入后的真实模型生成实验。

本文对照 2026-09-07 克隆的固定版本，摘录可借鉴的原文，并区分中文释义与我们自己的改写建议。本文不作为新 skill 或整体注入模型；生产输入只使用去重后的内容规划原则，没有执行上游 workflow 或新增工具。

[上次完整研究记录](/data1/home/zhuyifan/ws2/slides-planning-research-20260907.sIcA39/RESEARCH.md)。此前完成静态研究及“先拟页表，再按需要取图”；本次将第 4 节整合的内容原则接入 Planner。

## 1. 审阅总表

标记含义：`改写`＝值得吸收，但不能照搬；`按需`＝随内容选用，不作为固定任务；`已有`＝主要用于核对现有表达，不再加一份重复要求；`补充`＝次要来源，合并到已有建议即可。这些标记保留原始取舍记录；用户批准的是整合后的原则，不是逐段照搬上游要求。

| 编号 | 来源 | 可借鉴点 | 建议标记 | 责任边界 |
| --- | --- | --- | --- | --- |
| P01 | presentation-making | 从源材料识别核心问题和必须保留的证据、限定 | 改写 | Planner 的内容判断；不虚构资料研究能力 |
| P02 | presentation-making | 按讲述逻辑组织，不按原文章节一对一切页 | 改写 | Planner 的取舍与页序 |
| P03 | presentation-making | 每页推进一个理解，而非只挂一个主题名称 | 已有 | 改善现有“一句主题”的质量，不加字段 |
| S01 | scientific-slides | 在规划阶段考虑背景、前人工作和问题缺口 | 改写 | Planner 判断哪些来源内容值得讲 |
| S02 | scientific-slides | 前人工作进入讲述，不只是页脚引用 | 按需 | 本课程的来源讲解；不强制人物页或照片 |
| L01 | slidesage | 先想学生要学会什么，再安排解释和学习活动 | 改写 | Planner 的内容选择，不引入目标 schema |
| L02 | slidesage | 必要前置知识在前，已有知识不必重新教 | 改写 | Planner 的顺序判断，不建概念 DAG |
| L03 | slidesage | 示例、尝试、回顾与对照按学习需要安排 | 按需 | Planner 决定是否需要；具体交互归 Builder |
| B01 | baoyu-slide-deck | 按读者需要决定保留、简化和省略 | 改写 | 与 P01/P02 合并，不另加一组清单 |
| B02 | baoyu-slide-deck | 判断什么内容需要视觉材料，什么文字就够 | 改写 | Planner 决定材料用途，Builder 决定构图 |
| B03 | baoyu-slide-deck | 相邻页形成理解递进，不是主题跳转 | 改写 | 与 P02 合并 |
| X01 | presentation-builder | 图要说清具体内容，而不只是“这一页配张图” | 补充 | 合并到 B02，不引入 storyboard 协议 |

没有把 12 条摘录全部追加到输入。后文第 4 节保留整合依据和接入边界。

## 2. 原文摘录、中文释义与改写边界

### P01 · 核心问题、来源和必要证据【改写】

来源：[presentation-making / deck-workflow.md][P]，第 7–18 行。以下是分开的两处摘录。

> Do not reconstruct a technical claim from memory when the source is available.

> - the central question or claim;
> - the main learning or decision goals;
> - the facts, derivations, examples, caveats, and evidence that must survive;

中文释义：有源材料时，不靠记忆重构技术主张；先明确中心问题、学习目的，以及哪些事实、推导、例子、限定和证据不能丢。

建议表达：**依据已有材料明确核心问题与必要内容；压缩讲述时保留影响理解和正确性的关键条件与证据。**

不带入：强制记录表、固定资料数量、让 Planner 重做每条推导。资料未提供或能力不足时，应承认缺口；图片搜索不等于论文研究。这里是在摘录内容规划原则，不是重新引入一整套事实检查门禁。

### P02 · 从材料结构转成讲述结构【改写】

来源：[deck-workflow.md][P]，第 32–45 行。

> Do not convert source pages or document sections one for one. Combine repeated
> setup, split dense reasoning, and give difficult ideas enough visual space.

原文另给了一条可替换的默认叙事顺序。中文概括为：问题 → 必要背景 → 局限或证据 → 关键想法 → 推理或验证 → 结论。它不是不可变模板；原文明确允许材料需要时采用其他顺序。

建议表达：**按理解过程组织页面，合并重复铺垫，给困难推理足够篇幅；不机械地把章节或算法列表逐项变成页面。**

不带入：每个算法固定六段、固定页数或每段单独一页。与我们已有“按重要性分配篇幅、不为凑页扩写”合并，不重复堆叠。

### P03 · 每页的作用是推进理解【已有】

来源：[deck-workflow.md][P]，第 67、70 行。两处独立摘录：

> Keep one primary point or teaching move per slide.

> Explain what an equation, figure, or result establishes, not only what it is.

中文释义：一页可以讲清一个主要观点，也可以完成一次必要的理解推进；公式和图不只要被命名，还要说明它们建立了什么认识。

建议处理：我们已有“这页讲什么、读者要明白什么”，先提升这一句的实际表达，不新增 `purpose`、`takeaway` 等同义字段。

页表表达示意（是我们的改写示例，不是上游原文）：

| 偏目录式 | 更能表达这一页的内容目的 |
| --- | --- |
| 随机森林 | 随机森林：为什么只增加树的数量还不够，树之间的差异也重要 |
| 算法历史 | 方法的提出背景：它试图解决什么问题，与此前方法有什么关系 |

不带入：强制所有标题成为完整结论句。布局、公式展开、动画和操作步骤仍归 Builder。

### S01 · 背景与前人工作属于规划内容【改写】

来源：[scientific-slides / presentation_workflow.md][S]，第 17–23 行。

> **Research and Literature Review** (Use research-lookup skill):

> 4. **Gather supporting citations**: Collect papers supporting your interpretations

上下文释义：它把查找背景资料、知识缺口、相关研究及支持性引用放在内容大纲之前。可借鉴的是“资料影响内容判断”，不是单纯制作完后补参考文献。

建议表达：**规划关键方法时，考虑它为何被提出、要解决什么问题，以及继承或改变了什么；据此决定是否需要来源、背景或演进内容。**

不带入：原文的 `research-lookup` 依赖、固定论文数量、单独文献表产物和研究 agent。若未来确实需要新增文本检索能力，应作为独立能力问题讨论，不能靠一句提示词声称已经有了。

### S02 · 来源讲解不等于页脚引用【按需】

来源：[presentation_workflow.md][S]，第 104 行。

> Background: Show key prior work visually (not just cite)

中文释义：重要前人工作需要进入可理解的展示，而不只是出现作者年份或页脚引用。

对我们这套集成学习课的启发：**来源讲解应该解释方法的来由和演进关系；人物照片、原始论文或图示服务于这段讲述。**

不带入：“每个算法必须一张创始人照片”“每章必须一页历史”“只有配图才算讲清来源”。原文没有这些要求。需要准确区分：算法来源讲解是此前用户对本课程的意图，不是上游提供的通用人物页模板。

### L01 · 先确定学习结果，再选择内容【改写】

来源：[slidesage / instructional-design.md][L1]，第 8–10 行。

> 1. **Identify desired results** → write learning objectives.
> 2. **Determine acceptable evidence** → design the retrieval checks that prove the objective.
> 3. **Plan learning experiences** → only now choose the explanatory slides.

中文释义：先想希望学生掌握什么、什么表现可以说明理解，再安排解释和活动。

建议表达：**先明确读者最后需要理解、解释或运用什么，再决定哪些内容和例子值得占用篇幅。**

不带入：目标 ID、Bloom 等级、`covers` 字段、每个目标必须有测试页。“练习存在”也不自动证明学习目标已经达成。这里借鉴的是思考顺序，不是它的机器校验体系。

### L02 · 必要前置与已有知识分开处理【改写】

来源：[slidesage / concept-sequencing.md][L2]，第 3、16 行。两处独立摘录：

> Learners can't grasp a concept before its prerequisites.

> Mark **prior knowledge** with `"assumed": true` — it's a valid prerequisite without a teaching slide:

中文释义：讲解依赖必要的前置理解；如果读者已经掌握，不必再为其安排教学页面。

建议表达：**按读者已有知识安排必要前置和后续方法；不遗漏理解所需的铺垫，也不重复教授已经掌握的基础。**

不带入：`assumed` / `teaches` 字段、概念 DAG、拓扑排序工具和概念数量限制。也不把“先给直觉，再补严格定义”视作非法顺序。

### L03 · 示例、尝试与前后对照【按需】

来源：[slidesage / learning-science.md][L3]，第 13–21 行。选取一处原文：

> For `apply`-level objectives, **model a full worked example first** (`worked-example` archetype, numbered
> steps), then have learners attempt a similar one (`retrieval`).

同一节还建议后续回访早先内容，并对相关概念进行对照。这里只记录该资料的主张，不将其措辞当作已经在我们实验中验证的效果。

建议表达：**需要读者会用时，可安排示例和尝试；方法容易混淆时，可通过后续对照帮助建立区别。**

不带入：每概念一页练习、固定五级帮助、统一帮助记录、每章固定回顾页或固定“例题先行”。若任务需要先尝试再解释，也保留这种顺序。具体交互机制由 Builder 设计。

### B01 · 内容取舍以读者为中心【改写】

来源：[baoyu-slide-deck / analysis-framework.md][B]，第 17、106 行。两处独立摘录：

> Prioritize by audience relevance, not source order

> Decide what to keep, transform, or omit.

中文释义：不是源文先出现就先讲，也不是所有材料都必须进课件。按读者需要判断保留、转换表达或省略。

建议处理：并入 P01/P02，不另设“保留／简化／视觉化／删除”的输出字段。

明确不摘取：原文的 `≤15 words`、`3–5 Maximum`、固定例子数量、默认简化背景，以及将 `Excessive caveats` 泛化为删限定条件。对这套课有价值的方法来历，不能因为被分类为“背景”就优先删掉。

### B02 · 判断视觉材料的用途【改写】

来源：[analysis-framework.md][B]，第 46、64–66 行。两处独立摘录：

> Identify which content benefits from visualization.

> - **Text Only**: Simple statements, transitions, minor details

中文释义：不是每一页都需要图；先判断图是否帮助说明内容，简单陈述也可以用文字完成。

建议表达：**按内容需要选择真实对象、原始材料或示意表达；需要找图时，先明确这张图帮助讲清什么。**

边界：Planner 判断材料需要和用途；Builder 决定 SVG、图表、布局及动画。不要搬原文的内容到版式映射表，不给每页加视觉优先级，也不要求每页取图。

这不能顺带解决“Planner 已分配图片但 Builder 未读取”的交接问题；后者需要独立验证。

### B03 · 页序要有衔接理由【改写】

来源：[analysis-framework.md][B]，第 100–102 行。

> - Each slide should answer: "What comes next?"
> - Use narrative connectors between sections
> - Build logical progression, not topic jumps

中文释义：相邻页应有逻辑上的承接，不只是一个主题讲完后换下一个名字。

建议表达：**让前一页建立的认识为下一页的问题或方法提供理由。**

不带入：固定开头与结尾页数、每页显式“承上启下”文案、每页增加连接字段。与 P02 合并即可。

### X01 · 图具体传达什么【补充，不单独接入】

来源：[presentation-builder / SKILL.md][X]，第 61–62 行。

> ### Graphic Concept
> [What visual/chart/diagram should appear and what it communicates]

中文释义：不仅写图的类型，还要明确它传达的内容。

建议处理：只吸收“材料的表达目的”，合并进 B02。不要带它的逐页 storyboard 多字段、研究 agent、设计 A/B 或固定侧栏布局。

Anthropic `pptx` 未列摘录：它是文件制作型对照，上一轮没有找到值得放入此次内容规划短文的独立增量。

## 3. 对照当前系统：哪些不是新增需求

| 现有内容 | 本次如何处理 |
| --- | --- |
| 读者、场合、总时长和范围 | 已有，沿用，不重复声明 |
| 先拟页表，再按页需要取图 | 已有，不再增加阶段或草稿文件 |
| 按重要性分配篇幅、不凑页 | 将 P02/B01 与现有表达合并，而不是追加一遍 |
| 每页“讲什么、读者要明白什么” | 已有；P03 用作改写质量参照，不加字段 |
| Planner 不定布局、公式、操作和构图 | 保留；不照搬上游 storyboard 的生产字段 |
| 真实证据用搜索图片，不用生成图替代 | 已有；B02 只补用途判断，不再加图量或取图预算 |

本次最有增量的，是 S01/S02 的方法背景与来源讲解、L01/L02 的学习需要和前置关系，以及 P02/B03 的理解递进。

## 4. 整合后的内容规划 guideline【我方改写，已接入，不是原文摘录】

2026-09-08 再次核对克隆原文后扩充。这里覆盖的是内容规划的主要判断，不是声称已经形成经过实验验证的完整教学理论。来源背景只是其中一个维度；不能从一次算法课的遗漏推导出所有课程都需要人物历史页。

### 4.1 审阅版：八个判断维度

以下是选择内容时的考虑角度，不是八个生成阶段，也不是每章必须覆盖的八类页面。来源编号对应第 2 节；跨学科表达和责任划分是我们的整合，不是上游原话。

| 编号 | 维度 | 候选 guideline | 借鉴来源与改写标记 |
| --- | --- | --- | --- |
| G01 | 读者与目的 | 从读者已有知识和本次希望形成的理解、判断或运用能力出发取舍内容；按重要性和理解难度分配篇幅，在给定时长内讲清主线，不求目录齐全。 | L01、B01、P01；合并已有范围与篇幅要求 |
| G02 | 核心问题与必要背景 | 让读者知道主题在回答什么问题、为什么值得理解；补足必要前置，不重复教授已知基础。背景的篇幅取决于它对理解的作用。 | P02、L02；合并改写 |
| G03 | 来由、语境与演进 | 方法或算法交代针对的问题、关键贡献及与已有方法的关系；事件、作品或观点考虑影响理解的时代、作者与形成语境。重要背景进入讲述，不只留作者名或引用；不另凑人物履历。 | S01、S02；方法来源有直接依据，扩展到历史／文学是我方建议 |
| G04 | 解释与证据 | 不只罗列名称和结论，要安排足以建立理解的机制、推理、实例或证据。区分原始材料、解释和示意；压缩时保留影响结论的条件，不编造数据、出处或因果关系。 | P01、P03、S01；原始材料与解释的跨学科区分为我方整合 |
| G05 | 顺序与理解递进 | 按适合内容的逻辑组织：因果、时间、问题与解决、论点与证据等，不机械照搬资料章节。每页推进一个主要理解，相邻页有承接；困难推理可分多页，重复铺垫应合并。 | P02、P03、B03；不同叙事路径亦见 B 原文第 4 节 |
| G06 | 运用、辨析与边界 | 需要读者会用时安排示例或尝试；容易混淆时安排对照，涉及选择时说明适用条件和局限。活动服务于学习目的，不因有某种页型就额外添加任务。 | L03、P01；页型约束为我方责任边界，不采用固定练习配额 |
| G07 | 素材与表达用途 | 先明确素材帮助读者看见、理解或判断什么，再选择真实对象、原始资料或示意表达。搜索结果按用途判断，不因关键词相关就采用；有价值的新材料可促使调整页表。 | B02、X01、S02；检索匹配与页表调整为我方结合实验的建议 |
| G08 | 收束与迁移 | 结尾回到最初的问题，把重要认识联系起来，说明它能帮助读者怎样解释、判断或行动；不只复述目录，也不强制每章增加总结页。 | P 原文第 2 节、B 原文第 4 节、L03；适配教学场景改写 |

G03 不能保证搜到人物照片，G07 也不能代替检索能力；本次整合解决的是规划判断，不把工具能力缺口包装成提示词问题。

### 4.2 审阅时的精简正文

下面保留审阅版本；实际生效内容以 [prompts/deck.md](prompts/deck.md) 为准。接入时整理成八条短原则，与既有范围、素材和每页主题要求去重；表和摘录没有注入。

> 围绕读者已有知识和本次需要形成的理解、判断或运用能力取舍内容，按重要性和理解难度分配篇幅，不求目录齐全。
>
> 让主线回答一个清楚的问题，补足必要前置。方法与算法说明针对的问题、关键贡献和演进关系；事件、作品与观点交代影响理解的时代、作者或形成语境。重要背景进入讲述，不只留下名字或引用。
>
> 用机制、推理、实例或证据建立理解，不只罗列结论；区分原始材料、解释和示意，保留影响结论的条件，不编造事实或来源。
>
> 按内容选择合适的讲述顺序，让每页推进一个主要理解、相邻页形成承接。需要会用时安排示例或尝试，需要辨析时安排对照与适用边界；不为每个主题固定配齐页型或教学环节。
>
> 素材服务于明确的讲述用途，搜索结果按用途而非仅按关键词判断；有价值的新材料可以调整页表。结尾回到核心问题，整合所得认识及其用途，不只复述目录。

### 4.3 接入边界【已落实】

- 只归 Planner 的内容规划；各建页 skill 的 description 继续忠于自身能力，不承担课程大纲原则。
- 与现有读者、篇幅、每页主题及素材用途要求去重，不再追加一套同义要求。
- 用独立的简短格式示例承载页表语法，不再让 AdaBoost 五页套餐同时承担格式、粒度、内容和页型选择四种职责。
- 不新增工具、页表字段、概念 DAG、目标编号、检查门禁、取图预算或独立规划阶段。
- 页表仍然只写标签和一句主题；Builder 负责具体讲解展开、交互机制与视觉实现，Style Director 负责全局风格。
- 内容意图若重要，应反映在页表主题里。例如“提出背景：此前方法有什么不足，这个方法改变了什么”，而不是期待人物图片反过来补出缺失的讲解页。

接入记录：移除 AdaBoost 五页套餐、每算法／概念通常 3–5 页的固定粒度暗示及重复页型适用说明；保留原有页表格式示例与四种标签映射。`deck.md` 模板从 5,257 增至 6,277 UTF-8 字节，净增 1,020 字节；Style Director 开启时剥离 CSS 段后的模板同样净增 1,020 字节。这是模板字节差，不是 token 数或整轮输入统计。

### 仅针对当前集成学习课的补充【课程意图，不是全局规则】

> 保留关键方法的来源与演进讲解；人物照片、原始论文或图示按讲述需要使用，不做脱离方法内容的人物履历页。

单独列出，是为了不把用户对这套课的需求自动扩大为“所有课程、所有算法都必须介绍创始人”。

## 5. 来源与版本

以下链接均固定到实际克隆的 commit，不指向可能变化的主分支。原始资料保留在 `/data1/home/zhuyifan/ws2/slides-planning-research-20260907.sIcA39/`。摘录保留来源归属；中文释义、取舍和候选短文为本次整理。

| 标识 | 作者／项目 | 固定版本 | 原文 |
| --- | --- | --- | --- |
| P | msimchowitz / writing-skills | `214981fe02326f27b0fc8790d00eb4b731607073` | [deck-workflow.md][P] |
| S | K-Dense-AI / scientific-agent-skills | `9cf7d9aea7d84754db4c167ab04b299d33c444bc` | [presentation_workflow.md][S] |
| L1–L3 | vedraut / slidesage | `2bbeebd9d31be79aad818938306f0bd4d615b515` | [instructional-design][L1] · [concept-sequencing][L2] · [learning-science][L3] |
| B | JimLiu / baoyu-skills | `6b7a2e417500561a5ecdd0b168332f4142584617` | [analysis-framework.md][B] |
| X | sk2977 / presentation-builder | `04be6279f6185799228fbc6bf5c43ac53338670e` | [SKILL.md][X] |

[P]: https://github.com/msimchowitz/writing-skills/blob/214981fe02326f27b0fc8790d00eb4b731607073/for-agents/presentation-making/references/deck-workflow.md
[S]: https://github.com/K-Dense-AI/scientific-agent-skills/blob/9cf7d9aea7d84754db4c167ab04b299d33c444bc/skills/scientific-slides/references/presentation_workflow.md
[L1]: https://github.com/vedraut/slidesage/blob/2bbeebd9d31be79aad818938306f0bd4d615b515/references/instructional-design.md
[L2]: https://github.com/vedraut/slidesage/blob/2bbeebd9d31be79aad818938306f0bd4d615b515/references/concept-sequencing.md
[L3]: https://github.com/vedraut/slidesage/blob/2bbeebd9d31be79aad818938306f0bd4d615b515/references/learning-science.md
[B]: https://github.com/JimLiu/baoyu-skills/blob/6b7a2e417500561a5ecdd0b168332f4142584617/skills/baoyu-slide-deck/references/analysis-framework.md
[X]: https://github.com/sk2977/presentation-builder/blob/04be6279f6185799228fbc6bf5c43ac53338670e/SKILL.md
