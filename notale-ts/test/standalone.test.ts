import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runtimeEnvironment } from '../src/core/baseline-pipeline.js';
import { generationScriptFor } from '../src/tools/media-execution.js';

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

test('explicit custom skills use their own ImageGen script', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'notale-skills-'));
  try {
    const script = path.join(root, 'make-illustration/scripts/gen.py');
    mkdirSync(path.dirname(script), { recursive: true });
    writeFileSync(script, 'print("fixture")\n');
    assert.equal(generationScriptFor(), undefined);
    assert.equal(generationScriptFor(root), script);
    assert.throws(() => generationScriptFor(path.join(root, 'missing')), /不是目录/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
