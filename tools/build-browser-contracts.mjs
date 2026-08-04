#!/usr/bin/env node
/* ============================================================================
   build-browser-contracts.mjs — 把 viewer/schema 里的 ESM 契约模块生成一份
   **classic script 孪生体**，挂到 window 上给浏览器用。

   为什么不能在浏览器里直接 <script type="module"> import 这些 .mjs：
     1. MIME：Python 的 http.server 把 .mjs 当 text/plain 送，浏览器拒绝执行
        非 JS MIME 的模块（网络面板显示 200，控制台只给一句
        "Failed to fetch dynamically imported module"，极易误判成路径错）。
        任意静态服务器都可能不认识 .mjs。
     2. 更根本的：`file://` 下 ES module import 被 CORS 直接挡掉，与 MIME 无关。
        本项目的终点是"双击就能打开、能编辑、能存"的自包含 HTML —— 所以浏览器侧
        **不能**依赖 ES module，这不是权宜之计而是架构约束。

   于是分工：.mjs 仍是唯一真相源（node CLI / 测试 / sync.mjs 镜像都用它），
   本脚本生成的 .browser.js 是提交进仓库的生成物（与 sync.mjs 同一套惯例）。

   用法:  node tools/build-browser-contracts.mjs          写入孪生体
          node tools/build-browser-contracts.mjs --check  只校验是否漂移（漂移则 exit 1）
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const schema = join(repo, 'viewer', 'schema');

/* 顺序即 app.html 里 <script> 的加载顺序：被依赖的排前面。
   classic script 之间只能靠加载顺序 + window 全局互通，所以这里的顺序是契约的一部分。 */
const TARGETS = [
  { src: 'enums.mjs', out: 'enums.browser.js', global: 'LectureEnums' },
  { src: 'fields.mjs', out: 'fields.browser.js', global: 'LectureFields' },
  { src: 'validate-core.mjs', out: 'validate-core.browser.js', global: 'LectureValidate' },
];
const globalOf = (srcName) => (TARGETS.find(t => t.src === srcName) || {}).global;

/** 把 ESM 源码转成 classic script 体，并收集导出名。
 *  只处理这两个文件实际用到的 export 形态；遇到没见过的形态就报错而不是猜——
 *  猜错会静默少导出一个名字，浏览器侧到运行时才炸。 */
function transform(src, relName) {
  const names = new Set();
  let inBlockComment = false;
  const lines = src.split('\n').map((line) => {
    /* 先把注释行摘出去再做语法判断：这些文件的中文注释里正好有以「import」「export」
       开头的散文（enums.mjs 里就有一句 "import 的是早已删掉的 JS agent…"），
       不排除注释就会把说明文字当成语句、报一个莫名其妙的错。 */
    const t = line.trim();
    const wasInComment = inBlockComment;
    if (inBlockComment) { if (t.includes('*/')) inBlockComment = false; return line; }
    if (t.startsWith('/*') && !t.includes('*/')) { inBlockComment = true; return line; }
    if (wasInComment || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return line;

    /* 兄弟模块的 import → 从对应的全局解构。被依赖的模块必须自己也是一个 TARGET，
       否则那个全局在浏览器里根本不存在——所以这里硬性检查而不是放过。 */
    let m = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]\.\/([\w.-]+)['"]\s*;?/.exec(line);
    if (m) {
      const g = globalOf(m[2]);
      if (!g) {
        throw new Error(`${relName}: import 了 ./${m[2]}，但它不在 TARGETS 里 —— `
          + '浏览器侧没有对应的 window 全局。把它也加进 TARGETS（并排在依赖方之前）。');
      }
      const bound = m[1].split(',').map(s => s.trim()).filter(Boolean).join(', ');
      return `  const { ${bound} } = window.${g};   /* ← 原 import './${m[2]}' */`;
    }
    if (/^\s*import\s/.test(line)) {
      throw new Error(`${relName}: 无法识别的 import 形态（孪生体是 classic script）—— ${line.trim()}`);
    }
    // export { a, b };  → 只收名字，整行删掉（允许行尾带 // 注释）
    m = /^\s*export\s*\{([^}]*)\}\s*;?\s*(?:\/\/.*)?$/.exec(line);
    if (m) {
      for (const part of m[1].split(',')) {
        const n = part.trim().split(/\s+as\s+/).pop().trim();
        if (n) names.add(n);
      }
      return '';
    }
    // export function foo(...) / export const foo = ... / export let / export class
    m = /^(\s*)export\s+(async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) { names.add(m[4]); return m[1] + (m[2] || '') + line.slice(line.indexOf(m[3])); }
    if (/^\s*export\b/.test(line)) {
      throw new Error(`${relName}: 无法识别的 export 形态，请扩展本脚本或改写源码 —— ${line.trim()}`);
    }
    return line;
  });
  return { body: lines.join('\n'), names: [...names] };
}

function build(t) {
  /* 必须先抹平 CRLF：JS 正则里 `.` 不匹配 \r（它是行终止符），所以
     /…(?:\/\/.*)?$/ 在 CRLF 文件上永远匹配不到"行尾带 // 注释"的那种 export，
     报出来的却是"无法识别的 export 形态"——照着错误信息去改源码会完全走错方向。 */
  const src = readFileSync(join(schema, t.src), 'utf8').replace(/\r\n/g, '\n');
  const { body, names } = transform(src, t.src);
  if (!names.length) throw new Error(`${t.src}: 没收集到任何导出名，八成是解析出错了`);
  const banner = `/* ⚠ 生成物：由 tools/build-browser-contracts.mjs 从 viewer/schema/${t.src} 生成。\n`
    + `   别在这里改，改 ${t.src} 后重新运行生成脚本。\n`
    + `   存在的理由：浏览器侧不能用 ES module（.mjs 的 MIME 不可靠，且 file:// 直接禁 import），\n`
    + `   所以把同一份逻辑包成 classic script 挂到 window.${t.global}。 */\n`;
  const tail = `\n  window.${t.global} = { ${names.sort().join(', ')} };\n`;
  return { rel: `viewer/schema/${t.out}`, abs: join(schema, t.out), names,
    expected: banner + '(function () {\n  \'use strict\';\n' + body + tail + '})();\n' };
}

const built = TARGETS.map(build);
const norm = s => s.replace(/\r\n/g, '\n');

if (process.argv.includes('--check')) {
  const drift = [];
  for (const b of built) {
    let cur;
    try { cur = readFileSync(b.abs, 'utf8'); } catch { drift.push(b.rel + '（孪生体缺失）'); continue; }
    if (norm(cur) !== norm(b.expected)) drift.push(b.rel + '（与 .mjs 源不一致）');
  }
  if (drift.length) {
    console.error('✗ 浏览器孪生体已过期，请运行 `node tools/build-browser-contracts.mjs`：');
    drift.forEach(d => console.error('  · ' + d));
    process.exit(1);
  }
  console.log('✓ 浏览器孪生体与 viewer/schema 源一致（' + built.length + ' 个文件）');
} else {
  for (const b of built) {
    writeFileSync(b.abs, b.expected);
    console.log('  ' + b.rel + '  → window.' + TARGETS.find(t => b.rel.endsWith(t.out)).global
      + '  (' + b.names.length + ' 个导出)');
  }
  console.log('✓ 生成 ' + built.length + ' 个孪生体');
}
