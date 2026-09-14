/** Shared media executor for Planner, Director and Builder, without per-deck quotas. */
import { requestBytes } from '../core/http.js';
import { spawn } from 'node:child_process';
import { RESOURCES } from '../core/guidance.js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, configValue } from '../adapters/models/profiles.js';
import { jsonText, type PlannerPorts } from '../core/planning.js';
import { decodeText, splitLines, stripText, PYTHON_SPACE } from '../core/text.js';
import { parsePythonJson, parsePythonJsonBytes, isPythonIntegerField, inheritJsonProvenance, pythonJsonTruthy, pythonNumberText } from '../core/json.js';
import { resolvePath } from '../core/planner-contract.js';
import { isWithin } from '../core/theme.js';
import { redact } from '../core/redact.js';
import { imageOutput } from './check.js';
import { mediaError, search, type MediaOptions } from './image-search.js';
import { imageInfo, valueError } from './media-transport.js';
import type { ToolOutput, WorkspacePorts } from './workspace.js';

type Row = Record<string, any>;
const GEN_ENDPOINT = 'https://llmapi.paratera.com/v1/images/generations', GEN_MODEL = 'Doubao-Seedream-4.0';
export function generationKeyFromFile(bytes: Buffer): string | undefined {
  const pattern = new RegExp(`^${PYTHON_SPACE}*PARATERA_API_KEY${PYTHON_SPACE}*=${PYTHON_SPACE}*([^\\n]+?)${PYTHON_SPACE}*$`, 'u');
  for (const line of splitLines(decodeText(bytes, false))) {
    const match = line.match(pattern);
    if (match) return stripText(match[1]!).replace(/^['"]+|['"]+$/g, '');
  }
  return undefined;
}
function generationKey(env: NodeJS.ProcessEnv): string {
  if (env.PARATERA_API_KEY) return env.PARATERA_API_KEY;
  const fallback = '/data1/home/zhuyifan/ws2/Notale/notale/.env.local';
  if (existsSync(fallback)) {
    const key = generationKeyFromFile(readFileSync(fallback));
    if (key !== undefined) return key;
  }
  throw Object.assign(new Error('找不到 PARATERA_API_KEY(环境变量和 .env.local 都没有)'), { name: 'RuntimeError' });
}
export function generationScriptFor(resourceRoot?: string): string | undefined {
  if (resourceRoot === undefined) return undefined;
  if (!existsSync(resourceRoot) || !statSync(resourceRoot).isDirectory()) throw new Error(`✗ --skills 指的 ${resourceRoot} 不是目录，ImageGen 生成脚本不可用`);
  // Explicitly selecting the bundled Python tools still selects the migrated native implementation.
  if (resolvePath(resourceRoot) === resolvePath(path.join(RESOURCES, '../../notale-v2/tools'))) return undefined;
  const script = path.join(resourceRoot, 'make-illustration/scripts/gen.py');
  if (!existsSync(script) || !statSync(script).isFile()) throw new Error(`✗ 取图脚本不存在：${script}`);
  return path.resolve(script);
}
async function customGeneration(script: string, prompt: string, count: number | bigint, out: string, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<Row[]> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn('python', [script, prompt, '--n', String(count), '--out', path.resolve(out, 'image.png')], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let timedOut = false;
    const tail = (value: string) => [...value].slice(-1500).join('');
    child.stdout.on('data', data => stdout.push(Buffer.from(data)));
    child.stderr.on('data', data => stderr.push(Buffer.from(data)));
    const kill = () => { if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, 300000);
    const abort = () => kill(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) kill();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', code => {
      cleanup();
      if (signal?.aborted) return reject(signal.reason);
      if (timedOut) return reject(Object.assign(new Error('ImageGen script timed out after 300 seconds'), { name: 'TimeoutExpired' }));
      try {
        const output = decodeText(Buffer.concat(stdout)), error = decodeText(Buffer.concat(stderr));
        if (code !== 0 || !existsSync(path.join(out, 'illustrations.json')) || !statSync(path.join(out, 'illustrations.json')).isFile()) return reject(Object.assign(new Error(tail(error || output || 'media returned no results')), { name: 'RuntimeError' }));
        resolve();
      } catch (error) { reject(error); }
    });
  });
  return parsePythonJson(decodeText(await readFile(path.join(out, 'illustrations.json')))) as Row[];
}
function jsonValueType(value: unknown, numberIsInteger = Number.isInteger(value)): string {
  return value == null ? 'NoneType' : Array.isArray(value) ? 'list' : typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? numberIsInteger ? 'int' : 'float' : typeof value === 'string' ? 'str' : 'dict';
}
function imageResponseObject(value: unknown, numberIsInteger = Number.isInteger(value)): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`'${jsonValueType(value, numberIsInteger)}' object has no attribute 'get'`), { name: 'AttributeError' });
  return value as Row;
}
/** Python base64.b64decode(validate=False), including ignored characters and padding. */
export function decodeGenerationBase64(value: unknown, numberIsInteger = Number.isInteger(value)): Buffer {
  if (typeof value !== 'string') {
    const type = jsonValueType(value, numberIsInteger);
    throw new TypeError(`argument should be a bytes-like object or ASCII string, not '${type}'`);
  }
  if (/[^\x00-\x7f]/.test(value)) throw valueError('string argument should contain only ASCII characters');
  let data = '', pads = 0;
  for (const char of value) {
    const position = data.length % 4;
    if (char === '=') {
      if (position >= 2 && position + ++pads >= 4) return Buffer.from(data, 'base64');
      continue;
    }
    if (!/[A-Za-z0-9+/]/.test(char)) continue;
    pads = 0; data += char;
  }
  if (data.length % 4 === 1) throw new Error(`Invalid base64-encoded string: number of data characters (${data.length}) cannot be 1 more than a multiple of 4`);
  if (data.length % 4) throw new Error('Incorrect padding');
  return Buffer.from(data, 'base64');
}
export async function generate(prompt: string, count: number | bigint, out: string, options: MediaOptions = {}, signal?: AbortSignal): Promise<Row[]> {
  const env = options.env ?? process.env;
  if (options.imageGenScript) return customGeneration(options.imageGenScript, prompt, count, out, env, signal);
  const request = options.fetch ?? fetch, key = generationKey(env);
  const deadline = AbortSignal.timeout(300000);
  const combined = AbortSignal.any([deadline, ...(signal ? [signal] : [])]);
  try {
    combined.throwIfAborted();
    const { response, bytes: responseBytes } = await requestBytes(request, GEN_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: jsonText({ model: GEN_MODEL, prompt, size: '2048x1152', n: count }, { ensureAscii: true }) }, 300, combined);
    if (!response.ok) throw Object.assign(new Error(`接口返回 HTTP ${response.status}:\n    ${[...decodeText(responseBytes, false, { universalNewlines: false })].slice(0, 400).join('')}`), { name: 'RuntimeError' });
    const responseRoot: Row = {};
    const data = imageResponseObject(parsePythonJsonBytes(responseBytes, responseRoot), isPythonIntegerField(responseRoot, 'value')), images: Buffer[] = [];
    let candidates = pythonJsonTruthy(data.data) ? data.data : [];
    if (!Array.isArray(candidates) && typeof candidates !== 'string') {
      if (candidates && typeof candidates === 'object') candidates = Object.keys(candidates);
      else throw new TypeError(`'${jsonValueType(candidates, isPythonIntegerField(data, 'data'))}' object is not iterable`);
    }
    let candidateIndex = 0;
    for (const candidate of candidates) {
      const item = imageResponseObject(candidate, isPythonIntegerField(candidates, String(candidateIndex++)));
      combined.throwIfAborted();
      if (pythonJsonTruthy(item.b64_json)) images.push(decodeGenerationBase64(item.b64_json, isPythonIntegerField(item, 'b64_json')));
      else if (pythonJsonTruthy(item.url)) {
        if (typeof item.url !== 'string') throw Object.assign(new Error(`'${jsonValueType(item.url, isPythonIntegerField(item, 'url'))}' object has no attribute 'timeout'`), { name: 'AttributeError' });
        const { response: downloaded, bytes } = await requestBytes(request, item.url, {}, 180, combined);
        if (!downloaded.ok) throw Object.assign(new Error(`HTTP Error ${downloaded.status}: ${downloaded.statusText}`), { name: 'RuntimeError' });
        images.push(bytes);
      }
    }
    if (!images.length) throw Object.assign(new Error(`没有返回图片: ${jsonText(data, { ensureAscii: true }).slice(0, 300)}`), { name: 'RuntimeError' });
    const rows: Row[] = [];
    for (const [index, bytes] of images.entries()) {
      combined.throwIfAborted();
      const file = images.length === 1 ? 'image.png' : `image-${index + 1}.png`;
      await writeFile(path.join(out, file), bytes); rows.push({ file, prompt, model: GEN_MODEL, size: '2048x1152' });
    }
    const log = path.join(out, 'illustrations.json');
    const previousRoot: Row = {};
    const previous: Row[] = existsSync(log) ? parsePythonJson(decodeText(await readFile(log)), previousRoot) : [];
    if (!Array.isArray(previous)) throw Object.assign(new Error(`'${jsonValueType(previous, isPythonIntegerField(previousRoot, 'value'))}' object has no attribute 'append'`), { name: 'AttributeError' });
    previous.push(...rows);
    combined.throwIfAborted();
    await writeFile(log, jsonText(previous, { indent: 2 }));
    combined.throwIfAborted();
    return previous;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (deadline.aborted) throw Object.assign(new Error('ImageGen script timed out after 300 seconds'), { name: 'TimeoutExpired' });
    throw error;
  }
}
function searchBackend(options: MediaOptions): string {
  if (options.backend !== undefined) return options.backend;
  return configValue(configValue(loadConfig(), 'media'), 'image_search_backend', 'gemini');
}
function mediaCount(args: Row, key: string, fallback: number): number | bigint {
  if (args[key] === undefined) return fallback;
  const value = args[key];
  if (!isPythonIntegerField(args, key) || value < 1) throw valueError(`${key} must be a positive integer`);
  return Number.isSafeInteger(value) ? value : BigInt(pythonNumberText(value, args, key));
}
export async function fetchMedia(name: string, args: Row, pages: string, owner: string, options: MediaOptions = {}, signal?: AbortSignal): Promise<{ out: string; records: Row[]; errors: Row[] }> {
  if (!['ImageSearch', 'ImageGen'].includes(name) || !owner || path.basename(owner) !== owner || ['.', '..'].includes(owner)) throw valueError('invalid media operation or owner');
  const key = name === 'ImageSearch' ? 'count' : 'n', count = mediaCount(args, key, name === 'ImageSearch' ? 3 : 1);
  const out = path.join(pages, 'assets/img', `${owner}-${randomUUID().replaceAll('-', '').slice(0, 12)}`);
  if (!isWithin(out, pages)) throw valueError('media output is outside pages');
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out);
  let raw: Row[], errors: Row[] = [];
  const backend = name === 'ImageSearch' ? searchBackend(options) : undefined;
  if (name === 'ImageSearch') {
    try {
      if (backend !== 'gemini') throw valueError(`未知图片检索后端：${backend}`);
      [raw, errors] = await search(args.query, count, out, options, signal);
    } catch (error) { if (signal?.aborted) throw signal.reason; return { out, records: [], errors: [mediaError(backend!, error, options.env)] }; }
  } else raw = await generate(args.prompt, count, out, options, signal);
  const records: Row[] = [];
  for (const item of raw) {
    const row = inheritJsonProvenance({ ...item }, item);
    if (row.download_error) { row.error = row.download_error; delete row.download_error; }
    const filename = row.file; delete row.file;
    if (filename) {
      try {
        if (typeof filename !== 'string') throw valueError('图片文件名不是字符串');
        const target = resolvePath(filename, out);
        if (!isWithin(target, out)) throw valueError(`'${target}' is not in the subpath of '${resolvePath(out)}'`);
        if (existsSync(target) && (await stat(target)).isFile()) row.path = path.relative(resolvePath(pages), target).split(path.sep).join('/');
      } catch (error) { if (name !== 'ImageSearch') throw error; row.error = mediaError(backend!, error, options.env).message; }
    }
    records.push(row);
  }
  return { out, records, errors };
}
export async function mediaCall(name: string, args: Row, pages: string, owner: string, options: MediaOptions = {}, signal?: AbortSignal): Promise<ToolOutput> {
  const started = performance.now(), backend = name === 'ImageSearch' ? searchBackend(options) : undefined;
  const { out, records, errors } = await fetchMedia(name, args, pages, owner, { ...options, ...(backend !== undefined ? { backend } : {}) }, signal), images: ToolOutput['images'] = [];
  for (const row of records) {
    signal?.throwIfAborted();
    if (!Object.hasOwn(row, 'path')) { if (!Object.hasOwn(row, 'error')) row.error = '未取得可用图片'; continue; }
    try {
      const file = path.join(pages, row.path);
      if (name === 'ImageSearch') { const [, width, height] = await imageInfo(file); row.w = width; row.h = height; }
      images.push(...(await imageOutput(file)).images);
    } catch (error) { if (signal?.aborted) throw signal.reason; row.error = (error as Error).message; delete row.path; }
  }
  if (name !== 'ImageSearch') return { text: jsonText(records), images };
  const fields = ['query_index', 'title', 'source', 'page_url', 'url', 'author', 'license', 'path', 'w', 'h', 'error'];
  const result = parsePythonJson(redact(jsonText({ results: records.map(row => inheritJsonProvenance(Object.fromEntries(fields.filter(key => row[key] != null && row[key] !== '').map(key => [key, row[key]])), row)), errors }), options.env));
  try {
    const attribution = records.map(item => {
      const row = inheritJsonProvenance({ ...item }, item), file = row.path; delete row.path;
      if (file) row.file = path.relative(resolvePath(out), resolvePath(file, pages)).split(path.sep).join('/');
      return row;
    });
    await writeFile(path.join(out, 'attribution.json'), redact(jsonText(attribution, { indent: 2 }), options.env));
    await writeFile(path.join(out, 'search.json'), redact(jsonText({ query: args.query ?? null, backend, requested_count: mediaCount(args, 'count', 3),
      duration_ms: Math.round(performance.now() - started), result }, { indent: 2 }), options.env));
  } catch (error) { result.errors.push(mediaError('record', error, options.env)); }
  return { text: jsonText(result), images };
}
export function mediaPorts(options: MediaOptions = {}): { workflow: PlannerPorts['media']; workspace: WorkspacePorts['media'] } {
  return {
    workflow: async (name, args, pages, owner, signal) => { const result = await mediaCall(name, args, pages, owner, options, signal); return { text: result.text, images: result.images.map(([mime, data]) => ({ mime, data })) }; },
    workspace: (name, args, context, signal) => mediaCall(name, args, context.cwd, context.pid, options, signal),
  };
}
export async function mediaSources(pages: string): Promise<Record<string, Row>> {
  const records: Record<string, Row> = {}, root = path.join(pages, 'assets/img');
  if (!existsSync(root)) return records;
  const directories = (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory() || item.isSymbolicLink()).map(item => item.name).sort();
  for (const filename of ['attribution.json', 'illustrations.json']) for (const directory of directories) {
    const log = path.join(root, directory, filename); if (!existsSync(log)) continue;
    try {
      for (const row of parsePythonJson(decodeText(await readFile(log)))) {
        if (!row.file) continue;
        const file = resolvePath(row.file, path.dirname(log));
        if (!isWithin(file, path.dirname(log)) || !isWithin(file, pages)) throw valueError('source file outside private media directory');
        if (existsSync(file) && (await stat(file)).isFile()) records[path.relative(resolvePath(pages), file).split(path.sep).join('/')] = row;
      }
    } catch (error) { console.warn(`  来源记录无法读取：${filename}: ${(error as Error).message}`); }
  }
  return records;
}
export async function writeCredits(pages: string): Promise<void> {
  const records = await mediaSources(pages); if (!Object.keys(records).length) return;
  const lines = Object.entries(records).map(([file, row]) => {
    const parts = ['title', row.page_url ? 'page_url' : 'url', 'author', 'license', 'model'].filter(key => row[key]).map(key => String(row[key]));
    return `- \`${file}\`` + (parts.length ? ' — ' + parts.join(' · ') : '');
  });
  await writeFile(path.join(pages, 'assets/img/CREDITS.md'), '# 素材来源\n\n取图结果记录，包含未采用候选；不代表页面实际加载。\n\n' + lines.join('\n') + '\n');
}
