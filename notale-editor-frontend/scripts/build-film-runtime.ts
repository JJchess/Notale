import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const out = resolve(process.env.EDITOR_FILM_PLAYER_DIR ?? '.local/film-runtime');
await mkdir(out, { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/film/player.ts'], outfile: join(out, 'player.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022' }),
  build({ entryPoints: ['src/film/film.css'], outfile: join(out, 'player.css'), bundle: true, platform: 'browser', target: 'es2022' }),
  copyFile('public/film-overlay.html', join(out, 'film-overlay.html')),
]);
const hashes: Record<string, string> = {};
for (const name of ['player.js', 'player.css', 'film-overlay.html']) hashes[name] = createHash('sha256').update(await readFile(join(out, name))).digest('hex');
await writeFile(join(out, 'player-build.json'), JSON.stringify({ version: 1, hashes }, null, 2) + '\n');
console.log('Film runtime ready: ' + out);
