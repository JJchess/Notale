# 命名规范 · House Naming Regime

> 目标：全系统命名一致，且**吸收外来资料（博物馆/编辑设计等）时把它起成本地名，让它看起来和我们的系统浑然一体**。
> 定调：**朴素小写英文 id + 中文显示名**；外来学术黑话一律译成朴素本地词；研究编号（`DESIGN_RESEARCH` 的 T-n）只作 provenance、永不暴露为名字。
> 法制：**渐进法制**——新命名从今天起硬执行；已进数据/语料的 id 缓行（grandfather）；只清理廉价且不入数据的漂移。

---

## 1. 命名空间与规则

| 命名空间 | 出现在 | 规则 | 例 |
|---|---|---|---|
| `scene.kind` / `block.type` / `layout.kind` / `layout.preset` / `theme` | doc JSON（数据） | 全小写朴素英文；**单词优先**，必要才连字符；禁外来黑话、禁缩写 | `hero` `list` `flow` `split` `pullquote` `compose` |
| CSS token（custom property） | index.html / doc-to-deck.js | **家族前缀语法**（见 §4） | `--ink` `--ff-serif` `--fs-lead` `--sp-3` |
| CSS class | index.html / doc-to-deck.js | `组件-部件` 全词 kebab；禁缩写 | `.pullquote-text` `.section-num` |
| 中文显示名 | UI / SPEC / 讲义可见处 | 每个数据 id 配一个稳定中文名（见 §3） | hero=封面 · pullquote=抽句 |
| provenance | 注释 / 本文件映射表 | 源术语 + `DESIGN_RESEARCH Tn`，**不作暴露名** | `sidenote ← marginalia ← T23` |

**"朴素词"判据**：一个通用开发者一眼就认得的词才可直接做 id（figure / quote / gallery / grid / compose / pullquote / sidenote / timeline / table…）。认不得的黑话必须译（marginalia、tombstone、enfilade、small-multiples…）。

---

## 2. 外来资料「本地化吸收」流程（每纳入一个外来机制/概念都走一遍）

1. **归位**：它属于哪个命名空间？（block / layout / preset / token / role / theme）
2. **起本地名**：按 §1 起一个朴素英文 id；黑话查 §5 词表译成本地词。
3. **配显示名**：给一个稳定中文名，登记进 §3。
4. **记 provenance**：把「本地名 ← 源术语 ← Tn」登记进 §5，别让 T 号或外来术语出现在代码 id 里。
5. **套语法 + 过 lint**：token 套 §4 家族；跑 `npm run check`（命名 lint），无告警才落地。

> 反例：preset 直接叫 `marginalia` / `tombstone` ✗ → 应为 `sidenote` / `specimen`，并在 §5 记来源。

---

## 3. 中文显示名登记表

**scene.kind**：hero=封面 · content=内容页 · quiz=测验页 · statement=金句页 · section=章节页
**layout.kind**：flow=竖排 · index=分节目录 · split=锚定分栏 · compose=自由编排*(新)*
**block.type**：hero=封面块 · statement=金句 · pullquote=抽句 · list=要点 · agenda=并列条目 · callout=要点框 · timeline=时间线 · formula=公式 · flow=流程 · table=表格 · code=代码 · compare=对照 · grid=网格 · quiz=测验 · sim=仿真 · runnable=可运行代码 · embed=嵌入 · freeform=自由块
**theme**：cartesian=坐标纸（克制人文）· cobalt-grid=钴蓝公报 · lab=暗仪表台 · slate=石板（冷灰编辑/工程）

---

## 4. CSS token 家族语法（目标态）

