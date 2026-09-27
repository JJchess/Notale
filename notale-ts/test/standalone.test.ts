import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runtimeEnvironment } from '../src/core/baseline-pipeline.js';

test('explicit environment file is local, optional, and never mutates the caller', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'notale-env-'));
  try {
    const file = path.join(root, '.env.local');
    writeFileSync(file, 'MODEL_KEY=from-file\nORDERED=${MODEL_KEY}\n');
    const host = { MODEL_KEY: 'from-host' };
    assert.deepEqual(runtimeEnvironment(host, file), { MODEL_KEY: 'from-host', ORDERED: 'from-host' });
    assert.deepEqual(host, { MODEL_KEY: 'from-host' });
    assert.deepEqual(runtimeEnvironment(host, path.join(root, 'missing')), host);
    const disabled = { ...host, NOTALE_DOTENV_DISABLED: 'true' };
    assert.deepEqual(runtimeEnvironment(disabled, file), disabled);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
