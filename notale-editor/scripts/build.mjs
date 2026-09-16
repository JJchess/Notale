import { build } from 'esbuild';
import { recordBuild } from './build-cache.mjs';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const runtimeDir=process.env.EDITOR_RUNTIME_DIR??'dist';
await mkdir(runtimeDir, { recursive: true });
const chartEngine=await readFile('node_modules/echarts/dist/echarts.min.js','utf8');
await writeFile(runtimeDir+'/chart-engine.js',`(function(){const previous=window.echarts;${chartEngine}\nwindow.__NOTALE_CHART_ENGINE__=window.echarts;window.echarts=previous||window.echarts;})();`);
await Promise.all([
  build({entryPoints:['src/browser/vector-editor.ts'],outfile:runtimeDir+'/vector-editor.js',bundle:true,format:'iife',globalName:'NotaleVectorEditor',target:'es2022',external:['fs','path']}),
  build({entryPoints:['src/browser/vector-worker.ts'],outfile:runtimeDir+'/vector-worker.js',bundle:true,format:'iife',target:'es2022',external:['fs','path']}),
  build({entryPoints:['src/browser/text-editor.ts'],outfile:runtimeDir+'/text-editor.js',bundle:true,format:'iife',globalName:'NotaleTextEditor',target:'es2022'}),
  build({
    entryPoints: ['src/browser/bridge.ts'],
    outfile: runtimeDir+'/bridge.js',
    bundle: true,
    format: 'iife',
    target: 'es2022',
  }),
  build({
    entryPoints: ['src/browser/workbench.ts'],
    outfile: runtimeDir+'/workbench.js',
    bundle: true,
    format: 'esm',
    target: 'es2022',
  }),
  build({
    entryPoints: ['src/browser/show.ts'],
    outfile: runtimeDir+'/show.js',
    bundle: true,
    format: 'esm',
    target: 'es2022',
  }),
]);
for (const name of ['workbench.html', 'workbench.css', 'show.html'])
  await copyFile('src/browser/' + name, 'dist/' + name);
await copyFile('node_modules/reveal.js/dist/reveal.css', 'dist/reveal.css');
await copyFile('node_modules/pathkit-wasm/bin/pathkit.wasm',runtimeDir+'/pathkit.wasm');

await writeFile(runtimeDir+'/runtime-notices.txt', 'These licenses cover Notale and its third-party runtime code. User-authored slides and assets retain their own ownership and licensing.\n\n'+await readFile('LICENSE','utf8')+'\n\n'+await readFile('docs/THIRD-PARTY-NOTICES.txt','utf8'));
await recordBuild();
