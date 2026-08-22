# 共享契约 —— 每个建页 agent 必读

你负责**一页**。读这份 + `../assets/CHASSIS.md` + 你自己那份 `pNN.md`，就够了。
**不要读别的 `page-*.html`**（它们正被并发写，读到的是半成品）。
不要读 `PLAN.md`（那是给编排者的），也不要读 `assets/base.js` / `deck.js` 源码（接口全在 CHASSIS.md）。

---

## 1. 这堂课在讲什么（你那一页必须服务于这个主张）

90 分钟通识课《从猿人到太空人》，听众是大一学生、文理兼有、不预设微积分和生物学。

**全课主张**：演化没有给我们任何一项太空适应。366 万年前 Laetoli 的脚印和 1969 年月面的靴印之间，
这具身体几乎没变。变的是**信息的遗传通道**——从基因（改一次要上万代）到体外传承
（石器打法、火、语言、文字、图纸；改一次只要几年）。太空人不是演化出来的，是这条快通道搭出来的。
课的结尾落在：**两条通道差了两到三个数量级，而身体只跟得上慢的那条。**

六幕：
`序 两个脚印` → `I 一具草原上的身体` → `II 第二条遗传通道` → `III 加速` →
`IV 离开地面` → `V 草原的身体在轨道上` → `VI 收束`

你的页面**只讲你那份 `pNN.md` 里写的东西**。`pNN.md` 里会写明"这一页不许碰什么"——
那些是别的页的活，重复讲会让 90 分钟塌掉。

## 2. 颜色语义（全套 44 页统一，不得挪用）

- `--gene` 赭石 `#e0913a` = 基因 / 身体 / 生物演化 / 慢通道
- `--cult` 青 `#5fc8d8` = 文化 / 技术 / 体外传承 / 快通道
- `--warn` `#e0574a` = 代价 / 限制 / 危险
- `--acc` = 本幕强调色，`Chrome.mount({act})` 自动设好

读者会在 44 页里不被告知地学会"赭色的慢、青色的快"。**你这一页里凡是出现这两类东西，
必须用对应的颜色**；凡是与两条通道无关的元素，用中性灰阶（`--text-2` `--text-3` `--line`）。

## 3. 知识结构 —— 骨架约定（**最重要的一条**）

你的 `pNN.md` 里指定了这一页的知识结构。**不要用「左右两栏」「卡片网格」这类容器思路去搭页面**，
那些是容器不是关系。五种结构各自必须把什么显式化：

| 结构 | 必须让读者一眼看见的关系 | 硬要求 |
|---|---|---|
| **process** | A 导致 B、A 先于 B、A 变成 B | 画面上**必须有可见的方向**：箭头、连线、前后态并置、进度轴、时间轴。只是把三个块并排放着不算 process |
| **comparison** | A 与 B 在同一维度上差多少 | **必须有共同基准**：同一根坐标轴、同一条基线、逐行对齐的维度列。两边各画各的图、各用各的比例尺 = 失败 |
| **classification** | A 属于 B、B 包含 A、C 和 D 同级 | **必须有嵌套或缩进**：包含框、层级竖线、树。平铺的同级项不算 classification |
| **generalization** | 这是主张，那些是支撑 | **主张在视觉上要比支撑重一档**：更大字号 + 左侧粗竖线（`.claim`），支撑挂在一条主干上（`.supports`/`.trunk`） |
| **enumeration** | 若干无序无因果的同级项 | 本套里几乎不该出现。如果你觉得你这页是 enumeration，多半是关系没想清楚，回去看 `pNN.md` |

`deck.css` 给了这五套原语（`.flow/.arw/.axisline`、`.cmp/.dim/.hdr/.rowline`、`.hier/.lv/.box`、
`.claim/.supports/.support/.trunk`），见 CHASSIS.md §5。
原语是起点不是终点：**能用 canvas/SVG 把同一层关系画得更清楚就画**，
唯一硬要求是那层关系在画面上看得见，不需要读者自己在脑子里拼。

## 4. 交互的规矩

- **同一个关系只用一种交互讲透。** 不要给同一个变量做滑块 + 滚轮 + 拖拽三条路径；
  不要在一页里既画图表又做模拟去说同一句结论。
- **背后必须真算。** 轨道积分、Tsiolkovsky、几何约束、群体模拟、热流、物资账 —— 全部当场算。
  禁止预录动画、假数据、写死的结果数字。`pNN.md` 会给公式和常数。
- **随机一律给种子**：`<script src="assets/lib/seedrandom.min.js"></script>` 后
  `var rng = new Math.seedrandom('page-15');`。读者每次打开看到的数必须一样。
- **首屏就有信息**。页面加载完的静止状态必须已经能讲；交互是"再进一步"，不是"先动才有东西看"。
  动画类页面用 `Deck.loop(fn,{still:t})` 指定定格时刻。
- 有交互就给一句 `.hint`（自带 ▸ 前缀）写清怎么操作，14px 以上。
- 没被要求交互的页面**不要硬加**。凡是不服务于理解的效果，砍掉。

