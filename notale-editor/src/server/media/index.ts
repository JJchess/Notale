/** ImageSearch (grounded Gemini + Commons resolution) and ImageGen (Paratera Seedream), copied from
 * notale-ts src/tools/{image-search,media-transport,media-execution}.ts. Every image — searched or
 * generated — goes through the same SSRF-guarded download and sharp decode/pixel-cap validation.
 * Files land directly under the caller's outDir; the caller stores bytes and builds previews. */
import { lookup } from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import instructions from './media-instructions.json' with { type: 'json' };

type Row = Record<string, any>;
export type PublicGet = (raw: string, deadline: number, signal?: AbortSignal) => Promise<IncomingMessage>;
export interface MediaOptions { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; publicGet?: PublicGet }
export interface MediaImage { path: string; bytes: Buffer; mime: string; w?: number; h?: number; prompt?: string; title?: string; source?: string; page_url?: string; author?: string; license?: string }
export interface MediaResult { text: string; images: MediaImage[] }

/** Model-facing tool schemas, verbatim from notale-ts resources/builder-instructions.json MEDIA_SCHEMAS. */
export const IMAGE_TOOL_SCHEMAS: ReadonlyArray<{ type: string; name: string; description: string; parameters: Row }> = instructions.toolSchemas;

const GEN_ENDPOINT = 'https://llmapi.paratera.com/v1/images/generations', GEN_MODEL = 'Doubao-Seedream-4.0', GEN_SIZE = '2048x1152';
const MAX_PIXELS = 89478485, MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
const LIMITS = { count: { fallback: 3, max: 5 }, n: { fallback: 1, max: 4 } } as const;
const MIME: Record<string, [string, string]> = { jpeg: ['.jpg', 'image/jpeg'], png: ['.png', 'image/png'], gif: ['.gif', 'image/gif'], webp: ['.webp', 'image/webp'] };

