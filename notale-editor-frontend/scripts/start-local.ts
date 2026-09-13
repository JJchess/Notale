import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';

const frontend = process.cwd(), backend = resolve(frontend, '../notale-editor');
const ports = [process.env.PORT ?? '4312', process.env.EDITOR_PORT ?? '4310', process.env.EDITOR_CONTENT_PORT ?? '4311'].map(Number);
if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(ports).size !== 3) throw Error('Choose three distinct valid ports');
const [port, apiPort, contentPort] = ports;
const children: ChildProcess[] = [];
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.map(child => new Promise<void>(done => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return done();
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timer); done(); });
    child.kill('SIGTERM');
  })));
  process.exitCode = code;
}
process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
function start(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  if (stopping) throw Error('Startup cancelled');
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.once('error', error => { console.error(error.message); void stop(1); });
  child.once('exit', () => { if (!stopping) { console.error('A service stopped; closing the local stack.'); void stop(1); } });
}
async function ready(url: string) {
  const end = Date.now() + 20000;
  while (!stopping && Date.now() < end) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 200));
  }
  throw Error(`Service did not become ready: ${url}`);
}
try {
  await access(resolve(backend, 'dist/server/main.js'));
  await access(resolve(frontend, process.env.NEXT_DIST_DIR ?? '.next', 'BUILD_ID'));
  for (const candidate of ports) await new Promise<void>((done, fail) => {
    const socket = createServer();
    socket.once('error', () => fail(Error(`Port ${candidate} is unavailable; existing processes were not stopped`)));
    socket.listen(candidate, '127.0.0.1', () => socket.close(error => error ? fail(error) : done()));
  });
  start(['dist/server/main.js'], backend, { ...process.env, EDITOR_PORT: String(apiPort), EDITOR_CONTENT_PORT: String(contentPort), EDITOR_RUNTIME_DIR: resolve(backend, 'dist') });
  await ready(`http://127.0.0.1:${apiPort}/health`);
  start(['.local/tooling/scripts/serve.js'], frontend, { ...process.env, NODE_ENV: 'production', PORT: String(port), EDITOR_BACKEND_URL: `http://127.0.0.1:${apiPort}`, EDITOR_CONTENT_BACKEND_URL: `http://127.0.0.1:${contentPort}`, EDITOR_PUBLIC_CONTENT_URL: `http://notale-content.localhost:${port}` });
  await ready(`http://127.0.0.1:${port}`);
  console.log(`Local editor ready: http://localhost:${port} — Ctrl+C stops both owned services.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await stop(1);
}
