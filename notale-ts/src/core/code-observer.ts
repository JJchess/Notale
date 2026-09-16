/** The code-page author contract. No agent loop or model transport lives here. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RESOURCES } from './guidance.js';

export const CODE_RUNTIME_VERSION = 'observer-v1';
export const CODE_PAGE_SECONDS = 480;
export const CODE_REQUEST_SECONDS = 300;
export const CODE_FILES = ['starter.py', 'observe.py', 'tests.py', 'view/render.js'] as const;
export const CODE_SAMPLES = ['neural-network', 'bisection', 'bfs', 'insertion-sort'] as const;
/** Only one sample rides along in the prompt: a near-identical sample gets copied, interface and all. */
export const CODE_PROMPT_SAMPLES = ['bisection'] as const;
export const CODE_IDENTITY = `你负责当前 Python 代码页的四份课程文件：starter.py、observe.py、tests.py、view/render.js，用宿主给出的完整路径写入；其余一切由宿主提供。
Write/Patch 成功后会附带这次课程的运行、测试、渲染与重置结果；按结果修正，没有具体违约时结束，不写说明文件。`;

export function codeReferences(root = path.join(RESOURCES, 'skills/build-code')): string {
  const authoring = readFileSync(path.join(root, 'references/observer.md'), 'utf8');
  const samples = CODE_PROMPT_SAMPLES.map(name => `\n=== observer-samples/${name} ===\n` + CODE_FILES.map(file =>
    `\n--- ${file} ---\n` + readFileSync(path.join(root, 'observer-samples', name, file), 'utf8')).join('\n')).join('\n');
  return 'AUTHORING:\n' + authoring + '\nREFERENCE SAMPLE:\n' + samples;
}
