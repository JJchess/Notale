import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function values(flag) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) out.push(args[++i]);
  }
  return out;
}

function value(flag, fallback = null) {
  const found = values(flag);
  return found.length ? found.at(-1) : fallback;
}

function parseCase(raw, index) {
  const split = raw.indexOf('::');
  if (split <= 0 || split === raw.length - 2) throw new Error(`--case ${index + 1} 必须是 slug::query`);
  return { slug: raw.slice(0, split), query: raw.slice(split + 2) };
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function appendJsonl(file, record) {
  await writeFile(file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
}

async function runCase({ slug, query }, experimentDir, eventsFile) {
  const runDir = path.join(experimentDir, slug);
  const stdoutFile = path.join(experimentDir, `${slug}.stdout.log`);
  const stderrFile = path.join(experimentDir, `${slug}.stderr.log`);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await appendJsonl(eventsFile, { timestamp: startedAt, event: 'case.start', slug, query, runDir });

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/cli.mjs', 'query-reference', '--query', query, '--out', runDir], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
  });

  await Promise.all([
    writeFile(stdoutFile, result.stdout),
    writeFile(stderrFile, result.stderr),
  ]);
  const record = {
    timestamp: new Date().toISOString(),
    event: 'case.end',
    slug,
    status: result.code === 0 ? 'pass' : 'fail',
    exitCode: result.code,
    durationMs: Math.round(performance.now() - started),
    runDir,
    stdoutFile,
    stderrFile,
  };
  await appendJsonl(eventsFile, record);
  return record;
}

const rawCases = values('--case');
if (rawCases.length < 2) throw new Error('至少提供两个 --case slug::query，实验会并发执行');
const cases = rawCases.map(parseCase);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const experimentDir = path.resolve(value('--out', path.join(root, 'runs', 'query-reference-experiments', stamp)));
const eventsFile = path.join(experimentDir, 'experiment-events.jsonl');
await mkdir(experimentDir, { recursive: true });

const sourceFiles = [
  'src/query-pipeline.mjs',
  'src/content-planner.mjs',
  'src/visual-plan.mjs',
  'src/providers.mjs',
  'src/pipeline.mjs',
  'src/lib/network.mjs',
  'package.json',
  'package-lock.json',
];
const sourceSnapshot = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await sha256File(path.join(root, file))])));
const config = {
  version: '1.0',
  startedAt: new Date().toISOString(),
  boundary: 'query -> planning -> reference-images',
  concurrency: cases.length,
  interventionPolicy: {
    allowedBeforeStart: ['generic pipeline/provider changes', 'automated tests'],
    forbiddenAfterStart: ['per-page edits', 'case-specific prompt changes', 'manual retries with changed code'],
  },
  semanticInputFields: ['query'],
  cases,
  sourceSnapshot,
};
await writeFile(path.join(experimentDir, 'experiment-config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
await appendJsonl(eventsFile, { timestamp: new Date().toISOString(), event: 'experiment.start', caseCount: cases.length });

const results = await Promise.all(cases.map(item => runCase(item, experimentDir, eventsFile)));
const summary = {
  ...config,
  finishedAt: new Date().toISOString(),
  status: results.every(item => item.status === 'pass') ? 'pass' : 'fail',
  results,
};
await writeFile(path.join(experimentDir, 'experiment-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await appendJsonl(eventsFile, { timestamp: summary.finishedAt, event: 'experiment.end', status: summary.status });
process.stdout.write(`${JSON.stringify({ experimentDir, status: summary.status, results }, null, 2)}\n`);
if (summary.status !== 'pass') process.exitCode = 1;
