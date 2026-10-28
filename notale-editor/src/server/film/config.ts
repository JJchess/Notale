import { createHash } from 'node:crypto';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FilmServerOptions {
  dataDir: string;
  playerDir?: string;
  ffmpeg?: string;
  ffprobe?: string;
  chromium?: string;
  python?: string;
  /** Only for an explicitly trusted local authoring workspace. BRIDGE-v2 is same-origin. */
  trustedLocalFilms?: boolean;
}
export interface FilmRuntime {
  playerDir: string;
  editorRuntimeDir: string;
  chromium?: string;
  commands: Record<string, string>;
}
export function runtimeOptions(options: FilmServerOptions): FilmRuntime {
  return {
    playerDir: options.playerDir ? resolve(options.playerDir) : '',
    editorRuntimeDir: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    chromium: options.chromium,
    commands: { ffmpeg: options.ffmpeg ?? 'ffmpeg', ffprobe: options.ffprobe ?? 'ffprobe', python3: options.python ?? 'python3' },
  };
}
export function scopeDirectory(dataDir: string, scope: string) {
  return resolve(dataDir, 'workspaces', createHash('sha256').update(scope).digest('hex'));
}
/** Own exact children only. Never signal a shell, process group, tmux or another service. */
export class FilmProcesses {
  private children = new Set<ChildProcess>();
  private closing = false;
  constructor(private runtime: FilmRuntime) {}
  spawn = (command: string, args: readonly string[], options: SpawnOptions = {}) => {
    if (this.closing) throw Error('影片服务正在关闭');
    const child = spawn(this.runtime.commands[command] ?? command, args, options);
    this.children.add(child);
    child.once('close', () => this.children.delete(child));
    return child;
  };
  async close() {
    this.closing = true;
    await Promise.all([...this.children].map(child => new Promise<void>(done => {
      if (child.exitCode !== null || child.signalCode !== null) { done(); return; }
      const force = setTimeout(() => child.kill('SIGKILL'), 1500);
      child.once('close', () => { clearTimeout(force); done(); });
      child.kill('SIGTERM');
    })));
  }
}