const valueError = (message: string) => Object.assign(new Error(message), { name: 'ValueError' });
const truthy = (value: unknown) => Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value);
const isObject = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ---- redaction (notale-ts core/redact.ts) ----
const secretName = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)/i;
const word = '[\\p{L}\\p{N}_]', boundary = `(?:(?<=${word})(?!${word})|(?<!${word})(?=${word}))`;
const patterns: Array<[string, RegExp]> = ([
  ['sk', /sk-(?:ant-)?[A-Za-z0-9_-]{30,}/g], ['aws', /\bAKIA[0-9A-Z]{16}\b/g], ['github', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['google', /\bAIza[0-9A-Za-z_-]{35}\b/g], ['xai', /\bxai-[A-Za-z0-9]{20,}\b/g], ['bearer', /([Bb]earer\s+)[A-Za-z0-9._~+/=-]{30,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g],
  ['privkey', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
] as Array<[string, RegExp]>).map(([name, pattern]) => [name, new RegExp(pattern.source.replaceAll('\\b', boundary), 'gu')]);
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!text) return text;
  const known = Object.entries(env).filter(([name, value]) => value && [...value].length >= 16 && secretName.test(name) && !/^https?:\/\//.test(value)) as Array<[string, string]>;
  for (const [name, value] of known.sort((a, b) => [...b[1]].length - [...a[1]].length)) text = text.replaceAll(value, `<redacted:${name}>`);
  for (const [name, pattern] of patterns) text = text.replace(pattern, (...match) => (name === 'bearer' ? match[1] : '') + `<redacted:${name}>`);
  return text;
}
const stripText = (text: string) => text.replace(/^[\t-\r \x1c-\x1f\x85\p{Zs}\u2028\u2029]+|[\t-\r \x1c-\x1f\x85\p{Zs}\u2028\u2029]+$/gu, '');

// ---- HTTP (notale-ts core/http.ts requestBytes, simplified) ----
// ponytail: total deadline instead of notale-ts's undici idle-read timer; add the idle timer if slow-but-alive providers get cut off.
async function requestBytes(request: typeof fetch, url: string, init: RequestInit, timeoutSeconds: number, signal?: AbortSignal): Promise<{ response: Response; bytes: Buffer }> {
  const combined = AbortSignal.any([AbortSignal.timeout(timeoutSeconds * 1000), ...(signal ? [signal] : [])]);
  combined.throwIfAborted();
  const response = await request(url, { ...init, signal: combined });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

// ---- public image transport (notale-ts media-transport.ts) ----
export function publicAddress(raw: string): boolean {
  let address = ipaddr.parse(raw);
  if (address.kind() === 'ipv6' && (address as ipaddr.IPv6).isIPv4MappedAddress()) address = (address as ipaddr.IPv6).toIPv4Address();
  const constants: { private: string[]; exceptions: string[]; shared?: string } = instructions.networks[address.kind() === 'ipv4' ? '4' : '6'];
  const contains = (cidr: string) => { const [network, bits] = ipaddr.parseCIDR(cidr); return address.kind() === network.kind() && address.match(network, bits); };
  return !(constants.shared && contains(constants.shared)) && (!constants.private.some(contains) || constants.exceptions.some(contains));
}
export const publicGet: PublicGet = async (raw, deadline, signal) => {
  let url: URL;
  try { url = new URL(raw); } catch { throw valueError('图片地址必须是无凭据的公开 HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw valueError('图片地址必须是无凭据的公开 HTTP(S) URL');
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw Object.assign(new Error('图片下载超时'), { name: 'TimeoutError' });
  const combined = AbortSignal.any([AbortSignal.timeout(Math.ceil(remaining)), ...(signal ? [signal] : [])]);
  combined.throwIfAborted();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let abortLookup!: () => void;
  const addresses = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    abortLookup = () => reject(combined.reason);
    combined.addEventListener('abort', abortLookup, { once: true });
    if (combined.aborted) { abortLookup(); return; }
    // OS DNS lookup itself is not abortable; abandon its result without opening a socket.
    lookup(host, { all: true }).then(resolve, reject);
  }).finally(() => combined.removeEventListener('abort', abortLookup));
  combined.throwIfAborted();
  if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw valueError('图片地址解析到非公网地址');
  const address = addresses[0]!;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal: combined, agent: false, headers: { 'User-Agent': 'Notale-image-search/1.0' },
      // Validate all answers, then connect only to the chosen checked address.
      lookup: (_host, options, callback) => {
        if (options.all) (callback as any)(null, [address]); else callback(null, address.address, address.family);
      },
    }, resolve);
    request.setTimeout(Math.min(30000, Math.max(1, deadline - performance.now())), () => request.destroy(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
    request.on('error', reject);
  });
};
/** Sniff format, reject decompression bombs, and fully decode once so truncated/corrupt files fail here. */
async function imageInfo(input: string | Buffer): Promise<{ extension: string; mime: string; w: number; h: number }> {
  const metadata = await sharp(input, { limitInputPixels: false }).metadata();
  const kind = MIME[metadata.format ?? ''];
  const w = metadata.width!, h = metadata.pageHeight ?? metadata.height!;
  if (w * h > MAX_PIXELS) throw valueError(`图片超过解码器的安全尺寸：${w * h} 像素，上限 ${MAX_PIXELS}`);
  if (!kind) throw valueError(`不支持的浏览器图片格式：${metadata.format?.toUpperCase() ?? 'None'}`);
  await sharp(input, { limitInputPixels: MAX_PIXELS }).raw().toBuffer();
  return { extension: kind[0], mime: kind[1], w, h };
}
async function downloadImage(url: string, out: string, stem: string, deadline: number, signal: AbortSignal | undefined, get: PublicGet): Promise<{ file: string; mime: string; w: number; h: number }> {
  const partial = path.join(out, stem + '.part');
  try {
    for (let redirect = 0; redirect < 6; redirect++) {
      signal?.throwIfAborted();
      if (performance.now() >= deadline) throw Object.assign(new Error('图片下载超时'), { name: 'TimeoutError' });
      const response = await get(url, deadline, signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.statusCode!)) {
          if (!response.headers.location) throw valueError('图片重定向缺少 Location');
          url = new URL(response.headers.location, url).href; continue;
        }
        if (response.statusCode !== 200) throw Object.assign(new Error(`图片下载 HTTP ${response.statusCode}: ${response.statusMessage}`), { name: 'OSError' });
        const handle = await open(partial, 'wx');
        try {
          let size = 0;
          for await (const chunk of response) {
            signal?.throwIfAborted();
            if (performance.now() >= deadline) throw Object.assign(new Error('图片下载超时'), { name: 'TimeoutError' });
            if ((size += chunk.length) > MAX_DOWNLOAD_BYTES) throw valueError('图片文件超过 40MB');
            await handle.writeFile(chunk);
          }
        } finally { await handle.close(); }
        const info = await imageInfo(partial), file = stem + info.extension;
        await rename(partial, path.join(out, file)); return { file, mime: info.mime, w: info.w, h: info.h };
      } finally { response.destroy(); }
    }
    throw valueError('图片重定向过多');
  } finally { await unlink(partial).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

// ---- ImageSearch (notale-ts image-search.ts) ----
function mediaError(source: string, error: unknown, env: NodeJS.ProcessEnv): Row {
  const exception = error as Error & { status?: number; statusText?: string; retryAfter?: string };
  const result: Row = { source, code: exception.status ? String(exception.status) : exception.name === 'Error' ? 'ValueError' : exception.name,
    message: [...redact(exception.status ? `HTTP ${exception.status}: ${exception.statusText}` : String(exception.message), env)].slice(0, 500).join('') };
  if (exception.status && /^\d+$/.test(exception.retryAfter ?? '')) result.retry_after_seconds = Number(exception.retryAfter);
  return result;
}
function queriesOf(query: unknown): string[] {
  const queries = typeof query === 'string' ? [query] : query;
  if (!Array.isArray(queries) || !queries.length || queries.some(value => typeof value !== 'string' || !stripText(value))) throw valueError('query 必须是非空字符串或非空字符串数组');
  return queries;
}
function requestBody(queries: string[], count: number): Row {
  const body: Row = structuredClone(instructions.searchBody);
  body.contents[0].parts[0].text = body.contents[0].parts[0].text.replace('123987', String(count)) + JSON.stringify(queries.map((query, query_index) => ({ query_index, query })));
  return body;
}
function commonsFile(raw: string): boolean {
  try { const url = new URL(raw); return url.hostname === 'commons.wikimedia.org' && decodeURIComponent(url.pathname).startsWith('/wiki/File:'); } catch { return false; }
}
const decodeEntities = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity: string) =>
  entity[0] === '#' ? String.fromCodePoint(parseInt(entity.slice(entity[1] === 'x' || entity[1] === 'X' ? 2 : 1), entity[1] === 'x' || entity[1] === 'X' ? 16 : 10))
    : ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' } as Record<string, string>)[entity.toLowerCase()]!);
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1]!.toLowerCase()] ??= decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}
/** First <img src> inside Commons' <div id="file" class="fullImageLink">. */
// ponytail: regex scan instead of notale-ts's htmlparser2 (not a notale-editor dependency); only looks before the first </div>, which is where Commons puts the main image.
export function commonsImage(html: string): string | undefined {
  for (const div of html.matchAll(/<div\b([^>]*)>/gi)) {
    const attrs = attributes(div[1]!);
    if (attrs.id !== 'file' || !attrs.class?.split(/\s+/).includes('fullImageLink')) continue;
    const rest = html.slice(div.index! + div[0].length), end = rest.search(/<\/div\s*>/i);
    const img = (end < 0 ? rest : rest.slice(0, end)).match(/<img\b([^>]*)>/i);
    return img ? attributes(img[1]!).src : undefined;
  }
  return undefined;
}
async function pageImages(url: string, deadline: number, signal: AbortSignal | undefined, get: PublicGet): Promise<[string, string[]]> {
  for (let redirect = 0; redirect < 6; redirect++) {
    signal?.throwIfAborted();
    if (deadline <= performance.now()) throw Object.assign(new Error('来源页读取超时'), { name: 'TimeoutError' });
    const response = await get(url, deadline, signal);
    try {
      if ([301, 302, 303, 307, 308].includes(response.statusCode!)) {
        if (!response.headers.location) throw valueError('来源页重定向缺少 Location');
        url = new URL(response.headers.location, url).href; continue;
      }
      if (response.statusCode !== 200) throw Object.assign(new Error(`来源页 HTTP ${response.statusCode}: ${response.statusMessage}`), { name: 'OSError' });
      if (!commonsFile(url)) throw valueError('来源不是 Commons 文件详情页');
      if (!String(response.headers['content-type'] ?? '').toLowerCase().includes('html')) throw valueError('来源页不是 HTML');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of response) { signal?.throwIfAborted(); size += chunk.length; if (size > 2000000) throw valueError('来源页超过 HTML 解析器的安全大小'); chunks.push(Buffer.from(chunk)); }
      const image = commonsImage(Buffer.concat(chunks).toString('utf8'));
      return [url, image ? [new URL(image, url).href] : []];
    } finally { response.destroy(); }
  }
  throw valueError('来源页重定向过多');
}
async function downloadCandidate(item: Row, out: string, index: number, deadline: number, options: MediaOptions, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<Row> {
  const row: Row = { source: 'gemini-google-search', title: item.title ?? '', page_url: item.page_url ?? '', download_attempts: [] }, seen = new Set<string>();
  const get = options.publicGet ?? publicGet;
  const attempt = async (url: unknown): Promise<boolean> => {
    if (typeof url !== 'string' || !url || seen.has(url)) return false;
    seen.add(url); const evidence: Row = { url }; row.download_attempts.push(evidence);
    try {
      const { file, mime, w, h } = await downloadImage(url, out, String(index).padStart(2, '0'), deadline, signal, get);
      Object.assign(row, { url, file, mime, w, h }); return true;
    } catch (error) { if (signal?.aborted) throw signal.reason; evidence.error = mediaError('download', error, env).message; return false; }
  };
  if (typeof row.page_url !== 'string' || !row.page_url) { row.error = '候选缺少来源页地址'; return row; }
  if (!commonsFile(row.page_url)) {
    if (await attempt(item.image_url)) row.extracted_from = 'search_response';
    else row.error = row.download_attempts.at(-1)?.error ?? '候选未提供图片直链';
    return row;
  }
  try {
    const [final, urls] = await pageImages(row.page_url, deadline, signal, get); row.resolved_page_url = final;
    for (const url of urls) if (await attempt(url)) { row.extracted_from = 'source_html'; return row; }
    row.error = 'Commons 主图缺失或无法下载';
  } catch (error) { if (signal?.aborted) throw signal.reason; row.error = mediaError('source_page', error, env).message; }
  return row;
}
async function search(query: unknown, count: number, out: string, options: MediaOptions, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<[Row[], Row[]]> {
  const queries = queriesOf(query), key = env.GEMINI_API_KEY;
  if (!key) throw valueError('未配置 GEMINI_API_KEY；此检索未执行，改搜索词不能修复配置');
  const body = requestBody(queries, count), batch = Array.isArray(query), rows: Row[] = [], errors: Row[] = [];
  const error = (exception: unknown, index?: number) => { const row = mediaError('gemini-google-search', exception, env); if (batch && index !== undefined) row.query_index = index; errors.push(row); };
  try {
    signal?.throwIfAborted();
    const { response, bytes } = await requestBytes(options.fetch ?? fetch, instructions.searchEndpoint, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual' }, 120, signal);
    const status = () => { if (!response.ok) throw Object.assign(new Error(), { name: 'HTTPStatusError', status: response.status, statusText: response.statusText, retryAfter: response.headers.get('Retry-After') ?? '' }); };
    let parsed: Row;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { status(); throw valueError('Gemini 成功响应不是 JSON'); }
    status();
    const candidates = parsed?.candidates;
    if (!Array.isArray(candidates) || !candidates.length || !isObject(candidates[0])) throw valueError('Gemini 未返回候选响应，不是正常零结果');
    const candidate = candidates[0];
    if (candidate.finishReason !== 'STOP') throw valueError(`Gemini 响应未完整结束：${candidate.finishReason ?? 'None'}`);
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts) || parts.some(part => !isObject(part))) throw valueError('Gemini 响应缺少有效 content.parts');
    if (!parts.some(part => part.toolCall?.toolType === 'GOOGLE_SEARCH_WEB') && !(isObject(candidate.groundingMetadata) && truthy(candidate.groundingMetadata.webSearchQueries))) throw valueError('Gemini 未返回 Google 搜索执行记录，不能确认这些候选来自实际搜索');
    const texts = parts.filter(part => !truthy(part.thought)).map(part => Object.hasOwn(part, 'text') ? part.text : '');
    if (texts.some(text => typeof text !== 'string')) throw valueError('Gemini 返回了非字符串 text');
    const groups = JSON.parse(texts.join(''))?.queries;
    if (!Array.isArray(groups)) throw valueError('Gemini 响应缺少 queries 数组，不是正常零结果');
    const byIndex = new Map<number, Row>();
    for (const group of groups) {
      const index = group?.query_index;
      if (!isObject(group) || !Number.isInteger(index) || index < 0 || index >= queries.length || byIndex.has(index)) { error(valueError('Gemini 返回无效或重复的 query_index')); continue; }
      byIndex.set(index, group);
    }
    const deadline = performance.now() + 300000;
    for (let index = 0; index < queries.length; index++) {
      const group = byIndex.get(index);
      if (!group || !Array.isArray(group.results)) { error(valueError('Gemini 漏交此需求的 results，不是正常零结果'), index); continue; }
      const seen = new Set<string>(); let accepted = 0;
      for (const item of group.results) {
        signal?.throwIfAborted();
        if (accepted >= count) break;
        if (!isObject(item) || ['title', 'page_url'].some(key => typeof item[key] !== 'string')) { error(valueError('Gemini 图片候选格式错误'), index); continue; }
        const direct = truthy(item.image_url) ? item.image_url : '';
        if (typeof direct !== 'string') { error(valueError('Gemini image_url 不是字符串'), index); continue; }
        const identity = JSON.stringify([item.page_url, direct]); if (seen.has(identity)) continue;
        seen.add(identity); accepted++;
        const row = await downloadCandidate(item, out, rows.length, deadline, options, env, signal);
        if (batch) row.query_index = index; rows.push(row);
      }
    }
  } catch (exception) { if (signal?.aborted) throw signal.reason; error(exception); }
  return [rows, errors];
}

// ---- ImageGen (notale-ts media-execution.ts generate, native Paratera path only) ----
async function generate(prompt: unknown, count: number, out: string, options: MediaOptions, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<Row[]> {
  if (typeof prompt !== 'string' || !stripText(prompt)) throw valueError('prompt 必须是非空字符串');
  const key = env.PARATERA_API_KEY;
  if (!key) throw Object.assign(new Error('未配置 PARATERA_API_KEY；ImageGen 未执行'), { name: 'RuntimeError' });
  const timeout = AbortSignal.timeout(300000), combined = AbortSignal.any([timeout, ...(signal ? [signal] : [])]), deadline = performance.now() + 300000;
  try {
    const { response, bytes } = await requestBytes(options.fetch ?? fetch, GEN_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GEN_MODEL, prompt, size: GEN_SIZE, n: count }), redirect: 'manual' }, 300, combined);
    if (!response.ok) throw Object.assign(new Error(`接口返回 HTTP ${response.status}:\n    ${[...bytes.toString('utf8')].slice(0, 400).join('')}`), { name: 'RuntimeError' });
    const data = JSON.parse(bytes.toString('utf8'));
    const candidates: unknown[] = isObject(data) && Array.isArray(data.data) ? data.data : [];
    const rows: Row[] = [];
    for (const [index, candidate] of candidates.entries()) {
      combined.throwIfAborted();
      if (!isObject(candidate)) continue;
      const stem = `image-${index + 1}`;
      if (typeof candidate.b64_json === 'string' && candidate.b64_json) {
        const decoded = Buffer.from(candidate.b64_json, 'base64'), info = await imageInfo(decoded), file = stem + info.extension;
        await writeFile(path.join(out, file), decoded);
        rows.push({ file, mime: info.mime, w: info.w, h: info.h, prompt, model: GEN_MODEL, size: GEN_SIZE });
      } else if (typeof candidate.url === 'string' && candidate.url) {
        // Provider URLs go through the same public-address guard and decode validation as search results.
        const { file, mime, w, h } = await downloadImage(candidate.url, out, stem, deadline, combined, options.publicGet ?? publicGet);
        rows.push({ file, mime, w, h, prompt, model: GEN_MODEL, size: GEN_SIZE });
      }
    }
    if (!rows.length) throw Object.assign(new Error(`没有返回图片: ${JSON.stringify(data).slice(0, 300)}`), { name: 'RuntimeError' });
    return rows;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw Object.assign(new Error('ImageGen 超过 300 秒未完成'), { name: 'TimeoutError' });
    throw error;
  }
}

