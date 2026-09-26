import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { developmentSecret } from '../src/server/development-secret.js';

test('standalone signing persists privately across concurrent starts and rejects corruption without rotation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'notale-secret-'));
  try {
    const values = await Promise.all(
      Array.from({ length: 12 }, () => developmentSecret(directory)),
    );
    assert.equal(new Set(values).size, 1);
    assert.match(values[0], /^[a-f0-9]{64}$/);
    assert.equal(await developmentSecret(directory), values[0]);
    assert.equal((await stat(join(directory, 'preview-secret'))).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(directory), ['preview-secret']);
    await writeFile(join(directory, 'preview-secret'), 'corrupt');
    await assert.rejects(developmentSecret(directory), /Invalid local preview signing secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
