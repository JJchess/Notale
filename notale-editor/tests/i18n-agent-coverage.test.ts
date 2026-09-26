import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeMessage } from '../src/i18n/index.js';

/** What the agent reports to the author -- step labels, their chips and details, a turn's closing note -- is
 * fixed text with holes, so the English UI can show it only if the catalog has the template. */
test('every step label, detail and note the agent emits has a catalog template', () => {
  const source = readFileSync(new URL('../src/server/agent/run.ts', import.meta.url), 'utf8');
  const strings = [...source.matchAll(/(?:label: |detail: \[|chip: |stopped = |note = |fatal = )(['`])((?:\\.|(?!\1).)*?)\1/g)].map(match => match[2]!);
  // The model-call step is named by a helper: '请求模型', then '请求模型（第 N 轮）'.
  const call = /const label = \(\) => turn <= 1 \? '([^']+)' : `([^`]+)`/.exec(source)!;
  strings.push(call[1]!, call[2]!);
  // Tool steps are `${verb} ${target}`, or the bare verb when the call has no path or command.
  const verbs = /const verb = \(\{([^}]*)\}/.exec(source)![1]!.matchAll(/'([^']+)'/g);
  for (const [, verb] of verbs) strings.push(verb!, `${verb} \${target}`);
  assert.ok(strings.length > 10, 'the scan found the strings');
  const missing = strings.filter(text => /[一-鿿]/.test(text) && !describeMessage(text.replace(/\$\{[^}]*\}/g, 'x')));
  assert.deepEqual(missing, []);
});
