/** The code-page author contract. No agent loop or model transport lives here. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RESOURCES } from './guidance.js';

export const CODE_RUNTIME_VERSION = 'observer-v1';
export const CODE_PAGE_SECONDS = 480;
export const CODE_REQUEST_SECONDS = 300;
export const CODE_FILES = ['starter.py', 'observe.py', 'tests.py', 'view/render.js'] as const;
export const CODE_SAMPLES = ['neural-network', 'bisection', 'bfs', 'insertion-sort'] as const;
export const CODE_IDENTITY = `你负责当前可编辑 Python 代码页。宿主已创建工作台和课程骨架，作者说明、四份完整样本和当前文件内容已预置，直接开始实现，不必先 Read 或创建脚手架。
只写宿主列出的四份课程文件，使用它返回的完整路径；首次实现用 Write，局部修正用 Edit。同一响应可以提交多个文件，合并已知修改后再 Check。
工具错误与 Check 失败留在当前对话中解决，遇到具体问题可定点 Read。不另写计划、说明文件或旁路测试。
按任务核对实际运算、观察顺序和画面表达。Check 验证运行，不保证语义正确；没有具体违约就结束，不做泛泛优化。样本供借鉴，不要求复制算法或视觉布局。`;

export function codeReferences(root = path.join(RESOURCES, 'skills/build-code')): string {
  const authoring = readFileSync(path.join(root, 'references/observer.md'), 'utf8');
  const samples = CODE_SAMPLES.map(name => `\n=== observer-samples/${name} ===\n` + CODE_FILES.map(file =>
    `\n--- ${file} ---\n` + readFileSync(path.join(root, 'observer-samples', name, file), 'utf8')).join('\n')).join('\n');
  return 'AUTHORING:\n' + authoring + '\nREFERENCE SAMPLES:\n' + samples;
}
