import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const manifest = '.local/build-cache.json';
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`],
      ),
    )
  )
    .flat()
    .sort();
}
async function fingerprint(paths) {
  const hash = createHash('sha256');
  for (const path of [...paths].sort())
    hash
      .update(path)
      .update('\0')
      .update(await readFile(path))
      .update('\0');
  return hash.digest('hex');
}
async function state() {
  return {
    node: process.version,
    inputs: await fingerprint([
      ...(await files('src')),
      'LICENSE',
      'docs/THIRD-PARTY-NOTICES.txt',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'tsconfig.build.json',
      'scripts/build.mjs',
      'scripts/build-cache.mjs',
    ]),
    output: await fingerprint(await files('dist')),
  };
}
export async function recordBuild() {
  await mkdir('.local', { recursive: true });
  await writeFile(manifest, JSON.stringify(await state(), null, 2));
}
async function ensureBuild() {
  try {
    const previous = JSON.parse(await readFile(manifest, 'utf8'));
    if (JSON.stringify(previous) === JSON.stringify(await state())) {
      console.log('Build reused: source, configuration and compiled output hashes match.');
      return;
    }
  } catch {}
  const code = await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
  if (code !== 0) throw new Error(`Build failed (${code})`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await ensureBuild();
