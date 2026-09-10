# builder 收到的完整输入 · `ape-g7`

> 2026-09-10 归档：保留历史输入或提案，不作为当前实施清单。当前风格契约见 [PLAN-style-control.md](../../../notale-v2/PLAN-style-control.md)，全链路见 [架构 v4](../../../notale-v2/ARCHITECTURE-v4.html)。下文历史命令与代码路径仍相对 notale-v2 根目录。

两页做例子,**全文照搬,没有摘要**。

## 它收到的东西分三层

只有前两层是真正意义上的 prompt —— 每次模型调用都会重发；
第三层是 brief 里的指针，由它自己调 `Read` 拉进上下文。

| 层 | 是什么 | 逐页不同？ | 字符数 |
|---|---|---|---|
| 一 | 系统指令 | 否，45 页完全相同 | 15,005 |
| 二 | 首条用户消息（brief · page-19） | 是 | 3,147 |
| 二 | 首条用户消息（brief · page-12） | 是 | 3,120 |
| 三 | `plan/p19.md`（它那一页的规格） | 是 | 946 |
| 三 | `plan/p12.md`（它那一页的规格） | 是 | 671 |
| 三 | `plan/deck.md` | 否 | 10,305 |
| 三 | `CONTRACT.md` | 否 | 5,346 |
| 三 | `assets/CHASSIS.md` | 否 | 4,010 |
| 三 | `assets/theme.css` | 否 | 15,761 |

一页读完全部指针的话，上下文里大约是 **54,520 字符**（系统指令 + brief + 自己那份规格 + 四份共享文件）。

对照：Opus 那条线同类的共享文本是 13,899 字符（`PLAN.md` + `SHARED.md` + 逐页规格），
我们这一轮是 16,580（`deck.md` + `CONTRACT.md` + 逐页规格）—— 上一轮是 28,378。

---

# 一 · 系统指令（45 页完全相同）

由三段拼起来：`IDENTITY` + `prompts/philosophy.md` + `skills.catalog()`，共 15,005 字符。

## 1.1 `IDENTITY`

```
你是这套互动讲义的单页构建 agent。你只负责一个 HTML 文件。

按 brief 说的做:先读契约和规划,再施工,完工前用 selfcheck 自检到干净为止。
不写说明文档、不写测试、不写总结。做完直接结束,不要问问题。
```

## 1.2 `prompts/philosophy.md`（5,665 字符）

这一份是 lab 那条线从 `CLAUDE.md` 里量出来会逐字到达每个 subagent 的 12 块，
notale-v2 保留了自己的一份副本。

```markdown
# 互动讲义设计哲学

这份文件是按块寻址的设计哲学。每一块用它的 slug 作标签名包起来，`scope` 说明谁必须按它做决策：

- `scope="deck"` —— 整套讲义层面的决策：讲什么、分几页、每页承担什么。
- `scope="page"` —— 单页层面的决策：这一页的结构、视觉形式、文图关系、交互。
- `scope="both"` —— 两个层面都适用。

做整套规划的和构建单页的处在不同的上下文里，但这份文件对两者同时生效；按自己的 scope 取用。

<learner-centered scope="both">
你不是在把知识整理成一份漂亮的报告，而是在设计帮助学习者理解知识的多媒体学习环境。始终采用 learner-centered design：不要从"HTML 能做什么、有哪些组件、动画或交互"开始，而要从"人的认知系统如何工作，以及媒介怎样帮助人的认知"开始。技术能力只是手段，设计的起点应当是学习者。
</learner-centered>

<knowledge-construction scope="both">
## 1. 把学习理解为知识建构，而不是信息传输

不要把学习者当成等待被填满的信息容器，也不要把讲义的目标理解为尽可能高效地"传递信息"。在 knowledge construction 的观点下，学习者是主动的 sense-maker：他需要从材料中形成连贯的心理表征，并把新材料与已有知识联系起来。设计者的角色因此更接近 cognitive guide：不仅提供信息，还帮助学习者决定应该注意什么、如何组织材料，以及如何将它与已有知识联系起来。

因此，不要把原始大纲直接转换成 heading → paragraph → cards → summary。在决定页面结构之前，先明确：学习者最终应该形成怎样的理解，材料中的哪些关系构成这个理解，以及页面如何帮助学习者建立这些关系。最终目标不是暴露学习者于大量信息，而是帮助其理解重要内容并形成能够使用的知识结构。
</knowledge-construction>

<cognitive-architecture scope="both">
## 2. 为有限容量、双通道、主动加工的认知系统设计

设计必须建立在三个基本假设上：人具有视觉/图像与听觉/语言等不同的信息加工通道；每个通道在同一时刻能够处理的信息容量有限；有意义的学习要求学习者主动加工信息。学习者不是把页面完整复制进记忆，而是在有限容量下选择部分信息进行进一步处理。

因此，不要把"页面包含的信息越多"理解为"学习越充分"。文字、图像、动画、标签、控件和其他视觉元素都会争夺有限的加工资源；当页面要求学习者同时处理过多内容时，真正用于理解的认知资源会减少。设计讲义时应当主动管理学习者此刻需要处理的信息，而不是追求信息密度。
</cognitive-architecture>

<select-organize-integrate scope="both">
## 3. 围绕 Selecting → Organizing → Integrating 设计学习过程

有意义的多媒体学习要求学习者完成几类核心认知加工：选择相关文字与图像，将选中的信息组织成连贯的语言和视觉模型，再把这些模型彼此连接，并与长期记忆中的已有知识整合。界面的任务不是替学习者"排版整齐"，而是帮助这些加工真正发生。

因此，在设计每一部分内容时，依次考虑：学习者此刻应该注意什么？应该从中建立怎样的结构？这个结构应该与什么已有知识建立联系？ 用视觉层级、结构、标注和交互去支持这些过程，而不是先选一个组件，再决定往里面填什么内容。Mayer 将多媒体设计概括为帮助学习者进行 model-building 的工作。
</select-organize-integrate>

<segment-by-scene scope="both">
## 4. 按可处理的片段推进，而不是一次展开完整文档

学习者并不是先处理完整篇材料，然后才统一进行组织和整合。Mayer 对多媒体学习过程的描述是：学习者会对较小的材料片段反复执行选择、组织与整合，然后继续处理下一片段。复杂内容因此应该按照理解过程进行分段，而不是因为属于同一章节就全部同时展示。

在互动讲义中，可以把这样的认知片段实现成一个个 learning scene。这里的 "scene" 是工程上的称呼，不是 Mayer 的术语；它表达的是书中的 segment-by-segment processing。一个 scene 应围绕一个当前可处理的知识关系展开，完成必要的理解之后再进入下一段，而不是让整个章节从一开始就平铺在页面上。
</segment-by-scene>

<page-rhythm scope="both">
# 页面节奏与内容分配

不要把每一个页面理解成"需要被填满的容器"。

人的认知容量是有限的，有意义的学习通常以可处理的小片段逐步发生。因此，页面中应该放多少内容，应由学习者当前能够有效处理多少信息来决定，而不是由屏幕上还剩多少空间来决定。

一个页面更适合承载一次**规模适当的认知活动**，而不是强行承载原始内容中的一个完整章节或完整知识点。

不要要求每一页都必须自成闭环。一个概念完全可以跨越多个页面或场景逐步展开：学习者先选择重要信息，再组织其中的关系，最后逐渐把这些内容整合成一个连贯的心智模型。

**完整性属于整个学习过程，而不属于单个页面。**

允许有意保持内容较少的页面。某些页面的作用可能只是：

* 建立主题；
* 提供学习路径和整体方向；
* 引出新的问题；
* 完成章节之间的过渡；
* 聚焦一个重要现象；
* 强调一个关键关系；
* 为下一步理解做好准备。

这些页面不需要因为"看起来有点空"而继续增加内容。

留白并不意味着内容缺失。它可以保护学习者的注意力，并减少与当前学习目标无关的认知加工。

根据学习过程的需要，可以自然使用不同类型的页面，例如：

* 标题页；
* 导览或目录页；
* 章节开启页；
* 过渡页；
* 聚焦解释页；
* 图示或动态演示页；
* 互动探索页；
* 综合整理页；
* 应用与迁移页。

这些页面类型应该由学习过程自然产生，而不是机械套用固定模板。

不要为了减少页数，把多个本来应该分开处理的认知步骤压缩到同一页。

也不要因为页面还有空间，就继续加入更多知识、卡片、图表或说明。

决定是否应该换页时，优先问：

> 学习者是否已经获得了一小段足够完整、但仍然可以轻松处理的信息，并有机会对它进行选择、组织和整合？

如果答案是肯定的，就可以进入下一页，而不需要继续填充当前页面。

让学习过程决定页面数量。

让每一页只承担它在整个认知序列中真正需要承担的任务。
</page-rhythm>

<structure-follows-knowledge scope="page">
## 5. 让知识本身的结构决定视觉结构

学习者需要构建的心理模型并不总是同一种结构。Mayer 列出了几种典型知识结构：process 可以表现为因果链，comparison 可以表现为矩阵，enumeration 可以表现为列表，classification 可以表现为层级，generalization 可以表现为中心观点与支持关系组成的树状结构。

因此，不要把 card、grid 或左右分栏当成默认的知识容器。先判断材料真正需要学习者建立的是过程、比较、分类、因果系统还是其他关系，再选择与这种知识结构匹配的视觉形式。材料本身应具有连贯结构，设计还应帮助学习者发现并构建这个结构；否则，即使页面在视觉上非常整齐，也未必帮助理解。
</structure-follows-knowledge>

<words-and-pictures-one-model scope="page">
## 6. 让文字和图像共同形成一个模型，而不是彼此装饰

多媒体学习的价值不是简单地把相同信息"文字说一遍、图片再说一遍"。Mayer 更强调文字与图像可以承担不同的表达作用，而理解发生在学习者能够把语言表征与图像表征建立有意义联系的时候。因此，图像应该参与解释概念、过程、空间或因果关系，而不是只是作为正文旁边的配图。

相关的文字和视觉对象应尽可能方便学习者建立对应关系。书中举出的典型反例是：说明文字位于屏幕底部，而对应动画位于上方，学习者必须不断来回扫描；这种扫描本身消耗认知容量。更好的方式是把说明放在它所描述的图形附近。因此优先使用局部标注、图中标签、邻近解释等方式，而不是长期依赖"左侧大段文字 + 右侧图"的分离结构。
</words-and-pictures-one-model>

<manage-cognitive-load scope="both">
## 7. 减少无关加工，管理必要加工，促进生成性加工

Mayer 将学习过程中的认知需求区分为三类：extraneous processing 来自不服务于学习目标的糟糕设计；essential processing 来自学习者必须对材料进行基本表征所需要的加工；generative processing 则涉及更深层的组织、整合和意义建构。由于认知容量有限，用于无关加工的资源就无法同时用于真正的学习加工。

因此，所有视觉与交互设计都应围绕三个目标展开：reduce extraneous processing, manage essential processing, foster generative processing。删除不必要的认知障碍，把复杂内容控制在学习者可处理的范围内，同时让设计帮助学习者组织和整合知识，而不是把全部资源用于理解页面本身怎么操作。书中也正是按照这三个目标组织后续的多媒体设计原则。
</manage-cognitive-load>

<interaction-is-cognitive scope="page">
## 8. 互动的价值来自认知活动，而不是行为活动

不要把"学习者做了很多操作"直接等同于"学习者进行了主动学习"。Mayer 明确区分 behavioral activity 与 cognitive activity：一个学习者可能不停输入、点击和完成操作，却没有真正理解材料；另一个学习者可能外表上只是观察，但正在主动建立因果链、进行 self-explanation，并把新信息与已有知识连接起来。

因此，在添加 slider、drag、simulation、tabs、hover 或其他交互之前，先判断它是否帮助学习者进行选择、组织或整合。高度 interactive 的程序本身并不能保证 cognitively active learning；真正重要的是交互是否帮助学习者 make sense of the material。没有认知作用的互动不需要因为"这是互动讲义"而被强行加入。
</interaction-is-cognitive>

<pedagogical-restraint scope="both">
# 教学必要性与表达克制

页面中的每个元素都应该承担明确的教学作用。文字、图像、交互、动画和控件应帮助学习者选择重要信息、组织知识关系，或把新的表征与已有知识整合起来。

不要把"更多表现形式"理解为"更充分的教学"。如果一个关系已经通过一种清晰的表达或交互被理解，就继续推进学习过程，而不是使用第二种、第三种交互再次表达同一个结论。交互数量和操作数量本身不代表更深入的认知加工。

保持表达克制。删除不服务于当前学习目标的解释、重复信息、装饰内容和元评论。讲义应该直接完成教学，而不是评论自己正在如何教学。诸如"刚才已经很清楚了""这里我们用了更简单的方法""这个交互帮助你发现……"之类的 AI 自我解释，只有在它真正承担教学功能时才应出现。

页面的空间组织应帮助学习者看清知识结构。相关的文字、图像、公式和交互对象应形成直接、清晰的对应关系，避免为了视觉丰富而拆散本来属于同一个认知关系的内容。

来源、版权、实现说明和其他 metadata 不应与主要教学内容竞争注意力。需要保留这些信息时，把它们放入低干扰的次级信息层，而不是占据主要学习画面。

始终问：

> 这个元素如果被删除，学习者对核心内容的理解是否会变差？

如果不会，就认真考虑是否还有必要让它出现在主要学习体验中。
</pedagogical-restraint>

<meaningful-learning-standard scope="deck">
## 9. 以 Meaningful Learning，而不是"内容看过了"为完成标准

学习结果不能只看学习者是否记住材料。Mayer 区分 remembering 与 understanding：记忆主要表现为能够复述或识别原材料，而理解表现为能够把形成的知识用于新的情境，也就是 transfer。一个学习者可以拥有良好的 retention，却仍然只有 fragmented 或 inert knowledge。

因此，互动讲义的目标不是让学习者"看完整章"、记住所有 bullet 或复述定义，而是帮助他形成 integrated、transferable knowledge。设计一个概念时，应当始终考虑最终形成的心理模型是否能够被用于解释新的问题或新的情境。页面的成功标准是理解与迁移，而不是信息覆盖率。
</meaningful-learning-standard>
```

