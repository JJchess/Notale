#!/usr/bin/env node
/* ============================================================================
   LectureDoc v1 校验器（零依赖）
   用法:  node demo/schema/validate.mjs [json文件路径]
          缺省校验 demo/course.lecture.json
   设计给 agent 自修循环用：错误信息带 JSON 路径，读错误→改 JSON→重跑。
   与 lecture-doc.schema.json 语义保持一致（结构 + 受限表达式静态检查）。
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '..', 'course.lecture.json');

const errors = [];
const err = (path, msg) => errors.push(path + ' — ' + msg);
const warnings = []; /* 非致命，但收集用于 schema 演化决策（见 SPEC §3.3） */
const warn = (path, msg) => warnings.push(path + ' — ' + msg);

/* ---------- 小工具 ---------- */
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
function req(obj, key, pred, path, what) {
  if (!(key in obj)) { err(path, '缺少必填字段 ' + key); return false; }
  if (!pred(obj[key])) { err(path + '.' + key, '类型不对，应为 ' + what); return false; }
  return true;
}
function opt(obj, key, pred, path, what) {
  if (key in obj && !pred(obj[key])) { err(path + '.' + key, '类型不对，应为 ' + what); return false; }
  return true;
}
function noExtra(obj, allowed, path) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(path + '.' + k, '未知字段（schema 不允许额外属性）');
}

/* ---------- 受限表达式静态检查（SPEC §4） ---------- */
const MATH_IDS = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow', 'min', 'max', 'floor', 'round', 'PI', 'E'];
function checkExpr(expr, varNames, path) {
  if (!isStr(expr)) { err(path, '表达式应为字符串'); return; }
  if (!/^[\w\s+\-*/%(),.<>=!?:&|]*$/.test(expr)) { err(path, '表达式含非法字符: ' + expr); return; }
  const ids = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const allowed = new Set([...varNames, ...MATH_IDS]);
  for (const id of ids) if (!allowed.has(id)) err(path, '表达式标识符不在白名单: "' + id + '"（允许: ' + [...varNames].join(', ') + ' + 数学函数）');
}

/* ---------- inline-md 检查：禁原始 HTML ---------- */
function checkInline(s, path) {
  if (!isStr(s)) return;
  if (/<[a-zA-Z/][^>]*>/.test(s)) err(path, 'inlineMd 禁止原始 HTML 标签（用 **b** / *em* / `code` / $latex$）');
  if ((s.match(/\$/g) || []).length % 2 !== 0) err(path, '行内公式 $ 未配对');
}

/* ---------- freeform.html 危险标签静态检查（净化的第一道关，运行时还会再净化一次） ---------- */
const DANGEROUS_HTML = /<script|<style|<iframe|<object|<embed|on\w+\s*=|javascript:/i;
function checkFreeformHtml(html, path) {
  if (DANGEROUS_HTML.test(html)) err(path, 'html 含危险标签/属性（script/style/iframe/object/embed/内联事件/javascript: 协议均不允许）');
}

