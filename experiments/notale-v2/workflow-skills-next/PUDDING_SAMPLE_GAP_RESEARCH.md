# The Pudding 样例补缺研究

更新时间：2026-08-30

这份文档记录对 The Pudding 六个指定仓库及一个关联实现仓的研究结果。它是 sample 选型索引，不是 Agent 运行时 reference，也不应随 `SKILL.md` 进入构建上下文。

## 结论

`editorial-letter-grid` 已判定为参考价值不足，从 sample 和预览索引中移除。重新查看六个原项目的实机状态后，结论分两层：

1. **没有另一个合格的 `cover/composition` 替代品。** `censorship`、`falsetto-story`、`mow` 和 `3d-cities-story` 的首屏都不足以成为该类标杆；`data` 没有页面实现。这个缺口应该去新的来源中找，不在这六个里硬选。
2. **有三个真正高质量的 `page/chart` 段落。** 按优先级是 `censorship` 的 100 集删改时间线、`foundation-names` 的 5,307 色号探索器、`falsetto-story` 的 50 年音域时间线。它们只能作为现有 chart sample 的质量替换候选，不能偷换成 cover 或 learning interaction。

`3d-cities-story` 的人口山脉和 `data/random` + `sixty` 的随机性实验仍然成立，并已进入 `_review`。`mow` 的路径游戏与正式 `lawn-path` 同构，只作算法和验收 donor。`data` 仍只作数据与方法来源。

## 当前缺口基线

这里按“正式 sample + 已经成形且不重复的 `_review` candidate”计算能力覆盖；review candidate 仍需通过验收和归档，不等于已经正式完成。`interaction/code` 按当前决定暂不补。

| 类别 | 目标 | 当前可用 | 缺口 | 判断 |
|---|---:|---:|---:|---|
| `cover/composition` | 3 | 2 | 1 | `prism-light` + `climate-zones-title` |
| `cover/motion` | 3 | 0 | 3 | 完全缺失 |
| `cover/generative` | 3 | 4 | 0 | 已充足，不再堆叠 |
| `page/general` | 5 | 5 | 0 | 已充足；重复版本不计数 |
| `page/chart` | 3 | 6 | 0 | 已过量，不从本批继续拆 chart |
| `page/3d` | 3 | 2 | 1 | `gimbal` + `population-mountains` |
| `interaction/general` | 5 | 4 | 1 | `lawn-path`、`future-climate-analogy`、`motif-match`、`randomness-lab` |
| `interaction/3d` | 3 | 0 | 3 | 完全缺失 |

当前非 code 直接缺口合计 9 个。

## 固定研究源

所有仓库固定在共享目录 `/data1/home/zhuyifan/ws2/Notale/refs`。`pudding-data` 使用显式名称，避免把含义过宽的 `data` 作为目录名。

| 仓库 | 固定提交 | 本地目录 | 许可判断 | 线上成品 |
|---|---|---|---|---|
| `the-pudding/data` | `7a5f4394bededfe8f255d7266ab4d2343c66d178` | `refs/pudding-data` | MIT；各数据来源仍需逐项确认 | 多个故事的数据总仓 |
| `the-pudding/3d-cities-story` | `431de5d4a1c1d3ccb7a4a87b951dd18fc1486db1` | `refs/3d-cities-story` | MIT；Mapbox 数据、样式和瓦片另算 | `pudding.cool/2018/12/3d-cities-story/` |
| `the-pudding/censorship` | `0ef3fb3c7027da65347c19b816f2fcb64ca0e426` | `refs/censorship` | MIT；影视片段和海报不能由代码许可推定 | `pudding.cool/2022/08/censorship/` |
| `the-pudding/foundation-names` | `fe53ae458c45415373723bce0e541360822793b3` | `refs/foundation-names` | 未发现许可文件；只允许清洁重建机制 | `pudding.cool/2021/03/foundation-names/` |
| `the-pudding/falsetto-story` | `6a261f974e09f86a1a7c66102c0326f6386acf0a` | `refs/falsetto-story` | MIT；Spotify/Giphy 媒体另算 | `pudding.cool/2019/08/register/` |
| `the-pudding/mow` | `c7e66fa6e14731115195591ba09bc64502288702` | `refs/mow` | MIT；用户路径数据另行最小化 | `pudding.cool/2026/06/mow/` |
| `the-pudding/sixty` | `660d9782433b7b88d0cbcc2b2e3f57095c639155` | `refs/sixty` | 未发现许可文件；只允许清洁重建机制 | `pudding.cool/2022/04/random/` |

