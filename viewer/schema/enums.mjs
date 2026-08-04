/* 枚举单一真相源：全系统的数据 id 清单只在这里声明一次。
   加一个枚举值的流程：① 改这里 → ② 改 schema JSON 对应 enum（JSON 不能 import）→
   ③ 改 Python 侧 lecture_agent/schema/enums.py 的 StrEnum → ④ 落渲染侧
   （doc-to-deck.js 的渲染分支 / app.html 的 CSS——经典脚本/CSS 不能 import）→
   ⑤ 写 skill 契约让规划器选得到 → ⑥ 跑 `pytest` 看守卫。

   守卫在 lecture-agent/tests/test_enum_consistency.py（①②③ 三处集合相等 + 技能镜像同步）。
   注意：旧注释说这条线由 legacy/tools/check-consistency.mjs 的 Check C′/E 守——那个脚本
   import 的是早已删掉的 JS agent 与改名前的 demo/schema/，随目录重组一起失效了。守卫失效后
   漂移就没人管（chart/stats/diagram 就这么漏出去过），所以重写成随 pytest 自动跑的测试。
   命名遵循 NAMING.md（朴素小写英文 id）。 */

export const SCENE_KINDS = ['hero', 'content', 'quiz', 'statement', 'section'];

export const LAYOUT_KINDS = ['flow', 'index', 'split', 'compose', 'full'];

export const BLOCK_TYPES = ['hero', 'statement', 'list', 'agenda', 'callout', 'timeline', 'formula', 'flow', 'table', 'code', 'compare', 'grid', 'quiz', 'sim', 'chart', 'stats', 'diagram', 'graph', 'runnable', 'embed', 'freeform', 'pullquote', 'video', 'media'];

export const DIAGRAM_TYPES = ['cycle', 'pyramid', 'staircase', 'snake', 'arrow-seq', 'circular-grid', 'connected-circles'];

/* graph = 带命名边的一等图块（树/DAG/分支流程）。与 DIAGRAM_TYPES 的区别是它有 edges：
   diagram/flow 只能表达一条线性链或一圈环，一棵带父子关系的真实树在它们里不可表达。 */
export const GRAPH_TYPES = ['tree', 'dag', 'flowchart'];

export const SIM_ENGINES = ['dynamics1d', 'searchCompare', 'custom', 'widget'];

export const CHART_TYPES = ['bar', 'line', 'area', 'scatter'];

export const QUIZ_KINDS = ['objective', 'subjective'];

export const CODE_LANGS = ['python', 'javascript', 'text'];

export const EMBED_PRODUCTS = ['codelab', 'video', 'sim'];

export const RUNNABLE_ENVS = ['objective1d', 'custom'];

export const THEMES = [
  'cartesian', 'cobalt-grid', 'lab', 'slate',
  // 扩展主题库（移植自 bold-template-pack；各有同名 [data-theme] token 块 + 已 vendor 字体）
  'soft-editorial', 'vellum', 'grove', 'monochrome', 'signal', 'broadside',
  'emerald-editorial', 'editorial-forest', 'bold-poster', 'coral', 'studio',
];

/* CAPABILITIES —— 热力图行骨架，来自 enum 全集而非观测数据（从没被触发的能力才不会从图上消失）。
   variant-bearing block（chart/diagram/sim/quiz/code/embed/runnable）判别字段必填，
   variant 行已完整覆盖其出现次数，不再重复列裸 type 行。
   reachable:false 标"结构合法但规划器不会自动产出"——对应 registry.py 的 AUTO_EXCLUDE
   (freeform/embed) 与 video 无 skill 契约（见 lecture_agent/domain/skills/registry.py）。
   runnable 曾在 AUTO_EXCLUDE 里(单例约束)，viewer 支持多实例后已移出，规划器现在可自动产出。 */
const FLAT_BLOCK_TYPES = [
  'hero', 'statement', 'pullquote', 'list', 'agenda', 'callout',
  'timeline', 'formula', 'table', 'compare', 'grid', 'stats',
];
const UNREACHABLE_FLAT = new Set(['video']);   // freeform 已解除 AUTO_EXCLUDE，规划器可自动选中

export const CAPABILITIES = [
  ...FLAT_BLOCK_TYPES.map((k) => ({ key: k, group: 'block', reachable: true })),
  ...['freeform', 'video', 'media'].map((k) => ({ key: k, group: 'block', reachable: !UNREACHABLE_FLAT.has(k) })),
  ...CHART_TYPES.map((v) => ({ key: `chart:${v}`, group: 'variant', reachable: true })),
  ...DIAGRAM_TYPES.map((v) => ({ key: `diagram:${v}`, group: 'variant', reachable: true })),
  ...GRAPH_TYPES.map((v) => ({ key: `graph:${v}`, group: 'variant', reachable: true })),
  ...SIM_ENGINES.map((v) => ({ key: `sim:${v}`, group: 'variant', reachable: true })),
  ...QUIZ_KINDS.map((v) => ({ key: `quiz:${v}`, group: 'variant', reachable: true })),
  ...CODE_LANGS.map((v) => ({ key: `code:${v}`, group: 'variant', reachable: true })),
  ...EMBED_PRODUCTS.map((v) => ({ key: `embed:${v}`, group: 'variant', reachable: false })),
  ...RUNNABLE_ENVS.map((v) => ({ key: `runnable:${v}`, group: 'variant', reachable: true })),
  ...LAYOUT_KINDS.map((k) => ({ key: k, group: 'layout', reachable: true })),
  { key: 'fragment', group: 'animation', reachable: true },
  { key: 'transition', group: 'animation', reachable: true },
  { key: 'autoAnimate', group: 'animation', reachable: true },
  { key: 'hero_image', group: 'media', reachable: true },
  { key: 'list_icons', group: 'media', reachable: true },
];