## 1.3 skill 清单（9,221 字符）

53 份技法文档的一句话说明 + 调用方式。**这是系统指令里最大的一块**，
而实测每页真正读的只有规划指派给它的那两三份。

```markdown
下面这些 skill 可以通过 Skill 工具调用,调用后会把那份技法文档的正文给你。
**清单里有对应技法文档的,先读了再动手,不要自己从头摸索一套。**
理由和库一样:每页各自重新试一遍,产出不稳定、也慢。
清单里没有对应的,就自己写,不必硬凑。

- ambient-section-particles: Use when a region should feel like it holds a medium: slow drifting motes with tunable density, downward pull, sideways drift, sway and spin, either recycling forever, leaving, settling into a shallow pile.
- animation-systems: Use when the question is how motion should behave across an entire page rather than how to make one thing move.
- animejs: Use when one motion must be distributed across many elements at once, arriving one after another or rippling outward from the center of a grid.
- atmosphere-background: Use when a dark field needs weather and direction: soft folds of light drifting slowly across the frame like illuminated fabric, overlapping so crossings brighten.
- babylonjs-engine: Use when a three-dimensional scene must also behave: things falling under gravity, colliding, resting, hinged, shoved, picked, with imported rigged figures playing their own motion and controls drawn inside the scene.
- background-grid-webgl: Use when the backdrop should feel like space receding away — a ruled ground plane drifting toward a distant horizon, its lines thinning and dissolving with distance.
- barba-js: Use when a reader moves between separate whole pages and the handover should feel continuous.
- cobejs: Use when a small, continuously turning Earth should sit in a corner or a card as a compact visual anchor, marked with a handful of locations as glowing dots and either drifting on its own or turning under the pointer.
- container-lines: Use when the page's own measurements should be visible — hairline vertical guides standing at the edges of the content column, with tiny exact marks at true corners.
- corner-diagonals: Use when panels, cards, and controls should read as machined or cut rather than softly rounded, with angled corners repeated as one consistent structural language across a page.
- corner-lasers: Use when light should enter the field from one off-center anchor at a corner or edge: two or three thin beams sharing a single origin.
- css-alpha-masking: Use when an element's edge should dissolve into transparency instead of ending on a hard line.
- css-border-gradient: Use when an edge must change colour along its length, so a rim catches light on one side or a directional highlight marks the one panel that matters, which a flat outline cannot express.
- d3-viz: Use when a picture must be computed from data rather than drawn by hand: nodes joined by links, hierarchies, flows, circular relationship rings, grids colored by value.
- design-taste-frontend: Use when a page needs a committed visual direction chosen before layout: reading audience and mood, then fixing type scale, spacing rhythm, one locked accent.
- dither-background: Use when a backdrop should look sampled and quantized: visibly enlarged square cells, a repeating threshold pattern, broad slow-drifting cloud masses in near-black and gray, with edges falling off so one bright mass sits off-center.
- falling-leaves: Use when many small flat objects must tumble on their own axes as they fall — showing a face, thinning to nothing edge-on, opening out again.
- frontend-design: Use when one page's look must be decided rather than defaulted: which palette, which display and body type pairing, what layout, the single element it will be remembered by.
- glass-dark-ui: Use when panels must float translucently over a dark or moving backdrop while the words on them stay fully readable.
- globe-gl: Use when the subject is spread across the real Earth and where a thing sits on the sphere carries the meaning.
- globe-particles: Use when a sphere assembled from thousands of glowing points, slowly turning and tilted inside an orbital ring or flattened disc, should stand in abstractly for a system, a network.
- gooey-blob-system: Use when separate soft shapes must actually merge into one mass and pull apart again — cells dividing, droplets joining, a neck that stretches thin and finally snaps.
- gsap-core: Use when a single value must change over time with exact control over its curve, delay, repetition, direction, and what happens when it finishes.
- gsap-scrolltrigger: Use when a sequence's progress must be steered by a continuously changing value the reader controls — a position, a slider, a page's travel.
- gsap-timeline: Use when several movements must be arranged against each other in time — this one starting slightly before that one ends, three overlapping, a named moment you can jump to.
- lightweight-3d-effects: Use when a page needs a hint of depth without real three-dimensional geometry: a card that tips toward the pointer with layered inner planes and a moving sheen.
- locomotive-scroll: Use when a tall page should glide with weight and inertia instead of jumping line by line, and layers should travel at different speeds so depth is felt while reading.
- lottie-animations: Use when a finished, hand-crafted vector animation should play on the page without anyone re-creating its motion frame by frame, and such an asset exists or can be obtained.
- make-illustration: Use when a page needs a picture of something that has no photograph and no exact geometry — an atmosphere, a setting, a material, a metaphor, a stylised object standing in for an idea.
- marquee-loop: Use when a strip of items, terms, examples, small pictures, tags, should travel across the page endlessly with no visible seam, restart or jump, as one continuous ambient band.
- matterjs: Use when things must fall, collide, swing, stack, topple, settle, or be dragged with convincing weight and momentum in a flat side-on world — a pendulum, a lever, a rope, colliding carts, a pile that collapses.
- mini-game: Use when a concept only lands by doing: a playable unit with one goal, one core action, feedback, a win or lose condition and a reset, delivered as a self-contained embeddable piece that reports its state and result.
- pixijs-2d: Use when a page must animate thousands of tiny elements at once — drifting point fields, sparks, swarms, streaks — and animating that many ordinary page elements would visibly stutter. You author the behaviour yourself.
- pointer-trail-emitter: Use when something must be laid down along the path a pointer travels — a trail, a brush stroke — with the same spacing whether the hand flicks or crawls.
- progressive-blur: Use when blur must grow gradually across a strip so whatever passes beneath dissolves smoothly toward an edge, instead of a hard line where sharp content suddenly becomes soft. Typical uses.
- reveal-hover-effect: Use when two aligned versions of the same picture must be compared by uncovering one through the other under a moving pointer.
- scroll-reveal-libraries: Use when the only motion needed is content becoming visible as it comes into view — fading, sliding, zooming or flipping in, declared per element, with staggered arrival delays if you want a rough cascade.
- skeuomorphic-ui: Use when a control should read as a physical object you could press or turn — a moulded surface catching light along its top edge, darkening below.
- technical-wireframe-info-layout: Use when a whole page should read as an annotated technical plate: the subject pulled apart into separated components with thin routed lines running out to sparse labels and metric.
- theme-factory: Use when a set of separate pages must look like one designed system rather than a run of unrelated experiments.
- threejs-landscape: Use when a subject needs to be standing somewhere: open ground stretching to a horizon, sky above it, grass and stones near the viewer, a time of day that can slide from dawn to night.
- threejs-towers: Use when a structure should build itself on screen in named stages rather than appear finished — tiers stacking, a temporary support frame always one step ahead of the finished work.
- threejs-weather: Use when precipitation must read as real weather across a dimensional scene: rain whose single drops you can follow, a storm that leans with the wind.
- threejs-webgl: Use when the subject genuinely needs three dimensions the reader can orbit around: a structure with real depth, lit surfaces, cast shadows, materials that answer to light, and parts that respond when pointed at.
- vantajs: Use when a section needs a living ambient backdrop chosen from a small catalogue of ready-made looks — rolling waves, drifting fog, a connected net of points, clouds, cells.
- web-access: 所有联网操作必须通过此 skill 处理，包括：搜索、网页抓取、登录后操作、网络交互等。 触发场景：用户要求搜索信息、查看网页内容、访问需要登录的网站、操作网页界面、抓取社交媒体内容（小红书、微博、推特等）、读取动态渲染页面、以及任何需要真实浏览器环境的网络任务。
- web-media-getter: Use when a page needs the real thing rather than an impression of it — a named person, a documented place, an event that happened, a museum object, a specimen, an instrument.
- webgl-3d-object: Use when one object should read as a genuine solid — a form whose lit faces, highlights, edges and cast shadow shift as it slowly turns.
- webgl-laser: Use when one intense beam of light should own the whole field — a needle-thin white-hot core, a narrow coloured halo, and slow-drifting haze that blooms beside it and thins outward.
```

---

# 二 · 例 1：`page-19`

## 2.1 首条用户消息（brief，3,147 字符）

**这就是 harness 唯一直接塞给它的东西。** 注意它几乎全是指针 —— 
`briefs()` 是模板填充，不问模型（全流程唯一不照抄 Claude Code 的一处）。

```markdown
你要构建这套 90 分钟互动讲义《Apeman – Spaceman》中的**第 19 页**,文件是
`/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/page-19.html`(已有空骨架,覆盖它)。

**第一步,先完整读这两份文件,它们是硬约束:**
1. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/CONTRACT.md` —— 页面构建契约
2. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/deck.md` —— 整套 45 页共享的部分:主线、页间归属、数字口径。
3. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/p19.md` —— **你这一页的规格**。照它施工。

规划已经按页拆开了,所以你只需要这两份。**不要去找那份完整的规划**——
上一轮它是一份 67KB 的单文件,17 个 subagent 取了 39 次、16 次整篇,
其中绝大部分内容跟自己那一页无关。

再读 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/assets/theme.css`(版式和组件的类名在里面)。
**底盘的接口在 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/assets/CHASSIS.md`** —— `Deck.*` 的每个方法、三个必须自己给的
CSS token、四个工具类各自什么时候必须加,都在那一份里。契约里不再抄它了
(抄过一轮:一份契约末尾多出 12,802 字符的 CHASSIS 全文,占它的 40%),
所以要认接口就读这一份,别在契约里找。

