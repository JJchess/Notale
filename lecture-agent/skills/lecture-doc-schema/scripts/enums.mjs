/* ⚠ 生成物：由 demo/schema/ 同步而来（node lecture-agent/sync.mjs）。别在这里改，改 demo/schema/。 */
/* 枚举单一真相源（iter73 解耦）：全系统的数据 id 清单只在这里声明一次。
   加一个枚举值的流程：① 改这里 → ② 改 schema JSON 对应 enum（JSON 不能 import，由
   check-consistency Check C′ 守两侧集合相等）→ ③ 落渲染侧（doc-to-deck.js 的渲染分支 /
   index.html 的 [data-theme] token 块——经典脚本/CSS 不能 import，由 Check E 存在性 warn 提醒）
   → ④ 教学散文若涉及（plan.mjs themeHint 等，Check E 提醒）→ ⑤ npm test 看守卫。
   任何一处漏改都会被守卫抓住，不再静默漂移。命名遵循 NAMING.md（朴素小写英文 id）。 */

export const SCENE_KINDS = ['hero', 'content', 'quiz', 'statement', 'section'];

export const LAYOUT_KINDS = ['flow', 'index', 'split', 'compose'];

export const BLOCK_TYPES = ['hero', 'statement', 'list', 'agenda', 'callout', 'timeline', 'formula', 'flow', 'table', 'code', 'compare', 'grid', 'quiz', 'sim', 'runnable', 'embed', 'freeform', 'pullquote', 'video'];

export const SIM_ENGINES = ['dynamics1d', 'searchCompare', 'custom', 'widget'];

export const THEMES = ['cartesian', 'cobalt-grid', 'lab', 'slate'];