/* ---------- block 校验 ---------- */
const BLOCK_TYPES = ['hero', 'statement', 'list', 'agenda', 'callout', 'formula', 'flow', 'table', 'code', 'compare', 'quiz', 'sim', 'runnable', 'embed', 'freeform'];
function checkBlock(b, path, state) {
  if (!isObj(b)) { err(path, 'block 应为对象'); return; }
  if (!BLOCK_TYPES.includes(b.type)) { err(path + '.type', '未知 block 类型: ' + b.type); return; }
  opt(b, 'status', v => ['ready', 'pending', 'error'].includes(v), path, 'ready|pending|error');
  opt(b, 'fragment', v => typeof v === 'boolean', path, 'boolean');
  const T = b.type;
  if (T === 'hero') {
    if (req(b, 'title', v => Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every(isStr), path, '1–3 行字符串数组')) {}
    for (const k of ['tag', 'sub', 'facts', 'hint']) opt(b, k, isStr, path, 'string');
    if (b.sub) checkInline(b.sub, path + '.sub');
  } else if (T === 'statement') {
    req(b, 'statement', isStr, path, 'string'); checkInline(b.statement, path + '.statement');
  } else if (T === 'list') {
    if (req(b, 'items', v => Array.isArray(v) && v.length >= 1 && v.length <= 6, path, '1–6 项数组'))
      b.items.forEach((it, i) => { if (!isObj(it) || !isStr(it.text)) err(path + `.items[${i}]`, '每项需 {text}'); else checkInline(it.text, path + `.items[${i}].text`); });
  } else if (T === 'agenda') {
    if (req(b, 'rows', v => Array.isArray(v) && v.length >= 1 && v.length <= 6, path, '1–6 行数组'))
      b.rows.forEach((r, i) => { if (!isObj(r) || !isStr(r.label) || !isStr(r.text)) err(path + `.rows[${i}]`, '每行需 {label, text}'); else checkInline(r.text, path + `.rows[${i}].text`); });
  } else if (T === 'callout') {
    req(b, 'label', isStr, path, 'string'); req(b, 'text', isStr, path, 'string');
    checkInline(b.text, path + '.text');
  } else if (T === 'formula') {
    req(b, 'latex', isStr, path, 'string');
  } else if (T === 'flow') {
    if (req(b, 'nodes', v => Array.isArray(v) && v.length >= 2 && v.length <= 5, path, '2–5 节点数组'))
      b.nodes.forEach((n, i) => { if (!isObj(n) || !isStr(n.title)) err(path + `.nodes[${i}]`, '节点需 {title}'); if (n.state && !['on', 'q'].includes(n.state)) err(path + `.nodes[${i}].state`, '应为 on|q'); });
  } else if (T === 'table') {
    req(b, 'head', v => Array.isArray(v) && v.length >= 2 && v.every(isStr), path, '表头字符串数组');
    if (req(b, 'rows', v => Array.isArray(v) && v.length >= 1, path, '行数组'))
      b.rows.forEach((row, i) => { if (!Array.isArray(row)) err(path + `.rows[${i}]`, '行应为数组'); });
  } else if (T === 'code') {
    req(b, 'language', v => ['python', 'javascript', 'text'].includes(v), path, 'python|javascript|text');
    req(b, 'source', isStr, path, 'string');
  } else if (T === 'compare') {
    for (const side of ['left', 'right']) {
      if (!isObj(b[side]) || !isObj(b[side].block)) { err(path + '.' + side, '需 {caption?, block}'); continue; }
      checkBlock(b[side].block, path + '.' + side + '.block', state);
    }
  } else if (T === 'quiz') {
    if (!['objective', 'subjective'].includes(b.kind)) { err(path + '.kind', '应为 objective|subjective'); return; }
    if (b.kind === 'objective') {
      if (req(b, 'choices', v => Array.isArray(v) && v.length >= 2 && v.length <= 6, path, '2–6 选项数组')) {
        const keys = new Set();
        b.choices.forEach((c, i) => {
          if (!isObj(c) || !/^[a-z]$/.test(c.key || '') || !isStr(c.text)) err(path + `.choices[${i}]`, '每项需 {key:"a"-"z", text}');
          else { if (keys.has(c.key)) err(path + `.choices[${i}].key`, '选项 key 重复: ' + c.key); keys.add(c.key); }
        });
        if (req(b, 'answer', v => /^[a-z]$/.test(v), path, '单字母') && !keys.has(b.answer)) err(path + '.answer', 'answer "' + b.answer + '" 不在选项 key 里');
      }
      req(b, 'explain', isStr, path, 'string');
    } else {
      req(b, 'prompt', isStr, path, 'string');
    }
  } else if (T === 'sim') {
    if (!['dynamics1d', 'searchCompare', 'custom'].includes(b.engine)) { err(path + '.engine', '未知引擎: ' + b.engine); return; }
    let paramNames = [];
    if (req(b, 'params', v => Array.isArray(v) && v.length >= 1 && v.length <= 4, path, '1–4 参数数组')) {
      b.params.forEach((p, i) => {
        if (!isObj(p) || !isStr(p.name) || !isStr(p.label) || ![p.min, p.max, p.step, p.default].every(isNum))
          err(path + `.params[${i}]`, '参数需 {name,label,min,max,step,default}');
        else {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.name)) err(path + `.params[${i}].name`, '非法参数名');
          if (p.default < p.min || p.default > p.max) err(path + `.params[${i}]`, 'default 不在 [min,max] 内');
          paramNames.push(p.name);
        }
      });
    }
    if (b.engine === 'dynamics1d') {
      if (req(b, 'model', isObj, path, 'object')) {
        const M = b.model, mp = path + '.model';
        req(M, 'stateVar', isStr, mp, 'string'); req(M, 'init', isNum, mp, 'number');
        req(M, 'steps', v => Number.isInteger(v) && v > 0 && v <= 500, mp, '1–500 整数');
        const constNames = Object.keys(M.consts || {});
        if (isStr(M.update)) checkExpr(M.update, [M.stateVar, ...paramNames, ...constNames, 'xi'], mp + '.update');
        else err(mp + '.update', '缺少 update 表达式');
      }
      (b.regimes || []).forEach((r, i) => {
        if (!isObj(r) || !isStr(r.when) || !isStr(r.label) || !isStr(r.desc)) err(path + `.regimes[${i}]`, '需 {when,label,desc}');
        else { checkExpr(r.when, paramNames, path + `.regimes[${i}].when`);
          if (r.tone && !['line', 'accent', 'ink'].includes(r.tone)) err(path + `.regimes[${i}].tone`, '应为 line|accent|ink'); }
      });
      if (b.noiseNote) { checkExpr(b.noiseNote.when, paramNames, path + '.noiseNote.when'); if (!isStr(b.noiseNote.text)) err(path + '.noiseNote.text', '应为 string'); }
    } else if (b.engine === 'searchCompare') {
      if (req(b, 'model', isObj, path, 'object')) {
        const M = b.model, mp = path + '.model';
        if (isStr(M.objective)) checkExpr(M.objective, ['x'], mp + '.objective'); else err(mp + '.objective', '缺少 objective 表达式');
        req(M, 'domain', v => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] < v[1], mp, '[min,max] 数组');
        req(M, 'strategies', v => Array.isArray(v) && v.every(s => ['grid', 'random', 'bayes'].includes(s)), mp, 'grid|random|bayes 数组');
        if (isStr(M.budgetParam) && !paramNames.includes(M.budgetParam)) err(mp + '.budgetParam', '"' + M.budgetParam + '" 不在 params 里');
      }
    } else { /* custom */
      req(b, 'computeJs', isStr, path, 'string（沙箱 JS 纯函数源码）');
      req(b, 'chart', isObj, path, 'object');
    }
  } else if (T === 'runnable') {
    if (state.runnableCount++ > 0) err(path, '每个 deck 至多一个 runnable block（运行时约束，见 SPEC §3.2）');
    req(b, 'languages', v => Array.isArray(v) && v.length >= 1 && v.every(l => ['python', 'js'].includes(l)), path, 'python|js 数组');
    if (req(b, 'starter', isObj, path, 'object'))
      for (const l of b.languages || []) if (!isStr(b.starter[l])) err(path + '.starter.' + l, '缺少该语言的初始代码');
    if (req(b, 'env', isObj, path, 'object')) {
      const E = b.env, ep = path + '.env';
      if (E.kind === 'objective1d') {
        if (isStr(E.objective)) checkExpr(E.objective, ['x'], ep + '.objective'); else err(ep + '.objective', '缺少 objective 表达式');
        req(E, 'domain', v => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] < v[1], ep, '[min,max] 数组');
      } else if (E.kind === 'custom') {
        if (!isStr(E.pythonPreamble) && !isStr(E.jsPreamble)) err(ep, 'custom 环境需 pythonPreamble 或 jsPreamble 至少一个');
      } else err(ep + '.kind', '应为 objective1d|custom');
    }
  } else if (T === 'embed') {
    req(b, 'product', v => ['codelab', 'video', 'sim'].includes(v), path, 'codelab|video|sim');
  } else if (T === 'freeform') {
    if (req(b, 'html', v => isStr(v) && v.length > 0, path, '非空字符串')) checkFreeformHtml(b.html, path + '.html');
    if (req(b, 'rationale', v => isStr(v) && v.length >= 10, path, '至少 10 字，需具体说明现有类型为何不适用')) {
      state.freeformUses.push({ path, rationale: b.rationale });
    }
  }
}