`Lec` 的接口**已经逐条列在契约里了,带参数名和返回键** —— 照着用就行,
**不要去读 `lec.js` 源码**,那是四万多字符的实现,读它只会挤占你的上下文。
只有在契约里那份接口确实说不清、而你必须弄清某个函数的行为时,才去看它对应的那一段。

**绝对不要读任何其它 `page-*.html`** —— 它们正被其它 agent 并发写着。

页首要调 `Lec.mount({ index: 19, kicker: …, title: …, take: … })` ——
kicker、标题、take 三样在 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/p19.md` 里给定了,照抄,不要自己另起。

**这一页必须先读完下面这些技法文档,再动手**(用 Skill 工具,名字原样传):

  - web-media-getter
  - reveal-hover-effect

这是规划阶段按你这一页交互的真实需要指派的,不是可选项。读完再写代码。

**内容只往 `<main id="main">` 里写。** 骨架里已经有它了。页眉页脚由 `Lec.mount()`
往 `#main` 前后插,三者是兄弟节点、都在流里 —— 所以**不要给页眉页脚或你自己的容器
加 `position: fixed`**,也不要删 `base.css` / `theme.css` 提供的类。

**知识结构:classification**。`theme.css` 为这个结构提供了一套**排版原语**(不只是一个
类名):子元素类名、以及它把哪层关系显式化。先读 `CONTRACT.md` 里那份接口块,
照原语搭,不要自己另拼一套。

那层关系**必须在画面上看得见** —— process 要有可见的箭头或进度轴,不能只是并排的块;
comparison 的同一维度必须在同一行上,两侧不能各排各的;classification 的下位项必须在
上位项的框内或缩进下;generalization 的主张要比支撑重一档。**不要让读者自己在脑子里拼。**

不要用 card、grid、左右分栏这类容器名去定页面结构 —— 那些是容器,不是知识关系。
上一轮不指派结构时 20 页全退回了左右两栏;而只给类名不给原语的那一轮,
48 页里 `k-` 开头的类一次都没被用上、文字叠压 29 处。

这一页的要点、形式、不许碰的东西,全在 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/p19.md` 里,照它做。

**这一页预计停留 130 秒。**内容量要对得上这个时间 —— 少了讲不满,多了讲不完,
也不许靠压小字号、压行高、压间距把超出的内容塞进来。装不下就是规划的问题,
在报告里说清楚,不要自己硬塞。

克制这三条,都是上一轮实物问题反推出来的:

- **同一个关系用一种清晰的交互讲透就够。** 不要用第二种、第三种把同一个结论
  再说一遍 —— 上一轮有一页给同一个变量做了滚轮、竖直拖动、拖游标三条互相冗余的
  输入路径。交互数量不代表更深的认知加工。
- **不要写 AI 式的元评论。** 「小、短、少。第一把尺子给出的答案已经很清楚了。」
  「这个交互帮助你发现……」这类句子是在评论自己怎么教,不是在教。讲义直接完成教学。
- **来源、许可、实现说明不上主画面。** 需要保留就放次级层(`title` 属性、折叠区、
  页脚极小字),或者写进 `assets/img/` 旁边的清单文件。上一轮有 9/17 页把
  「照片:NASA / ESA 哈勃 …… 均为公有领域」直接排进了正文,那是在和教学内容抢注意力。

判一个元素该不该留,就问:**它如果被删掉,读者对核心内容的理解会不会变差?**

你这一页负责的概念,以及别的页各自负责什么,看 `PLAN.md` 第 2 节那张归属表 ——
不要替别的页讲它们负责的东西。同一个概念可以跨连续几页逐步展开,
所以「这一页要不要自成闭环」不由你决定,按规划里给你的那一小步做就行。

骨架已经接好 `base.css` / `theme.css` / `base.js` / `lec.js`,也已经有 `#stage`,
`data-page` / `data-total` 都盖过章 —— 往 `#stage` 里加内容就行,别动这些。

完工前在 `pages/` 目录下跑 `python3 assets/selfcheck.py page-19.html`,
改到干净为止:JS 报错 0、加载失败 0、超出画布 0、被裁元素 0,字号按**契约里那套分层地板**
(纯数字刻度 ≥12px / 控件标签与图注 ≥14px / 正文与说明句 ≥16px / 折行文本行高 ≥1.35 倍)。
注意 selfcheck 只报一个"最小字号",它管不了分层 —— 最小值是 12px 也可能是正文被压到了
12px,那是不合格的。**不允许靠压字号、压行高、压间距把内容塞进一页**,装不下就是内容多了。

只交付 `page-19.html` 这一个文件,不要写任何文档/测试/总结。完成后简短报告你做了什么。
```

## 2.2 它那一页的规格 `plan/p19.md`（946 字符）

brief 里指到这一份，由它自己 Read 进来。
**这一轮把「每个数值连单位和出处都写进来」改成了「只点名用了 `Lec` 的哪几个函数」**，
所以中位从 3,116 字符掉到 929 —— 值留在 `assets/lec.js`，唯一真相只有一处。

```markdown
# page-19 · 颅骨能告诉我们什么 · **130 秒**

Kicker：`READ THE BONE`  
主标题：猜颅骨，不猜聪明

## 知识结构：classification
把关于颅骨的判断分为三层：**可直接观察**、**可测量估计**、**不能由单枚颅骨直接推出**。三联画各用同一套分类槽，学生先判断，再以遮罩揭示颅腔轮廓与答案；层级从“证据本身”走向“解释边界”。

## 表征形式
交互式三联画。每格是带统一比例尺的真实颅骨侧面照片，上层遮罩隐藏标本信息与颅腔轮廓；指针移动时局部揭示对齐的半透明轮廓。下方固定三类判断区，避免把物种排列成进步阶梯。

## 层级里的各项
- 可直接观察：颅骨外形、牙列与可见结构。
- 可测量估计：依据颅腔边界估计容积；结果受保存状态与重建方法影响。
- 不能直接推出：聪明程度、语言能力、社会制度或具体复杂行为。
- 调用 `Lec.K.p19SkullSpecimens`、`Lec.K.p19CranialCapacityRanges`；显示与取整调用 `Lec.P.roundTo`。没有对应条目时不得在页面脚本写死数值。

## 必须点出来的一到三句
颅腔大小可以估计，复杂行为却不能从一枚颅骨直接读出。  
脑容量是证据之一，不是“智力刻度”。

## 交互（只有这一个）
学生为每格选择“观察／估计／不能直接推出”，再移动指针揭开颅腔轮廓与反馈。选“谁最聪明”时不判某件标本胜出，而提示该问题超出单枚颅骨的证据能力；可重置重猜。

## 不许碰
不得把脑容量等同智力，不按颅骨大小排列高低或文明等级；不解释脑增大的原因，不展开手、牙、腿与脑的镶嵌顺序——留给 p20。

## 必用skill
web-media-getter、reveal-hover-effect

## 媒体
取三件来源明确、视角近似且许可可用的真实颅骨标本照片，并准备与照片严格对齐的颅腔遮罩。真实标本用于强调判断来自受损、具体的证据，而非理想化头像；出处与许可仅写入图片 title 或页脚极小字。

## 版面提示
三列等宽，照片尺度和揭示方向一致；分类槽固定在每列底部。物种名与容量信息只在揭示后出现，列序不得暗示从“低”到“高”。
```

---

# 三 · 例 2：`page-12`

## 3.1 首条用户消息（brief，3,120 字符）

**这就是 harness 唯一直接塞给它的东西。** 注意它几乎全是指针 —— 
`briefs()` 是模板填充，不问模型（全流程唯一不照抄 Claude Code 的一处）。

```markdown
你要构建这套 90 分钟互动讲义《Apeman – Spaceman》中的**第 12 页**,文件是
`/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/page-12.html`(已有空骨架,覆盖它)。

**第一步,先完整读这两份文件,它们是硬约束:**
1. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/CONTRACT.md` —— 页面构建契约
2. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/deck.md` —— 整套 45 页共享的部分:主线、页间归属、数字口径。
3. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/p12.md` —— **你这一页的规格**。照它施工。

规划已经按页拆开了,所以你只需要这两份。**不要去找那份完整的规划**——
上一轮它是一份 67KB 的单文件,17 个 subagent 取了 39 次、16 次整篇,
其中绝大部分内容跟自己那一页无关。

再读 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/assets/theme.css`(版式和组件的类名在里面)。
**底盘的接口在 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/assets/CHASSIS.md`** —— `Deck.*` 的每个方法、三个必须自己给的
CSS token、四个工具类各自什么时候必须加,都在那一份里。契约里不再抄它了
(抄过一轮:一份契约末尾多出 12,802 字符的 CHASSIS 全文,占它的 40%),
所以要认接口就读这一份,别在契约里找。

`Lec` 的接口**已经逐条列在契约里了,带参数名和返回键** —— 照着用就行,
**不要去读 `lec.js` 源码**,那是四万多字符的实现,读它只会挤占你的上下文。
只有在契约里那份接口确实说不清、而你必须弄清某个函数的行为时,才去看它对应的那一段。

**绝对不要读任何其它 `page-*.html`** —— 它们正被其它 agent 并发写着。

页首要调 `Lec.mount({ index: 12, kicker: …, title: …, take: … })` ——
kicker、标题、take 三样在 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/p12.md` 里给定了,照抄,不要自己另起。

**这一页必须先读完下面这些技法文档,再动手**(用 Skill 工具,名字原样传):

  - make-illustration

这是规划阶段按你这一页交互的真实需要指派的,不是可选项。读完再写代码。

**内容只往 `<main id="main">` 里写。** 骨架里已经有它了。页眉页脚由 `Lec.mount()`
往 `#main` 前后插,三者是兄弟节点、都在流里 —— 所以**不要给页眉页脚或你自己的容器
加 `position: fixed`**,也不要删 `base.css` / `theme.css` 提供的类。

**知识结构:enumeration**。`theme.css` 为这个结构提供了一套**排版原语**(不只是一个
类名):子元素类名、以及它把哪层关系显式化。先读 `CONTRACT.md` 里那份接口块,
照原语搭,不要自己另拼一套。

那层关系**必须在画面上看得见** —— process 要有可见的箭头或进度轴,不能只是并排的块;
comparison 的同一维度必须在同一行上,两侧不能各排各的;classification 的下位项必须在
上位项的框内或缩进下;generalization 的主张要比支撑重一档。**不要让读者自己在脑子里拼。**

不要用 card、grid、左右分栏这类容器名去定页面结构 —— 那些是容器,不是知识关系。
上一轮不指派结构时 20 页全退回了左右两栏;而只给类名不给原语的那一轮,
48 页里 `k-` 开头的类一次都没被用上、文字叠压 29 处。

这一页的要点、形式、不许碰的东西,全在 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/ape-g7/pages/plan/p12.md` 里,照它做。

**这一页预计停留 40 秒。**内容量要对得上这个时间 —— 少了讲不满,多了讲不完,
也不许靠压小字号、压行高、压间距把超出的内容塞进来。装不下就是规划的问题,
在报告里说清楚,不要自己硬塞。

克制这三条,都是上一轮实物问题反推出来的:

- **同一个关系用一种清晰的交互讲透就够。** 不要用第二种、第三种把同一个结论
  再说一遍 —— 上一轮有一页给同一个变量做了滚轮、竖直拖动、拖游标三条互相冗余的
  输入路径。交互数量不代表更深的认知加工。
- **不要写 AI 式的元评论。** 「小、短、少。第一把尺子给出的答案已经很清楚了。」
  「这个交互帮助你发现……」这类句子是在评论自己怎么教,不是在教。讲义直接完成教学。
- **来源、许可、实现说明不上主画面。** 需要保留就放次级层(`title` 属性、折叠区、
  页脚极小字),或者写进 `assets/img/` 旁边的清单文件。上一轮有 9/17 页把
  「照片:NASA / ESA 哈勃 …… 均为公有领域」直接排进了正文,那是在和教学内容抢注意力。

判一个元素该不该留,就问:**它如果被删掉,读者对核心内容的理解会不会变差?**

你这一页负责的概念,以及别的页各自负责什么,看 `PLAN.md` 第 2 节那张归属表 ——
不要替别的页讲它们负责的东西。同一个概念可以跨连续几页逐步展开,
所以「这一页要不要自成闭环」不由你决定,按规划里给你的那一小步做就行。

骨架已经接好 `base.css` / `theme.css` / `base.js` / `lec.js`,也已经有 `#stage`,
`data-page` / `data-total` 都盖过章 —— 往 `#stage` 里加内容就行,别动这些。

