// The same cases run against both copies of Istar's pi fork (notale-ts and notale-editor); only the
// import prefix differs (tools/check-istar-sync.mjs compares them with it normalised).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffBytes } from '../src/server/agent/pi/tools/media-sniff.js';
import { GeminiFiles, type FilesClient } from '../src/server/agent/pi/ai/gemini-files.js';
import { convertMessages } from '../src/server/agent/pi/ai/google.js';
import { pageRange, readMedia } from '../src/server/agent/pi/tools/media-read.js';
import type { FileContent, Message, Model } from '../src/server/agent/pi/ai/types.js';

const bytes = (text: string, pad = 0) => new Uint8Array([...Buffer.from(text, 'latin1'), ...new Array(pad).fill(32)]);
const model = (input: Model<'google-generative-ai'>['input']) => ({ id: 'gemini-3.8-flash', name: 'g', api: 'google-generative-ai', provider: 'google', baseUrl: '', reasoning: true, input, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1e6, maxTokens: 1000 }) as Model<'google-generative-ai'>;
async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'istar-media-'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:d=1.2', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:d=1.2', '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', join(dir, 'clip.mp4')]);
  // A text PDF, made by LibreOffice.
  await writeFile(join(dir, 'doc.txt'), 'Page one heading\nbody\n');
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, join(dir, 'doc.txt')], { stdio: 'ignore', timeout: 120_000 });
  return { dir, done: () => rm(dir, { recursive: true, force: true }) };
}
/** A Files API that remembers what it was asked; `fail` makes uploads throw. */
function fakeFiles(options: { fail?: boolean; processing?: number } = {}) {
  const uploads: string[] = [];
  let polls = options.processing ?? 0;
  const client: FilesClient = {
    async upload({ file }) { if (options.fail) throw new Error('quota'); uploads.push(file); return { name: 'files/x', uri: `https://gemini/files/${uploads.length}`, state: polls ? 'PROCESSING' : 'ACTIVE', expirationTime: new Date(Date.now() + 48 * 3600e3).toISOString() }; },
    async get() { polls--; return { name: 'files/x', uri: `https://gemini/files/${uploads.length}`, state: polls > 0 ? 'PROCESSING' : 'ACTIVE', expirationTime: new Date(Date.now() + 48 * 3600e3).toISOString() }; },
  };
  return { client, uploads };
}

test('file kinds come from the bytes: PDF, MP4, QuickTime, WebM; HEIF, Matroska and NUL-bearing files are binary; source is text', () => {
  assert.deepEqual(sniffBytes(bytes('%PDF-1.7')), { kind: 'pdf', mimeType: 'application/pdf' });
  assert.deepEqual(sniffBytes(bytes('\0\0\0\x20ftypisom', 8)), { kind: 'video', mimeType: 'video/mp4' });
  assert.deepEqual(sniffBytes(bytes('\0\0\0\x14ftypqt  ', 8)), { kind: 'video', mimeType: 'video/quicktime' });
  assert.deepEqual(sniffBytes(bytes('\0\0\0\x18ftypheic', 8)), { kind: 'binary' });
  assert.deepEqual(sniffBytes(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from('webm')])), { kind: 'video', mimeType: 'video/webm' });
  assert.deepEqual(sniffBytes(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from('matroska')])), { kind: 'binary' });
  assert.deepEqual(sniffBytes(bytes('export const a = 1;\n')), { kind: 'text' });
  assert.deepEqual(sniffBytes(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])), { kind: 'binary' });
});

test('page ranges: default first 10, "3-5", at most 20, and nothing outside the document', () => {
  assert.deepEqual(pageRange(undefined, 30), { first: 1, last: 10 });
  assert.deepEqual(pageRange('3-5', 30), { first: 3, last: 5 });
  assert.deepEqual(pageRange('7', 30), { first: 7, last: 7 });
  assert.throws(() => pageRange('1-21', 30), /at most 20/);
  assert.throws(() => pageRange('31', 30), /outside/);
});

test('uploads are cached by content, renewed when stale, and a vanished file becomes a note', async () => {
  const { dir, done } = await workspace();
  try {
    let now = Date.now();
    const { client, uploads } = fakeFiles({ processing: 2 });
    const files = new GeminiFiles({ client, cacheFile: join(dir, 'cache.json'), now: () => now });
    const part: FileContent = { type: 'file', mimeType: 'video/mp4', path: join(dir, 'clip.mp4'), bytes: 1 };
    await files.prepare(part);
    assert.equal(uploads.length, 1);
    assert.match(part.uri!, /files\/1$/);
    // The same bytes under another name: the cache answers.
    await copyFile(join(dir, 'clip.mp4'), join(dir, 'again.mp4'));
    const again: FileContent = { type: 'file', mimeType: 'video/mp4', path: join(dir, 'again.mp4'), bytes: 1 };
    await new GeminiFiles({ client, cacheFile: join(dir, 'cache.json'), now: () => now }).prepare(again);
    assert.equal(uploads.length, 1);
    // 47.5 hours on, the reference is about to go: uploaded again.
    now += 47.5 * 3600e3;
    const map = await files.parts([{ role: 'toolResult', toolCallId: 'c', toolName: 'read', isError: false, timestamp: 0, content: [part] } as Message]);
    assert.equal(uploads.length, 2);
    assert.deepEqual(map.get(part), { fileData: { fileUri: part.uri, mimeType: 'video/mp4' } });
    const gone: FileContent = { ...part, path: join(dir, 'missing.mp4') };
    const notes = await files.parts([{ role: 'user', timestamp: 0, content: [gone] } as Message]);
    assert.match(String(notes.get(gone)?.text), /could not be sent/);
  } finally { await done(); }
});