`sixty` 是 `data/random` 对应的页面实现仓，虽然不在最初六个链接中，但缺少它就无法研究“用户怎样构造序列、算法怎样评分、证据怎样返回”的完整闭环，因此作为关联研究源固定下来。

## 重新审计后的高质量候选

### 1. `censorship`：100 集删改时间线

**归类：** `build-page/references/chart.md`

**建议目录名：** `page-chart/censorship-timeline`

**主要来源：**

- `refs/censorship/src/components/Graphic.Scroll.svelte`
- `refs/censorship/src/components/Scroll.Figure.svelte`
- `refs/censorship/src/data/cuts.csv`

这是六个仓库里最强的未收录段落。它把 100 集变成 100 条对齐时间轴，然后在同一批 canonical scenes 上依次显示 206 个删改区间、类别编码、具体证据和累计时长。空间身份在状态间保持，读者看到的是证据被逐层暴露，不是七张无关图交叉淡化。

运行时核心只需 DOM/SVG/CSS 与本地 CSV，不需要原项目的 MP4、海报或剧集截图。若制作 sample，只取这个 7 状态时间线，不携带影视对比段落。代码是 MIT；删改时间和分类数据仍需单独记录来源和使用边界。

### 2. `foundation-names`：5,307 色号探索器

**归类：** `build-page/references/chart.md`

**建议目录名：** `page-chart/shade-name-distribution`

**主要来源：**

- `refs/foundation-names/src/components/Explore.svelte`
- `refs/foundation-names/src/components/InteractiveWrapper.svelte`
- `refs/foundation-names/src/components/Interactive.svelte`
- `refs/pudding-data/foundation-names/`

这个候选的价值不在字母封面，而在完整的数据探索面板：5,307 个真实色号按明度组成密度山形，用户可按品牌和命名类别过滤，在 swatches / names / table 之间改变证据粒度，并与全体分布对照。颜色本身同时是数据与视觉编码，不是装饰皮肤。

原项目没有明确代码许可，因此不能复制 Svelte 组件；可以基于 `pudding-data` 中 MIT 数据清洁重建同等的证据结构。数据应预处理为本地 bins 和索引，不把 1.29 MB 原始 CSV 直接塞进首帧。

### 3. `falsetto-story`：50 年音域时间线

**归类：** `build-page/references/chart.md`

**建议目录名：** `page-chart/vocal-register-timeline`

**主要来源：**

- `refs/falsetto-story/src/js/year.js`
- `refs/falsetto-story/src/js/graphic.js` 中 `year-0` 到 `year-17`
- `refs/falsetto-story/src/assets/data/avg.csv`
- `refs/falsetto-story/src/assets/data/avg_top.csv`
- `refs/falsetto-story/src/assets/data/songs.csv`

全屏状态机把一条 1958-2019 音域折线逐步变成年份比较、具体歌曲标注和 Top 10 散点对照。最终结论是由同一数据模型逐步显露出来的，不需要用户阅读长文才能理解。

这一项只是条件候选：必须截取纯图表状态，移除 Spotify 音频、Giphy 背景和 YouTube 结尾；原项目的品牌 logo 也不进 sample。MIT 代码可作状态编排参考，媒体授权不随代码许可转移。

### 分类边界

三个候选都是 `page/chart`：原作的滚动或左右点击只推进 authored chart state，用户没有改变模型条件并产生新结果。色号筛选虽然可探索，中心仍是读取固定数据的分布，按既定边界归 chart，不归 learning interaction。

## 已落地候选：人口山脉

