import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const output=process.env.EDITOR_DIST_DIR??'dist';
await mkdir(output, { recursive: true });
const result = await build({
  entryPoints: ['src/workbench.ts'], outfile: output+'/editor.js',
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true,
});
await copyFile('index.html', output+'/index.html');
await copyFile('src/editor.css', output+'/editor.css');
await copyFile('vendor/katex.min.css', output+'/katex.min.css');
await writeFile(output+'/bundle-meta.json', JSON.stringify(result.metafile));
console.log('Independent frontend built: browser-only bundle and static assets.');
