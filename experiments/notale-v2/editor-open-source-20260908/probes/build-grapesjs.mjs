import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const core = resolve(here, '../repos/grapesjs/packages/core');
const pkg = JSON.parse(await readFile(resolve(core, 'package.json'), 'utf8'));
await build({
  entryPoints: [resolve(core, 'src/index.ts')],
  outfile: resolve(here, 'grapesjs-source.js'),
  bundle: true,
  plugins: [{
    name: 'upstream-es5-target',
    setup(builder) {
      builder.onLoad({ filter: /\.ts$/ }, async ({path}) => ({
        contents: ts.transpileModule(await readFile(path, 'utf8'), {
          compilerOptions: {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.ESNext,
            esModuleInterop: true,
          },
          fileName: path,
        }).outputText,
        loader: 'js',
        resolveDir: dirname(path),
      }));
    },
  }],
  format: 'iife',
  globalName: 'GrapesSource',
  platform: 'browser',
  nodePaths: [resolve(here, 'node_modules')],
  define: {
    __GJS_VERSION__: JSON.stringify(pkg.version),
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'warning',
});
console.log(`Built cloned GrapesJS source ${pkg.version}`);
