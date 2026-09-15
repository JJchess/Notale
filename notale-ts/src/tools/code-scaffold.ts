/** Host-owned observer lesson scaffold and shared browser dependencies. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RESOURCES } from '../core/guidance.js';
import { resolvePath } from '../core/planner-contract.js';
import { CODE_FILES, CODE_RUNTIME_VERSION } from '../core/code-observer.js';

const outerTemplate = readFileSync(path.join(RESOURCES, 'code-observer/outer.html'), 'utf8');
const packageRoot = path.resolve(RESOURCES, '..');
export function lessonRoot(pages: string, pid: string): string {
  if (!/^page-\d+$/.test(pid)) throw new Error(`invalid page id: '${pid}'`);
  return path.join(pages, 'assets/lessons', pid);
}
function copy(source: string, target: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
function ensureDependencies(pages: string): void {
  const shared = path.join(pages, 'assets/code-runtime-' + CODE_RUNTIME_VERSION), assets = path.join(shared, 'assets'), libraries = path.join(assets, 'lib');
  const modules = path.join(packageRoot, 'node_modules');
  for (const name of ['base.css', 'base.js']) copy(path.join(RESOURCES, 'chassis', name), path.join(assets, name));
  // Copies stay inside the output. Relative lesson links survive moving the whole lecture.
  if (!existsSync(path.join(libraries, 'monaco-editor/min/vs/loader.js'))) {
    copy(path.join(modules, 'monaco-editor/min'), path.join(libraries, 'monaco-editor/min'));
    for (const name of ['LICENSE', 'ThirdPartyNotices.txt', 'package.json']) copy(path.join(modules, 'monaco-editor', name), path.join(libraries, 'monaco-editor', name));
  }
  const pyodide = path.join(libraries, 'pyodide');
  for (const name of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'package.json']) {
    if (!existsSync(path.join(pyodide, name))) copy(path.join(modules, 'pyodide', name), path.join(pyodide, name));
  }
  copy(path.join(packageRoot, 'third_party/PYODIDE-LICENSE.txt'), path.join(pyodide, 'LICENSE'));
  const numpy = JSON.parse(readFileSync(path.join(pyodide, 'pyodide-lock.json'), 'utf8')).packages.numpy;
  if (!existsSync(path.join(pyodide, numpy.file_name))) {
    const wheel = path.join(packageRoot, 'dist/browser/packages', numpy.file_name);
    if (!existsSync(wheel)) throw new Error('missing code runtime dependency: NumPy wheel ' + numpy.file_name);
    if (createHash('sha256').update(readFileSync(wheel)).digest('hex') !== numpy.sha256) throw new Error('NumPy wheel hash mismatch');
    copy(wheel, path.join(pyodide, numpy.file_name));
  }
  for (const name of ['codicon.css', 'codicon.ttf']) copy(path.join(modules, '@vscode/codicons/dist', name), path.join(libraries, 'vscode-codicons', name));
  for (const name of ['LICENSE', 'LICENSE-CODE', 'package.json']) copy(path.join(modules, '@vscode/codicons', name), path.join(libraries, 'vscode-codicons', name));
}
const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function outerPage(pid: string, title: string, total: number): string {
  lessonRoot('', pid);
  const number = pid.slice(5);
  return outerTemplate.replaceAll('page-987', pid).replaceAll('data-page="987"', `data-page="${number}"`)
    .replaceAll('index:987', `index:${Number(number)}`).replaceAll('654', String(Math.trunc(total)))
    .replaceAll('__NOTALE_TITLE__', escapeText(title).replaceAll('"', '&quot;').replaceAll("'", '&#x27;'));
}
/** New lessons use observer-v1; existing lessons are never silently migrated. */
export async function scaffold(pagesDir: string, pid: string, title: string, total: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
  signal?.throwIfAborted();
  const pages = resolvePath(pagesDir), target = lessonRoot(pages, pid);
  const marker = path.join(target, '.notale-code-lesson.json');
  const shared = path.join(pages, 'assets/code-runtime-' + CODE_RUNTIME_VERSION);
  const editable = CODE_FILES.map(file => 'lesson/' + file);
  if (existsSync(marker)) {
    const meta = JSON.parse(readFileSync(marker, 'utf8'));
    if (meta.runtimeVersion !== CODE_RUNTIME_VERSION) throw new Error(`旧版或未知代码页协议 ${meta.runtimeVersion ?? "legacy"} 不再支持续写，请重新生成新版页面`);
  } else {
    if ((existsSync(target) && readdirSync(target).length) || existsSync(path.join(pages, pid + '.html')))
      throw new Error(`Refusing to replace unmanaged code page: ${pid}`);
    ensureDependencies(pages);
    const source = path.join(RESOURCES, 'code-observer');
    for (const name of ['core', 'runtime', 'styles.css', 'licenses']) {
      const dest = path.join(shared, name);
      if (!existsSync(dest)) copy(path.join(source, name), dest);
    }
    copy(path.join(source, 'scaffold'), path.join(target, 'lesson'));
    copy(path.join(source, 'view-shell.html'), path.join(target, 'lesson/view/index.html'));
    const configuredTitle = title.trim() || pid;
    const config = readFileSync(path.join(source, 'lesson.js'), 'utf8')
      .replace('"code-page"', JSON.stringify(pid)).replace('"代码实验"', JSON.stringify(configuredTitle));
    writeFileSync(path.join(target, 'lesson/lesson.js'), config);
    const prefix = '../../code-runtime-' + CODE_RUNTIME_VERSION + '/';
    let shell = readFileSync(path.join(source, 'workbench.html'), 'utf8').replaceAll('{{TITLE}}', escapeText(configuredTitle));
    for (const name of ['assets/', 'core/', 'styles.css']) shell = shell.replaceAll('"' + name, '"' + prefix + name);
    writeFileSync(path.join(target, 'index.html'), shell);
    let outer = outerPage(pid, configuredTitle, total);
    if (existsSync(path.join(pages, 'assets/theme.css')))
      outer = outer.replaceAll(`${pid}/index.html`, `${pid}/index.html?theme=../../theme.css`);
    writeFileSync(path.join(pages, pid + '.html'), outer);
    writeFileSync(marker, JSON.stringify({ schemaVersion: 1, runtimeVersion: CODE_RUNTIME_VERSION, page: pid,
      title: configuredTitle, editable, fixedRuntime: prefix.slice(0, -1) }, null, 2) + '\n');
  }
  const { lesson } = await import(pathToFileURL(path.join(target, 'lesson/lesson.js')).href);
  return { page: path.join(pages, pid + '.html'), workbench: path.join(target, 'index.html'), limits: lesson.limits,
    editable_root: path.join(target, 'lesson'), fixed_runtime: shared,
    editable: editable.map(file => ({ path: path.join(target, file), content: readFileSync(path.join(target, file), 'utf8') })) };
}