完工前在 `pages/` 目录下跑 `python3 assets/selfcheck.py page-12.html`,
改到干净为止:JS 报错 0、加载失败 0、超出画布 0、被裁元素 0,字号按**契约里那套分层地板**
(纯数字刻度 ≥12px / 控件标签与图注 ≥14px / 正文与说明句 ≥16px / 折行文本行高 ≥1.35 倍)。
注意 selfcheck 只报一个"最小字号",它管不了分层 —— 最小值是 12px 也可能是正文被压到了
12px,那是不合格的。**不允许靠压字号、压行高、压间距把内容塞进一页**,装不下就是内容多了。

只交付 `page-12.html` 这一个文件,不要写任何文档/测试/总结。完成后简短报告你做了什么。
```

## 3.2 它那一页的规格 `plan/p12.md`（671 字符）

brief 里指到这一份，由它自己 Read 进来。
**这一轮把「每个数值连单位和出处都写进来」改成了「只点名用了 `Lec` 的哪几个函数」**，
所以中位从 3,116 字符掉到 929 —— 值留在 `assets/lec.js`，唯一真相只有一处。

```markdown
# page-12 · 身体不是整套升级 · **40 秒**

Kicker：`II · 身体先改变`

主标题：身体各部分，各有自己的变化时钟

## 知识结构：enumeration
用同一人体轮廓中的并列分层，把骨盆与腿、足、手与牙、脑列为不同变化线索。各层不画成阶段阶梯，也不以箭头暗示同步升级；仅以分离的色层和短标签提示后续将逐项考察“何时改变、如何改变”。

## 表征形式
静态章节转场：一个正面人体轮廓由半透明解剖色层叠合而成。各层略微错位展开，但仍共同组成一个身体，建立“同一身体、多个变化部分”的心理表征。

## 并列的各项
- 骨盆与腿：支撑与行走
- 足：接触地面
- 手与牙：操作与取食线索
- 脑：变化时间不能由直立直接推出

本页不显示年代或测量值，不调用 `Lec.K` 常量或 `Lec.P` 函数。

## 必须点出来的一到三句
下一步不问人类“何时成人”，而问身体各部分何时、如何分别改变。  
这些变化并不同步，也不是一次完成的整套升级。

## 交互（只有这一个）
无 —— 这一页只承担章节过渡。

## 不许碰
不重复共同祖先、分类包含关系、化石谱系、分叉树或灌木图；不展示物种节点与谱系连线。骨盆、腿、足、手、牙和脑只作后续问题索引，不提前解释结构机制、年代顺序或演化原因。

## 必用skill
make-illustration

## 媒体
生成一幅非写实、非“猿到人队列”式的分层人体轮廓。保持单一站立姿态，用有限色层区分身体部分；不得加入进步阶梯、物种序列、火箭或未来人意象。
```

---

# 四 · 两页都会读到的共享文件

## `plan/deck.md`（10,305 字符）

整套共享的部分：主线、证据链、页表、页间归属、数字口径。
**它现在是每页共享文本里最大的一项（10,305 字符）** —— 下一步该做的「给每页切 deck 片」就是治它。

```markdown
# 《Apeman – Spaceman：仍是猿，已经抵达太空》90 分钟互动讲义 · 总规划

## 0. 这套讲义的主线

人类从来没有“脱离猿类、升级为太空物种”；直立身体、累积文化和协作系统层层叠加，才让一种依然脆弱的猿类暂时越过了地球边界。

| 章 | 页 | 这一章要让读者信什么 |
|---|---|---|
| I　我们从未离开猿类 | 01–11 | 人类是现生猿类的一支；演化是分叉、混合与镶嵌变化，不是从低到高的队列 |
| II　身体先改变 | 12–22 | 双足行走、手、牙齿、脑并未同步升级；直立早于大脑显著增大 |
| III　文化跑得比基因快 | 23–33 | 火、工具、语言与制度依靠跨代累积，使个人借用无数前人的能力 |
| IV　把一只猿送出地球 | 34–44 | 航天不是身体进化的必然终点，而是能源、计算、组织与生命保障共同维持的短暂例外 |
| V　回望这条路 | 45 | “太空人”仍是依赖文化、群体与地球生态系统的猿类 |

E1　人类属于猿类；共同祖先关系应画成分叉树，而不是“猿变成人”的直线。

E2　人类特征以不同速度出现：双足行走远早于大脑显著增大，演化没有预先写好的太空终点。

E3　工具、火、语言和制度能够跨代累积；一个人使用的是许多代人共同保存的能力。

E4　进入太空取决于能量、速度、材料、计算、分工和生命保障组成的系统，而不是某个“航天基因”。

E5　太空环境会迅速暴露人体的旧适应；人类离开地球时仍必须携带一个微缩的地球环境。

无交互（只承担开场/推进/过渡/收束）：01 02 12 23 34 45

## 1. 页表（一行一页，这张表是全套的骨架）

| # | 幕 | 证据 | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 | 版式 | 表征形式 | 必用skill |
|---|---|---:|---:|---|---|---|---|---|---|---|
| 01 | I | — | 10 | generalization | 无 | 一种仍属于猿类的动物，已经在月球留下脚印 | 不讲证据链（p02） | focus | 真实照片：月面脚印与人足剪影 | web-media-getter、theme-factory |
| 02 | I | — | 45 | enumeration | 无 | 全课沿“谱系—身体—文化—航天系统—脆弱性”推进 | 不展开共同祖先（p04–06） | ledger | 静态路线图 | design-taste-frontend |
| 03 | I | E1 | 130 | comparison | 先画你的进化图 | 学生最熟悉的“猿到人队列”会暗示不存在的方向与等级 | 不讲正确谱系细节（p04） | stage-cards | 学习者作答：排列六张轮廓卡 | mini-game、konva.min.js |
| 04 | I | E1 | 130 | process | 展开共同祖先树 | 人类与黑猩猩共享祖先，不是由现生黑猩猩变来 | 不讲化石年代（p07） | canvas-full | 可展开分叉树 | d3-viz |
| 05 | I | E1 | 140 | classification | 点选谁属于猿类 | “猿类”是包含人类的生物分类，不是对“未进化者”的俗称 | 不讲双足结构（p13–16） | triptych | 标本照片分类与即时反馈 | web-media-getter、mini-game |
| 06 | I | E1 | 130 | comparison | 拖齐骨架同源部位 | 人、黑猩猩和长臂猿的身体差异建立在大量同源结构之上 | 不推断生活方式（p15） | split-lr | 带标注骨架照片与拖拽叠合 | web-media-getter、konva.min.js |
| 07 | I | E1 | 120 | process | 拖时间压缩尺 | 数百万年尺度会让“祖先”“近亲”和“我们小时候”显得过分接近 | 不讲脑容量趋势（p18–20） | split-tb | 可缩放时间轴 | d3-viz、gsap-scrolltrigger |
| 08 | I | E1 | 130 | enumeration | 拼化石证据包 | 牙齿、骨盆、足迹和年代测定共同支持推断，没有单块“答案骨头” | 不裁定唯一物种归属（p09） | stage-cards | 化石照片证据卡 | web-media-getter、mini-game |
| 09 | I | E1 | 140 | classification | 给化石贴置信度 | 化石分类包含不确定性，同一证据可能支持多个近缘位置 | 不把不确定性说成“什么都不知道”（p10） | ledger | 可排序证据账本 | d3-viz |
| 10 | I | E1 | 130 | generalization | 改画分叉灌木 | 人类演化更像枝条繁茂、部分交汇的灌木，而非单列阶梯 | 不讲基因交流细节（p11） | canvas-full | 可编辑谱系网络 | d3-viz、konva.min.js |
| 11 | I | E1 | 130 | comparison | 找出阶梯陷阱 | 图像的构图本身会偷偷加入“更高、更好、更现代”的价值判断 | 不进入身体变化顺序（p12） | triptych | 三种演化图式判读 | reveal-hover-effect |
| 12 | II | — | 40 | enumeration | 无 | 下一步不问“何时成人”，而问身体各部分何时、如何分别改变 | 不重复谱系树（p04–10） | focus | 静态章节转场：分层人体轮廓 | make-illustration |
| 13 | II | E2 | 130 | process | 旋转骨盆模型 | 短而宽的骨盆帮助躯干在单腿支撑时保持稳定 | 不讲分娩代价（p21） | canvas-full | 可旋转三维骨盆 | threejs-webgl |
| 14 | II | E2 | 140 | comparison | 切换股骨角度 | 膝部靠近身体中线，使双足步行时重心不必左右大幅摆动 | 不讲足弓（p16） | split-lr | 动态骨骼力线示意 | threejs-webgl |
| 15 | II | E2 | 130 | process | 平衡走路挑战 | 双足步行不是“少两条腿”，而是连续控制支撑面与重心 | 不计算肌肉力矩（本课不展开） | canvas-full | 可玩的侧向平衡小游戏 | mini-game、matterjs |
| 16 | II | E2 | 130 | classification | 配置一只脚 | 足弓、短趾和对齐的大趾构成适合长距离步行的组合 | 不宣称单一结构决定双足（p17） | stage-cards | 可拖拽足部结构模型 | konva.min.js |
| 17 | II | E2 | 130 | generalization | 运行步行代价赛 | 不同身体组合会改变稳定性与能量代价，但不存在万能“最佳身体” | 不引入微积分优化（本课不展开） | split-tb | 参数化步行模拟 | matterjs、mini-game |
| 18 | II | E2 | 140 | comparison | 对齐身体与脑时间线 | 明确双足证据出现后，脑容量仍在很长时间里接近早期范围 | 不解释脑为何增大（p20） | ledger | 可交互双轨时间图 | d3-viz |
| 19 | II | E2 | 130 | classification | 猜颅骨不猜聪明 | 颅腔大小可以估计，复杂行为不能仅凭一枚颅骨直接读出 | 不把脑容量等同智力（p20） | triptych | 颅骨照片与遮罩揭示 | web-media-getter、reveal-hover-effect |
| 20 | II | E2 | 130 | generalization | 重排特征出现顺序 | 手、牙、腿和脑呈镶嵌式变化，“先站立再变聪明”也只是粗略摘要 | 不讲文化累积机制（p24–28） | stage-cards | 特征年代排序任务 | mini-game、konva.min.js |
| 21 | II | E2 | 120 | comparison | 调节分娩权衡 | 骨盆承担步行、支撑与分娩等多重约束，演化结果常是折中 | 不宣称存在单一“产科困境”解释（本课不展开） | split-lr | 可操作剖面模型 | konva.min.js |
| 22 | II | E2 | 140 | process | 改写目的论句子 | “为了使用工具而站起来”把后来结果误写成了早先目的 | 不进入文化传递实验（p24） | ledger | 学习者改写与因果排序 | mini-game |
| 23 | III | — | 45 | enumeration | 无 | 身体变化以世代计，文化却能在一次教学中跨过许多代试错 | 不讲具体传递机制（p24） | focus | 静态章节转场：一只手递出火种 | make-illustration |
| 24 | III | E3 | 130 | process | 独自复制折纸 | 单靠观察会丢失步骤；示范、纠错和语言能提高传递保真度 | 不推广到全部文化（p25–26） | stage-cards | 多轮复制小游戏 | mini-game |
| 25 | III | E3 | 140 | comparison | 运行传话链 | 文化传递既会累积改进，也会产生偏差、简化与偶然漂变 | 不讲自然选择数学模型（本课不展开） | split-tb | 可复现随机传递模拟 | seedrandom.min.js、d3-viz |
| 26 | III | E3 | 130 | generalization | 搭累积棘轮 | 一旦改进能被可靠保存，下一代就能从前人的终点继续 | 不讲语言起源年代（p29） | canvas-full | 可拖拽棘轮隐喻 | matterjs、mini-game |
| 27 | III | E3 | 130 | classification | 给工具读功能 | 石器形状提供制造与使用线索，但名称不等于唯一用途 | 不用单件石器代表整个物种（p28） | split-lr | 真实石器照片与热点标注 | web-media-getter |
| 28 | III | E3 | 140 | process | 敲出石片 | 打击点、角度与力度共同决定石片是否剥离，技术需要身体练习 | 不提供危险实物敲击指导（本课不展开） | canvas-full | 二维断裂近似模拟 | matterjs、mini-game |
| 29 | III | E3 | 130 | comparison | 有词无词协作 | 共享符号能降低协调成本，但复杂协作不必等待完整现代语言 | 不宣称确定语言诞生日期（本课不展开） | triptych | 两轮团队指令任务 | mini-game |
| 30 | III | E3 | 130 | process | 维持一团火 | 火需要燃料、氧气、知识与持续照料；“会用火”是一套实践 | 不讲最早用火争议细节（p31） | split-lr | 燃烧状态操作模型 | mini-game、animation-systems |
| 31 | III | E3 | 130 | classification | 审判最早用火证据 | 烧骨、灰层、炉址与自然火各有不同证明力度 | 不把最早日期写成定论（p32） | ledger | 证据权重判定 | web-media-getter、d3-viz |
| 32 | III | E3 | 120 | comparison | 压缩创新年代 | 旧石器时代绝大部分时间远长于农业、工业和航天时代之和 | 不说变化速度始终单调加快（p33） | split-tb | 可缩放历史时间带 | d3-viz |
| 33 | III | E3 | 140 | generalization | 组装群体大脑 | 没有人独自掌握火箭全部知识；制度把分散专长接成可行动系统 | 不讲火箭物理（p35–39） | stage-cards | 可连线专长网络 | d3-viz、mini-game |
| 34 | IV | — | 40 | enumeration | 无 | 从文化进入航天：问题不再是“谁最聪明”，而是谁能维持完整系统 | 不讲轨道机制（p35–37） | focus | 真实照片：任务控制中心与宇航员 | web-media-getter |
| 35 | IV | E4 | 130 | comparison | 掷球进入轨道 | 轨道不是关闭重力，而是物体下落时持续错过地面 | 不讲逃逸速度（p38） | canvas-full | 可操作轨道物理模拟 | threejs-webgl、mini-game |
| 36 | IV | E4 | 140 | process | 调整轨道速度 | 同一高度下，过慢会坠落、合适会绕行、过快会进入更高轨道 | 不讲火箭分级（p39） | split-lr | 三维地球与实时轨迹 | threejs-webgl |
| 37 | IV | E4 | 130 | classification | 识别失重误区 | 轨道舱内的“失重”主要来自舱与人体共同自由落体 | 不讲长期生理效应（p41） | triptych | 三场景分类与动态示意 | threejs-webgl |
| 38 | IV | E4 | 140 | comparison | 比较世界逃逸门槛 | 逃离天体所需速度取决于天体质量与半径，不取决于火箭“想飞多高” | 不推导公式（本课不展开） | split-tb | 可交互天体比较图 | echarts.min.js |
| 39 | IV | E4 | 130 | process | 造一枚分级火箭 | 携带燃料本身也要燃料，分级通过抛弃空结构改善质量比 | 不讲发动机化学细节（p40） | canvas-full | 分级火箭小游戏 | mini-game、matterjs |
| 40 | IV | E4 | 130 | enumeration | 给任务配系统 | 推进、制导、通信、电力、热控与结构缺一项都可能使任务失败 | 不讲人体生理（p41–42） | ledger | 故障预算与系统配对 | mini-game |
| 41 | IV | E5 | 140 | process | 运行微重力身体 | 骨、肌肉与体液会对长期低负荷环境产生可观察变化 | 不把变化描述成即时或不可逆（p42） | split-lr | 动态人体状态模型 | animation-systems、make-illustration |
| 42 | IV | E5 | 130 | classification | 配置生命保障循环 | 呼吸、水、温度、废物与压力必须形成受监测的物质循环 | 不把空间站说成完全封闭生态系统（p43） | canvas-full | 可连管路生命保障模型 | d3-viz、mini-game |
| 43 | IV | E5 | 130 | comparison | 算补给断点 | 乘员、任务时长与回收效率会迅速改变所需携带的水、氧和食物 | 不设计具体载人任务（p44） | ledger | 可交互资源账本 | echarts.min.js |
| 44 | IV | E4 | 140 | generalization | 审批一次火星任务 | 技术可行、风险、成本、公平与科学收益是不同问题，不能压成一个分数 | 不替学生给出唯一伦理答案（p45） | stage-cards | 多角色决策小游戏 | mini-game、d3-viz |
| 45 | V | — | 60 | comparison | 无 | 从分叉谱系到生命保障，太空人始终是一只借助累积文化并携带地球条件的猿 | 不开启星际殖民新主题（本课结束） | focus | 静态综合图：脚印、谱系、火种、轨道与生命环 | technical-wireframe-info-layout |

