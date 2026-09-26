import { CODE_LIMITS } from '../runtime/limits.js';

export class RuntimeFailure extends Error {
  constructor(kind, message, detail = {}) {
    super(message);
    this.name = "RuntimeFailure";
    this.kind = kind;
    Object.assign(this, detail);
  }
}

export class WorkerRuntimeAdapter {
  constructor(options = {}) {
    this.workerUrl = options.workerUrl || "../runtime/python-worker.js";
    this.timeoutMs = Number(options.timeoutMs) || CODE_LIMITS.timeoutMs;
    this.onStatus = options.onStatus || (() => {});
    this.worker = null;
    this.generation = 0;
    this.requestId = 0;
    this.current = null;
    this.ready = false;
    this.readyPromise = null;
    this.disposed = false;
  }

  start() {
    if (this.disposed) throw new RuntimeFailure("disposed", "运行时已经释放。");
    if (this.worker) return this.readyPromise;
    const generation = ++this.generation;
    this.ready = false;
    this.onStatus({ kind: "loading", message: "Python 准备中" });
    this.worker = new Worker(this.workerUrl, { type: "module" });

    let resolveReady;
    let rejectReady;
    this.readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
      this.rejectReady = reject;
    });

    this.worker.addEventListener("message", (event) => {
      if (generation !== this.generation || this.disposed) return;
      const data = event.data || {};
      if (data.type === "ready") {
        this.ready = true;
        this.onStatus({ kind: "ready", message: `Python ${data.pythonVersion || "已就绪"}` });
        resolveReady(data);
        return;
      }
      if (data.type === "fatal") {
        const error = new RuntimeFailure("initialization", data.message || "Python 初始化失败。", data);
        rejectReady(error);
        this.failCurrent(error);
        this.onStatus({ kind: "error", message: "Python 无法启动" });
        return;
      }
      if (!this.current || data.id !== this.current.id) return;
      if (data.type === "preparing") {
        this.onStatus({ kind: "running", message: data.message });
        return;
      }
      if (data.type === "executing") {
        clearTimeout(this.current.timer);
        this.current.timer = this.runTimer(data.id, this.timeoutMs, false);
        return;
      }
      if (data.type === "frames") {
        this.current.onFrames?.(data.frames);
        return;
      }
      const { resolve } = this.current;
      clearTimeout(this.current.timer);
      this.current = null;
      this.onStatus({ kind: "ready", message: `Python ${data.pythonVersion || "已就绪"}` });
      resolve(data);
    });

    this.worker.addEventListener("error", (event) => {
      if (generation !== this.generation || this.disposed) return;
      const error = new RuntimeFailure("worker", event.message || "Python Worker 发生错误。", { line: event.lineno || 1 });
      rejectReady(error);
      this.failCurrent(error);
      this.onStatus({ kind: "error", message: "Python Worker 错误" });
    });
    return this.readyPromise;
  }

  async run(request, onFrames) {
    await this.start();
    if (this.current) throw new RuntimeFailure("busy", "已有代码正在运行。");
    const id = ++this.requestId;
    this.onStatus({ kind: "running", message: "正在运行" });
    return new Promise((resolve, reject) => {
      const timer = this.runTimer(id, 30000, true);
      this.current = { id, resolve, reject, timer, onFrames };
      this.worker.postMessage({ ...request, type: "run", id });
    });
  }

  failCurrent(error) {
    if (!this.current) return;
    clearTimeout(this.current.timer);
    const { reject } = this.current;
    this.current = null;
    reject(error);
  }

  runTimer(id, milliseconds, preparing) {
    return window.setTimeout(() => {
      if (!this.current || this.current.id !== id) return;
      const { reject } = this.current;
      const message = preparing ? `依赖准备超过 ${milliseconds}ms，已终止并重建 Python。`
        : `运行超过 ${this.timeoutMs}ms，已终止并重建 Python。`;
      this.current = null;
      reject(new RuntimeFailure("timeout", message, { id }));
      this.restart("timeout");
    }, milliseconds);
  }

  restart(reason = "restart") {
    if (this.disposed) return;
    const error = new RuntimeFailure("cancelled", reason === "timeout" ? "运行超时。" : "运行已取消。");
    this.failCurrent(error);
    this.rejectReady?.(error);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.start().catch(() => {});
  }

  cancel({restart = true} = {}) {
    const hadWork=Boolean(this.current || this.worker && !this.ready);
    if(restart){if(hadWork)this.restart("cancel");return hadWork;}
    if(!this.worker)return false;
    const error=new RuntimeFailure("cancelled", "运行已取消。");
    this.failCurrent(error);this.rejectReady?.(error);
    this.worker.terminate();this.worker=null;this.ready=false;this.readyPromise=null;this.generation++;
    this.onStatus({kind:'ready',message:''});return hadWork;
  }

  dispose() {
    if (this.disposed) return;
    this.cancel({restart:false});this.disposed=true;
  }

  getState() {
    return {
      ready: this.ready,
      running: Boolean(this.current),
      generation: this.generation,
      requestId: this.requestId,
    };
  }
}