**归类：** `build-page/references/3d.md`

**建议目录名：** `page-3d/population-mountains`

**主要来源：**

- `refs/3d-cities-story/src/js/graphic.js`
- `refs/3d-cities-story/src/html/partials/story/intro.hbs`
- 线上人口挤压与相机倾斜段落

### 为什么能补位

它不是给平面图片做透视假象。原实现使用 Mapbox GL 的空间挤压，将人口密度编码为真实高度，并在滚动过程中把相机从俯视转到约 60° 俯仰，再改变方位角。空间变换直接证明“平面上的人口点可以成为密度地形”，符合 `page/3d` 的 authored spatial evidence。

它不属于 `interaction/3d`：原地图设置为 `interactive: false`，用户滚动只推进作者编排的观察视点，没有改变人口模型、空间条件或推理结果。

### 保留的不变量

- 高度必须由本地人口数据或等价的明确字段映射得到，不允许手工摆一组看似城市的柱体；
- 首帧已有可读证据，相机变化进一步暴露密度峰值和城市结构；
- 至少包含俯视、倾斜和侧向三个有命名目的的 authored view；
- 同一批空间对象在相机变化中保持身份，不能用三张无关截图交叉淡化；
- 标题、单位、注释和结论保留为 DOM/SVG，不困在纹理或 mesh 中。

### 移植合同

- 正式 sample 运行时完全离线，禁止调用 Mapbox style、token、vector tile 或静态图 API；
- 使用可随 sample 打包的本地数据和 chassis 内本地 3D 能力重建真实几何；
- 可以学习 MIT 代码的状态与相机编排，但不能把远程地图截图或录屏当成 3D 页面；
- 若无法合法、离线地保留真实高度和连续相机，候选直接判失败，不降级为 `page/general` 或 cover。

### 验收重点

关闭网络后完整运行；检查 mesh 数值与可见高度一致；拖动或滚轮不是必要条件；reduced motion 直接落在最能表达人口地形的决定性视图。

## 已落地候选：随机性实验

**归类：** `build-interaction/references/general.md`

**建议目录名：** `interaction-general/randomness-lab`

**主要来源：**

- `refs/sixty/src/components/Slide.Test.svelte`
- `refs/sixty/src/components/App.svelte`
- `refs/sixty/src/utils/computeComplexity.js`
- `refs/sixty/src/utils/supabase.js`
- `refs/pudding-data/random/trials.csv`

### 为什么能补位

用户不是筛选固定记录，也不是点击下一页。他需要亲手构造一个“看起来随机”的序列；每次输入改变 canonical sequence，算法计算复杂度，页面把结果放进真实群体分布和研究争议中，随后用户可以依据证据修正自己的随机性直觉。完整链条是：

`构造序列 → 模型计算复杂度 → 与群体证据比较 → 暴露人的模式偏好 → 再次构造或改变判断`

这满足 `interaction/general` 的学习合同，也提供当前样例库缺少的“构造—测量—反思”交互，而不是再做一份滑块仿真或路径游戏。

### 保留的不变量

- 用户输入必须真正成为被评分的 canonical sequence；展示层不能另存一份伪状态；
- 复杂度、重复、run length 或等价特征必须由透明的本地算法计算；
- 页面展示个人序列在群体或基准分布中的位置，并解释这个位置回答了什么；
- 至少允许一次明确的再试或对比，让证据改变下一步动作；
- 初始画面已经可操作并说明任务，不依赖长篇滚动故事才能成立。

### 移植合同

- `sixty` 没有明确许可，因此不复制其 Svelte 代码或品牌视觉；只清洁重建交互模型和完成度；
- 原评分通过 Supabase 查询 `random_acss`，原聚合结果也从远程 Pudding URL 加载。正式 sample 禁止这些运行时请求；
- 优先只保留硬币序列任务，把合法可用的评分表和小型聚合摘要打包到本地；
- 如果无法合法打包原 CTM/acss 查询表，使用透明、确定性的本地 Lempel–Ziv、block complexity 或组合指标，并在页面中明确标注为近似复杂度，不能冒充原研究分数；
- 不把 2.3 MB 原始 trials 全量塞进运行时。离线预处理为足够复核图形的 bins、quantiles 和样本量；保留生成脚本或数据出处；
- 不上传、不持久化用户输入，不使用 Pudding logo 和字体。

