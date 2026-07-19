# 讲义内容/样式分类体系（梳状）+ 跨仓库借鉴地图

> 单一真相源：**"一张幻灯片能承载什么、以什么形态承载"** 的全部维度。
> "样式"不止视觉皮肤——它散布在 agent 运行的各环节（选主题→定页型→排版式→填内容块→插媒体→加交互→加动效→出稿）。
> 本文档是后续"逐项借鉴实现"的路线图。**现状标记：✅已有 · ⚠部分/薄 · ❌缺。**

## 0 · 锚点：lecture-agent 现有模型

- **SceneKind**（页面角色）：hero / content / quiz / statement / section
- **LayoutKind**（空间版式）：flow / index / split / compose
- **BlockType**（内容块，19）：hero · statement · list · agenda · callout · timeline · formula · flow · table · code · compare · grid · quiz · sim · runnable · embed · freeform · pullquote · video
- **SimEngine**：dynamics1d / searchCompare / custom / widget

## 0.1 · 参考仓库（`refs/`，本文件内路径均相对 ws2 工作区根）

| 仓库 | 最值得借鉴 |
|---|---|
| presenton | HTML+Tailwind「布局即代码」+ Zod schema；**语义图标检索** + AI 配图管线；主题 graph_0..9 色阶 |
| presentation-ai (ALLWEONE) | **`layout-catalog.ts` 内容块教学语义分族**（最佳蓝本）；**`theme-schema.ts`** 主题解耦（smartLayout vs cardBackground）；30+ 图表；38 主题 |
| reveal.js | 22 个 `--r-*` 主题变量；16 种 fragment + auto-animate；katex/mathjax |
| slidev | **21 layouts + 26 内建组件**（Mermaid/Monaco/MagicMove/Youtube/VDrag…）；v-click/v-mark/v-motion |
| marpit | 纯 CSS 主题 + directives（极简派参考） |
| PptxGenJS | **187 预设几何形状**（Ⅴ视觉元素形状库参考，非导出用途）；10 图表 |
| deckdeckgo | Web Component：poll 投票/qrcode/gif/白板 excalidraw/代码沙盒 |

---

## 一、梳状分类体系（10 轴）

以用户 A–M 清单为脊柱，归并冗余：**C 内容 / G 数据 / H 图示 / K 组件 → 合并为门类「Ⅳ 内容实现」四族**；**H 关系表达**逻辑面并入「Ⅲ 信息结构」、图形面入 Ⅳ·图示族；其余保留。按 agent 流程排序。

### 上游 · 决策层

**Ⅰ · A 目的 Intent** ⚠
演示目的（说服/教学/汇报/科普）+ 每页意图（引入/定义/推导/举例/对比/检验/总结）。现藏在 `block.intent` + audience，未成显式枚举。→ 可补：页意图枚举驱动内容选型（参考 presentation-ai `generation-prompt.ts` 组件选型规则）。

**Ⅱ · B 叙事 Narrative** ✅部分
全局故事线（STORM 多视角 / SCQA / 问题-方案 / 总分总 / 编年）+ 页序 + 章节切分。现：`planning.py` STORM + `insert_sections`。→ 可补：显式叙事模板库。

**Ⅲ · D 信息结构 Information Structure**（含 H 逻辑面）⚠
这页信息的逻辑关系：并列 / 层级 / 序列 / 对比 / 因果 / 矩阵 / 关系网。现隐含在 planner 选 block type，未独立建模。→ **关键补齐**：把"逻辑结构"显式化，作为"选哪种内容实现"的依据（presentation-ai 的 sequence/comparison/relationship 家族本质是这一层）。

### 中游 · 实现层

**Ⅳ · 内容实现 Content Realization**（= C+G+H+K 合并，四族）— **A 路为主**

| 族 | 现有齿 | 缺/可补（借鉴源） | 路 |
|---|---|---|---|
| C 文本族 | statement/list/agenda/callout/pullquote | boxes 13 变体、quote/callout 变体（presentation-ai `layout-catalog.ts`） | — |
| G 数据可视化族 | table/grid | **chart 一等公民（缺！）** + **stats/KPI 数字卡（缺）** + infographic(progress/gauge)；数据用 markdown 表填充 | A |
| H 图示族 | flow/timeline | **cycle(环/花)/pyramid/staircase/snake/arrow-seq/circular-grid/connected-circles**（presentation-ai）；mermaid/plantuml（slidev）；187 流程图形（PptxGenJS `flowChart*`） | A |
| K 组件/交互族 | quiz/sim/runnable/formula/code/tutor | poll 投票（deckdeckgo）、monaco 可编辑/playground 沙盒、magic-move 代码变形（slidev） | A |

**Ⅴ · F 视觉元素 Visual Element** ⚠
组成承载物的原子：文字 run / 形状 shape / 线 line / 图标 icon / 色块 / 分隔 hr / 徽标。现：文字/线有，**形状与图标缺**。→ 借鉴：PptxGenJS 187 预设几何、frontend-slides 抽象 CSS 形、presenton 6 风格图标（bold/duotone/fill/light/regular/thin）。

### 排布与资产层

**Ⅵ · E 布局 Slide Layout** ⚠(4 种)
空间排布 flow/index/split/compose。→ 借鉴：**slidev 21 layouts**（two-cols / two-cols-header / image-left·right / iframe-left·right / center / full / fact / quote / cover / section / intro / end）；presentation-ai `<SECTION left|right|vertical>` 根图位。

