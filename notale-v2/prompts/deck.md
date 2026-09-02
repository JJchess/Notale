一次规划并完整交付《{query}》这套 {minutes} 分钟互动讲义。
- 读者：{audience}
- 场合：{scenario}
内容深度、术语、例子、互动与视觉必须适配读者和场合。

## 交付

同一回复只调用两次 `Write`，不输出正文：

1. `Write(file_path="{css_path}", content=…)`：完整纯 CSS，不加代码围栏。
2. `Write(file_path="{pages_path}", content=…)`：图池后接全部页面：

       （图池表，或者一行「本套无需图池」）

       # page-01 [标题页]
       （主题）

       # page-02 [内容页]
       （主题）

页号从 01 连续到 N。

## 内容范围与页数

`{minutes}` 是整套讲义的总时长。把 `{query}` 给出的主题和大纲当作范围边界，按重要性分配页面；
一个算法或一个概念通常 3–5 页，枝节不升格为章节，只有大纲的顶层主题才可插标题页。
不为凑时长或填满画布扩写、拆页。

## 图池（写在 `pages.md` 开头、第一个 `# page-01` 之前）

只规划真正承担证据、场景或可操作物体的图，最多 14 张；不需要图片就只写一行
「本套无需图池」。需要时用下表，表头原样照抄：

| 文件名 | 类型 | 检索词 / 生成提示词 | 用在哪几页 | 用法 |
|---|---|---|---|---|
| tool-oldowan.jpg | 照片 | Oldowan stone tool | 14 | 内容图 |
| illus-savanna.png | 插画 | 非洲草原早期人族剪影，无文字 | 01,13 | 整页底图 |

- 文件名用小写连字符；照片 `.jpg`，插画 `.png`。
- 真实器物、遗址、人物和其他证据本体用照片；无法拍摄的历史场景或抽象过程才用插画。
- 照片检索词用 3–5 个英文词，指向 Wikimedia、NASA、博物馆等可追溯来源；
  插画提示词写明主题、材质、配色和“无文字”。
- 用法只能是 `内容图`、`整页底图` 或 `组件素材`。需要拖拽或点选的真实物体优先用
  孤立背景照片做组件素材。
- `用在哪几页` 写页号，逗号分隔——harness 按这一列把文件名发给对应的页，写错就送不到。

## `theme.css`

### 视觉方向

{direction}

### 配色禁令

{theme_bans}

## CSS 边界

只生成共享 token、区域关系和复用组件；不生成页眉页脚、`mount()`、utility 类或标题位置。
单页专用的尺寸、gap 和 flex 份额留给建页 agent 内联。

## 固定版心

必须原样包含：

    :root { --pad-x: 56px; --pad-y: 28px; }
    #stage { display: flex; flex-direction: column; padding: var(--pad-y) var(--pad-x); }

逻辑画布 {canvas_w}×{canvas_h}；顶层区块用固定高度或 flex 份额，主区 `flex:1`。
`base.css` 已负责缩放、reset、`[hidden]`、`.sr-only/.min0/.cv-fill/.no-pan`、焦点和
reduced-motion；不重复或覆盖。

## Token

定义 `--bg`、`--text`、`--font-sans`、`--focus`、`--muted` 和必要的语义色。每个语义 token
只表示一个概念，并在接口中列出 hex、含义和允许位置；无语义元素用同一冷暖倾向的灰阶。
`--muted` 与底色至少 4.5:1；不定义 `--rule`、`--border`，线条直接用 `--muted`。
不用 `@import` 或联网 URL，只用本地字体和系统 fallback。

字阶 token：`--fs-h1 34px` 页标题；`--fs-h2 22px` 区块标题；`--fs-lead 19px` 导语；
`--fs-body 18px` 正文；`--fs-sec 16px` 次级成句；`--fs-label 15px` 标签；
`--fs-tick 13px` 纯数字刻度。成句文字不用 label/tick。{font_floor}只可上调。

## 版式

共享版式只定义可复用的区域关系，不规定某页的具体内容；不要用万能两栏冒充全部版式。
知识关系（过程／对照／归类／概括）由各页用 SVG、Canvas、图表或自己的布局表达，不预置骨架类。

舞台背景不用重复条纹、点阵或网格；网格线只属于真实坐标系或图表。

## 共享组件

定义并在接口列出：数值 `.big/.big.sm/.big.lg` `.num` `.unit`；操作 `.hint` `.btn` `.btns`
`.ctl` 及 range；标记 `.tag` `.legend>.li>.sw` `.sw.line`；媒体 `.cvbox`（只定位、圆角、裁切）；
作答 `.quiz` `.opt` `.fb`；文字 `.lead` `.small` `.note`；仪器 `.panel` 与无填色但等边距的 `.panel.q`。
数字用等宽或 tabular nums；操作含焦点、选中、禁用态，选中与正确性分开，不默认红绿对错。
不用粗色侧条、渐变字、装饰边框 metric 卡或多层卡片底色；填色主要留给 `.panel`，其余用线、
缩进和字号组织。仅有整页底图时定义 `.backdrop/.backdrop-note`。文件末尾加入：

    svg .bar, svg .cell, svg .box { width:auto; height:auto; }

## 接口注释

`theme.css` 第一段必须用下列定界符，逐行列出 Builder 可用的每个 token（hex、唯一语义、位置）、
版心、版式几何和组件用法；未列出的等于不可用，其余注释只留短标题。

    /* ==== INTERFACE ====
       token  --model #2457A6  当前模型值｜预测、前向箭头
       token  --fs-body 18     正文
       版心   1488×844         #stage 已含 padding
       版式   .focus           标题后单一主区
       组件   .panel           读数与控件
       ==== /INTERFACE ==== */

## `pages.md`：标签加主题

每页只写**一个标签和一句主题**：这页讲什么、读者要明白什么，可带冒号补语指方向。
Planner 只决定顺序、标签和主题；数据、控件、步骤、公式、讲解、UI 和构图都归建页 agent，
主题里不写“调节…观察…”这类操作句。

只有用户要求或媒介确实关键时，才用括号注明「学习游戏／模拟训练」。

下例校准粒度：AdaBoost 在 90 分钟《集成学习》里只占这五页，单独成套也不多于此。

    # page-NN [标题页]
    AdaBoosting 算法

    # page-NN [内容页]
    AdaBoosting 算法的历史

    # page-NN [内容页]
    AdaBoosting 算法讲解：弱分类器如何按权重组合成强分类器

    # page-NN [交互页]
    交互理解 AdaBoosting 算法（模拟训练）

    # page-NN [代码页]
    代码实操 AdaBoosting 算法

page-01 固定为整套 `[标题页]` 封面；此后 `[标题页]` 只用于大纲顶层主题的分节或收束，不承载新知识。

`[内容页]` 无需动手；`[交互页]` 要让读者改变真实状态并看见派生证据，
点答案、展开文字或切换标签不算交互；`[代码页]` 的主要学习动作是修改并运行代码。
