export interface AuthorMessage { action: 'run' | 'render' | 'stop'; id?: number }
export interface AuthorTaskContext { current(): boolean; signal: AbortSignal }
export interface AuthorSchedulerOptions {
  run(message: AuthorMessage, context: AuthorTaskContext): Promise<unknown> | unknown;
  render(message: AuthorMessage, context: AuthorTaskContext): Promise<unknown> | unknown;
  stop(action: AuthorMessage['action']): void;
  reply(message: AuthorMessage, value?: unknown, error?: unknown): void;
}
export declare class AuthorScheduler {
  constructor(options: AuthorSchedulerOptions);
  run: AuthorSchedulerOptions['run'];
  render: AuthorSchedulerOptions['render'];
  submit(message: AuthorMessage): void;
  dispose(): void;
}
