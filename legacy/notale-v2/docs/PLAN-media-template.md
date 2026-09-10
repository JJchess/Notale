# 蓝图：媒体素材链路 + 模板驱动的风格控制

> 历史草案，已由 [媒体与视觉主题包 · 精简实施计划](PLAN-media-template-v2.md) 替代。本文保留现状调查与旧方案，不再作为实施依据。更新后的总览见 [ARCHITECTURE-v3.html](../architecture/ARCHITECTURE-v3.html)。

2026-09-07。只读调研后写的设计，不含实施。判据沿用 `PLAN-research-loop.md` §4.6（6 deck 盲评、任一 deck 劣化即拒）。

---

## 0. 先说现状 —— 链路不是没有，是死的

代码里已经有一整条「planner 规划图池 → harness 取图/生图/压暗/抠图 → 按页发给 builder」的链路
（`core/planner.py: assets / img_plan / _img_lines`，`core/imgcut.py`，执行体 `vendor/skills/{web-media-getter,make-illustration}`）。
最近 12 轮 run 里渲染出的图是 0 张，原因有三处，全部在代码或 run 产物里能指认：

| # | 断点 | 证据 | 性质 |
|---|---|---|---|
| A | **送达 bug**：`plan_run` 把 `assets()` 返回的 IMG.md 正文当 `pool` 传给 `briefs()`，而 `_IMG_ROW` 只认原始表的裸文件名（IMG.md 那列是 `` `assets/img/x.jpg` ``，带反引号和前缀）→ 永远匹配 0 行 | 读代码即可确认；probe-uhi 取到 6 张、送达 0 | 确凿 bug（研究计划里的 F7） |
| B | **planner 过度弃权**：deck.md 说「只规划真正承担证据、场景或可操作物体的图」，示例是考古题 → 史记、集成学习、全部 ens-* 轮都写了「本套无需图池」 | `runs/probe-shiji-20260905/pages/plan/pages.md` 首行；ens-trim/steps/comp 同 | 提示词措辞 |
| C | **builder 侧没有图工具**：ImageSearch / ImageGen 8-29 升格为工具（43f0537，含 4 条测试），b84aef0 checkpoint 时整块删掉；`prompts/tech.md` 的「图片」一节仍指向一个总是空的 IMG.md | `git show 43f0537:notale-v2/core/tools.py` | 回退 |

另一条结构性缺口：Style Director 与 deck **并行且互不见**（`plan_run` 刻意如此），所以即使图池有「整页底图」，写 theme.css 那一步也看不到它；
`direction.md` 里「source the background from the subject or supplied image」这句没有任何 supplied image 的入口。

**结论先摆出来：** 问题 1 的主体工作是修 + 恢复，不是新建；问题 2 的主体工作是给 Director 加一个「用户参照」入口，复用它已有的取样-写主题-闸这条路。

### 0.1 三个同级 agent（2026-09-07 与用户对齐后定）

Planner（内容）、Style Director（外观）、Builder（页面）是**三个同级 agent**，由一层确定性的编排（run 脚本 / `core.run`）并行拉起前两个、两者落盘后再起 N 路 Builder。三者互不调用，只通过 run 目录的文件契约通信：

| agent | 写 | 读 |
|---|---|---|
| Planner | `plan/pNN.md`、`briefs.json`、证据图 `assets/img/*` | run 参数 |
| Style Director | `theme.css`（含 TEMPLATE 块）、`assets/img/backdrop.*` | run 参数、`--template`、画廊 |
| Builder | `page-NN.html`、`assets/img/pNN-*`、`CREDITS.md` | 上面两行的全部产物 |

代码本来就是这个形状（`core/director.py` 自带入口、提示词、闸、trace 步骤），只是被 `plan_run` 用一个线程和 `--style-director` 开关挂在 Planner 下面。改动是删掉那个线程与开关，`config.yaml` 加 `director:` 一节与 `planner:` `builder:` 同级。

