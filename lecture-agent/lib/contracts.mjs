/* 每种 block 类型的紧凑生成契约（取自 SPEC / create-* 技能）。run-lecture 与 smoke 共用。
   只覆盖自动生成会用到的类型（runnable/embed/freeform 默认不自动产出）。 */
export const CONTRACTS = {
  hero: `{ "type":"hero", "title":["1-3 行标题数组"], "tag":"上标签(可选)", "sub":"副题(可选, inline-md)", "facts":"一行事实文字(可选)", "hint":"一句提示(可选)" }`,
  statement: `{ "type":"statement", "statement":"一句大字陈述(inline-md)" }`,
  list: `{ "type":"list", "items":[ {"lead":"衬线强调词(可选)","text":"要点(inline-md: **b**/*em*/\`code\`/$latex$；禁原始 HTML)"} ] }  // 1-12 项`,
  agenda: `{ "type":"agenda", "rows":[ {"label":"短标签","text":"该行说明(inline-md)"} ] }  // 1-12 行，逐行等高，适合并列要点`,
  callout: `{ "type":"callout", "label":"短标签", "text":"一句小结(inline-md)" }`,
  formula: `{ "type":"formula", "latex":"纯 LaTeX 源码，如 f_{t+1}=I(f_t,D_t)。**不要**用 $ 或 $$ 包裹(渲染器自动当公式渲染)", "caption":"可选说明" }`,
  flow: `{ "type":"flow", "nodes":[ {"title":"节点名","sub":"副文(可选)","state":"on|q(可选)"} ], "loopNote":"可选" }  // 2-7 个节点`,
  table: `{ "type":"table", "head":["列1","列2"], "rows":[ ["格","格"], ["格", {"text":"高亮格","hi":true}] ] }  // head≥2`,
  code: `{ "type":"code", "language":"python|javascript|text", "source":"静态展示代码(不可运行)", "filename":"可选", "caption":"可选" }`,
  compare: `{ "type":"compare", "left":{"caption":"左标题","block":{一个简单block}}, "right":{"caption":"右标题","block":{一个简单block}} }  // 仅用于左右对称内容(如前后代码)。左右的 block 用简单类型: code / list / callout / formula(不要用 sim / runnable / quiz / grid / 嵌套 compare)`,
  quiz: `{ "type":"quiz", "kind":"objective", "stem":"题干", "choices":[{"key":"a","text":"..."},{"key":"b","text":"..."},{"key":"c","text":"..."}], "answer":"b", "explain":"解释为什么对+为什么最像的干扰项不对" }
  或主观: { "type":"quiz", "kind":"subjective", "prompt":"讨论题干", "angles":["切入角(可选)"], "instruction":"作答要求(可选)" }`,
  sim: `{ "type":"sim", "engine":"dynamics1d", "params":[{"name":"标识符","label":"标签","min":0,"max":2,"step":0.05,"default":0.9}], "model":{ "stateVar":"c","init":0.05,"steps":40,"update":"受限表达式：仅 params名/consts键/stateVar/噪声 xi/数学函数(sin cos tan exp log sqrt abs pow min max floor round PI E)。例 c + alpha*(T-c) + sigma*xi","consts":{"T":1} }, "regimes":[{"when":"受限布尔表达式如 alpha<1","label":"标签","desc":"说明","tone":"line|accent|ink(可选)"}], "chart":{"xLabel":"t","yLabel":"c(t)","targetLine":{"value":1,"label":"目标"}} }
  或 searchCompare(黑箱优化三策略): { "type":"sim","engine":"searchCompare","params":[{"name":"n","label":"预算 n =","min":5,"max":30,"step":1,"default":12,"decimals":0}],"model":{"objective":"受限表达式,变量只有 x,如 sin(x)+sin(10*x/3)","domain":[2.7,7.5],"yDomain":[-2.4,2.2],"strategies":["grid","random","bayes"],"budgetParam":"n"},"labels":{"grid":"网格","random":"随机","bayes":"贝叶斯"} }`,
};

/* 授权给规划器用的 block 类型菜单（自动模式）。 */
export const AUTO_BLOCK_TYPES = Object.keys(CONTRACTS);

export const AUTHORING_RULES = `硬规则(违反会被校验/打回)：
- 正文克制，一页一个观点；lead 是一句陈述，不是"本页将展示…"这类引导语；不写"让我们""值得注意的是"。
- 文本字段只用 inline-md(**b**/*em*/\`code\`/$latex$)，禁原始 HTML 标签。
- 公式一律 LaTeX，不用 Unicode 上下标。formula 块的 latex 填纯源码，**不要** $ / $$ 包裹（正文里的行内公式才用 $…$）。
- 绝不写死颜色/字体(主题 token 负责视觉)。
- 中文排版：中文句全角标点；汉字与拉丁/数字间空格(如 2026 年、AI 产品)；中文标签不做 uppercase。
- 多个并列要点用 agenda(逐行等高)，别把两个不等高的块并排；compare 只用于左右天然对称内容。
- sim 优先 dynamics1d/searchCompare；表达式只能用白名单标识符+数学函数。`;