/* ---------- scene 校验 ---------- */
function checkScene(s, path, state, seenIds) {
  if (!isObj(s)) { err(path, 'scene 应为对象'); return; }
  if (req(s, 'id', v => isStr(v) && /^[a-z0-9][a-z0-9-]*$/.test(v), path, 'kebab-case id')) {
    if (seenIds.has(s.id)) err(path + '.id', 'scene id 重复: ' + s.id); seenIds.add(s.id);
  }
  req(s, 'kind', v => ['hero', 'content', 'quiz', 'statement'].includes(v), path, 'hero|content|quiz|statement');
  req(s, 'notes', v => isStr(v) && v.length > 0, path, '非空字符串（演讲者备注必填）');
  for (const k of ['eyebrow', 'headline', 'lead']) opt(s, k, isStr, path, 'string');
  if (s.headline) checkInline(s.headline, path + '.headline');
  if (s.lead) checkInline(s.lead, path + '.lead');
  if (!req(s, 'blocks', v => Array.isArray(v) && v.length >= 1, path, '非空数组')) return;
  if (s.kind === 'hero' && (s.blocks.length !== 1 || s.blocks[0].type !== 'hero')) err(path + '.blocks', 'hero 页应恰好含一个 hero block');
  if (s.kind === 'statement' && !s.blocks.some(b => b.type === 'statement')) err(path + '.blocks', 'statement 页应含 statement block');
  if (s.kind === 'quiz' && !s.blocks.some(b => b.type === 'quiz')) err(path + '.blocks', 'quiz 页应含 quiz block');
  s.blocks.forEach((b, i) => checkBlock(b, path + `.blocks[${i}]`, state));
}