**整页底图归 Director，不归 Planner。** 它是外观决定：Director 在①选参照那一次响应里顺手发一个 ImageGen / ImageSearch 取底图，②写主题时底图已在手里。这样 Planner 与 Director 之间**零等待**，第一版蓝图里「写主题等 deck 回合 1 取完底图」那根跨 agent 的线就不存在了。

---

## 1. 媒体：两层各管各的，取图永远是 harness 的事

### 1.1 回答「planner 加还是 builder 自己找」

不是二选一，两层管的东西不同：

| 层 | 管什么 | 为什么在这层 | 模型输出什么 |
|---|---|---|---|
| **planner** | **证据图**：具名人物、真实器物、文献、遗址、数据来源截图 | 只有它知道全套结构，能用图**约束**一页的内容（「算法史」那页配 Freund & Schapire 的照片，builder 就不会把史页写成又一张流程图） | `ImageSearch` / `ImageGen` 工具调用，≤14 张，与 `Write(pages.md)` 同一响应发出 |
| **director** | **整页底图**（模板自带则直接用） | 底图是外观决定，要和 token 一起定 | ①那次响应里 ≤1 个取图调用 |
| **builder** | **局部图**：本页的氛围、材质、组件素材、planner 没料到的需求 | 8–12 路并行，取图成本可以摊；planner 串行不该扛全部 | 同样两个工具，每页有预算 |

**三侧都是工具，同一份执行体。** 第一版蓝图写的是「planner 只写一张 markdown 表，harness 用正则抠参数」——那正是 8-28 为 theme.css 围栏 bug 放弃的「从散文里抠代码」形状，断点 A 的送达 bug 就是这个形状的产物。改成工具之后参数走 schema 校验，这一类 bug 整体消失，而不是被判据兜住。
「集中获取导致一步输出不现实」的顾虑仍然不成立：模型只发调用，下载、判相关、压暗、抠图全是工具体内的确定性步骤（43f0537 定下的边界：执行体是 harness 代码，不是模型用 Bash 拼命令）。

### 1.2 planner 层：一次调用变两回合，其余修两处

**a. 两回合（替掉断点 A 那条正则链路）。**

```
回合 1  planner 一个响应：Write(pages.md 草稿) + N × ImageSearch/ImageGen
harness  并发执行 N 个取图（现 assets() 是串行，改并发顺手），每张回传 标题/许可/尺寸/缩略图，取不到的回传原因
回合 2  planner 看结果：补搜没取到的、剔掉不相干的（Holbein 那张靠看图剔，不靠 _off_topic 正则猜），
        Write(pages.md 定稿)，每页主题旁点名本页用的文件
```

上限写死：**2 回合、14 张**；回合 2 里再发的取图执行完就结束，不再有回合 3。GPT-5.6-Sol 能吃 `input_image`（已探过），缩略图按 Director 的先例缩到 900 宽 JPEG。
送达由 harness 从工具调用的 `pages` 参数确定性地发到 brief，不再解析任何文本；`_IMG_ROW` / `img_plan` / IMG.md-as-data 一起删。
回归用例一条：规划了图的 deck，`briefs.json` 至少一页含 `assets/img/`。

代价：planner 多一回合（一次取图墙钟 + 一次调用），换来「模型看见了取到什么」——这是现有链路里彻底没有的一环，也是 `_off_topic` / `_too_pale` 两条正则守卫存在的原因；它们可以随之降级成只记录。

**b. 弃权门槛（断点 B）。** deck.md 里图池那一段改成「何时该发 ImageSearch/ImageGen」的规则，不靠一个考古示例：

- 页表里出现具名人物、器物、文献、地点、机构、历史事件 → 该页必有一张**照片**行；
- 纯抽象题目也有「历史/人物」页，规则同上；
- 一张图都不发也可以，但 pages.md 开头要写一句理由；harness 只记录不拦。

量法：6 个基准 deck 的图池非空率、每 deck 图行数。现在是 0/6。