**Ⅶ · I 媒体 Media** — **B 路（插入）**

| 齿 | 现状 | 借鉴源 |
|---|---|---|
| 图片：AI 生成 / 图库 / 直链 | ❌ | presenton `image_generation_service`(Pixabay/Pexels/DALL·E)；presentation-ai(Unsplash/fal.ai/Together) |
| **图标：语义向量检索**（6 风格） | ❌ | presenton `icon_finder_service`(FastEmbed all-MiniLM) |
| 视频 / youtube / gif / 音频 | ⚠(video/embed) | deckdeckgo youtube·gif；PptxGenJS addMedia(audio/video/online) |
| 二维码 qrcode / logo | ❌ | deckdeckgo qrcode |

### 表现与输出层

**Ⅷ · J 主题 Theme** ✅(15 主题)
视觉皮肤：色/字/间距·字阶/圆角/背景·底纹/明暗/封面反相。→ 可补：**图表色阶 graph_0..9**（presenton）、**阴影 / 渐变 / mask 背景 token**、**smartLayout 色 vs cardBackground 色分离**（presentation-ai `theme-schema.ts`，保图表/示意图上文字可读，最值得抄）。

**Ⅸ · L 动效 Animation** ⚠ — **A 路**
现有 live 分段视图。→ 借鉴：reveal 16 种 fragment + **auto-animate**（幻灯片间平滑变形）；slidev v-click/v-clicks/v-after/v-switch + **v-mark 手绘圈划** + v-motion + 7 种转场。

**Ⅹ · M 输出 Rendering** 
输出目标：reveal.js HTML（唯一产出形态，不做 PPTX/PDF 导出）✅。

### 贯穿轴 · 教学元信息 Pedagogical meta（lecture 独有）
notes 讲者备注 ✅ · tutor AI 助教（建议问题 + 本地知识库）✅ · coverage 覆盖度 ✅ · audience 难度匹配 ✅。参考仓库都没有这一层——保留强化即可，是相对通用 PPT 工具的护城河。

---

## 二、两条借鉴路径

- **A 路 · 转成 HTML 原生渲染形态**：内容以**结构化 JSON** 产出、由 JS 运行时渲染。对应 Ⅳ(数据/图示/组件族) + Ⅸ动效 + Ⅹ的 HTML 渲染。lecture-agent 的 block 模型 + sim/runnable 已是这套范式雏形。
  借鉴 = **加 BlockType 枚举 → viewer 渲染分支/token → skill 契约 → 规划器提示 → Playwright 目视 + make all**（与主题扩展同构的 5 步）。数据填充统一用 **LLM 友好的 markdown 表 / series-categories**（三仓库一致做法）。
- **B 路 · 作为素材插入**：内容是**外部获取/生成的资产**（图片/图标/视频）嵌进 block。对应 Ⅶ媒体。
  借鉴 = **加 media 适配层**：新建 `ports.MediaProvider` port + `adapters/media/*`（图库 API / AI 生图 / 语义图标检索），符合六边形架构，domain 只认 port。

## 三、优先级路线图（填最大缺口、教学价值最高优先）

1. **chart 一等公民**（Ⅳ·G，A 路）：现仅 table/sim，缺真正图表块。加 `chart` BlockType，数据用 markdown 表，渲染复用 viewer 已 vendor 的 **Observable Plot**（`viewer/vendor/plot`，零新依赖）。图表色走 Ⅷ 的 graph 色阶。
2. **图标 + 配图管线**（Ⅶ，B 路）：`ports.MediaProvider` + adapter（先接一个图库/语义图标检索），给 hero/list/grid 配图配图标——视觉丰富度提升最大。
3. **stats/KPI 数字卡 + 序列/关系变体**（Ⅳ·G/H，A 路）：steps/cycle/pyramid/connected-circles，补信息结构表达。
4. **动效轴**（Ⅸ，A 路）：fragment 逐条出现 + auto-animate，讲义"边讲边现"。
5. **layout 扩充**（Ⅵ）：从 slidev 借 two-cols/image-side 等，补 LayoutKind。

每项遵循**同构 5 步**，domain 只认新 port、渲染器零改、每批独立验证（先例见 `lecture-agent/PROJECT_STRUCTURE.md` 的主题扩展记录）。

## 四、关键借鉴源文件（实现时按图索骥）
- 内容块分族蓝本：`refs/presentation-ai/src/lib/presentation/layout-catalog.ts`
- 主题解耦 schema：`refs/presentation-ai/src/lib/presentation/theme-schema.ts` + `themes.ts`
- 组件选型规则：`refs/presentation-ai/src/lib/presentation/generation-prompt.ts`
- 元素/版式 schema + 校验元数据：`refs/presenton/servers/fastapi/templates/v2/models/elements.py` + `layouts.py`
- 语义图标检索 / AI 配图：`refs/presenton/servers/fastapi/services/{icon_finder_service,image_generation_service}.py`
- 现代内容原语库：`refs/slidev/packages/client/{layouts,builtin}/`
- 预设几何形状库（Ⅴ视觉元素借鉴，非导出用途）：`refs/PptxGenJS/src/core-enums.ts`
