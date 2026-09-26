import { spawn } from 'node:child_process';
const checks = ['typecheck', 'test'];
const results = await Promise.all(
  checks.map(
    (name) =>
      new Promise((resolve) => {
        const started = performance.now(),
          child = spawn('npm', ['run', name], { stdio: 'inherit' });
        child.on('error', (error) => resolve({ name, error: String(error), code: 1 }));
        child.on('exit', (code) =>
          resolve({
            name,
            code: code ?? 1,
            seconds: ((performance.now() - started) / 1000).toFixed(1),
          }),
        );
      }),
  ),
);
for (const result of results)
  console.log(
    `${result.name}: ${result.code === 0 ? 'passed' : 'failed'} (${result.seconds ?? '?'}s)${result.error ? ' ' + result.error : ''}`,
  );
process.exitCode = results.some((result) => result.code !== 0) ? 1 : 0;
