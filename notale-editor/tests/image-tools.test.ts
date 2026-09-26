import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import sharp from 'sharp';
import { mediaCall, mediaAvailability, IMAGE_TOOL_SCHEMAS, type PublicGet } from '../src/server/media/index.js';

const png = () => sharp({ create: { width: 3, height: 2, channels: 3, background: '#c00' } }).png().toBuffer();
const withDir = async (run: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'media-test-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};
const jsonFetch = (body: unknown, calls: string[] = []) => (async (url: string | URL | Request) => {
  calls.push(String(url)); return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

test('schemas keep notale-ts names', () => {
  assert.deepEqual(IMAGE_TOOL_SCHEMAS.map(schema => schema.name), ['ImageSearch', 'ImageGen']);
});

test('ImageSearch downloads a grounded candidate through publicGet', async () => withDir(async dir => {
  const bytes = await png(), gets: string[] = [];
  const grounded = { candidates: [{ finishReason: 'STOP', groundingMetadata: { webSearchQueries: ['cat'] }, content: { parts: [{ text: JSON.stringify({ queries: [{ query_index: 0, results: [
    { title: 'Red cat', page_url: 'https://example.org/cat', image_url: 'https://example.org/cat.png' }] }] }) }] } }] };
  const publicGet: PublicGet = async url => {
    gets.push(url);
    return Object.assign(Readable.from([bytes]), { statusCode: 200, statusMessage: 'OK', headers: { 'content-type': 'image/png' } }) as unknown as IncomingMessage;
  };
  const result = await mediaCall('ImageSearch', { query: 'red cat photo' }, dir, { env: { GEMINI_API_KEY: 'test-key' }, fetch: jsonFetch(grounded), publicGet });
  assert.deepEqual(gets, ['https://example.org/cat.png']);
  assert.equal(result.images.length, 1);
  const image = result.images[0]!;
  assert.equal(image.mime, 'image/png'); assert.equal(image.w, 3); assert.equal(image.h, 2);
  assert.ok(image.bytes.equals(bytes)); assert.equal(image.path, '00.png');
  assert.equal(image.title, 'Red cat'); assert.equal(image.page_url, 'https://example.org/cat'); assert.equal(image.source, 'gemini-google-search');
  const text = JSON.parse(result.text);
  assert.deepEqual(text.errors, []);
  assert.equal(text.results[0].path, '00.png'); assert.equal(text.results[0].url, 'https://example.org/cat.png');
}));

test('ImageSearch without GEMINI_API_KEY is unavailable and reports why', async () => withDir(async dir => {
  assert.equal(mediaAvailability({}).imageSearch.available, false);
  assert.match(mediaAvailability({}).imageSearch.reason, /GEMINI_API_KEY/);
  let fetched = false;
  const result = await mediaCall('ImageSearch', { query: 'x' }, dir, { env: {}, fetch: (async () => { fetched = true; throw new Error('no'); }) as typeof fetch });
  assert.equal(fetched, false);
  assert.deepEqual(result.images, []);
  assert.match(JSON.parse(result.text).errors[0].message, /未配置 GEMINI_API_KEY/);
}));

test('ImageGen provider URL on a private address is rejected by the SSRF guard', async () => withDir(async dir => {
  const calls: string[] = [];
  await assert.rejects(mediaCall('ImageGen', { prompt: 'a cat' }, dir, { env: { PARATERA_API_KEY: 'k' }, fetch: jsonFetch({ data: [{ url: 'http://127.0.0.1/x.png' }] }, calls) }), /非公网地址/);
  assert.deepEqual(calls, ['https://llmapi.paratera.com/v1/images/generations']);
}));

test('ImageGen b64_json decodes into one validated image', async () => withDir(async dir => {
  const bytes = await png();
  const result = await mediaCall('ImageGen', { prompt: 'a cat' }, dir, { env: { PARATERA_API_KEY: 'k' }, fetch: jsonFetch({ data: [{ b64_json: bytes.toString('base64') }] }) });
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]!.mime, 'image/png'); assert.equal(result.images[0]!.w, 3); assert.equal(result.images[0]!.prompt, 'a cat');
  assert.deepEqual(JSON.parse(result.text), [{ path: 'image-1.png', prompt: 'a cat', model: 'Doubao-Seedream-4.0', size: '2048x1152' }]);
}));

test('ImageGen rejects n above 4 before any request', async () => withDir(async dir => {
  const calls: string[] = [];
  await assert.rejects(mediaCall('ImageGen', { prompt: 'a cat', n: 5 }, dir, { env: { PARATERA_API_KEY: 'k' }, fetch: jsonFetch({}, calls) }), /n 不能超过 4/);
  assert.deepEqual(calls, []);
}));