## 5. 技术契约（照抄这个骨架）

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title></title>
<link rel="stylesheet" href="assets/base.css">
<link rel="stylesheet" href="assets/deck.css">
<style> /* 只写这一页特有的 */ </style>
</head>
<body data-page="NN" data-total="44">
<div id="stage"><main id="main"> …内容… </main></div>
<script src="assets/base.js"></script>
<script src="assets/deck.js"></script>
<!-- 需要的库：assets/lib/xxx.js -->
<script>
Chrome.mount({ act:N, title:'…', sub:'…', foot:'…' });
// 你的初始化
</script>
</body></html>
```

- `data-page`（两位补零，如 `07`）/ `data-total="44"` 已经在骨架文件里，**不要改**。
- 画布固定 1600×900，**不得出现滚动条**。主区可用宽 1488、可用高约 660（有页眉页脚时）。
  用 `flex`/`grid` + `height:100%`，不要写死高度。所有 grid/flex 子项加 `.min0`。
- 装不下就是内容多了 —— 但**你只有一页**，所以要做的是把话说短，
  **绝对不许**靠压小字号、压行高、压间距塞进去。
- 字号只用 CSS token（`--fs-body` 等，见 CHASSIS.md §3），不写裸 px 字号。
  地板：正文 ≥16px、控件标签/图例/图注/操作提示 ≥14px、纯数字刻度 ≥12px、多行文本行高 ≥1.35。
- **凡是 `assets/lib/` 里有的库能做的呈现，不许自己从底层重写**：
  常规图表（坐标轴/刻度/图例/折线柱状散点面积饼热力）→ `echarts`（**必须 `{renderer:'svg'}`**，
  并显式给 `textStyle.fontSize:16` / 轴标签 14 / 图例 14）；
  可拖拽命中检测的二维场景 → `konva`（文字标签用 DOM 叠加，不用 `Konva.Text`）；
  节点连线与数据驱动矢量图 → `d3`；三维 → `three`；下落碰撞摆动堆叠 → `matter`；
  上万元素同时运动 → `pixi`；多动画按时间线编排 → `gsap`；公式 → `katex`（基准 ≥20px）；
  矩阵 → `ml-matrix`。手写 canvas 只用于这些库覆盖不到的自定义图形。
- 自包含：`file://` 直接打开就能跑，只引 `pages/` 下的相对路径，不用 CDN。

## 6. 图片

`assets/img/` 下已有素材，**不要再去下载或生成**。可用文件见该目录的 `CREDITS.md`：

真实照片 —— `laetoli-trackway.jpg` `moon-bootprint.jpg` `tool-oldowan.jpg` `tool-acheulean.jpg`
`tool-levallois.jpg` `wright-1903.jpg` `saturn-v-launch.jpg` `earthrise.jpg` `blue-marble.jpg`
`spacewalk-emu.jpg` `iss-treadmill.jpg` `inuit-parka.jpg` `skull-afarensis.jpg` `skull-erectus.jpg`

生成插画 —— `illus-savanna.png` `illus-fire.png` `illus-knapping.png`（右下角有「AI生成」角标，**那个角不要压内容**）

**出处与许可不许印在页面主画面上**（会和教学内容抢注意力）。只写进 `<img title="…">`，
`pNN.md` 会给你该写的 title 文本。

## 7. 文字风格

- 讲课口吻，短句。**不要**"如图所示""我们可以看到""接下来我们将探讨"。
- 每个数字给可感换算（"7.7 km/s ≈ 北京到上海 3 分钟"）。
- 不确定的结论要标出来（"这一步目前有争议"），不要把假设讲成定论。
- 页脚 `foot` 那一句写"这一页交给下一页的东西"，别写成本页摘要。

## 8. 自检

写完跑：`python3 assets/selfcheck.py page-NN.html`（在 `pages/` 目录下）。
要求：**0 个 JS 报错、0 个加载失败、0 个超出画布、0 个被裁切**，最小字号 ≥12。
有交互的加 `--after "<触发交互的 JS>"` 再跑一遍，确认交互后也不溢出。
交付只有 `page-NN.html`（外加你确实需要的、放在 `assets/` 下的自有资源）——不要写测试、不要写报告。

## 9. 版面密度与常见坑

- `#main` 通常写成 `display:flex; flex-direction:column; height:100%; gap:…`，
  让内部区块自己分配高度。**不要给主区里的块写死 px 高度**（除了图片框这类确实要定高的）。
- selfcheck 会报"画面占用"。**低于 45% 说明这一页排空了**（多半是某个 `flex:1` 的块把内容顶到了两端，
  中间留下一条大空白）——把行距/图框放大或收紧 flex，而不是加内容。高于 85% 说明太挤。
- 一页里不要出现两块以上的大面积空白。
- 深色底上的照片直接放，不要加白框。图片框统一 `border-radius: var(--r); overflow:hidden`。
- canvas 一律 `Deck.fit()` / `Deck.autofit()`，外面套 `.cvbox`，canvas 本身加 `.cv-fill`。
- 需要拖动的区域加 `.no-pan`。
- 手写 canvas 里取指针坐标必须用 `Deck.pt(el, e)`（外层有 scale，`offsetX` 是错的）。
  用 Konva 则不必，它自己就对。
