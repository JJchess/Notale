/** Original grounded Gemini search protocol and Commons image resolution. */
import { requestBytes } from '../core/http.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Parser } from 'htmlparser2';
import { stripText } from '../core/text.js';
import { redact } from '../core/redact.js';
import { jsonText, parsePythonJson, parsePythonJsonBytes, isPythonIntegerField, pythonJsonTruthy } from '../core/json.js';
import { downloadImage, mediaInstructions, publicGet, valueError, type PublicGet } from './media-transport.js';

type Row = Record<string, any>;
export interface MediaOptions { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; publicGet?: PublicGet; backend?: string; imageGenScript?: string }
export function mediaError(source: string, error: unknown, env = process.env): Row {
  const exception = error as Error & { status?: number; statusText?: string; retryAfter?: string };
  const result: Row = { source, code: exception.status ? String(exception.status) : exception.name === 'Error' ? 'ValueError' : exception.name,
    message: [...redact(exception.status ? `HTTP ${exception.status}: ${exception.statusText}` : exception.message, env)].slice(0, 500).join('') };
  if (exception.status && /^\d+$/.test(exception.retryAfter ?? '')) result.retry_after_seconds = Number(exception.retryAfter);
  return result;
}
export function queriesOf(query: unknown): string[] {
  const queries = typeof query === 'string' ? [query] : query;
  if (!Array.isArray(queries) || !queries.length || queries.some(value => typeof value !== 'string' || !stripText(value))) throw valueError('query 必须是非空字符串或非空字符串数组');
  return queries;
}
export function requestBody(queries: string[], count: number | bigint): Row {
  const body = structuredClone(mediaInstructions.searchBody);
  body.contents[0].parts[0].text = body.contents[0].parts[0].text.replace('123987', String(count)) + jsonText(queries.map((query, query_index) => ({ query_index, query })));
  return body;
}
function commonsFile(raw: string): boolean {
  try { const url = new URL(raw); return url.hostname === 'commons.wikimedia.org' && decodeURIComponent(url.pathname).startsWith('/wiki/File:'); } catch { return false; }
}
export function commonsImage(html: string): string | undefined {
  let depth = 0, image: string | undefined;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'div') { if (depth || (attributes.id === 'file' && attributes.class?.split(/\s+/).includes('fullImageLink'))) depth++; }
      else if (name === 'img' && depth && image === undefined) image = attributes.src;
    },
    onclosetag(name) { if (name === 'div' && depth) depth--; },
  }, { decodeEntities: true });
  parser.end(html); return image;
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
async function downloadCandidate(item: Row, out: string, index: number, deadline: number, options: MediaOptions, signal?: AbortSignal): Promise<Row> {
  const row: Row = { source: 'gemini-google-search', title: item.title ?? '', page_url: item.page_url ?? '', download_attempts: [] }, seen = new Set<string>();
  const get = options.publicGet ?? publicGet;
  const attempt = async (url: unknown): Promise<boolean> => {
    if (typeof url !== 'string' || !url || seen.has(url)) return false;
    seen.add(url); const evidence: Row = { url }; row.download_attempts.push(evidence);
    try {
      const [file, w, h] = await downloadImage(url, out, index, deadline, signal, get);
      Object.assign(row, { url, file: path.basename(file), w, h }); return true;
    } catch (error) { if (signal?.aborted) throw signal.reason; evidence.error = mediaError('download', error, options.env).message; return false; }
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
  } catch (error) { if (signal?.aborted) throw signal.reason; row.error = mediaError('source_page', error, options.env).message; }
  return row;
}
export async function search(query: unknown, count: number | bigint, out: string, options: MediaOptions = {}, signal?: AbortSignal): Promise<[Row[], Row[]]> {
  const queries = queriesOf(query), env = options.env ?? process.env, key = env.GEMINI_API_KEY;
  if (!key) throw valueError('未配置 GEMINI_API_KEY；此检索未执行，改搜索词不能修复配置');
  const body = requestBody(queries, count), started = performance.now(), batch = Array.isArray(query);
  const journal: Row = { model: mediaInstructions.searchModel, endpoint: mediaInstructions.searchEndpoint, request: body }, rows: Row[] = [], errors: Row[] = [];
  const error = (exception: unknown, index?: number) => { const row = mediaError('gemini-google-search', exception, env); if (batch && index !== undefined) row.query_index = index; errors.push(row); };
  try {
    signal?.throwIfAborted();
    const { response, bytes: responseBytes } = await requestBytes(options.fetch ?? fetch, mediaInstructions.searchEndpoint, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: jsonText(body, { compact: true, allowNan: false }), redirect: 'manual' }, 120, signal);
    journal.http_status = response.status;
    const status = () => { if (!response.ok) throw Object.assign(new Error(), { name: 'HTTPStatusError', status: response.status, statusText: response.statusText, retryAfter: response.headers.get('Retry-After') ?? '' }); };
    try { journal.response = parsePythonJsonBytes(responseBytes); } catch { status(); throw valueError('Gemini 成功响应不是 JSON'); }
    status(); journal.request_seconds = Math.round(performance.now() - started) / 1000;
    const candidates = journal.response?.candidates;
    if (!Array.isArray(candidates) || !candidates.length || !candidates[0] || typeof candidates[0] !== 'object' || Array.isArray(candidates[0])) throw valueError('Gemini 未返回候选响应，不是正常零结果');
    const candidate = candidates[0];
    if (candidate.finishReason !== 'STOP') throw valueError(`Gemini 响应未完整结束：${candidate.finishReason ?? 'None'}`);
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts) || parts.some(part => !part || typeof part !== 'object' || Array.isArray(part))) throw valueError('Gemini 响应缺少有效 content.parts');
    if (!parts.some(part => part.toolCall?.toolType === 'GOOGLE_SEARCH_WEB') && !(candidate.groundingMetadata && typeof candidate.groundingMetadata === 'object' && !Array.isArray(candidate.groundingMetadata) && pythonJsonTruthy(candidate.groundingMetadata.webSearchQueries))) throw valueError('Gemini 未返回 Google 搜索执行记录，不能确认这些候选来自实际搜索');
    const texts = parts.filter(part => !pythonJsonTruthy(part.thought)).map(part => Object.hasOwn(part, 'text') ? part.text : '');
    if (texts.some(text => typeof text !== 'string')) throw valueError('Gemini 返回了非字符串 text');
    const payload = parsePythonJson(texts.join('')), groups = payload?.queries;
    if (!Array.isArray(groups)) throw valueError('Gemini 响应缺少 queries 数组，不是正常零结果');
    const byIndex = new Map<number, Row>();
    for (const group of groups) {
      const index = group?.query_index;
      if (!group || typeof group !== 'object' || !isPythonIntegerField(group, 'query_index') || index < 0 || index >= queries.length || byIndex.has(index)) { error(valueError('Gemini 返回无效或重复的 query_index')); continue; }
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
        if (!item || typeof item !== 'object' || Array.isArray(item) || ['title', 'page_url'].some(key => typeof item[key] !== 'string')) { error(valueError('Gemini 图片候选格式错误'), index); continue; }
        const direct = pythonJsonTruthy(item.image_url) ? item.image_url : '';
        if (typeof direct !== 'string') { error(valueError('Gemini image_url 不是字符串'), index); continue; }
        const identity = JSON.stringify([item.page_url, direct]); if (seen.has(identity)) continue;
        seen.add(identity); accepted++;
        const row = await downloadCandidate(item, out, rows.length, deadline, options, signal);
        if (batch) row.query_index = index; rows.push(row);
      }
    }
  } catch (exception) { if (signal?.aborted) throw signal.reason; error(exception); }
  finally {
    journal.seconds = Math.round(performance.now() - started) / 1000; journal.errors = errors;
    await writeFile(path.join(out, 'provider.json'), redact(jsonText(journal, { indent: 2 }), env));
  }
  return [rows, errors];
}