## 2. 页间不重复的硬约定

| 概念或形式 | 唯一展开页 | 职责边界 |
|---|---|---|
| “人类属于猿类”的分类含义 | 04–06 | p04 讲共同祖先；p05 讲分类包含关系；p06 只讲同源结构 |
| 线性进化图的误导 | 03、10–11 | p03 暴露先入图式；p10 建立分叉替代表征；p11 识别视觉价值判断 |
| 化石证据与不确定性 | 08–09 | p08 组装多类证据；p09 只处理置信度与竞争性解释 |
| 演化时间尺度 | 07、18、32 | p07 建立百万年尺度；p18 对齐身体与脑；p32 比较文化时代长度 |
| 双足行走结构 | 13–17 | p13 骨盆；p14 股骨与膝；p15 动态平衡；p16 足部；p17 综合代价 |
| 脑容量 | 18–20 | p18 只讲时间关系；p19 限制从颅骨到行为的推断；p20 放回镶嵌演化 |
| 演化折中 | 21 | 只在此页集中处理多重约束，不在其他页泛称“完美适应” |
| 目的论语言 | 22 | 只在此页集中改写“为了……所以进化”的句式 |
| 文化传递机制 | 24–26 | p24 保真度；p25 偏差与漂变；p26 累积棘轮 |
| 石器 | 27–28 | p27 读证据与功能限制；p28 体验制造动作，不重复年代谱系 |
| 语言与协作 | 29 | 不承担语言起源断代，只比较协调条件 |
| 火 | 30–31 | p30 讲维持火的实践系统；p31 讲考古证据强弱 |
| 群体知识网络 | 33 | 只在此页建立“分布式专长”，p40 改讲航天器子系统 |
| 轨道三维场景 | 35–37 | p35 建立持续下落直觉；p36 调速度看轨迹；p37 解释共同自由落体 |
| 逃逸速度 | 38 | 只比较天体，不推导公式、不与轨道速度混写 |
| 火箭分级小游戏 | 39 | 全套唯一火箭建造游戏，只处理质量比与抛弃空级 |
| 航天系统清单 | 40 | 只讲工程子系统依赖，不重复 p33 的人员专长网络 |
| 微重力人体 | 41 | 只讲骨、肌、体液的方向性变化，不重复 p37 的失重物理 |
| 生命保障 | 42–43 | p42 讲循环结构；p43 讲资源数量与回收效率 |
| 航天伦理决策 | 44 | 只在此页出现角色权衡与任务审批，不把伦理答案写进物理页 |
| 真实化石与标本照片 | 05、06、08、19、27、31 | 各页只取承担证据作用的对象；不得以装饰性“原始人”插画替代 |
| 可编辑谱系网络 | 10 | 全套只出现一次；其他谱系图只读或展开，不再允许自由编辑 |
| 物理模拟 | 15、28、35–36、39 | p15 平衡；p28 断裂近似；p35–36 轨道；p39 分级，状态量与胜负条件互不复用 |
| 资源账本 | 43 | 只在此页计算消耗与回收；p40 的账本只做故障依赖，不显示补给数量 |
| 全课综合图 | 45 | 只回收 E1–E5，不新增殖民、外星生命或未来主义内容 |

## 3. 数字口径

| 关键数值或口径 | 全套统一写法 | 页面调用约定 |
|---|---|---|
| 地球年龄 | 约 45.4 亿年 | 基准值取 `Lec.K`；页面不得另写局部常量 |
| 人类与黑猩猩谱系分开时间 | 约 700万—600 万年前；以范围表示，不写单一“生日” | 范围端点取 `Lec.K`；时间位置用 `Lec.P.mapTimeline` |
| 拉埃托利足迹年代 | 约 366 万年前 | 年代取 `Lec.K`；压缩位置用 `Lec.P.timelineFraction` |
| 南方古猿阿法种常用年代范围 | 约 390万—290 万年前 | 范围取 `Lec.K`；不得由页面自行四舍五入成单点 |
| 属于人属的早期化石时间 | 至少约 280 万年前；注明归属仍有讨论 | 数值取 `Lec.K`，文案保留“至少”“约” |
| 智人出现时间 | 约 30 万年前 | 数值取 `Lec.K`；与“行为现代性”不得视为同一日期 |
| 农业出现时间 | 多地独立发生；最早约 1.2 万年前 | 年代取 `Lec.K`；时间压缩用 `Lec.P.compressHistoryToYear` |
| 首次载人进入太空 | 1961 年 | 年份取 `Lec.K`；间隔用 `Lec.P.elapsedYears` |
| 首次载人登月 | 1969 年 | 年份取 `Lec.K`；不得写成“人类永久离开地球” |
| 地球平均半径 | 约 6371 km | 常量取 `Lec.K`；轨道半径用 `Lec.P.orbitRadiusFromAltitude` |
| 地球质量 | 约 5.972 × 10²⁴ kg | 常量取 `Lec.K`；不得在页面脚本另设近似值 |
| 地表重力加速度 | 约 9.81 m/s² | 常量取 `Lec.K`；重量用 `Lec.P.weight` |
| 近地轨道典型高度 | 约 400 km，仅作空间站量级示例 | 高度取 `Lec.K`；不得暗示全部近地轨道都为 400 km |
| 近地轨道速度 | 约 7.7 km/s，随轨道半径变化 | 用 `Lec.P.circularOrbitVelocity` 实时计算 |
| 地球逃逸速度 | 地表附近约 11.2 km/s | 用 `Lec.P.escapeVelocity` 计算，不写死显示结果 |
| 轨道周期 | 400 km 高度量级约 90 分钟 | 用 `Lec.P.orbitalPeriod` 计算并按统一规则取整 |
| 重力随天体变化 | 由质量与半径共同决定 | 用 `Lec.P.surfaceGravity`，不得只按天体大小排序 |
| 火箭质量比 | 由目标速度增量和比冲共同决定 | 用 `Lec.P.rocketMassRatio`；反算速度增量用 `Lec.P.rocketDeltaV` |
| 人体呼吸次数 | 由每分钟呼吸次数与任务时长计算 | 用 `Lec.P.breaths`；默认呼吸率取 `Lec.K` |
| 人体心跳次数 | 由每分钟心率与任务时长计算 | 用 `Lec.P.heartbeats`；默认心率取 `Lec.K` |
| 每日食物能量 | 输入以 kcal 展示，内部统一换算为 J | 用 `Lec.P.dailyEnergyJoules` |
| 水、氧、食物消耗 | 采用教学用平均值，并明确实际需求随活动、环境和个体变化 | 各基准值取 `Lec.K`；比例用 `Lec.P.ratio`、`Lec.P.percent` |
| 回收效率 | 统一显示为 0%–100%，不得把 100% 设为现实默认 | 用 `Lec.P.clamp` 限定输入，用 `Lec.P.percent` 显示 |
| 时间单位 | 深时统一用“年前”；历史事件统一用公历年份 | 换算用 `Lec.P.elapsedYears`、`Lec.P.generations` |
| 距离单位 | 人体尺度用 m，地表与轨道用 km，天文距离按需要换算 | 用 `Lec.P.convert`；比例模型用 `Lec.P.scaleDistance` |
| 图表取整 | 年代保留与证据精度一致的有效位；模拟读数最多两位小数 | 统一用 `Lec.P.roundTo` |
| 随机模拟 | 同一页面、同一种子必须得到同一批结果 | 使用 `seedrandom.min.js`；种子按 `page-NN` 命名 |
| ECharts 字号与渲染 | 所有图表使用 SVG；全局正文不低于 16px，词句标签不低于 14px | `echarts.init(...,{renderer:'svg'})`，不得使用默认 canvas |
```

## `CONTRACT.md`（5,346 字符）

**这一轮从 13,549 字符降到 5,346。** 原来它末尾会把整份 `CHASSIS.md` 抄一遍（有一轮 12,802 字符，占 40%）——现在改成指路，底盘接口由每页自己读 `assets/CHASSIS.md`。

````markdown
# 页面构建契约

## 1. 工作边界

1. 只创建或修改分配给你的 `page-NN.html`。
2. 绝不读取、复制、比较或修改任何其他 `page-*.html`。
3. 可读取且必须遵守：`PLAN.md`、本文件、`assets/theme.css`、`assets/lec.js`、`assets/CHASSIS.md`、`assets/lib/LIBS.md`，以及任务对应的 Skill 技法文档。
4. 不修改 `assets/` 中任何文件，不新建 CSS、JS、图片、测试或说明文件。
5. 页面必须自包含；以 `file://` 直接打开即可显示并交互。资源只用相对路径，禁止 CDN、网络请求和服务端依赖。
6. 最终只交付该 HTML 文件，不写文档、测试、总结或变更说明。

