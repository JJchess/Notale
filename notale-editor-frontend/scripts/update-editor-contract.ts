import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, copyFile, rm } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const frontend = process.cwd();
const backend = resolve(frontend, '../notale-editor');
function run(command: string, args: string[], cwd: string, capture = false): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed (${result.status ?? result.signal})`);
  return result.stdout ?? '';
}
const metadata = JSON.parse(await readFile(resolve(backend, 'package.json'), 'utf8'));
if (metadata.name !== '@notale/editor') throw Error('Expected sibling @notale/editor backend');
// The backend cache checks source, configuration and output hashes before reuse.
run(process.execPath, ['scripts/build-cache.mjs'], backend);
await mkdir(resolve(frontend, '.local'), { recursive: true });
await mkdir(resolve(frontend, 'vendor'), { recursive: true });
const temporary = await mkdtemp(resolve(frontend, '.local/contract-pack-'));
try {
  // npm follows the development symlink to ../notale-format and can pack its
  // node_modules as traversal entries. Pack a regular-file copy instead.
  const packageDir = resolve(temporary, 'package');
  for (const name of ['package.json', 'README.md', 'LICENSE', 'compose.yaml', 'dist', 'docs']) {
    await cp(resolve(backend, name), resolve(packageDir, name), { recursive: true });
  }
  const formatDir = resolve(backend, '../notale-format');
  for (const name of ['package.json', 'README.md', 'LICENSE', 'dist', 'src']) {
    await cp(resolve(formatDir, name), resolve(packageDir, 'node_modules/@notale/format', name), { recursive: true });
  }
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], packageDir, true));
  const entries = packed[0]?.files?.map((file: { path: string }) => file.path) as string[] | undefined;
  if (!entries?.length || entries.some(name => name.split('/').includes('..') || name.startsWith('/') || name.startsWith('node_modules/') && !name.startsWith('node_modules/@notale/format/'))) {
    throw Error('Editor archive contains an unsafe or unexpected path');
  }
  const filename = packed[0]?.filename;
  if (typeof filename !== 'string' || basename(filename) !== filename) throw Error('Invalid npm package filename');
  const archive = resolve(temporary, filename);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex').slice(0, 16);
  const destination = `vendor/notale-editor-${metadata.version}-${digest}.tgz`;
  await copyFile(archive, resolve(frontend, destination));
  run('npm', ['install', '--save-exact', '--no-audit', '--no-fund', `file:${destination}`], frontend);
  console.log(`Editor contract updated: ${destination}. Build and validate the frontend before publishing.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