test('in a tool result, inline data nests in the function response and uploaded files follow it', () => {
  const pdf: FileContent = { type: 'file', mimeType: 'application/pdf', path: '/a.pdf', bytes: 10 };
  const video: FileContent = { type: 'file', mimeType: 'video/mp4', path: '/v.mp4', bytes: 10, uri: 'https://gemini/files/1' };
  const media = new Map<FileContent, object>([[pdf, { inlineData: { mimeType: 'application/pdf', data: 'QQ==' } }], [video, { fileData: { fileUri: video.uri, mimeType: 'video/mp4' } }]]);
  const context = { messages: [
    { role: 'user', content: 'look', timestamp: 0 },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: { path: 'v.mp4' } }], api: 'google-generative-ai', provider: 'google', model: 'gemini-3.8-flash', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: 0 },
    { role: 'toolResult', toolCallId: 'c1', toolName: 'read', isError: false, timestamp: 0, content: [{ type: 'text', text: 'Read video' }, pdf, video] },
  ] } as never;
  const contents = convertMessages(model(['text', 'image', 'pdf', 'video']), context, media as never);
  const last = contents.at(-1)!;
  assert.equal(last.parts![0]!.functionResponse!.parts!.length, 1);
  assert.ok(last.parts![0]!.functionResponse!.parts![0]!.inlineData);
  assert.deepEqual(last.parts![1], { fileData: { fileUri: 'https://gemini/files/1', mimeType: 'video/mp4' } });
  // A model that reads neither gets notes, not the files.
  const text = convertMessages(model(['text']), context, media as never).at(-1)!;
  assert.ok(!text.parts!.some(part => part.fileData || part.functionResponse?.parts?.length));
});

test('read gives a video natively when it can, keyframes when the model only sees images or the upload fails, facts otherwise', async () => {
  const { dir, done } = await workspace();
  try {
    const scratch = join(dir, '.derived');
    await mkdir(scratch, { recursive: true });
    const clip = join(dir, 'clip.mp4');
    const native = await readMedia(clip, 'clip.mp4', undefined, model(['text', 'image', 'pdf', 'video']), { uploader: new GeminiFiles({ client: fakeFiles().client }), scratch });
    assert.ok(native!.some(block => block.type === 'file' && block.uri));
    assert.ok(native!.some(block => block.type === 'text' && block.text === '<video path="clip.mp4">'));
    const framed = await readMedia(clip, 'clip.mp4', undefined, model(['text', 'image']), { scratch });
    const frames = framed!.filter(block => block.type === 'image');
    assert.ok(frames.length >= 2, `frames: ${frames.length}`);
    assert.ok(framed!.some(block => block.type === 'text' && /^t=\d/.test(block.text)));
    const failed = await readMedia(clip, 'clip.mp4', undefined, model(['text', 'image', 'video']), { uploader: new GeminiFiles({ client: fakeFiles({ fail: true }).client }), scratch });
    assert.ok(failed!.some(block => block.type === 'image'));
    assert.match((failed![0] as { text: string }).text, /Could not send the video itself \(quota\)/);
    const blind = await readMedia(clip, 'clip.mp4', undefined, model(['text']), { scratch });
    assert.equal(blind!.length, 1);
    assert.match((blind![0] as { text: string }).text, /cannot watch video/);
  } finally { await done(); }
});

test('read gives a PDF natively, or its text and page images; other binaries point to bash; text stays text', async () => {
  const { dir, done } = await workspace();
  try {
    const scratch = join(dir, '.derived');
    await mkdir(scratch, { recursive: true });
    const pdf = join(dir, 'doc.pdf');
    const native = await readMedia(pdf, 'doc.pdf', undefined, model(['text', 'image', 'pdf', 'video']), { uploader: new GeminiFiles({ client: fakeFiles().client }), scratch });
    assert.ok(native!.some(block => block.type === 'file' && block.mimeType === 'application/pdf'));
    const asText = await readMedia(pdf, 'doc.pdf', undefined, model(['text', 'image']), { scratch });
    assert.ok(asText!.some(block => block.type === 'text' && /Page one heading/.test(block.text)));
    assert.ok(asText!.some(block => block.type === 'image'));
    await writeFile(join(dir, 'blob.bin'), Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 1]));
    assert.match(((await readMedia(join(dir, 'blob.bin'), 'blob.bin', undefined, model(['text']), { scratch }))![0] as { text: string }).text, /binary file/);
    assert.equal(await readMedia(join(dir, 'doc.txt'), 'doc.txt', undefined, model(['text']), { scratch }), undefined);
  } finally { await done(); }
});