### 验收重点

用全同、交替、短周期和伪随机四组确定性序列做模型测试，排序必须符合所声明的复杂度定义；reset 后输入、分数、图形和说明同时回到初始状态；断网、键盘和 reduced motion 均可用。

## 机制 donor，不直接计入样例

### `mow`

值得学习：

- `src/components/Game.svelte` 与 `StoryGame.svelte` 的真实路径状态；
- `src/components/Sandbox.svelte` 的 Play、Optimal、Pauses、Endings、Backtracks 等证据层；
- 最优路线、效率、回退和热力图的验证方式。

不直接收录：它与正式样例 `interaction-general/lawn-path` 使用同一类“网格障碍—路径—最优解—效率”学习模型。第二份不会增加 reference 的覆盖，且原仓含大量逐用户路径资产，直接打包会显著放大 sample。它只作为算法和验收 donor；除非未来 `lawn-path` 被淘汰，不再立项。

### `data`

`data` 是验证数据、字段、样本量和方法的来源，不是页面实现。除 `random` 外，本轮检查到的 queueing 等材料虽有真实公式和仿真价值，但没有与之配套、达到当前标准的完整页面，不能把 CSV 或 README 计作 sample。

## 二次审计对覆盖的影响

| 类别 | 当前可用 | 缺口 | 这三个新候选的作用 |
|---|---:|---:|---|
| `cover/composition` | 2 | 1 | 无法补位，需换新来源 |
| `cover/motion` | 0 | 3 | 无法补位 |
| `page/chart` | 6 | 0 | 只用于替换弱 sample，不继续堆数量 |
| `page/3d` | 2 | 1 | 人口山脉已计入，无新候选 |
| `interaction/general` | 4 | 1 | 色号筛选不冒充 learning interaction |
| `interaction/3d` | 0 | 3 | 六仓库仍无合格候选 |

因此这次重新审计改变的是 chart 样例的质量上限，不是缺口数量。整体仍有 9 个非 code 缺口。

## 所有新 sample 的硬门槛

- 固定 1600×900 逻辑画布，无页面或舞台滚动；
- 每个 sample 只归一个类别，只加载对应 `SKILL.md` 与一份 reference；
- 视觉和交互质量不得低于来源中被选中的段落；压缩代码不能成为降级理由；
- 正式运行完全离线，不依赖 Mapbox、Supabase、Spotify、Giphy、CDN 或远程字体；
- `interaction/*` 必须有真实算法、模型、仿真或规则系统；用户动作必须改变 canonical state、可见证据和有意义的下一步；
- `page/3d` 必须保留真实空间几何与 authored spatial evidence；截图、视频、CSS 透视卡片不算；
- 不复制未获许可的代码、字体、logo、影视内容或品牌资产；代码许可也不自动覆盖数据和媒体；
- 不出现 kicker、章节编号、操作提示条、instruction pill、review chrome 或其他与核心问题无关的 AI 生成痕迹；
- 字号和信息密度服从 1600×900 的远距离可读性，先删除无关文字，再放大必要文字；
- selfcheck、断网运行、确定性 reset、keyboard、resize、reduced motion 和资源清理全部通过后才能进入正式目录。

## 下一步顺序

1. 不恢复、不重做 `editorial-letter-grid`；`cover/composition` 去新仓库找替代品。
2. 若决定用这六个仓库提升 chart 样例质量，先做 `censorship-timeline`，它的证据密度、状态连续性和离线改造风险最好。
3. 第二选 `shade-name-distribution`，但必须清洁重建代码并预处理数据。
4. `vocal-register-timeline` 只在确认无音频、无 GIF 版仍能达到原图表视觉质量时立项。
5. `mow` 不立第二份路径游戏，保留为 `lawn-path` 的算法和验收参考。
