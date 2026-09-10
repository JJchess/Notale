import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Pool, type PoolClient } from 'pg';
import { Store } from '../src/server/store.js';
import { createApps, type AppOptions } from '../src/server/app.js';
import { commitSchema } from '../src/domain/model.js';

const sourceUrl = new URL(
  process.env.RESTORE_SOURCE_URL ??
    'postgres://notale_editor:local-editor-development@127.0.0.1:55439/notale_editor',
);
const container = process.env.RESTORE_PG_CONTAINER ?? 'notale-editor-postgres-1';
const sourceContext = {
  scope: process.env.RESTORE_SCOPE ?? 'local-workspace',
  actor: 'restore-drill',
};
const token = randomUUID().replaceAll('-', '');
const database = `editor_restore_${token}`;
const directory = `.local/restore-${token}`;
const archive = `${directory}/database.dump`;
const ctx = { scope: `restore-${token}`, actor: 'restore-drill' };
const probeId = randomUUID(),
  probePath = 'restore-probe.txt';
const source = new Pool({ connectionString: sourceUrl.href });
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const admin = new Pool({ connectionString: adminUrl.href });
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${database}`;
const target = new Pool({ connectionString: targetUrl.href });
const sourceStore = new Store(source),
  restored = new Store(target);
const uploaded: string[] = [];
let createdProbe = false;
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => abort.abort());
let createdDatabase = false,
  snapshot: PoolClient | undefined;
let apps: ReturnType<typeof createApps> | undefined;
const report: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  database,
  archive,
  status: 'running',
};
const pgEnv = {
  ...process.env,
  PGUSER: decodeURIComponent(sourceUrl.username),
  PGPASSWORD: decodeURIComponent(sourceUrl.password),
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
};
const docker = [
  'exec',
  '--env',
  'PGUSER',
  '--env',
  'PGPASSWORD',
  '--env',
  'PGHOST',
  '--env',
  'PGPORT',
  container,
];
// Use argument arrays and inherited secret environment, never shell interpolation.
async function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; output?: string; input?: string } = {},
) {
  const child = spawn(command, args, {
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: abort.signal,
  });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let stdout = '',
    stderr = '';
  const completed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} exited ${code}${options.output ? `; see ${options.output}` : ''}: ${stderr.slice(-3000)}`,
            ),
          ),
    );
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-10000);
  });
  const output = options.output
    ? pipeline(child.stdout, createWriteStream(options.output, { flags: 'wx', mode: 0o600 }))
    : Promise.resolve();
  if (!options.output)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-10000);
    });
  const input = options.input
    ? pipeline(createReadStream(options.input), child.stdin)
    : (child.stdin.end(), Promise.resolve());
  try {
    await Promise.all([completed, output, input]);
  } catch (error) {
    child.kill('SIGTERM');
    await closed;
    throw error;
  }
  if (stderr.trim()) console.log(`${command} diagnostics: ${stderr.trim()}`);
  return stdout.trim();
}
const tables: Record<string, string> = {
  editor_documents: 'id',
  editor_revisions: 'document_id,version',
  editor_mutations: 'document_id,mutation_id',
  editor_revision_assets: 'document_id,version,path',
  editor_uploads: 'scope,hash',
  editor_blobs: 'hash',
  editor_preview_leases: 'token_hash',
};
async function audit(client: PoolClient) {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const result: Record<string, unknown> = {};
  for (const [table, order] of Object.entries(tables)) {
    const from =
      table === 'editor_blobs' ? '(SELECT hash,size,created_at FROM editor_blobs)' : table;
    const row = await client.query(`SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY ${order}),''),'UTF8')),'hex') AS digest FROM ${from} t`);
    result[table] = row.rows[0];
  }
  const blobs = await client.query(
    "SELECT count(*)::int AS count, coalesce(sum(size),0)::text AS bytes, count(*) FILTER (WHERE size<>octet_length(data) OR hash<>encode(sha256(data),'hex'))::int AS invalid FROM editor_blobs",
  );
  assert.equal(blobs.rows[0].invalid, 0, 'Blob bytes/hash/size mismatch');
  result.blobs = blobs.rows[0];
  return result;
}
async function cleanupSource() {
  // Only this invocation's generated identity/scope and its two unique probe
  // blobs can be removed; original documents and shared assets are untouched.
  await sourceStore.transaction(async (c) => {
    if (createdProbe)
      for (const table of ['editor_mutations', 'editor_revision_assets', 'editor_revisions'])
        await c.query(`DELETE FROM ${table} WHERE document_id=$1`, [probeId]);
    if (createdProbe)
      await c.query('DELETE FROM editor_documents WHERE id=$1 AND scope=$2', [probeId, ctx.scope]);
    await c.query('DELETE FROM editor_uploads WHERE scope=$1', [ctx.scope]);
    await c.query(
      'DELETE FROM editor_blobs b WHERE hash=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM editor_revision_assets a WHERE a.hash=b.hash) AND NOT EXISTS(SELECT 1 FROM editor_uploads u WHERE u.hash=b.hash)',
      [uploaded],
    );
  });
}
await mkdir(directory, { recursive: true, mode: 0o700 });
console.log(`Restore evidence: ${directory}`);
try {
  // Prove docker tools address the same cluster as the application connection.
  const cluster = String(
    (await source.query('SELECT system_identifier FROM pg_control_system()')).rows[0]
      .system_identifier,
  );
  const toolCluster = await run(
    'docker',
    [
      ...docker,
      'psql',
      '-XAt',
      '--dbname',
      decodeURIComponent(sourceUrl.pathname.slice(1)),
      '--command',
      'SELECT system_identifier FROM pg_control_system()',
    ],
    { env: pgEnv },
  );
  assert.equal(toolCluster, cluster, 'Container/source database cluster mismatch');
  const fixtures = await sourceStore.list(sourceContext);
  const fixtureId =
    process.env.RESTORE_DOCUMENT_ID ??
    fixtures.find((d) => d.title === '集成学习 · 完整资源讲义')?.id;
  assert.ok(fixtureId, 'Import a real complete lecture first');
  const fixture = await sourceStore.get(sourceContext, fixtureId);
  assert.ok(
    fixture.document.slides.length >= 2 && Object.keys(fixture.document.assets).length,
    'A resource-backed multi-page fixture is required',
  );
  report.fixture = {
    id: fixtureId,
    version: fixture.version,
    slides: fixture.document.slides.length,
    paths: Object.keys(fixture.document.assets).length,
  };
  await source.query(
    'INSERT INTO editor_uploads(scope,hash) SELECT DISTINCT $1,hash FROM editor_revision_assets WHERE document_id=$2 AND version=$3 ON CONFLICT DO NOTHING',
    [ctx.scope, fixtureId, fixture.version],
  );
  const oldBytes = Buffer.from(`before backup ${token}`),
    newBytes = Buffer.from(`historical replacement ${token}`);
  const oldAsset = await sourceStore.upload(ctx, { data: oldBytes, mime: 'text/plain' });
  uploaded.push(oldAsset.hash);
  const newAsset = await sourceStore.upload(ctx, { data: newBytes, mime: 'text/plain' });
  uploaded.push(newAsset.hash);
  const document = structuredClone(fixture.document);
  document.id = probeId;
  document.title = 'Restore drill original';
  document.assets[probePath] = oldAsset;
  const first = await sourceStore.create(ctx, document);
  createdProbe = true;
  const editRequest = commitSchema.parse({
    baseVersion: 1,
    mutationId: randomUUID(),
    commands: [
      { type: 'deck.update', title: 'Restore drill historical edit' },
      { type: 'asset.put', path: probePath, asset: newAsset },
    ],
  });
  const second = await sourceStore.commit(ctx, probeId, editRequest);
  const restoreMutation = randomUUID();
  const third = await sourceStore.restore(ctx, probeId, 1, 2, restoreMutation);
  const leaseHash = createHash('sha256').update(`restore-lease-${token}`).digest('hex');
  const leaseExpiry = await sourceStore.renewPreview(ctx, probeId, 3, leaseHash);
  snapshot = await source.connect();
  await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshotId = (await snapshot.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const expected = await audit(snapshot);
  report.expected = expected;
  // This later write must survive in the source but be absent from the backup.
  const later = await sourceStore.commit(
    ctx,
    probeId,
    commitSchema.parse({
      baseVersion: 3,
      mutationId: randomUUID(),
      commands: [{ type: 'deck.update', title: 'After backup snapshot' }],
    }),
  );
  assert.equal(later.version, 4);
  console.log('Consistent snapshot pinned; source advanced to v4 while backup captures v3.');
  await run(
    'docker',
    [
      ...docker,
      'pg_dump',
      '--format=custom',
      `--snapshot=${snapshotId}`,
      '--dbname',
      decodeURIComponent(sourceUrl.pathname.slice(1)),
    ],
    { env: pgEnv, output: `${archive}.partial` },
  );
  await snapshot.query('COMMIT');
  snapshot.release();
  snapshot = undefined;
  await rename(`${archive}.partial`, archive);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  report.backup = { bytes: (await stat(archive)).size, sha256: hash.digest('hex') };
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  createdDatabase = true;
  // A broken transfer must fail without leaving a partially restored schema.
  const truncated = `${directory}/truncated.dump`;
  await pipeline(
    createReadStream(archive, { end: Math.floor((await stat(archive)).size / 2) }),
    createWriteStream(truncated, { flags: 'wx', mode: 0o600 }),
  );
  let rejected = false;
  try {
    await run(
      'docker',
      [
        ...docker.slice(0, 1),
        '-i',
        ...docker.slice(1),
        'pg_restore',
        '--verbose',
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        '--dbname',
        database,
      ],
      { env: pgEnv, input: truncated },
    );
  } catch (error) {
    rejected = true;
    report.truncatedArchiveError = error instanceof Error ? error.message : String(error);
  }
  assert.equal(rejected, true, 'Truncated archive was unexpectedly accepted');
  assert.equal(
    Number(
      (await target.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0]
        .count,
    ),
    0,
  );
  report.failedRestore = { truncatedArchiveRejected: true, noPartialTables: true };
  console.log('Truncated archive rejected; failed restore left no partial tables.');
  await run(
    'docker',
    [
      ...docker.slice(0, 1),
      '-i',
      ...docker.slice(1),
      'pg_restore',
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      '--dbname',
      database,
    ],
    { env: pgEnv, input: archive },
  );
  const verified = await target.connect();
  try {
    await verified.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actual = await audit(verified);
    assert.deepEqual(actual, expected);
    report.restored = actual;
    await verified.query('COMMIT');
  } finally {
    verified.release();
  }
  console.log('All seven editor tables and every stored blob match the pinned source snapshot.');
  for (const state of [first, second, third])
    assert.deepEqual(await restored.get(ctx, probeId, state.version), state);
  assert.equal((await restored.get(ctx, probeId)).version, 3);
  assert.deepEqual((await restored.asset(ctx, probeId, 1, probePath)).data, oldBytes);
  assert.deepEqual((await restored.asset(ctx, probeId, 2, probePath)).data, newBytes);
  assert.deepEqual((await restored.asset(ctx, probeId, 3, probePath)).data, oldBytes);
  assert.equal((await restored.commit(ctx, probeId, editRequest)).version, 2);
  assert.equal((await restored.restore(ctx, probeId, 1, 2, restoreMutation)).version, 3);
  assert.equal((await restored.get(ctx, probeId)).version, 3);
  await assert.rejects(restored.commit({ ...ctx, actor: 'other' }, probeId, editRequest), {
    code: 'IDEMPOTENCY_MISMATCH',
  });
  assert.equal((await sourceStore.get(ctx, probeId)).version, 4);
  assert.deepEqual(await restored.get(sourceContext, fixtureId, fixture.version), fixture);
  const restoredLease = await target.query(
    'SELECT expires_at FROM editor_preview_leases WHERE token_hash=$1',
    [leaseHash],
  );
  assert.equal(restoredLease.rows[0].expires_at.getTime(), leaseExpiry);
  report.history = {
    previewLeaseRestored: true,
    versions: 3,
    sourceLaterVersion: 4,
    historicalAssetBytes: true,
    commitReplay: true,
    restoreReplay: true,
    actorMismatchRejected: true,
  };
  const options: AppOptions = {
    store: restored,
    secret: randomUUID() + randomUUID(),
    contentOrigin: '',
    integration: { context: async () => sourceContext, authorize: async () => true },
  };
  apps = createApps(options);
  options.contentOrigin = await apps.content.listen({ host: '127.0.0.1', port: 0 });
  const origin = await apps.api.listen({ host: '127.0.0.1', port: 0 });
  console.log(
    'Restored service is running on isolated ephemeral ports; starting browser validation.',
  );
  const env = {
    ...process.env,
    EDITOR_URL: origin,
    TEST_DATABASE_URL: targetUrl.href,
    BROWSER_RESULTS_PATH: `${directory}/browser-results.json`,
    BROWSER_OUTPUT_DIR: `${directory}/browser-artifacts`,
    SLIDES_AUDIT_PATH: `${directory}/slides-audit.json`,
  };
  await run(process.execPath, ['--import', 'tsx', 'scripts/verify-slides.ts', fixtureId], {
    env,
    output: `${directory}/slides.log`,
  });
  await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    env,
    output: `${directory}/browser.log`,
  });
  const browserResults = JSON.parse(await readFile(`${directory}/browser-results.json`, 'utf8'));
  assert.ok(browserResults.stats.expected > 0);
  for (const key of ['skipped', 'unexpected', 'flaky']) assert.equal(browserResults.stats[key], 0);
  const slideResults = JSON.parse(await readFile(`${directory}/slides-audit.json`, 'utf8'));
  assert.equal(slideResults.results.length, fixture.document.slides.length);
  assert.ok(
    slideResults.results.every((r: any) => !r.error && !r.errors.length && !r.missing.length),
  );
  report.browser = browserResults.stats;
  report.slideAudit = { pages: slideResults.results.length, errors: 0, missing: 0 };
  assert.equal((await sourceStore.get(ctx, probeId)).version, 4);
  assert.deepEqual(await sourceStore.get(sourceContext, fixtureId, fixture.version), fixture);
  report.status = 'passed';
  console.log(
    'Restored real-slide audit, full browser suite, revision/assets and idempotency checks passed.',
  );
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  const cleanupErrors: string[] = [];
  const finish = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      cleanupErrors.push(`${label}: ${String(error)}`);
    }
  };
  await finish('snapshot', async () => {
    if (snapshot) {
      try {
        await snapshot.query('ROLLBACK');
      } finally {
        snapshot.release();
      }
    }
  });
  if (apps) {
    await finish('api', () => apps!.api.close());
    await finish('content', () => apps!.content.close());
  }
  await finish('target pool', () => target.end());
  await finish('temporary database', async () => {
    if (createdDatabase) {
      await admin.query(`DROP DATABASE "${database}"`);
      report.databaseRemoved = true;
    }
  });
  await finish('source probe', async () => {
    await cleanupSource();
    report.sourceProbeRemoved = true;
  });
  await finish('source pool', () => source.end());
  await finish('admin pool', () => admin.end());
  if (cleanupErrors.length) {
    report.cleanupErrors = cleanupErrors;
    report.status = 'failed';
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(`Final report: ${directory}/report.json (${report.status})`);
}
