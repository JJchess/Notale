# Pudding samples · 研究与入库记录

**2026-09-07：用户已明确批准全部 29 项入库。** 正式条目位于 `workflows/build-page/samples/` 与 `workflows/build-interaction/samples/`，对应目录、源码包、状态截图及运行入口均已注册。以下保留当时的候选研究记录；历史“待 review”字样不代表当前状态。

[正式分类画廊](../../workflows/index.html) · [完整入库映射](evidence/promotion.json)。8 项图像/叙事内容页、12 项图表内容页、9 项规则/模型交互页。

入口：[可视化备选库](index.html) · [运行中的预览](http://localhost:41991/)。本地服务命令：`node experiments/pudding-samples/tools/serve.cjs`。每个 mini 都是独立静态目录；使用 HTTP 打开即可，不需要 Svelte、构建工具、API token 或远程数据服务。

## 当前候选

| Mini | 原作 | 独立抽取的机制 | 状态 |
|---|---|---|---|
| [wine-bottle-choice](review/wine-bottle-choice/index.html) | [The Pour-igin of Species](https://pudding.cool/2025/04/wine-animals/) | 原 8 帧瓶身旋转、四选一、聚焦、数据揭示、重选 | 待用户 review |
| [waistline-cohorts](review/waistline-cohorts/index.html) | [Sizing chaos](https://pudding.cool/2026/02/womens-sizing/) | 原人物 PNG 叠层、101 个百分位插值点、年龄与尺码带分别变化 | 待用户 review |
| [brand-size-atlas](review/brand-size-atlas/index.html) | 同上 | 原品牌尺码区间、共享轴、Large / Size 8 对照、数据点详情 | 待用户 review |
| [menu-reading-room](review/menu-reading-room/index.html) | [Menu story](https://pudding.cool/2026/06/menu-story/) | 三张原扫描件、连续聚焦、原图缩放拖动 | 待用户 review |
| [wine-animal-rankings](review/wine-animal-rankings/index.html) | Wine animals | 原 PNG 酒瓶与动物、三种指标重排、选中追踪 | 待用户 review |

“待用户 review”不表示正式入库。原作视觉质量判断、源码研究、缩减边界和 mini 截图检查分别记在各目录的 `REVIEW.md`，不能用自动测试替代视觉判断。

## 已完成的原作视觉 review

- 酒标：看过四瓶首屏、选择 songbird 后的聚焦、标签分类图片、后续排行段落。首屏与选择交互值得抽取；瓶身反射、透明酒液、标签、旋转帧是不可替换的视觉材料。
- 女装尺码：看过 tween 首屏、11 岁中位数、15 岁群体、切换女装尺码、成人分布和品牌对照。人物分布和品牌比较各自能独立成立；拼贴标题单独截出后证据不足，本批不立项。
- 菜单集合：访问 [menu-collection](https://pudding.cool/2026/06/menu-collection/) 后等待 30 秒仍停在 loading；请求 `static.soot.com` 失败。只看到加载拼贴，**未通过作品视觉 review**，没有计入候选数。

原作完整截图存放在 `evidence/wine-animals/`、`evidence/womens-sizing/`、`evidence/menu-collection/`。所有 PNG 是浏览器实际截图，不是生成图或设计稿。

## 素材与源码

完整上游源码已 clone 到本目录 `sources/`，未修改上游工作树：

| 仓库 | 固定提交 |
|---|---|
| `the-pudding/wine-animals` | `134e56e14dfd1ec356e04df73b83b50f888f7a31` |
| `the-pudding/womens-sizing` | `03bcfaedd43ebd3374a4334022c4b3dd20d75ec2` |

源码仓约 3 GB，留在本地研究区并由本目录 `.gitignore` 排除；mini 只携带自己的依赖。要恢复源码可按仓库 URL clone，再 checkout 上表提交。不得把整个源码仓当作 mini 分发。

- Wine：4 份原始 WebP，像素与字节不变。
- Cohorts：66 份原始人物 PNG，像素与字节不变；保留图层叠加方式。不是 SVG 小人或重复头像贴图。
- Brand chart：原作本就是 DOM 点、区间与坐标轴；保留区间和数据，没有用截图充当交互图表。
- 字体按原作 URL 下载后本地引用；`assets.json` 记录文件 SHA-256、字节数、源 URL / 路径、上游提交与关键代码/数据文件哈希。
- 上游代码 LICENSE 为 MIT，副本保留为 `LICENSE.source`。媒体、商业字体与原数据的出处保留在素材清单；源码许可不被解释为这些内容的额外授权。这里是用户指定的本地研究与备选 review，不作发布授权判断。

## 验证与复现

`tools/prepare-assets.py` 从固定源码复制原素材、整理本地数据；`tools/check-candidates.cjs` 用 Playwright 打开临时本地 HTTP 服务，拦截所有非本地运行时请求，然后验证三个分辨率的关键交互。浏览器依赖目前使用环境中的 `/tmp/notale-playwright/node_modules/playwright`。

- 尺寸：1600×900、1280×720、390×844。
- Wine：四种选择、数据反馈、键盘选择、重置、鼠标转瓶。
- Cohorts：所有四个状态、中位数 27.28 / 30.39 / 30.39 / 37.68、同一人物 DOM 身份、101 个数据点。
- Brand：全部 / Large / Size 8、点详情、恢复全部。
- 所有样例：本地图片加载、请求与 JS 错误、文档横向溢出、reduced motion 首帧。
- 结果：[candidate-checks.json](evidence/candidate-checks.json)；画面：各 mini 的 `shots/`。

小屏使用保留坐标间距的局部横向滚动图表；Wine 保持四瓶同屏。不能以“没溢出文档”为由把整个人物分布挤压成一条不可读的竖线。

## 首轮后续队列（历史记录，本轮更新见下）

1. 继续检查菜单集合的远程加载；尝试关联的 `menu-story` 故事，看到正常交互画面后再选段落并 clone。
2. 酒标排行中的 `blank-bottle.png` 本次浏览器请求失败，上游 clone 中文件存在。应复核正常源图，不把单次网络失败写成“文件不存在”。恢复画面后判断是否值得独立抽取。
3. 去 Pudding 官网继续视觉筛选不同作品，优先增加扫描/照片叙事、空间交互、具有原始素材的 motion 段落；本批只覆盖了两个正常加载的作品，不能宣称整个集合扩充目标已经完成。
4. 全部新增仅放备选库，最后由用户决定是否入库。


## 2026-09-07 菜单与排行批次（历史记录）

- **此批次结束时为 5 个 mini，全部未入库。** 本轮新增 menu-reading-room、wine-animal-rankings；原有三项保留。
- 菜单故事官网正常运行。已经实际检查横向阅读第 0–8 页，并额外查看第 7 页的聚焦结束状态。完整源码已 clone：`sources/menu-story`，固定提交 `c652bc855acdeba393f9fe1962070daf74645098`。与加载失败的菜单集合是两个不同页面。
- 原作酒瓶排行图片重试后正常加载，已取得价格与评分状态的完整画面并亲自查看。本轮采用原作实际使用的 summary CSV，保留与另一个 median CSV 的差异；也修正了原代码好交易汇总标记名称互换的问题，见单项 REVIEW。
- 新增两项均按 1600×900、1280×720、390×844 实机测试；候选画面实际查看后修复遮挡和注释定位。原始扫描、原手指图、瓶形、动物图片均原字节复制，资产清单可逐项复核。
- 复现工具：`prepare-menu.py`、`prepare-rankings.py`、`check-menu.cjs`、`check-rankings.cjs`。截图保存在对应候选 `shots/`；独立结果为 `evidence/menu-candidate-checks.json` 与 `evidence/rankings-candidate-checks.json`。

仍需继续：从更多 Pudding 作品补充不同机制，优先视觉检查洋葱切分的空间交互和其他照片/扫描件驱动作品。当前三部作品的选中段落已落成五个待审 mini；不把这批进度等同于整个持续扩充目标结束。

## 第四个原作：洋葱切分（2026-09-07）

新增第 6 个待审 mini：[洋葱切分实验室](review/onion-cut-lab/)。已亲自操作原作 Explore 的 radial、96% 和 explode。原作是二维剖面，保留原 PNG 字母、积分模型与 Paper.js 路径求交，四种策略对照 + 参数探索 + 同一批路径散开。完整复查、范围与贝塞尔圆弧误差说明见 [REVIEW](review/onion-cut-lab/REVIEW.md)。

`node experiments/pudding-samples/tools/check-onion.cjs` 检查三尺寸、原作指标、面积守恒、实际路径与积分面积一致性、滑块/重置/键盘；结果见 evidence/onion-candidate-checks.json。原仓库 sources/onion 的 commit 与逐项哈希记录在 assets.json。所有 6 项仍 pending-user-review，promoted=false。

## 第五个原作：Walkachusetts（2026-09-07）

新增第 7 个待审 mini：[路上的 72 个瞬间](review/walk-photo-journal/)。已亲自视觉查看官网黑底 TLDR 照片墙、滚动路线，以及 TEXT 手绘照片边框；随后 clone `the-pudding/walkachusetts`，固定 commit 见素材清单。

提取全部 72 个有序影像（58 照片 + 14 原 MP4），保留原 WebP、较大原 JPG、九张每日插画、五张 PNG 边框与原生 route.svg。新增按天跳转、单张查看器；手机保留原作单列。详细来源、按天插值的步数估算与新增交互范围见 [REVIEW](review/walk-photo-journal/REVIEW.md)。

三尺寸交互检查通过；144 图片全部解码、14 视频均有有效元数据，并检查可见视频实际播放与暂停。159 原素材 SHA-256 逐项匹配。结果见 evidence/walk-candidate-checks.json、walk-media-checks.json。

当前 7 项均 pending-user-review，未入正式集合。后续继续官网筛选其他有独立视觉机制的作品；菜单集合的远程依赖仍待恢复后视觉核验。

## 第六个原作：爱情小说封面（2026-09-07）

新增第 8 项：[插画，走上书架](review/illustrated-cover-shelves/)。亲自查看官网 Illustration 的横移书架，并操作加入清单、打开阅读清单。实际界面源码为 `romance-covers-new`，已经 clone；先取得的 `romance-covers` 是图片下载工程，两个来源的作用已区分。

保留完整 375 本 Illustrated 封面、13 年时间书架、CSS 原生立体层板与阅读清单，比例直接从 1,435 条原数据复算。全部 JPG 逐字节匹配。三尺寸浏览器检查通过，375 图解码成功；详见 [REVIEW](review/illustrated-cover-shelves/REVIEW.md) 与 evidence/romance-candidate-checks.json。

本轮另看了 2019 book-covers 官网：当前只显示未排版文本，原地图没有正常出现（截图 evidence/book-covers/initial.png）。未将它视为通过视觉审核，也未制作候选，后续可复查恢复情况。

当前 8 项全部 pending-user-review、promoted=false。继续筛选其他正常可观察的原作，最终由用户统一决定入库。

## 第七个原作：Crokinole（2026-09-07）

新增第 9 项：[一击训练室](review/crokinole-shot-lab/)。已视觉复查官网模拟器棋盘及瞄准状态，并 clone `the-pudding/crokinole`。提取原三个手动局面，保留 Matter.js 物理、CSS 背景棋盘、原尺寸和四段 MP3；新增独立操作与结果保留。

本地三尺寸实际出手检查已通过：20 分入洞、未触碰对手的无效移除、碰撞有效性、原借力局面、键盘蓄力。手机 DPR=2 前景/背景对齐通过。原文件、适配文件和构建文件哈希全部核对，详见 [REVIEW](review/crokinole-shot-lab/REVIEW.md) 与 evidence/crokinole-candidate-checks.json。

另已视觉查看动物拟声词原作，但尚未定位公开可 clone 的项目源码；研究证据在 evidence/language/，暂不作为候选。

当前 9 项均 pending-user-review，promoted=false，等待用户统一入库决定。


## 2026-09-07 · Flipbook 四路对照

亲自查看原作、克隆 `the-pudding/flipbook` 并研究 Scrub 组件，新增 `review/flipbook-branches/`。完整复制六组 2,160 张 640×640 PNG，逐文件原件与 SHA-256 一致；加入播放、变速和逐帧控件。三种视口交互检查与全部图像解码通过。候选库现 10 项，全部 pending-user-review、未晋升。细节与边界见该 mini 的 REVIEW.md。


## 2026-09-07 · Pockets 容纳对照表

亲自查看原作并操作 iPhone X / Uniqlo 筛选，完整浅克隆 pockets，新增 `review/pocket-fit-desk/`。保留 80 条测量与预计算矩形、7 张原 PNG、原生 SVG 口袋绘图代码。七物品 × 80 口袋与在线原作逐条对照路径、物品尺寸/旋转和容纳状态，在三种视口通过；补充键盘详情、筛选与展开复核。候选库现 11 项，全部等待用户统一 review，未晋升。


## 2026-09-07 · 球衣版本穿着比例

亲自查看 Colors of the Court 原图与交互，完整浅克隆 nba-uniforms，新增 `review/jersey-edition-board/`。保留 126 张原 PNG、木地板 JPG、完整比赛和球队数据。29 队百分比与原在线表相同；修正原表对湖人 City 2 一场的漏计并保留对应 Kobe 原图。三种尺寸的全队切换、五列排序、键盘详情检查通过，127 图片解码及 129 原件哈希通过。备选库现 12 项，均 pending-user-review、未晋升。

本轮另浅克隆 movie_poster_colors；仓库元信息仍为模板占位，尚未确认已发布原作地址，也未视觉批准，暂不列候选。


## 2026-09-07 · Aztec iconography 局部讲解

亲自查看原作局部遮罩、滚动到鼻饰细节，完整浅克隆 aztec-gods。新增 `review/iconography-lens/`，保留两幅 1064×1064 PNG、一张原小图、17 个讲解状态及原遮罩坐标。三种尺寸检查、全部坐标/正文对照和图像解码/源件哈希通过。原仓库未见 LICENSE，来源事实记录于 SOURCE-NOTICE.md，不虚构许可。候选库现 13 项，全部等待用户统一 review，未晋升。


## 2026-09-07 · Shelters 个体流向

亲自查看原作图像分组、实际操作 Washington / imports 与 Rebel 悬浮详情，完整浅克隆 shelters。新增 `review/dog-flow-atlas/`：2,460 原记录、50 张品种 PNG、51 个州及特区双向切换。三种尺寸下全部 102 个组合的个体 ID 多重集合与源数据相同；全图解码、52 源件哈希与派生 CSV/JSON 一致性通过。备选库现 14 项，全部 pending-user-review、未晋升。


## 2026-09-07 · Pantheon 图像索引

继续研究已克隆 aztec-gods 的另一模块，亲自查看 Ometeotl 档案、Tlaloc 图像选择与 life 高亮。新增 `review/pantheon-index/`，保留完整 PNG 精灵、137 张原 SVG（非重绘）、137 条数据与原正文/出处。三种尺寸逐项原图解码、四主题集合、检索/键盘/来源检查通过，141 源文件哈希一致。另修复公共预览服务 SVG 等 MIME 类型。候选库现 15 项，全部等待用户 review、未晋升。


## 2026-09-07：Music DNA 片段对照（第 16 个候选）

实际查看 Music DNA 原作首屏和 Under Pressure → Ice Ice Baby 的正文对照，克隆 `the-pudding/sample-trees` 固定提交 `6a75bcb013e215739f3955878bcd0b87232bd6f7`。首次克隆明确网络失败，第二次完成 11,451 文件检出。

新增 [music-sample-pair](review/music-sample-pair/index.html)：两张原 JPEG 封面、原噪点、原字体和两段完整 MP3（7 / 8.5 秒），复用原 WaveSurfer 7.8.8 绘制真实波形。源码中的 crossfade 控件是顺序音频的视觉指示器，因此抽取为单播放器的 A→B 试听，不虚构同时混音。加入暂停、单段选择、波形与键盘定位。用已解码媒体 Blob 修复静态服务无 Range 时的定位回零问题。

三尺寸播放状态、切换、终点停止、定位、原图/波形解码和源素材哈希检查通过；亲自查看桌面与手机实际截图。完整边界见 [Review](review/music-sample-pair/REVIEW.md)。现 16 个候选，均待用户 review、未晋升。


## 2026-09-07：Population Clock（第 17 个候选）

亲自查看 Data Clocks 的新闻时钟、人口时钟，以及原作换城和浅色状态。完整克隆 `the-pudding/clocks`，固定 `eb7e3d5fa4fd25fc48b0577427cdb6951b0ae1fb`。人口实验具有独立完整数据与文字视觉机制，新增 [population-clock](review/population-clock/index.html)。

保留 8,664 条原记录、720 个十二小时制时刻、原三级候选筛选、Rubik 三种字重和深浅色。完整数据本地运行，新增时间选择、恢复实时和候选列表；原作没有照片，不存在以 SVG 替代照片的处理。原数据快照年代在页面明确标注。三种视口所有时间集合、跨分钟计时、人工选时、换城、列表和原数据/素材验证通过，已亲自看桌面与手机实际截图。详见 [Review](review/population-clock/REVIEW.md)。现 17 个候选，全部待用户 review、未晋升。

本轮其他线索：新闻时钟已实际查看，但依赖更新中的在线新闻数据，尚未抽取；`queues` 首次完整克隆进程已明确以 exit 128 结束（GitHub 443 连接超时），尚未确认原作 URL 与视觉，不计入候选。单仓库网络失败不阻塞其他研究。


## 2026-09-07：State Maze Stories（第 18 个候选）

亲自查看原作六人故事选择、California 开始前后，以及本地桌面/手机操作截图。完整克隆 `the-pudding/mazes`（`4bfd954b3532d0eacff03195f3da234e115f3ac9`），抽取 [state-maze-stories](review/state-maze-stories/index.html)。保留原 Svelte 3 迷宫/故事/地图/方法论组件、51 州与特区、六人原 PNG、原字体、所有迷宫 CSV 和活动册。原政策语境注明截至 2024-10-17。

三尺寸真实通关 California、阻墙判定、存档恢复、自动解答不计数通过；实际逐个打开全部 51 州、四种排序和 122 项源素材哈希检查通过。修复关闭后焦点恢复的原 ID 错误，补充 Escape、dialog 和手机键名。保留完整构建源码与依赖锁。原作重访中的网络加载失败和跳动按钮自动化等待已在 Review 中如实记录，最终成功完成原作操作截图。现 18 个候选，全部待用户 review、未晋升。


## 2026-09-07：Banknote Firsts（第 19 个候选）

亲自查看纸币原作的五图轮播与 Firsts 图表，实际悬停看到 Manuel Belgrano 的原纸币肖像及成就。完整克隆 `the-pudding/banknotes`，固定 `5e742abe8c8fe067ef3afc0ef58a55f6ede573b4`，新增 [banknote-firsts](review/banknote-firsts/index.html)。

保留全部 71 条记录、32 国、39 张原 WebP 肖像和五张原 JPG 票面。缺图记录继续无肖像，不生成替代图；原文件的 300px 清晰度如实保留。原 Baloo/Abhaya 字体、性别色和每人等宽格延续，增加稳定详情、键盘、检索、筛选与手机返回定位。轮播自动播放/暂停、横滑及原图阅读通过检查；修复原生图片拖拽对指针横滑的干扰。

三种尺寸逐条检查 71 份详情、全部肖像与票面、筛选/空状态、49 项源素材哈希与原数据去重顺序；亲自看本地桌面与手机截图。仓库没有 LICENSE，保留事实性来源说明，不虚构授权。现 19 个候选，全部待用户 review、未晋升。


## 2026-09-07：Foundation Shade Desk（第 20 个候选）

亲自查看 Beauty Brawl 正常加载后的 US 色块图，并实际操作 Count 与 Fenty 对照。完整克隆 `the-pudding/makeup-shades`（`e672acb1a18752b6c855394bb29598ed5d08962d`），新增 [foundation-shade-desk](review/foundation-shade-desk/index.html)。首次样式/图表加载不完整没有用于通过审核，重访成功的证据另存。

直接保留原 brawl 绘图 JS 与原 D3 4.12.0 + Jetpack，六组比较使用 585 条记录；完整 625 行原 CSV 同时保留，前置 Make Up For Ever 动画不冒充已迁移。五张原 JPG 实物拼贴、Nunito 字体、原色块/计数和 Fenty 开关均保留，增加 HEX/L 区间详情。手机标签固定、品牌列独立横滑。

三尺寸 6×2×2 全部组合的逐产品分箱数值、原 HEX 与可见状态检查通过；原素材/数据哈希一致，亲自查看桌面与手机最终图像。原数据注明 2018 年 5 月及方法边界。现 20 个候选，全部待用户 review、未晋升。

### 2026-09-07 — 候选 21：蒙面摔角手图鉴

已克隆 `the-pudding/wrestling`（36666b42395537a4c2adc87df871b06afe0434af），亲眼查看正常原作入口、Anibal 人物详情与 Japanese 筛选（17 项）。抽取完整探索模式为 `review/masked-wrestler-index/`：226 项原记录、完整 PNG 精灵图、双语简介、三类筛选、关联人物和原 fax 像素动画。原作三篇引导叙事不属于本 mini 范围。

三种屏宽均检查 226 项详情与 81 个英法筛选状态；5,785,600 个原像素通道比较 0 差异。亲眼复核桌面和手机，修正双语标题精灵图需裁切的问题。原始损坏关联 ID 作有记录的别名修复，缺失目标保持原文不伪造。源仓库无 LICENSE，来源说明已附。画廊共 21 项，均 pending-user-review、promoted=false。

### 2026-09-07 — 候选 22：一位歌手，多少种重复？

克隆 `the-pudding/song-repetition`（3e2682daf581f82741691257d0fe896b50298c8b）并亲眼查看原作 Gwen Stefani 分布与 Rihanna 详情，抽取 `review/artist-repetition-lab/`。461 位原索引歌手、6,919 条歌曲叠加 137 个原背景区间，使用原 D3 图表逻辑和四个原字体；该模块本身是 SVG 图表，未替换任何原栅格素材。

三种屏宽分别遍历全部 461 位歌手，点数、原配色、图幅边界、交互与动画通过；576 个原文件逐字节核验。手机图表横滑、原始资料年份与研究范围已明确。源码、构建文件、许可、截图及检查记录齐全。备选库共 22 项，全部 pending-user-review / promoted=false。

### 2026-09-07 — 候选 23：填字里，你先想到谁？

克隆 `the-pudding/crossword-puzzles`（552aa705a9a08ee48e06724921dba83ec8b6f968），亲眼查看原作棋盘、揭示和人物高亮；提取全部 13 套题、130 条线索，继续运行原 svelte-crossword 0.3.4 和原手机键盘，保留原字体及 SVG 棋盘/交叉纹理。五出版物与八年代的完整选择范围均保留。

三种屏宽逐题验证答案、交叉格、高亮、Clear 和检查；实际键盘通关及触摸键盘输入通过，普通动画、撤销/重做也通过。配套源码 1970s 的 URM 比例误写 91%，已亲眼核对原主文图表的 9%，作有出处的修正并归档原字段。19 个原数据/素材文件逐字节一致。画廊共 23 项，全部待用户 review、未推广。

Queues 的 clone 此轮已成功（0ec1d22ef61792a177b060efa734b2617771579b），但官网入口为视频，未找到可复核的交互原页，暂存 `evidence/queues/REVIEW.md`，没有创建候选。

### 2026-09-07 — 候选 24：年鉴里的发型年代

克隆 `the-pudding/hairbook-viz`（9e1f9bfc3014aae9ca5e39e7a55b8591d7b4a6e4），首次原页资源不完整，重试至曲线和照片全部出现后亲眼查看 1930s 图像、1985 hover。提取完整 84 年趋势与 180 张原 PNG，原 D3 绘图、数据、字体和照片保留；加入手机/键盘可用的年份选择与原图查看器。

三种屏宽遍历 84 年并解码全部 180 张照片，曲线路径和数值核对通过；188 个仓库原文件及一个原网页字体的哈希记录齐全。照片只代表年代，与年度中位数的关系已明确。亲眼复核桌面、手机和查看器后加入画廊，总计 24 项，全部 pending-user-review / promoted=false。

### 2026-09-07 — 候选 25：历史看起来有多远？

克隆 `the-pudding/photo-quiz`（6d012be7853337b199d3a7ec9d7a8557204343f5），亲眼查看原问答页和五题后结果；复核阻断原研究写入。完整保留二十个 JPEG（十张照片各两版）和 126,900 行公开读者快照，按原公式生成平均值和每组 last100。抽取五题年代判断与十图对照为独立本地 mini，保留原 noUiSlider 14.2.0 与字体，不采集出生年份或提交回答。

三屏宽实际五题作答、十图二十版解码、分布与查看器通过；23 个原仓库文件逐字节验证，20 组统计独立重算一致。备选库现 25 项，全部 pending-user-review / promoted=false。

### 2026-09-07 — 候选 26：着装规定，限制了谁？

克隆 `the-pudding/dress_codes`（1e1d4abce73f582b7cab119045927984a842b41d），亲眼查看原学校图阵及完整服装分布，成功重访加载后的五状态记录已存。提取 41 个服装标签、七区间、五段原解释，保留原 D3 高亮、GIF 与字体；增加频率/营销分类直接切换和逐项数量详情。

三尺寸全部标签与状态、41 项键盘详情通过；205 项显示状态与官网实际 DOM 逐项一致，正常动画和快速切换通过。11 个原文件逐字节验证。亲眼复核本地桌面和手机；说明原研究时间及抽样范围。画廊共 26 项，全部 pending-user-review、promoted=false。

### 2026-09-07 — 候选 27：波形与空气，怎样一起动？

克隆 `the-pudding/waveforms`（61349cde4b95583190e76a450122e2a5820b175d），亲眼查看官网完整空气网格、追踪列和方波；提取空气实验台，复用原 Waveform/AirGrid/Canvas/Oscillator 等组件及四个原字体。四波形、676 粒子、振幅/频率/相位、动画与试听独立可控。

三尺寸 36 状态与键盘/追踪/停止检查通过；正弦网格 6,100,980 个原像素通道零差异；实际浏览器音频 12 组 FFT 频率、振幅归零/恢复/静音通过。修复源粒子非正弦负相位、暂停初始绘图和快速动画切换边界，原版本均已留存。亲眼查看本地桌面及手机，画廊现 27 项，全部 pending-user-review、promoted=false。

### 2026-09-07 — 候选 28：同样的胜率，不同的余额

克隆 `the-pudding/yard-sale`（74127adc3445d686923257d67b76c497bc411df7），亲眼查看原手表开场、双人初始状态与第十轮结果。提取原 Svelte 双人模拟，保留四张人物 PNG、原 LayerCake/D3 双图和字体，增加逐轮精确余额表与重播。

明确标注原开场 12 轮为预设示例、原重置从第一轮随机。三尺寸逐轮核对官网和独立计算；财富反转与连续 1,000 轮种子随机交易均通过，原 17 项素材/文件哈希核验。已亲眼复核本地桌面与手机。备选库现 28 项，全部 pending-user-review、promoted=false。


### 29 · 外婆的泡菜厨房（2026-09-07）

实际查看原作标题、厨房、营养图与品尝画面后，提取完整 1996 章节。25 层原记录、四食材、三组放大图、12 段开场与 11 段收尾；68 个源文件核验，三屏宽完整流程和实际音频信号测试通过。候选 [grandmas-kimchi-kitchen](review/grandmas-kimchi-kitchen/REVIEW.md) 等待用户统一审阅，未提升。