## 2. 固定 HTML 骨架

保留 harness 已建骨架，只改 `NN`、页面标题与 `#stage` 内正文；按需增加本地库引用，但不得删改或重排底盘、主题引用：

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>页面标题</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
  <!-- 按需在此引用库的 CSS -->
</head>
<body data-page="NN" data-total="45">
  <div id="stage">
    <!-- 本页正文 -->
  </div>

  <!-- 按需在此引用库的 JS；依赖在前 -->
  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>
  <script>
    Lec.mount({
      index: NN,
      kicker: "PLAN.md 规定的栏目短语",
      title: "页面标题",
      take: "本页一句话结论"
    });

    // 本页初始化
  </script>
</body>
</html>
```

库必须在使用它的脚本之前加载；有依赖的库按 `assets/lib/LIBS.md` 顺序加载。`base.js`、`lec.js` 的既有位置与顺序不变。

页面只往 `#stage` 添加内容。页眉、页脚和主区由 `Lec.mount()` 生成，类名固定为 `.lec-header`、`.lec-footer`、`.lec-main`，并复用 `#main`。不得重复生成、改名、覆盖定位或改写外观。其占位高度以 `theme.css` 为准。

底盘接口只读 `assets/CHASSIS.md`，不得自行猜测或复制实现。

## 3. 内容与版面预算

以最终渲染状态计，所有限制均为硬限制：

- 画布：1600×900。
- 画面占用比：≥45%。
- 页面文本块总数：20–70 个；标题、正文、按钮、标签、图注、刻度、图例、读数、提示和 SVG 图表文字全部计入。
- 正文说明：120–360 个汉字；标题、刻度、按钮和纯数字读数不计。超过 360 字必须删减或拆页。
- 可操作控件：1–6 个；按钮、滑块、选择框、输入框、可拖对象和独立热点均计入。纯展示页可为 0，但不得把装饰冒充控件。
- 同时常驻的独立读数：≤6 个。
- 单个说明句原则上 ≤35 个汉字；超过则拆句。
- 同一信息不得在标题、图注、卡片和提示中重复陈述。

低于 45% 占用比或少于 20 个文本块时，应增加有教学意义的结构、维度、过程或对照；不得靠放大字号、拉大间距或堆装饰撑满。超过预算时应删减、合并或按 `PLAN.md` 反馈需拆页；禁止缩字号、压行高、裁切或藏字。

默认用 flex。只有矩阵、维度表等确需二维对齐时才用 grid。需要计算坐标才能对齐时改结构：拖拽用 `transform` 偏移并保留正常流位置；刻度与控件拆成明确区块；不得用反复试算的 `left/top` 凑齐。

禁止在缩放舞台内使用 `position:fixed`；需固定于内容区时用相对容器内的 `position:absolute`。

## 4. 字体与语言

逻辑画布中的字号下限：

- 纯数字刻度：≥12px。
- 含词句的刻度、标签、图注、图例、轴名：≥14px。
- 正文、提示、按钮、读数说明、tooltip：≥16px。
- 正文行高：≥1.35。
- KaTeX 基准字号：统一 ≥20px。

1600×900 舞台在 1366×768 屏幕上的缩放约为 `min(1366/1600,768/900)≈0.853`。因此逻辑字号会约缩为 85%；上述下限不得再降低。

受众为大学一年级通识课学生，文理混合，不假定微积分、生物学或其他专业基础：

- 首次出现的术语必须就地用一句通俗中文解释。
- 不用未解释的缩写、符号、学科黑话或公式步骤跳跃。
- 先给可观察现象或问题，再给术语和结论。
- 公式必须同时说明符号代表什么、结果意味着什么；不得只展示推导。
- 提示语使用直接、平等的课堂口吻，如“拖动看看”“比较两种情况”；不用命令、责备、卖萌或考试式口气。
- 页面应适合教师带讲，也能让学生课后独立重看；关键结论不能只靠教师口头补充。
- 文案必须在所有允许的交互状态下成立，不能依赖一次随机结果。

## 5. 主题与结构

1. 所有颜色、字体、圆角、阴影、边框和间距从 `theme.css` 的现有变量或类取得，不自创另一套视觉系统。
2. 不写与主题竞争的全局重置，不覆盖 `body`、`.lec-header`、`.lec-footer`、`.lec-main` 的主题规则。
3. 不删除底盘或主题提供的类，包括 `lec-root`、`lec-page`、`min0`、`cv-fill`；不得覆盖这些类的定位、尺寸或溢出规则。
4. 页面内容不得侵入页眉页脚，不得通过负 margin、transform 或绝对定位绕过内容区。
5. 装饰不能成为主要占用面积；每个卡片、图形和动画都必须承担解释、比较、操作或反馈功能。

## 6. 数字、数据与计算

1. 页面出现的计算结果、比例、单位换算、进度和物理量一律调用 `Lec.P` 得到，不得把结果数字写死。
2. 可写输入常量和现实给定值；由这些值导出的数字必须实时计算。
3. 页码进度使用 `Lec.P.progress` 或 `Lec.P.progressPercent`。
4. 交互后的读数必须由当前状态重新计算，不得用预录帧、假数据或分支文本冒充。
5. 随机样本、抽样和随机初态必须引用 `seedrandom.min.js`，使用固定种子，建议 `page-NN`；禁止 `Math.random()`。
6. 页面显示值与讲解值必须来自同一数据源及同一舍入规则。

## 7. 库与技法

动手前先查 `assets/lib/LIBS.md`；版本以该文件为准，不去压缩库内查版本。已有库能完成的呈现工作，禁止从底层重写：

- 常规坐标轴、刻度、图例、折线、柱、散点、面积、饼、热力图：ECharts。
- 可拖拽、需命中检测的二维场景：Konva。
- 三维场景：Three。
- 下落、碰撞、摆动、堆叠、物理约束：Matter。
- 节点连线、数据绑定矢量图：D3。
- 成千上万元素同时运动：Pixi。
- 多动画时间线：GSAP。
- 数学公式：KaTeX。
- 矩阵运算：ml-matrix。
- 页面实时训练小型二分类网络：`mlp.js`。
- 预训练模型、真实图片卷积或必须使用 GPU 的大矩阵：TensorFlow.js。

ECharts 必须：

```js
var chart = echarts.init(el, null, {renderer: "svg"});
```

并显式设置全局正文 ≥16px、词句标签/图例/轴名 ≥14px、纯数字刻度 ≥12px、tooltip ≥16px。

Konva 用于图形、拖拽和命中；普通文字标签用绝对定位的 DOM 叠加。仅无法脱离图形变换的短标注可用 `Konva.Text`，且显式满足字号下限。

KaTeX 必须同时引用本地 `katex.min.css` 与 `katex.min.js`，基准字号 ≥20px。

Three 必须先于 Globe 或 Vanta；GSAP 必须先于 ScrollTrigger。其他库依赖和精确版本按 `assets/lib/LIBS.md`。

需要清单外的新库时，仅在确无现有库可用时下载到 `pages/` 下并本地引用；禁止 CDN。

任务清单有对应 Skill 技法文档时，必须先用 Skill 阅读再实现；没有对应文档才自行实现。

## 8. Canvas、缩放与动画

1. 原生 canvas 一律用 `Deck.fit` 或 `Deck.autofit` 处理逻辑尺寸、高分屏和外层缩放。
2. 原生 canvas 指针坐标一律用 `Deck.pt`。
3. 动画循环一律用 `Deck.loop`。
4. canvas 取主题颜色一律用 `Deck.rgb` 或 `Deck.rgba`。
5. 禁止自行实现 `devicePixelRatio` 缩放、`getBoundingClientRect` 坐标换算或 `requestAnimationFrame` 主循环。
6. Konva 指针使用其舞台坐标接口，不再叠加自写换算。
7. 容器尺寸变化后必须同步更新 canvas、图表或三维渲染器；不得拉伸位图代替重绘。
8. 所有持续动画必须提供 `prefers-reduced-motion: reduce` 分支：停止自动循环或改为静态终态，核心信息仍完整可见。
9. 页面离开、暂停或组件销毁时停止循环、计时器和监听器。
10. TensorFlow.js 每步使用 `tf.tidy()` 或显式 `dispose()`；张量数不得持续增长。

## 9. 交互标准与无障碍

真交互必须同时满足：

- 用户能通过按钮、键盘、滑块、选择、拖动或点击改变一个有教学意义的变量或状态。
- 画面与数值反馈立即反映该状态。
- 反馈帮助比较、验证、预测或解释本页概念。
- 可重置到确定初态。
- 所有允许状态下无错误、无失真文案、无元素溢出。

仅 hover 发光、指针跟随、自动播放、入场淡入、背景粒子、卡片倾斜或无结果的点击均属装饰，不算交互。

所有操作必须键盘可达：

- 使用原生 `button`、`input`、`select` 优先。
- 自定义可操作元素必须有正确 `tabindex`、角色、可见焦点和键盘事件。
- 拖拽对象必须另提供方向键、按钮或滑块等等价操作。
- 状态不能只靠颜色表达；同时使用文字、形状或位置。
- 控件必须有可见标签；动态关键读数使用适当的 `aria-live`，但不得连续刷屏。
- 触控目标逻辑尺寸不得小于 44×44px。

## 10. 完工自检

在 `pages/` 目录运行：

```sh
python3 assets/selfcheck.py page-NN.html
```

对每个主要交互状态再运行：

```sh
python3 assets/selfcheck.py page-NN.html --after "<触发该状态的 JS>"
```

至少检查：初始状态、每个控件的边界值、重置状态、主要拖拽/切换后的状态；动画页还要检查 reduced-motion 分支。