**c. 底图不在这里。** 整页底图挪到 Director（见 §0.1、§2.4），Planner 图池只剩证据图。`_dim_backdrop` 与 `backdrops.jpg` 那段逻辑随之搬到 Director 侧的工具体里。

### 1.3 builder 层：恢复，不是新建

从 43f0537 恢复 `ImageSearch` / `ImageGen` 两个工具（schema、dispatch、4 条测试都在 git 里；执行体复用 `vendor/skills` 同一份，不留第二份实现）。要补的只有三样：

- **预算计数**（harness 侧）：每页 `ImageGen` ≤1 次（`n`≤2）、`ImageSearch` ≤2 次，超了 dispatch 直接回拒绝文本。生图单价先量一次再定数。
- **命名与越界**：本页私有图落 `assets/img/pNN-*.{jpg,png}`；`tech.md`「不修改 assets/」加这一条例外。图池图无前缀，一眼分得出谁的。
- **出处**：`ImageSearch` 下载结果里的 title / author / license 由 harness 追加进 `CREDITS.md`；builder 只负责 `<img title>`。

边界已经在工具 description 里写好：具名/真实 → Search；氛围/材质/无法拍摄的场景 → Gen；数据/几何/标签 → 自己画 SVG。

### 1.4 量什么

- 图池非空率、送达率（brief 提到 / `count_images.py` 数 `naturalWidth>0`）、每 deck 渲染图数；
- G3（AI 判别）有图 vs 无图对照 —— 这是「有视觉主体」那条判据最直接的杠杆；
- 生图费用 / deck。

---

## 2. 模板：用户参照进 Director 已有的那条路

### 2.1 一句话

**模板 = 一条由用户提供、必选的参照。** Director 现在的形状是「204 条画廊 → 挑 5 条 → 看截图写 theme.css → 四道闸」；
有模板时跳过「挑」，把模板的截图当成那 5 条，其余不动。画廊行的数据形状 `{id, src, title, pal, shot}` 直接复用：
模板截图过一遍 `gallery._palette()` 就是一行 `src="../../user"` 的参照，底色锚定闸（`ANCHOR_MAX`）自然锚到模板的实测底色上。

### 2.2 模板目录契约（`--template <dir>`）

```
template/
  shots/*.png|jpg      参照页截图，≥1 张（必需）。pptx 由用户先导出成图；v1 不解析 pptx
  backdrop.{jpg,png}   整页底图（竹简那种），可选
  logo.{png,svg}       角标，可选
  fonts/*.ttf|otf      随模板的字体，可选
  TEMPLATE.md          自由文字：气质、禁忌、角标位置、版心要求，可选
```

### 2.3 模板控制的三层，谁写谁

| 层 | 内容 | 谁产出 | 进哪里 |
|---|---|---|---|
| **L1 token** | 颜色、字体、字阶、材质/签名的文字契约 | **模型**（Director ② 步，看 shots + TEMPLATE.md） | theme.css 主体，四道闸照跑 |
| **L2 底图** | backdrop + 蒙版 | **harness**，确定性 | theme.css 末尾 harness 追加的 `/* ==== TEMPLATE ==== */` 块 |
| **L3 版框** | logo 角标、放大的 `--pad-x/--pad-y` 让版心避开角标 | **harness**，确定性 | 同上 |

L2 的实现是 `#stage::before{ position:absolute; inset:0; z-index:-1; background: linear-gradient(rgba(bg,α),rgba(bg,α)), url(assets/img/backdrop.jpg) center/cover }`。
`#stage` 有 transform，自成堆叠上下文，`z-index:-1` 稳稳压在所有页内容之下，builder 一行不用写。
**α 是算出来的**：取 `--text` 与「底图按 α 叠 `--bg` 后的 p95 亮度」求对比度，解到 ≥4.5:1 的最小 α。
这条正是 `_dim_backdrop` 那段注释里的教训（opacity .19 的底图把正文对比拉到 2.60:1）—— 控制不住结果的不是 opacity，是源图亮度分布，所以量了再定。

