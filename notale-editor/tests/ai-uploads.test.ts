import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiUploads } from '../src/server/agent/uploads.js';

const mp4 = Buffer.from('0000001c6674797069736f6d0000020069736f6d69736f32', 'hex');
test('an AI attachment is kept by kind: PDF and video by their bytes, DOCX turned into PDF; nothing else', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-uploads-'));
  try {
    const uploads = new AiUploads(root);
    const video = await uploads.save('doc-1', '演示.mp4', mp4);
    assert.deepEqual([video.kind, video.name], ['video', '演示.mp4']);
    const resolved = await uploads.resolve('doc-1', video.id);
    assert.ok(existsSync(resolved.path) && resolved.kind === 'video');
    await assert.rejects(uploads.save('doc-1', 'fake.pdf', mp4), /内容与扩展名不符/);
    await assert.rejects(uploads.save('doc-1', 'photo.gif', mp4), /只能附/);
    await assert.rejects(uploads.save('doc-1', 'empty.pdf', Buffer.alloc(0)), /100 MB/);
    await assert.rejects(uploads.resolve('doc-1', '00000000-0000-0000-0000-000000000000'), /附件不存在/);
    await assert.rejects(uploads.resolve('../x', video.id), /附件不存在/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
