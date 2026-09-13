import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, copyFile, rm } from 'node:fs/promises';
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
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporary], backend, true));
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
