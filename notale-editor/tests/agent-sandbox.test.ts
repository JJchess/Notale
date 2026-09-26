import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSandbox, SANDBOX_IMAGE } from '../src/server/agent/sandbox.js';

// Needs docker and the images from sandbox/README.md; skipped where they are not there.
const ready = (() => { try { execFileSync('docker', ['image', 'inspect', SANDBOX_IMAGE], { stdio: 'ignore' }); return true; } catch { return false; } })();
async function withBox(work: (box: Awaited<ReturnType<typeof openSandbox>>, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'notale-box-'));
  const box = await openSandbox(dir);
  try { await work(box, dir); } finally { await box.close(); await rm(dir, { recursive: true, force: true }); }
}
const out = async (box: Awaited<ReturnType<typeof openSandbox>>, cwd: string, command: string, timeout?: number) => {
  let text = '';
  const result = await box.exec(command, cwd, { onData: data => { text += data.toString(); }, ...(timeout ? { timeout } : {}) });
  return { text, code: result.exitCode };
};

test('commands run in the workspace and what they write is ours on the host', { skip: !ready }, () => withBox(async (box, dir) => {
  await mkdir(join(dir, 'pages'));
  const { text, code } = await out(box, join(dir, 'pages'), 'pwd && echo hi > note.txt');
  assert.equal(code, 0);
  assert.match(text, /\/workspace\/pages/);
  assert.equal(await readFile(join(dir, 'pages/note.txt'), 'utf8'), 'hi\n');
}));
test('the sandbox holds no credentials and reaches only allowlisted hosts', { skip: !ready }, () => withBox(async (box, dir) => {
  assert.equal((await out(box, dir, 'env | grep -ciE "gemini|paratera|api_key" || true')).text.trim(), '0');
  assert.match((await out(box, dir, 'curl -s -o /dev/null -w "%{http_code}" --max-time 20 https://registry.npmjs.org/left-pad')).text, /200/);
  assert.doesNotMatch((await out(box, dir, 'curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://example.com')).text, /200/);
}));
test('a command past its timeout is killed, children included', { skip: !ready }, () => withBox(async (box, dir) => {
  const started = Date.now();
  const { code } = await out(box, dir, 'sleep 30 & sleep 30', 2);
  assert.equal(code, null, 'a timeout reads as no exit code');
  assert.ok(Date.now() - started < 15_000);
  assert.equal((await out(box, dir, 'ps -eo args | grep -c "^sleep 30$" || true')).text.trim(), '0');
}));