/* ---------- deck 校验 ---------- */
function validate(doc) {
  if (!isObj(doc)) { err('$', '顶层应为对象'); return; }
  if (doc.schemaVersion !== '1.0') err('$.schemaVersion', '应为 "1.0"');
  req(doc, 'id', v => isStr(v) && /^[a-z0-9][a-z0-9-]*$/.test(v), '$', 'kebab-case id');
  req(doc, 'title', v => isStr(v) && v.length > 0, '$', '非空字符串');
  req(doc, 'language', isStr, '$', 'string');
  if (doc.tutor) {
    (doc.tutor.kb || []).forEach((k, i) => {
      if (!isObj(k) || !isStr(k.pattern) || !isStr(k.answer)) { err(`$.tutor.kb[${i}]`, '需 {pattern, answer}'); return; }
      try { new RegExp(k.pattern, k.flags || ''); } catch (e) { err(`$.tutor.kb[${i}].pattern`, '非法正则: ' + e.message); }
      checkInline(k.answer, `$.tutor.kb[${i}].answer`);
    });
  }
  const seenIds = new Set();
  if (req(doc, 'scenes', v => Array.isArray(v) && v.length >= 1, '$', '非空数组'))
    doc.scenes.forEach((s, i) => checkScene(s, `$.scenes[${i}]`, state, seenIds));
}

/* ---------- 运行 ---------- */
const state = { runnableCount: 0, freeformUses: [] };
let doc;
try { doc = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error('✗ JSON 解析失败: ' + e.message); process.exit(2); }
validate(doc);
if (state.freeformUses.length) {
  console.warn('⚠ 使用了 ' + state.freeformUses.length + ' 处 freeform block（未分类内容）——建议关注是否应收编为正式 block 类型：');
  for (const u of state.freeformUses) console.warn('  · ' + u.path + ' — rationale: "' + u.rationale + '"');
}
if (errors.length) {
  console.error('✗ ' + file);
  console.error('  发现 ' + errors.length + ' 个问题:');
  for (const e of errors) console.error('  · ' + e);
  process.exit(1);
} else {
  const nBlocks = doc.scenes.reduce((s, sc) => s + sc.blocks.length, 0);
  console.log('✓ ' + file);
  console.log('  合法 LectureDoc v1 — ' + doc.scenes.length + ' 页 / ' + nBlocks + ' 个 block');
  process.exit(0);
}