合格判据：

- 无 JavaScript 报错。
- 无资源加载失败或外部请求。
- 无元素超出 1600×900、被裁切或侵入页眉页脚。
- 无文字叠压。
- 字号和行高全部达标。
- 画面占用比 ≥45%。
- 文本块为 20–70 个。
- 无占比不足 1% 且无教学用途的小容器。
- 键盘可完成全部核心操作。
- 随机结果可复现，重置结果一致。
- 控件边界值不产生 NaN、Infinity、空白图或错误结论。
- ECharts 使用 SVG；canvas 走 Deck；动画有 reduced-motion 分支。
- 浏览器直接打开即可完整显示和交互。

任何一项不合格都必须修改页面并重新运行；反复执行，直到初始状态及所有被测交互状态报告干净。
````

## `assets/CHASSIS.md`（4,010 字符）

契约改指路之后，这一份的读取次数从**全程 1–3 次**变成**每页各一次（45 次）**。

````markdown
# CHASSIS.md —— 底盘接口速查

`base.css` 和 `base.js` 的**全部对外接口都在这一页里**。要用底盘，读这一页就够了，
不需要打开那两个源文件（合起来 400 行）。只有在你打算**改写或替换**底盘时才去读源码，
那时源码里每一条旁边都写了它各自解决什么问题。

底盘里只有和主题无关的机制：固定画布的整体缩放、canvas 在高分屏和缩放下的适配、
指针坐标换算、几个不写就一定出 bug 的布局细节、可访问性地板。
**没有任何配色、字体、字号、间距或组件外观** —— 那些是每次生成自己的设计。

---

## base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在你自己的样式之前。

### 必须由你给出的三个 token（底盘不给默认值，缺了页面会明显不对）

```css
:root{
  --bg:        #0b0e14;      /* 页面底色 */
  --text:      #e6e6e6;      /* 默认文字色 */
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

底盘另外会读 `--stage-w` / `--stage-h`（画布逻辑尺寸，默认 1600 / 900）和
`--focus`（焦点圈颜色）。缩放比由底盘算出后写回 `:root` 的 `--s`，CSS 里可以直接用。

### 结构

页面里要有 `#stage`，它就是那块 1600×900 的逻辑画布；引入 base.css + base.js 之后
缩放自动生效，不需要你写任何缩放代码。

### 四个工具类（这是 base.css 提供的全部类）

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | **任何 grid/flex 分栏的子项。** 子项默认不许缩到比内容小，一段长文本或一个宽 canvas 会把整列顶开、被裁掉，表现为「右边内容莫名其妙没了」 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 `<canvas>`。canvas 是替换元素，有 300×150 的默认尺寸，只写 `inset:0` 拉不开它 |
| `.no-pan` | 关掉触摸平移 | 需要拖动的交互区 |
| `.sr-only` | 只给读屏软件 | 图形的文字替代 |

---

## base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。
页面里只要有 `#stage`，引入即开始工作（缩放监听在文件末尾自动装好）。

### 尺寸与缩放

```
Deck.W / Deck.H          逻辑画布尺寸(读自 --stage-w / --stage-h)
Deck.s                   当前缩放比(同 :root 上的 --s)
Deck.onResize(fn)        注册尺寸变化回调,返回注销函数
Deck.init(cfg)           可选,只做键盘翻页和 document.title,不生成任何外观
```

```js
Deck.init({ index:3, total:14 });                 // 通常只需要这一行
Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页
Deck.init({ index:3, total:14, href:n => 'p'+n+'.html' });
```

### canvas 与指针

```
Deck.fit(cv)             高分屏适配,返回已 setTransform 的 2d ctx
Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸/触摸结束都兼容)
```

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。
它靠 `r.width / el.offsetWidth` 反推，**嵌套缩放也对，但元素被 rotate 之后不适用**。

### 从 CSS 读颜色（canvas 里写不了 `var()`）

```
Deck.token(name)         读成原始字符串
Deck.rgb(name)           读成 [r,g,b]
Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'
```

### 动画

```
Deck.reduced()           系统是否要求减少动态
Deck.loop(fn[,opt])      rAF 循环,返回 stop()
```

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧
`fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；
标签页隐藏时自动暂停，回来不会有 dt 跳变。

### 小工具

```
Deck.clamp / Deck.lerp / Deck.fmt
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段
```

---

## 底盘不做的事

顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、
版式模板 —— 一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

**如果这一轮另外做了共享文件**（比如统一的顶栏和进度轨、统一的数字格式化、
共用的底纹），把它的接口按上面这个格式追加到本文件末尾。多个页面各自
`cat` 一遍源码去认接口，是纯浪费。

---

## 本轮追加:`theme.css` 提供的 token 与 class

```
token   --fs-h1 34px       页标题;只用于页面唯一主标题
   token   --fs-h2 22px       区块小标题;用于分区标题与骨架节点标题
   token   --fs-lead 19px     导语、主张句、强调正文;可用于成句文字
   token   --fs-body 18px     正文(默认);成句文字只许用 body / lead / sec
   token   --fs-sec 16px      次级说明、表格正文、图注正文;可用于成句文字
   token   --fs-label 15px    控件标签、图例、操作提示;不得用于成句说明
   token   --fs-tick 13px     纯数字刻度,只有数字和单位时才可以用

   版心     内容区 1408×620,页眉 96 / 页脚 88 —— 照这个排,不要自己量

   原子     .row .col .grow .wrap .center .between .start .end
            .items-start .items-center .items-end .gap-* .pad-*;
            用原子组合页面,不要把所有页面套入同一种两栏
   骨架     .k-process        把「先后 / 因果」显式化:.step 沿 .axis 排列,
                              段间 .arw 自动画箭头;当前段高亮,已过段降饱和
   骨架     .k-comparison     把「同一维度上的差异」显式化:.dim 与对象列组成
                              对齐行列,.hdr 是共同列头,.rowline 通栏,.diff 标差异
   骨架     .k-classification 把「归属」显式化:.lv 用竖线和缩进表达层级,
                              下位 .box 必须嵌入或缩进于上位框,.bt 标题归属
   骨架     .k-generalization 把「主张—支撑」显式化:.claim 是更重的主张,
                              .supports 中的 .support 挂接在 .trunk 主干上
   骨架     .k-enumeration    把「同级并列」显式化:.it 使用统一项模板,
                              不暗示顺序;这是最弱结构,不应作为默认选择

   组件     .panel            读数面板    .ctl 控件行    .note 图注
```
````

## `assets/theme.css`（15,761 字符）



```css
/* ==== INTERFACE ====
   token   --fs-h1 34px       页标题;只用于页面唯一主标题
   token   --fs-h2 22px       区块小标题;用于分区标题与骨架节点标题
   token   --fs-lead 19px     导语、主张句、强调正文;可用于成句文字
   token   --fs-body 18px     正文(默认);成句文字只许用 body / lead / sec
   token   --fs-sec 16px      次级说明、表格正文、图注正文;可用于成句文字
   token   --fs-label 15px    控件标签、图例、操作提示;不得用于成句说明
   token   --fs-tick 13px     纯数字刻度,只有数字和单位时才可以用

   版心     内容区 1408×620,页眉 96 / 页脚 88 —— 照这个排,不要自己量

   原子     .row .col .grow .wrap .center .between .start .end
            .items-start .items-center .items-end .gap-* .pad-*;
            用原子组合页面,不要把所有页面套入同一种两栏
   骨架     .k-process        把「先后 / 因果」显式化:.step 沿 .axis 排列,
                              段间 .arw 自动画箭头;当前段高亮,已过段降饱和
   骨架     .k-comparison     把「同一维度上的差异」显式化:.dim 与对象列组成
                              对齐行列,.hdr 是共同列头,.rowline 通栏,.diff 标差异
   骨架     .k-classification 把「归属」显式化:.lv 用竖线和缩进表达层级,
                              下位 .box 必须嵌入或缩进于上位框,.bt 标题归属
   骨架     .k-generalization 把「主张—支撑」显式化:.claim 是更重的主张,
                              .supports 中的 .support 挂接在 .trunk 主干上
   骨架     .k-enumeration    把「同级并列」显式化:.it 使用统一项模板,
                              不暗示顺序;这是最弱结构,不应作为默认选择

   组件     .panel            读数面板    .ctl 控件行    .note 图注
   ==== /INTERFACE ==== */

:root {
  --bg: #f4f7fb;
  --text: #172033;
  --font-sans: Inter, "Noto Sans SC", "Source Han Sans SC",
    "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --focus: #0b72e7;

  --surface: #ffffff;
  --surface-soft: #eaf1f8;
  --surface-muted: #dfe8f2;
  --line: #c7d3e1;
  --line-strong: #8799ae;
  --muted: #53657a;
  --primary: #145da0;
  --primary-strong: #0d477d;
  --primary-soft: #dbeeff;
  --accent: #d86b2b;
  --accent-soft: #fff0e4;
  --success: #247a55;
  --success-soft: #e1f4ea;
  --warning: #a76008;
  --warning-soft: #fff2cf;
  --danger: #b33b45;
  --danger-soft: #fde8e9;

  /* 字号用途不可跨档挪用；折行文字行高均不低于 1.35。 */
  --fs-h1: 34px;    /* 页面唯一主标题。 */
  --fs-h2: 22px;    /* 区块小标题、节点标题。 */
  --fs-lead: 19px;  /* 导语、主张句、强调正文；允许成句。 */
  --fs-body: 18px;  /* 默认正文；允许成句。 */
  --fs-sec: 16px;   /* 次级说明、表格及图注正文；允许成句。 */
  --fs-label: 15px; /* 控件标签、图例、操作提示；禁止用于成句说明。 */
  --fs-tick: 13px;  /* 仅纯数字与单位组成的坐标刻度或读数刻度。 */

  --lh-tight: 1.35;
  --lh-body: 1.5;
  --lh-relaxed: 1.65;

  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 40px;
  --sp-8: 48px;
  --sp-9: 64px;

  --r-sm: 8px;
  --r-md: 14px;
  --r-lg: 22px;
  --shadow: 0 12px 32px rgb(31 55 82 / 10%);
  --shadow-soft: 0 5px 16px rgb(31 55 82 / 8%);

  --header-h: 96px;
  --footer-h: 88px;
  --content-x: 96px;
  --content-y: 48px;
  --content-w: 1408px;
  --content-h: 620px;
}

body {
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

.lec-header {
  position: absolute;
  z-index: 20;
  inset: 0 0 auto;
  height: var(--header-h);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: 0 var(--content-x);
  color: var(--primary-strong);
  background: rgb(244 247 251 / 96%);
  border-bottom: 1px solid var(--line);
  font-size: var(--fs-label);
  line-height: var(--lh-tight);
  letter-spacing: 0.04em;
}

.lec-header::before {
  width: 28px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--accent);
  content: "";
}

.lec-footer {
  position: absolute;
  z-index: 20;
  inset: auto 0 0;
  height: var(--footer-h);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: 0 var(--content-x);
  color: var(--muted);
  background: rgb(244 247 251 / 96%);
  border-top: 1px solid var(--line);
  font-size: var(--fs-label);
  line-height: var(--lh-tight);
}

.lec-main,
#main {
  position: absolute;
  z-index: 1;
  top: var(--header-h);
  right: 0;
  bottom: var(--footer-h);
  left: 0;
  box-sizing: border-box;
  width: 1600px;
  height: 716px;
  padding: var(--content-y) var(--content-x);
  overflow: hidden;
}

.lec-main > *,
#main > * {
  max-width: var(--content-w);
}

h1,
.h1 {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-h1);
  line-height: var(--lh-tight);
  letter-spacing: -0.02em;
}

h2,
.h2 {
  margin: 0;
  color: var(--primary-strong);
  font-size: var(--fs-h2);
  line-height: var(--lh-tight);
}

p {
  margin: 0;
}