闸只跑模型写的那部分；TEMPLATE 块是 harness 写的，形状声明不在禁令范围内（禁令的目的是不让模型发组件形状，harness 追加的层不是那回事）。
接口块由 harness 补一行给 builder 看：`底图  assets/img/backdrop.jpg 已铺在 #stage 底层，蒙版 α=.62；本页不再铺底`。

**无模板时 Director 自己取的底图也走 L2 这条路**，替掉现在「builder 自己 opacity .16–.22 铺底」的做法。铺底图只有一条路，且是 harness 的。

### 2.4 Director 的改动面

```
rows  = template.rows(dir)  if template else gallery.measure()
picks, bg_call = rows, None  if template else pick(run, rows)       # ① 一次响应：挑 5 条 + ≤1 个取底图调用；有模板不调模型
backdrop = template.backdrop or run_tool(bg_call)                    # 同一份 ImageGen/Search 执行体 + _dim_backdrop
css   = theme(run, picks, backdrop, template_brief=TEMPLATE.md 内容)  # ② 看 5 张截图 + 底图写 token
css  += template.layer(run, backdrop, css)                           # @font-face + L2 + L3
```

一个新模块 `core/template.py`（rows / layer / 求 α，约 120 行），`style-theme.md` 多一个 `{template}` 槽位，`style-pick.md` 允许发一个取底图调用，director 接 `--template` 参数；planner 不知道模板的存在。
`fonts_installed` 闸把模板随附字体的 family 算作已装。

### 2.5 明确不做的

- **不解析 pptx。** 先让用户导截图。升级路径：`python-pptx` 读 `theme1.xml` 直接拿主题色和字体，跳过截图量色。
- **不做「标题带 / 版式模板」。** 5 套 102 页里 79/79 同一版式指纹是当前最大的失败（F1），模板若强加标题区和内容区，就是把这个指纹变成规格。
  模板对版式的影响只到 `--pad-*`（避开角标）；TEMPLATE.md 里的版式要求以文字进 Director 提示词，最终仍由 builder 按内容定构图。
- **不让 builder 看整个图池。** 每页只收自己那几张（现有 `用在哪几页` 列），否则 20 页都去拿同一张最好看的图。
- **不上 rembg。** `imgcut` 的连通域路线对「孤立物体 + 平背景」够用且可复现。

### 2.6 量什么

- G1 跨 deck 判异（既有 judge）：带模板 vs 不带；
- **模板忠实度**：复用 G1 配对提示，配对 = 模板截图 × 生成页，问「同一套吗」；
- 合成对比度：每页 `--text` 对合成底 ≥4.5:1（确定性，进 selfcheck）。

---

## 3. 顺序与代价

按「先修死的，再加新的」排：

1. **恢复 ImageSearch / ImageGen 工具 + 预算计数 + CREDITS 追加** —— 从 git 取回，一天；两侧共用。
2. **planner 两回合 + 并发取图 + 按参数送达 + 回归用例** —— 删掉正则链路，一天。
3. **deck.md 弃权门槛 B** —— 提示词，6 deck 量图非空率。
4. **Director 独立成同级 agent** —— 删 plan_run 里的线程与 `--style-director` 开关，编排层并行起两个进程，config 加 `director:`；底图取图挪进 Director ①。
5. **`core/template.py` + `--template`** —— rows / layer / α 求解，两天。
6. **底图统一走 L2** —— 删 builder 侧铺底说明与 planner 侧 `_dim_backdrop`。

1–3 做完就能回答「配图对 G3 有没有效」；4–6 做完能回答「模板对 G1 有没有效」。两组实验互不依赖，可以分两臂跑。

风险两条：Seedream 生图端点（`gen.py` 写死 paratera `Doubao-Seedream-4.0`）要先探一次还活着没有；Wikimedia 的相关性守卫 `_off_topic` 放过过一张 Holbein 肖像，图多了以后误取会更显眼，届时加一道 Look 级的复核而不是再堆正则。
