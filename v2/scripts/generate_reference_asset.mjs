import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parateraReferenceProvider } from '../src/providers.mjs';

const [projectDirArg, sourceArg, outputArg, promptProfileArg, styleReferenceArg] = process.argv.slice(2);
if (!projectDirArg || !sourceArg || !outputArg) {
  throw new Error('usage: node scripts/generate_reference_asset.mjs <project-dir> <source-image> <output-image>');
}
const projectDir = path.resolve(projectDirArg);
const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
const result = await parateraReferenceProvider({
  page: { id: 'clean-plate', title: 'clean plate', purpose: 'layer decomposition' },
  design: { canvas: { width: 2560, height: 1440 } },
  ledger: [],
  cwd: projectDir,
  config: {
    envFile: '../../.env',
    apiKeyEnv: 'API_KEY',
    baseUrl: 'https://llmapi.paratera.com/v1',
    model: 'Doubao-Seedream-4.0',
    size: '2560x1440',
    watermark: false,
    timeoutMs: 180000,
    guidanceScale: 10,
    seed: 47101,
    promptProfile: promptProfileArg || 'gorden-clean-plate',
    styleReferences: [
      path.relative(projectDir, source),
      ...(styleReferenceArg ? [path.relative(projectDir, path.resolve(styleReferenceArg))] : []),
    ],
  },
});
await writeFile(output, result.binary);
process.stdout.write(`${output}\n`);