.lead {
  font-size: var(--fs-lead);
  line-height: var(--lh-body);
}

.body {
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

.sec {
  font-size: var(--fs-sec);
  line-height: var(--lh-body);
}

.label {
  font-size: var(--fs-label);
  line-height: var(--lh-tight);
}

.tick {
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-tick);
  line-height: var(--lh-tight);
}

/* 可拼装布局原子：只描述流向、伸缩、间距和对齐，不预设页面语义。 */
.row {
  display: flex;
  flex-direction: row;
}

.col {
  display: flex;
  flex-direction: column;
}

.wrap {
  flex-wrap: wrap;
}

.nowrap {
  flex-wrap: nowrap;
}

.grow {
  flex: 1 1 0;
}

.shrink0 {
  flex-shrink: 0;
}

.center {
  justify-content: center;
  align-items: center;
}

.start {
  justify-content: flex-start;
}

.end {
  justify-content: flex-end;
}

.between {
  justify-content: space-between;
}

.around {
  justify-content: space-around;
}

.evenly {
  justify-content: space-evenly;
}

.items-start {
  align-items: flex-start;
}

.items-center {
  align-items: center;
}

.items-end {
  align-items: flex-end;
}

.self-start {
  align-self: flex-start;
}

.self-center {
  align-self: center;
}

.self-end {
  align-self: flex-end;
}

.full {
  width: 100%;
  height: 100%;
}

.w-full {
  width: 100%;
}

.h-full {
  height: 100%;
}

.gap-1 { gap: var(--sp-1); }
.gap-2 { gap: var(--sp-2); }
.gap-3 { gap: var(--sp-3); }
.gap-4 { gap: var(--sp-4); }
.gap-5 { gap: var(--sp-5); }
.gap-6 { gap: var(--sp-6); }
.gap-7 { gap: var(--sp-7); }
.gap-8 { gap: var(--sp-8); }
.gap-9 { gap: var(--sp-9); }

.pad-1 { padding: var(--sp-1); }
.pad-2 { padding: var(--sp-2); }
.pad-3 { padding: var(--sp-3); }
.pad-4 { padding: var(--sp-4); }
.pad-5 { padding: var(--sp-5); }
.pad-6 { padding: var(--sp-6); }
.pad-7 { padding: var(--sp-7); }
.pad-8 { padding: var(--sp-8); }

.stack > * + * {
  margin-top: var(--sp-4);
}

.cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

.rule {
  width: 100%;
  height: 1px;
  background: var(--line);
}

.panel {
  box-sizing: border-box;
  padding: var(--sp-5);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-soft);
}

.panel[data-tone="primary"] {
  background: var(--primary-soft);
  border-color: #9bc9ef;
}

.panel[data-tone="accent"] {
  background: var(--accent-soft);
  border-color: #efbd99;
}

.readout {
  display: grid;
  gap: var(--sp-2);
  min-width: 180px;
  padding: var(--sp-4) var(--sp-5);
  color: var(--primary-strong);
  background: #102b46;
  border: 1px solid #315574;
  border-radius: var(--r-md);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 10%);
}

.readout .label {
  color: #bbd1e4;
}

.readout .value {
  color: #ffffff;
  font-size: var(--fs-h2);
  font-variant-numeric: tabular-nums;
  line-height: var(--lh-tight);
}

.ctl {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 44px;
  color: var(--text);
  font-size: var(--fs-label);
  line-height: var(--lh-tight);
}

.ctl > label {
  flex: 0 0 auto;
  color: var(--muted);
  font-weight: 650;
}

button,
.button,
select,
input {
  font: inherit;
}

button,
.button,
select {
  min-height: 40px;
  box-sizing: border-box;
  padding: var(--sp-2) var(--sp-4);
  color: var(--primary-strong);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  font-size: var(--fs-label);
  line-height: var(--lh-tight);
}

button,
.button {
  cursor: pointer;
  font-weight: 700;
}

button:hover,
.button:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
}

button[aria-pressed="true"],
.button.is-active {
  color: #ffffff;
  background: var(--primary);
  border-color: var(--primary);
}

input[type="range"] {
  min-width: 180px;
  accent-color: var(--primary);
}

input[type="checkbox"],
input[type="radio"] {
  width: 20px;
  height: 20px;
  accent-color: var(--primary);
}

.note {
  color: var(--muted);
  font-size: var(--fs-sec);
  line-height: var(--lh-body);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3) var(--sp-5);
  align-items: center;
  color: var(--muted);
  font-size: var(--fs-label);
  line-height: var(--lh-tight);
}

.legend > * {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

.swatch {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  border: 1px solid rgb(23 32 51 / 22%);
  border-radius: 3px;
}

/* process：顺序必须由可见主轴及箭头表达；仅并排卡片会隐藏先后或因果。 */
.k-process {
  --process-gap: 44px;
  position: relative;
  display: flex;
  align-items: stretch;
  gap: var(--process-gap);
  width: 100%;
  min-width: 0;
}

.k-process.axis,
.k-process .axis {
  position: relative;
}

.k-process.axis::before,
.k-process .axis::before {
  position: absolute;
  z-index: 0;
  top: 50%;
  right: 0;
  left: 0;
  height: 4px;
  border-radius: 999px;
  background: var(--line-strong);
  content: "";
  transform: translateY(-50%);
}

.k-process > .step,
.k-process .axis > .step {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-width: 0;
  box-sizing: border-box;
  padding: var(--sp-4);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--r-md);
}

.k-process > .step.is-current,
.k-process .axis > .step.is-current {
  background: var(--primary-soft);
  border-color: var(--primary);
  box-shadow: 0 0 0 4px rgb(20 93 160 / 12%);
}

.k-process > .step.is-done,
.k-process .axis > .step.is-done {
  color: var(--muted);
  background: var(--surface-soft);
  border-color: var(--line);
  filter: saturate(0.55);
}

.k-process .arw {
  position: relative;
  z-index: 2;
  display: grid;
  flex: 0 0 0;
  place-items: center;
  color: var(--primary);
}

.k-process .arw::before {
  position: absolute;
  content: "→";
  font-size: var(--fs-h2);
  font-weight: 800;
  line-height: 1;
}

.k-process.is-vertical {
  flex-direction: column;
  gap: var(--sp-6);
}

.k-process.is-vertical.axis::before,
.k-process.is-vertical .axis::before {
  top: 0;
  right: auto;
  bottom: 0;
  left: 28px;
  width: 4px;
  height: auto;
  transform: none;
}

.k-process.is-vertical .arw::before {
  content: "↓";
}

/* comparison：维度和对象必须共享同一网格行；两侧各自排版会破坏逐维对照。 */
.k-comparison {
  --comparison-cols: minmax(180px, 0.8fr) repeat(2, minmax(0, 1fr));
  display: grid;
  grid-template-columns: var(--comparison-cols);
  align-items: stretch;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}

.k-comparison > * {
  min-width: 0;
  box-sizing: border-box;
  padding: var(--sp-3) var(--sp-4);
  border-right: 1px solid var(--line);
}

.k-comparison > :nth-child(3n) {
  border-right: 0;
}

.k-comparison .hdr {
  color: var(--primary-strong);
  background: var(--surface-soft);
  font-size: var(--fs-h2);
  font-weight: 750;
  line-height: var(--lh-tight);
  text-align: center;
}

.k-comparison .dim {
  color: var(--muted);
  background: #f8fafc;
  font-size: var(--fs-sec);
  font-weight: 700;
  line-height: var(--lh-body);
  text-align: right;
}

.k-comparison .rowline {
  grid-column: 1 / -1;
  height: 1px;
  padding: 0;
  background: var(--line);
  border: 0;
}

.k-comparison .diff {
  color: var(--primary-strong);
  background: var(--accent-soft);
  box-shadow: inset 4px 0 0 var(--accent);
  font-weight: 700;
}

/* classification：竖线、缩进和包含框把上下位归属画出来；平铺会误读为同级。 */
.k-classification {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  width: 100%;
  min-width: 0;
}

.k-classification .lv {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-left: var(--sp-5);
  padding-left: var(--sp-5);
  border-left: 3px solid var(--line-strong);
}

.k-classification > .lv {
  margin-left: 0;
  border-left-color: var(--primary);
}

.k-classification .lv::before {
  position: absolute;
  top: 26px;
  left: -3px;
  width: var(--sp-5);
  height: 3px;
  background: var(--line-strong);
  content: "";
}

.k-classification .box {
  min-width: 0;
  padding: var(--sp-4);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--r-md);
}

.k-classification .box > .bt {
  margin: calc(-1 * var(--sp-4)) calc(-1 * var(--sp-4)) var(--sp-3);
  padding: var(--sp-2) var(--sp-4);
  color: var(--primary-strong);
  background: var(--surface-soft);
  border-bottom: 1px solid var(--line);
  border-radius: calc(var(--r-md) - 2px) calc(var(--r-md) - 2px) 0 0;
  font-size: var(--fs-h2);
  font-weight: 750;
  line-height: var(--lh-tight);
}

.k-classification .lv .lv .box {
  border-width: 1px;
}

/* generalization：主张比支撑重一档，支撑通过主干挂接；同权卡片会抹平论证层级。 */
.k-generalization {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--sp-5);
  width: 100%;
  min-width: 0;
}

.k-generalization .claim {
  padding: var(--sp-4) var(--sp-5);
  color: var(--primary-strong);
  background: var(--primary-soft);
  border-left: 8px solid var(--primary);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  font-size: var(--fs-lead);
  font-weight: 800;
  line-height: var(--lh-body);
}

.k-generalization .supports {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--support-cols, 3), minmax(0, 1fr));
  gap: var(--sp-5);
  padding-top: var(--sp-5);
}

.k-generalization .trunk {
  position: absolute;
  top: 0;
  right: 8%;
  left: 8%;
  height: 3px;
  background: var(--line-strong);
}

.k-generalization .trunk::before {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 3px;
  height: var(--sp-5);
  background: var(--line-strong);
  content: "";
  transform: translate(-50%, 0);
}

.k-generalization .support {
  position: relative;
  min-width: 0;
  padding: var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  font-size: var(--fs-sec);
  line-height: var(--lh-body);
}

.k-generalization .support::before {
  position: absolute;
  bottom: 100%;
  left: 50%;
  width: 3px;
  height: var(--sp-5);
  background: var(--line-strong);
  content: "";
  transform: translateX(-50%);
}

/* enumeration：仅表达同级并列，统一模板但不制造顺序；有更强关系时应换用其他骨架。 */
.k-enumeration {
  display: grid;
  grid-template-columns: repeat(var(--enum-cols, 3), minmax(0, 1fr));
  gap: var(--sp-4);
  width: 100%;
  min-width: 0;
}

.k-enumeration > .it {
  position: relative;
  min-width: 0;
  box-sizing: border-box;
  padding: var(--sp-5);
  background: var(--surface);
  border: 1px solid var(--line);
  border-top: 5px solid var(--primary);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-soft);
}

.k-enumeration > .it > .bt {
  margin-bottom: var(--sp-3);
  color: var(--primary-strong);
  font-size: var(--fs-h2);
  font-weight: 750;
  line-height: var(--lh-tight);
}

.k-enumeration > .it[data-tone="accent"] {
  border-top-color: var(--accent);
}

.k-enumeration > .it[data-tone="success"] {
  border-top-color: var(--success);
}

.is-primary {
  color: var(--primary-strong);
  background: var(--primary-soft);
}

.is-accent {
  color: #7a3512;
  background: var(--accent-soft);
}

.is-success {
  color: #15573b;
  background: var(--success-soft);
}

.is-warning {
  color: #714000;
  background: var(--warning-soft);
}

.is-danger {
  color: #7d2730;
  background: var(--danger-soft);
}

.muted {
  color: var(--muted);
}

.strong {
  font-weight: 750;
}

.mono-num {
  font-variant-numeric: tabular-nums;
}
```