| 家族 | 前缀/规则 | 成员 |
|---|---|---|
| 颜色 | 语义裸名；次级用 `-2` 后缀（**禁裸数字**） | `--bg` `--bg-2` · `--ink` `--ink-2` · `--accent` `--accent-ink` · `--line` `--card` `--panel` `--sel` `--cover-bg` |
| 字体族 | `--ff-*` | `--ff-serif` `--ff-sans` `--ff-mono` |
| 字号 | `--fs-*`（离散字阶，每主题参数化） | `--fs-caption` `--fs-body` `--fs-lead` `--fs-h2` `--fs-h1` `--fs-hero` |
| 间距 | `--sp-*`（8px 基线模数 + 语义档） | `--sp-1`…`--sp-6` · `--sp-gutter` · `--sp-rest` · `--sp-tight` |
| 尺寸/形状 | 语义裸名 | `--measure`（正文行宽）· `--radius` · `--page-bg-image` |

**已做（纯重命名，值不变）**：`--s1..s6→--sp-1..6` · `--gutter→--sp-gutter` · `--gap-rest→--sp-rest` · `--gap-tight→--sp-tight`（间距族仅在 index.html，安全）。
**grandfathered（保留原名，不改）**：`--serif` `--sans` `--mono` `--bg2` `--text2`——它们被 `doc-to-deck.js`（渲染器 getComputedStyle）**和内容 JSON 的 `var(--…)`**（如 baseline `course.lecture.json`）引用，改名=破坏语料/渲染，故按渐进法制缓行；目标态 `--ff-*`/`--bg-2`/`--ink-2` 留待未来配套内容迁移时再动。lint 已把这几个列为接受。

## 4b. CSS class 命名（目标态）
`组件-部件` 全词 kebab，禁缩写。旧→新：`pq-text→pullquote-text` · `pq-cite→pullquote-cite` · `sec-no→section-num` · `sec-title→section-title` · `sec-dek→section-dek` · `idx-item→index-item` · `cmp-cap→compare-caption` · `q→statement-quote` · `q-sub→statement-quote-sub`。已合规的保留：`freeform-*` `step-*` `split-*` `scene-index` `layout-index/split` `eyebrow` `headline` `lead` 等。
**本轮已做**：`pq-*→pullquote-*` · `sec-*→section-*` · `idx-item→index-item` · `cmp-cap→compare-caption`。`.q`/`.q-sub`（金句块）单字母歧义大、sed 易误伤，本轮未动，留待后续手工改。

---

## 5. Provenance / 外来术语 → 本地名 词表

| 本地 id | 中文显示名 | ← 源术语 | ← 研究 | 落点 | 状态 |
|---|---|---|---|---|---|
| `pullquote` | 抽句 | pull quote | T12 | block | 已上 iter58 |
| `sidenote` | 旁注 | marginalia | T23 | layout preset | 待做 iter59 |
| `figure` | 图释 | figure-context | T20 | layout preset | 待做 iter59 |
| `specimen` | 展品标签 | tombstone / object label | T13 | block | 待做 iter60 |
| `quote` | 引文 | quote panel / historical note | T12b | block | 待做 iter60 |
| `gallery` | 图阵 | small multiples / gallery | T24 | layout preset | 待做 iter62 |
| `compose` | 自由编排 | modular grid compose | T18 | layout kind | 待做 iter59 |

*（enfilade「线性轴动线」、visual rhythm「节奏留白」等是原则，不作 id。）*

---

## 6. 执行护栏
- **命名 lint** 并入 `tools/check-consistency.mjs`（`npm test` 第 ② 步）：数据 id 须全小写 `[a-z][a-z0-9-]*`；token 名须匹配 §4 家族白名单；命中黑话/缩写黑名单则**告警**（渐进法制，先 warn；同类复现 ≥2 次再升为 hard 拦截）。
- **charter**（`LOOP_PROMPT.md`）：吸收外来机制必须走 §2 流程（本地名 + 中文显示名 + provenance + 过 lint），方可落地。
- **grandfather**：`block.type`/`scene.kind`/`layout.kind`/`theme` 已入 schema 与语料，不改；仅补 §3 显示名与 §5 provenance。