function mediaCount(args: Row, key: 'count' | 'n'): number {
  const { fallback, max } = LIMITS[key], value = args[key];
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw valueError(`${key} must be a positive integer`);
  if (value > max) throw valueError(`${key} 不能超过 ${max}（${key === 'n' ? '单次最多生成' : '每个需求最多检索'} ${max} 张）`);
  return value;
}
export function mediaAvailability(env: NodeJS.ProcessEnv = process.env): { imageSearch: { available: boolean; reason: string }; imageGen: { available: boolean; reason: string } } {
  return {
    imageSearch: env.GEMINI_API_KEY ? { available: true, reason: '' } : { available: false, reason: '未配置 GEMINI_API_KEY，图片检索不可用' },
    imageGen: env.PARATERA_API_KEY ? { available: true, reason: '' } : { available: false, reason: '未配置 PARATERA_API_KEY，图片生成不可用' },
  };
}
/** name is 'ImageSearch' | 'ImageGen'. outDir is a fresh temp dir the caller owns.
 * ImageSearch reports failures inside `text` (results/errors); ImageGen and invalid arguments throw. */
export async function mediaCall(name: string, args: unknown, outDir: string, options: MediaOptions = {}, signal?: AbortSignal): Promise<MediaResult> {
  if (name !== 'ImageSearch' && name !== 'ImageGen') throw valueError(`未知媒体工具：${name}`);
  if (!isObject(args)) throw valueError('参数必须是对象');
  const env = options.env ?? process.env, images: MediaImage[] = [];
  const collect = async (row: Row, meta: Partial<MediaImage>) => {
    const file = row.file; delete row.file; delete row.mime;
    if (typeof file !== 'string') return;
    row.path = file;
    images.push({ path: file, bytes: await readFile(path.join(outDir, file)), mime: meta.mime!, ...meta });
  };
  if (name === 'ImageGen') {
    const records = await generate(args.prompt, mediaCount(args, 'n'), outDir, options, env, signal);
    for (const row of records) await collect(row, { mime: row.mime, w: row.w, h: row.h, prompt: row.prompt });
    return { text: redact(JSON.stringify(records.map(({ w: _w, h: _h, ...row }) => row)), env), images };
  }
  const count = mediaCount(args, 'count');
  let records: Row[] = [], errors: Row[];
  try { [records, errors] = await search(args.query, count, outDir, options, env, signal); }
  catch (error) { if (signal?.aborted) throw signal.reason; errors = [mediaError('gemini', error, env)]; }
  for (const row of records) {
    signal?.throwIfAborted();
    if (typeof row.file !== 'string') { row.error ??= '未取得可用图片'; continue; }
    const meta: Partial<MediaImage> = { mime: row.mime, w: row.w, h: row.h };
    for (const key of ['title', 'source', 'page_url', 'author', 'license'] as const) if (typeof row[key] === 'string' && row[key]) meta[key] = row[key];
    await collect(row, meta);
  }
  const fields = ['query_index', 'title', 'source', 'page_url', 'url', 'author', 'license', 'path', 'w', 'h', 'error'];
  const results = records.map(row => Object.fromEntries(fields.filter(key => row[key] != null && row[key] !== '').map(key => [key, row[key]])));
  return { text: redact(JSON.stringify({ results, errors }), env), images };
}
