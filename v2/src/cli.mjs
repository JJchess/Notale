#!/usr/bin/env node
import path from 'node:path';
import { validateContentPack } from './contracts.mjs';
import { parseArgs, readJson, requireFlag } from './lib/io.mjs';
import { buildPipeline, verifyRun } from './pipeline.mjs';
import { buildNativeHtmlFromReferenceRun } from './native-pipeline.mjs';
import { buildQueryNativeHtmlPipeline, buildQueryReferencePipeline } from './query-pipeline.mjs';

function help() {
  process.stdout.write(`Workflow V2

用法:
  node src/cli.mjs build --project <project.json> --out <run-dir>
  node src/cli.mjs query-reference --query <course-topic-and-requirements> --out <run-dir>
  node src/cli.mjs reference-html --run <reference-run> --out <run-dir> [--offline] [--allow-webgl] [--reuse-scenes]
  node src/cli.mjs query-native-html --query <course-topic-and-requirements> --out <run-dir> [--offline] [--allow-webgl]
  node src/cli.mjs validate --content-pack <content-pack.json>
  node src/cli.mjs verify --run <run-dir>

provider:
  project.json 中 content/reference/page/review 均可配置为 local，
  或 { "mode":"command", "argv":["可执行文件","参数"] }。
  content 还支持 { "mode":"research-planner", "model":"deepseek-ai/DeepSeek-V4-Flash", ... }，
  会执行联网研究、来源账本、叙事地图、页面合同与设计桥。
  reference 还支持 { "mode":"paratera", ... } 或 { "mode":"openrouter-image", "model":"openai/gpt-image-2", ... }。
  command provider 从 stdin 接收 JSON，并在 stdout 返回 JSON。
`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || flags.help) {
    help();
    return;
  }
  if (command === 'build') {
    const result = await buildPipeline({
      projectFile: requireFlag(flags, 'project'),
      outDir: requireFlag(flags, 'out'),
    });
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    if (result.manifest.status !== 'pass') process.exitCode = 1;
    return;
  }
  if (command === 'query-reference') {
    const result = await buildQueryReferencePipeline({
      query: requireFlag(flags, 'query'),
      outDir: requireFlag(flags, 'out'),
    });
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    if (result.manifest.status !== 'pass') process.exitCode = 1;
    return;
  }
  if (command === 'reference-html') {
    const result = await buildNativeHtmlFromReferenceRun({
      sourceRun: requireFlag(flags, 'run'),
      outDir: requireFlag(flags, 'out'),
      options: { offline: flags.offline === true, allowWebgl: flags['allow-webgl'] === true, reuseScenes: flags['reuse-scenes'] === true },
    });
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    if (result.manifest.status !== 'pass') process.exitCode = 1;
    return;
  }
  if (command === 'query-native-html') {
    const result = await buildQueryNativeHtmlPipeline({
      query: requireFlag(flags, 'query'),
      outDir: requireFlag(flags, 'out'),
      options: { offline: flags.offline === true, allowWebgl: flags['allow-webgl'] === true },
    });
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    if (result.manifest.status !== 'pass') process.exitCode = 1;
    return;
  }
  if (command === 'validate') {
    const file = path.resolve(requireFlag(flags, 'content-pack'));
    const pack = validateContentPack(await readJson(file));
    process.stdout.write(`✓ ${file} · ${pack.pages.length} 页 · 语义轻校验通过\n`);
    return;
  }
  if (command === 'verify') {
    const result = await verifyRun({ runDir: requireFlag(flags, 'run') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.pass) process.exitCode = 1;
    return;
  }
  throw new Error(`未知命令: ${command}`);
}

main().catch(error => {
  process.stderr.write(`✗ ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
