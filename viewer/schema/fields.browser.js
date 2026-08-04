/* ⚠ 生成物：由 tools/build-browser-contracts.mjs 从 viewer/schema/fields.mjs 生成。
   别在这里改，改 fields.mjs 后重新运行生成脚本。
   存在的理由：浏览器侧不能用 ES module（.mjs 的 MIME 不可靠，且 file:// 直接禁 import），
   所以把同一份逻辑包成 classic script 挂到 window.LectureFields。 */
(function () {
  'use strict';
/* ============================================================================
   LectureDoc 字段注册表 —— 编辑器的唯一"哪些字段能改、怎么改"真相源

   为什么手写而不从 lecture-doc.schema.json 生成：schema 用 $ref:"#/$defs/inlineMd"
   标注行内 markdown 字段，但**至少 5 处已经漂移**（callout.label / table.head[] /
   code.filename / code.caption / quiz.angles[] 在 schema 里是裸 string，而渲染器走
   inlineMd、validate.mjs 走 checkInline）。生成器会把这些 bug 一起编码进来。
   而 kind 标错不是化妆问题：把 plainText 误标成 inlineMd 会往渲染器会转义的字段里
   注入标记；反向误标则在提交时静默吃掉用户的 **粗体**。
   所以：手写 + 一致性测试守着（tests/test_field_registry_consistency.py），
   照 enums.mjs 与 test_enum_consistency.py 已经好用的那套路子。

   字段条目：
     path    相对 scene / block 的点+方括号路径（'headline' / 'items[3].text' / 'rows[2][4]'）
             注册表里写**模板**路径，数组下标用 [] 占位（'items[].text'）；
             渲染器盖锚点时填入真实下标。
     kind    inlineMd | plainText | number | enum | code:<lang>
             决定编辑面怎么读写：inlineMd 提交时走 renderInline 重绘、plainText 走 textContent。
     surface inplace（页面上就地改）| panel（只能在侧栏改，如 SVG 里的文字、代码、结构化数据）
     tier    none（写 doc + relayoutScene，不重渲）| block（rerenderBlock）
             | scene（rerenderScene + capture/restore）| confirm（不可恢复，先问）
             ★ 逐字段判定，不能逐块判定：dynamics1d 的 regimes[].label 长得像纯文本，
               但渲染器按值拷贝了它（{...r}），写 doc 无视觉效果，所以是 block 而不是 none。
     label   人类可读名，编辑器 UI 用
   ========================================================================== */

/* ---------- 路径存取 ---------- */

/** 'items[3].text' → ['items', 3, 'text']；'rows[2][4]' → ['rows', 2, 4] */
function parsePath(path) {
  const out = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(String(path)))) out.push(m[2] !== undefined ? Number(m[2]) : m[1]);
  return out;
}

/** 读；任一层缺失返回 undefined，不抛。 */
function getPath(obj, path) {
  let cur = obj;
  for (const k of parsePath(path)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/** 写；**不创建中间层**——父路径不存在就返回 false 而不是凭空造出一层。
 *  凭空造层会让一次手滑的路径静默写出一个 schema 之外的字段，之后谁都查不出它是哪来的。 */
function setPath(obj, path, value) {
  const keys = parsePath(path);
  if (!keys.length) return false;
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (cur == null || typeof cur !== 'object' || !(k in cur)) return false;
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (cur == null || typeof cur !== 'object') return false;
  cur[last] = value;
  return true;
}

/** 把带真实下标的路径归一成注册表里的模板路径：'items[3].text' → 'items[].text' */
function templatePath(path) {
  return String(path).replace(/\[\d+\]/g, '[]');
}

/* ---------- 注册表 ---------- */

const F = (path, kind, surface, tier, label) => ({ path, kind, surface, tier, label });

const FIELDS = {
  /* scene 级：渲染在 .pad 里、任何 block 节点之外，所以编辑器解析时
     node.closest('[data-block-id]') 返回 null，自然落到 scene 上。 */
  scene: [
    F('eyebrow', 'inlineMd', 'inplace', 'none', '眉标'),
    F('headline', 'inlineMd', 'inplace', 'none', '标题'),
    F('lead', 'inlineMd', 'inplace', 'none', '导语'),
    /* notes 渲染进 aside.notes（display:none，靠备注浮层看），所以只能在面板里改。
       必填非空——校验器会拦空值，编辑器的"清空即撤销"规则正好对上。 */
    F('notes', 'inlineMd', 'panel', 'none', '演讲者备注'),
  ],

  doc: [
    F('title', 'plainText', 'panel', 'none', '讲义标题'),
  ],

  /* block 级按 type 分组。Step 1 只放地基，后续步骤往里加行——
     加行时务必同时看 kind（渲染器用 inlineMd 还是 escapeHtml）与 tier（渲染器是活读还是按值拷贝）。 */
};

/** 查一个字段的注册条目；scope = 'scene' | 'doc' | block.type。找不到返回 null。 */
function fieldSpec(scope, path) {
  const rows = FIELDS[scope];
  if (!rows) return null;
  const want = templatePath(path);
  return rows.find(r => r.path === want) || null;
}

/** 某个 scope 下所有条目（编辑器建面板时用）。 */
function fieldsOf(scope) {
  return FIELDS[scope] || [];
}

/* ---------- 显式不可编辑清单 ----------
   一致性测试会要求 schema 里每个叶子路径要么在 FIELDS 里、要么在这里带一行理由。
   目的是防注册表变陈旧——enums.mjs 的注释记着这种漏已经发生过一次（chart/stats/diagram
   就那么漏出去过）。 */
const NOT_EDITABLE = {
  'block.id': '标识符，改了会打断 layout.steps/anchor/areas 与 autoAnimate 的引用',
  'block.status': '生成期状态机（ready/pending/error），不是作者内容',
  'scene.id': '标识符，DOM 锚点 section[data-scene-id] 与 layout 引用都靠它',
  'doc.schemaVersion': '协议版本，由生成侧写',
  'doc.language': '影响字体与断行策略，属文档级配置而非内容（后续可开到面板）',
  'video.captions': '字幕在外部 .vtt 文件里，属媒体流水线，不在讲义编辑器范围',
  'freeform.rationale': '写给评审看的"为何用逃生舱"，渲染器刻意不渲染它',
  'embed.product': '占位块的枚举，仓库里无 fixture 使用，不值得开编辑面',
};

  window.LectureFields = { FIELDS, NOT_EDITABLE, fieldSpec, fieldsOf, getPath, parsePath, setPath, templatePath };
})();
