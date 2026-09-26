import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { posix, relative, sep } from 'node:path';

/** One container per AI run: it sees only the run's workspace (at /workspace), runs as the host
 * user so the files it writes stay ours, has no credentials, and reaches the network only through
 * the allowlist proxy on an internal network (see `sandbox/`). */
const run = promisify(execFile);
export const SANDBOX_IMAGE = process.env.EDITOR_AGENT_SANDBOX_IMAGE || 'notale-agent-sandbox';
export const SANDBOX_NETWORK = process.env.EDITOR_AGENT_SANDBOX_NETWORK || 'notale-agent-net';
const PROXY = process.env.EDITOR_AGENT_SANDBOX_PROXY || 'http://notale-agent-proxy:8888';
/** A command the model runs without a timeout still ends. */
export const DEFAULT_TIMEOUT_S = 120;
export const MAX_TIMEOUT_S = 300;

export interface ExecOptions { onData: (data: Buffer) => void; signal?: AbortSignal; timeout?: number; env?: NodeJS.ProcessEnv }
export interface Sandbox {
  /** The `exec` of pi's BashOperations: runs `command` in `cwd` (a host path inside the workspace). */
  exec(command: string, cwd: string, options: ExecOptions): Promise<{ exitCode: number | null }>;
  close(): Promise<void>;
}

export async function openSandbox(workspace: string, labels: Record<string, string> = {}): Promise<Sandbox> {
  const name = `notale-agent-${randomUUID().slice(0, 12)}`;
  const uid = process.getuid?.() ?? 1000, gid = process.getgid?.() ?? 1000;
  // --init: a real PID 1 reaps what a killed command leaves behind.
  await run('docker', ['run', '-d', '--rm', '--init', '--name', name, ...Object.entries(labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]),
    '--network', SANDBOX_NETWORK, '--user', `${uid}:${gid}`,
    '--cpus', '1', '--memory', '1g', '--pids-limit', '256',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--read-only', '--tmpfs', '/tmp:rw,exec,size=512m',
    '-e', `HTTP_PROXY=${PROXY}`, '-e', `HTTPS_PROXY=${PROXY}`, '-e', `http_proxy=${PROXY}`, '-e', `https_proxy=${PROXY}`,
    '-v', `${workspace}:/workspace`, '-w', '/workspace', SANDBOX_IMAGE]);
  const inside = (cwd: string) => {
    const path = relative(workspace, cwd).split(sep).join('/');
    if (path.startsWith('..') || posix.isAbsolute(path)) return '/workspace';
    return path ? `/workspace/${path}` : '/workspace';
  };
  return {
    exec(command, cwd, { onData, signal, timeout }) {
      const seconds = Math.min(MAX_TIMEOUT_S, Math.max(1, Math.round(timeout ?? DEFAULT_TIMEOUT_S)));
      // `timeout` runs the command in its own process group and signals the whole group, so a
      // timed-out or aborted command takes its children with it.
      const child = spawn('docker', ['exec', '-i', '-w', inside(cwd), name, 'timeout', '--kill-after=3', `${seconds}s`, 'bash', '-lc', command], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const stop = () => { void run('docker', ['exec', name, 'pkill', '-TERM', '-x', 'timeout']).catch(() => {}); child.kill(); };
      if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
      return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => { signal?.removeEventListener('abort', stop); resolve({ exitCode: code === 124 || code === 137 ? null : code }); });
      });
    },
    async close() { await run('docker', ['rm', '-f', name]).catch(() => {}); },
  };
}
