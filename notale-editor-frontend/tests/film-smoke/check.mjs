import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['notale-format/node_modules/typescript/bin/tsc', '-p', 'notale-editor-frontend/tests/film-smoke/tsconfig.json']);
const {build}=await import('esbuild');
await build({entryPoints:[root+'notale-editor-frontend/src/film/overlay-page.ts'],outfile:root+'.local/motale-film/overlay-page.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
await build({entryPoints:[root+'notale-editor-frontend/src/film/workbench.ts'],outfile:root+'.local/motale-film/workbench.js',alias:{'@notale/editor/film':root+'notale-editor/src/film/index.ts','@notale/editor/browser':root+'notale-editor/src/browser-api.ts','@notale/format/film':root+'notale-format/src/film.ts'},bundle:true,format:'esm',platform:'browser',target:'es2022'});
mkdirSync(new URL('../../../.local/motale-film/check', import.meta.url), { recursive: true });
writeFileSync(new URL('../../../.local/motale-film/check/package.json', import.meta.url), '{"type":"module"}\n');
// Resolve the same public subpaths in the isolated emitted tree. These manifests
// are development output only; package-consumer validation uses the actual tarball.
const output = new URL('../../../.local/motale-film/check/', import.meta.url);
mkdirSync(new URL('node_modules/@notale/', output), { recursive: true });
for (const [name, entry] of [['format', './src/film.js'], ['editor', './src/film/index.js']]) {
  writeFileSync(new URL(`notale-${name}/package.json`, output), JSON.stringify({ name: `@notale/${name}`, type: 'module', exports: { './film': entry } }));
  const link = new URL(`node_modules/@notale/${name}`, output);
  if (!existsSync(link)) symlinkSync(`../../notale-${name}`, link, 'dir');
}
const available = readdirSync(new URL('../../../notale-editor/tests/film/', import.meta.url)).filter(name => name.endsWith('.test.ts')).map(name => name.slice(0, -3));
const requested = process.argv.slice(2);
const selected = requested.length ? requested : available;
for (const name of selected) {
  if (!available.includes(name)) throw new Error(`Unknown film test: ${name}`);
  run([`.local/motale-film/check/notale-editor/tests/film/${name}.js`]);
}
