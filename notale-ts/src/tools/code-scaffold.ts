/** Host-owned code lesson scaffold; author files and runtime retain the Python baseline. */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { RESOURCES } from '../core/guidance.js';
import { resolvePath } from '../core/planner-contract.js';
import { installCodeTheme } from './code-theme.js';

const constants = JSON.parse(readFileSync(path.join(RESOURCES, 'code-scaffold.json'), 'utf8'));
const template = path.join(RESOURCES, 'code-workbench');
const packageRoot = path.resolve(RESOURCES, '..');
export const EDITABLE: string[] = constants.editable;
export function lessonRoot(pages: string, pid: string): string {
  if (!/^page-\d+$/.test(pid)) throw new Error(`invalid page id: '${pid}'`);
  return path.join(pages, 'assets/lessons', pid);
}
function relativeLink(target: string, source: string): void {
  let existing;
  try { existing = lstatSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing?.isSymbolicLink()) {
    if (resolvePath(target) === resolvePath(source)) return;
    unlinkSync(target);
  } else if (existing) throw new Error(`fixed runtime target already exists and is not a symlink: ${target}`);
  mkdirSync(path.dirname(target), { recursive: true });
  symlinkSync(path.relative(path.dirname(target), source), target);
}
function copy(source: string, target: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
function ensureShared(pages: string): string {
  const shared = path.join(pages, 'assets/code-runtime'), assets = path.join(shared, 'assets'), libraries = path.join(assets, 'lib');
  const modules = path.join(packageRoot, 'node_modules');
  for (const name of ['core', 'runtime', 'styles.css']) copy(path.join(template, name), path.join(shared, name));
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
  writeFileSync(path.join(shared, '.notale-code-runtime.json'), JSON.stringify({ schemaVersion: 1, template: 'vendor/code-workbench', fixed: ['core', 'runtime', 'styles.css', 'assets'] }, null, 2) + '\n');
  return shared;
}
const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function outerPage(pid: string, title: string, total: number): string {
  lessonRoot('', pid);
  const number = pid.slice(5);
  return constants.outer.replaceAll('page-987', pid).replaceAll('data-page="987"', `data-page="${number}"`)
    .replaceAll('index:987', `index:${Number(number)}`).replaceAll('654', String(Math.trunc(total)))
    .replaceAll('__NOTALE_TITLE__', escapeText(title).replaceAll('"', '&quot;').replaceAll("'", '&#x27;'));
}
export async function scaffold(pagesDir: string, pid: string, title: string, total: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const pages = resolvePath(pagesDir), shared = ensureShared(pages), target = lessonRoot(pages, pid);
  await installCodeTheme(pages, path.join(shared, 'assets'), signal);
  const manifest = path.join(target, '.notale-code-lesson.json');
  if (existsSync(target) && readdirSync(target).length) {
    if (!existsSync(manifest) || !statSync(manifest).isFile()) throw new Error(`code lesson directory is non-empty and unmanaged: ${target}`);
  } else {
    mkdirSync(target, { recursive: true });
    copy(path.join(template, 'lesson'), path.join(target, 'lesson'));
    const configuredTitle = title.trim() || pid;
    const index = readFileSync(path.join(template, 'index.html'), 'utf8').replaceAll('__LESSON_TITLE_TEXT__', escapeText(configuredTitle));
    const lesson = readFileSync(path.join(target, 'lesson/lesson.js'), 'utf8').replaceAll('__LESSON_SLUG_JSON__', JSON.stringify(pid)).replaceAll('__LESSON_TITLE_JSON__', JSON.stringify(configuredTitle));
    writeFileSync(path.join(target, 'index.html'), index);
    writeFileSync(path.join(target, 'lesson/lesson.js'), lesson);
    if (index.includes('__LESSON_') || lesson.includes('__LESSON_')) throw new Error('code scaffold placeholders were not fully replaced');
    for (const name of ['core', 'runtime', 'assets', 'styles.css']) relativeLink(path.join(target, name), path.join(shared, name));
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, page: pid, title: configuredTitle, editable: EDITABLE, fixedRuntime: '../../code-runtime' }, null, 2) + '\n');
  }
  const pageFile = path.join(pages, pid + '.html');
  let outer = outerPage(pid, title.trim() || pid, total);
  if (existsSync(path.join(pages, 'assets/theme.css'))) outer = outer.replace('</head>', '<link rel="stylesheet" href="assets/code-runtime/assets/code-theme.css"><style>#stage,.code-workbench-frame{background:var(--workbench)}</style>\n</head>');
  writeFileSync(pageFile, outer);
  return { page: pageFile, workbench: path.join(target, 'index.html'), editable_root: realpathSync(path.join(target, 'lesson')),
    editable: EDITABLE.map(name => ({ path: realpathSync(path.join(target, name)), content: readFileSync(path.join(target, name), 'utf8') })), fixed_runtime: shared };
}
