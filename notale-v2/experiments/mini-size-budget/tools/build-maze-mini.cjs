const fs = require('fs'), {execFileSync} = require('child_process');
const base = 'experiments/mini-size-budget/';
const stages = ['area-maze', 'build-maze-area', 'alias-maze', 'refine-maze', 'finish-maze-area', 'finish-maze-syntax', 'compact-maze-values'];
if (process.argv.includes('--content')) stages.unshift('compact-maze-content');
for (const stage of stages) {
  try {
    execFileSync(process.execPath, [base + 'tools/' + stage + '.cjs'], {stdio: ['ignore', 'pipe', 'pipe']});
  } catch (error) {
    process.stderr.write(String(error.stdout || '') + String(error.stderr || ''));
    throw error;
  }
}
const metadata = JSON.parse(fs.readFileSync(base + 'maze/build.json'));
console.log({chars: metadata.chars, css: metadata.css, js: metadata.js});
