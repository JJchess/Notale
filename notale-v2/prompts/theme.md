为这套 {n_pages} 页讲义编写共享的 `assets/theme.css`。每页只引用它，不另建视觉系统。

## 输入

规划已经确定视觉世界，必须照此实现，不得擅自换色或改材质方向：

{world}

- 读者：{audience}
- 场合：{scenario}
- 实际使用的版式：

{layouts}

- 可作为整页底图的素材：

{img_pool}

如果附带了底图联系表，先看图再确定底色的精确明度和 `.backdrop` 遮罩强度。
规划与物理观看条件冲突时仍按规划实现，但在文件顶部用一条短注释指出冲突和原因。

## 视觉方向的作业方法

{direction}

## 输出职责

这份 CSS 只负责四类共享能力：

1. 颜色、字体和字阶 token。
2. 全套统一的版心与每种实际版式。
3. 四种知识关系的骨架原语。
4. 页面会复用的读数、控件、图例、提示和媒体包裹组件。

不要生成页眉页脚，不定义 `mount()`，不替页面安排标题位置。不要制造 utility 类或间距阶梯；
一次性的尺寸、gap 和 flex 份额由页面内联设置。

## 固定版心

必须原样包含：

    :root { --pad-x: 56px; --pad-y: 28px; }
    #stage { display: flex; flex-direction: column; padding: var(--pad-y) var(--pad-x); }

逻辑画布是 {canvas_w} × {canvas_h}。`#stage` 的 padding 已经定义版心，页面不得再加外层边距。
顶层区域使用固定高度或 flex 份额，主内容区使用 `flex:1`。

`base.css` 已提供舞台缩放、reset、`[hidden]`、`.sr-only`、`.min0`、`.cv-fill`、`.no-pan`、
`:focus-visible` 和 `prefers-reduced-motion`；不要重复或覆盖这些机制。

## Token

至少定义 `--bg`、`--text`、`--font-sans`、`--focus`，以及规划视觉世界中的语义色。
颜色取自规划给出的 hex，中性元素用灰阶。**语义色的权威声明只在接口块**：每个有概念含义的
token 都在那里写清 hex、唯一含义和允许出现的位置，建页 agent 只读接口块就能判断某个颜色
能不能用在手头这个元素上。

定义职责明确的字阶 token，名字必须编码用途，例如：

    --fs-h1: 34px;      /* 页标题 */
    --fs-h2: 22px;      /* 区块标题 */
    --fs-lead: 19px;    /* 导语或强调正文 */
    --fs-body: 18px;    /* 正文 */
    --fs-sec: 16px;     /* 次级成句说明 */
    --fs-label: 15px;   /* 控件、图例、图注、提示 */
    --fs-tick: 13px;    /* 仅纯数字刻度 */

成句文字不得使用 tick 或 label 档。{font_floor}可以按受众和场合上调，不得下调地板。

## 版式与知识骨架

为输入列出的每个版式提供同名类，并让其几何与名称一致；不要用一个万能两栏冒充全部版式。
版式只定义区域关系，不规定某页的具体内容。kicker 须与标题同栏堆叠，不得排成同行两栏，也不做成边框徽章。

四种知识骨架都必须提供可拼装原语：

- `.k-process`：阶段 `.step` 由 `.arw` 或贯穿的 `.axis` 连接，方向可见；不能只是并排。
- `.k-comparison`：`.dim`、`.hdr`、`.rowline`、`.diff` 形成同行、同尺度、同基线比较。
- `.k-classification`：`.lv`、`.box`、`.bt` 用嵌套、包含或缩进显示归属。
- `.k-generalization`：`.claim` 比 `.supports > .support` 更重，支撑挂在 `.trunk` 主干上。

骨架类是默认工具，不限制页面使用 SVG、Canvas 或图表表达同一关系。

## 共享组件

提供一套紧凑而完整的组件，状态必须可用：

- 数值：`.big`、`.big.sm`、`.big.lg`、`.num`、`.unit`；数字使用等宽或 tabular nums。
- 操作：`.hint`、`.btn`、`.btns`、`.ctl`、`input[type=range]`；包含焦点、选中和禁用态。
- 标记：`.tag`、`.legend > .li > .sw`、`.sw.line`。
- 媒体：`.cvbox` 只负责定位、圆角和裁切。
- 作答：`.quiz`、`.opt`、`.fb`；选中态与正确性分开，不默认使用红绿对错色。
- 文字：`.lead`、`.small`、`.note`。
- 仪器容器：`.panel`；`.panel.q` 保留同样边距但不填色。

共享组件不用粗色侧边条、渐变文字或装饰边框 hero-metric 卡片做默认样式。

表面层级保持克制：舞台底色之外，填色主要留给 `.panel` 这类读数或控件区域；
`.step`、`.it`、`.lv`、`.box`、`.cvbox` 等骨架原语用线、缩进和字号表达关系，不堆多层卡片底色。

`.backdrop` 用于整页氛围图：绝对定位铺满、`object-fit:cover`，通常压到 `opacity:.16–.22`，
或使用由 `--bg` 推出的高不透明罩层；`.backdrop-note` 放在不遮挡内容的角落。

文件末尾加入 SVG 防覆盖规则：

    svg .bar, svg .step, svg .cell, svg .box, svg .arw { width:auto; height:auto; }

## 接口注释

文件第一段必须是下面格式的接口块，列出最终实际提供的 token、版心、版式、骨架和组件。
每项写“名称 + 一句用途或关系”，不要只列类名，也不要在后续 CSS 注释中重复长篇解释。

    /* ==== INTERFACE ====
       token    --model #2457A6   当前模型算出的值｜预测值、前向箭头
       token    --attention #E76F2E 当前要观察或操作的点｜活动控件、游标
       token    --fs-body 18      正文
       版心     1488×844          #stage 已含 28px 56px padding
       版式     .focus            单焦点构图
       骨架     .k-process        用阶段和箭头显示方向
       组件     .panel            读数与控件容器
       ==== /INTERFACE ==== */

建页 agent 会拿到这份 CSS 的完整源码，所以接口块不必复述选择器本身；
它要说清的是**源码里读不出来的那部分**：每个 token 和类的用途、彼此的关系、什么时候该拿哪个。
CSS 其余注释只保留短标题。

输出完整文件，放在唯一一个标注为 `css` 的 Markdown 代码围栏中；围栏外不要输出其他代码块。
