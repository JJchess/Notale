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
    this.timeoutMs = Number(options.timeoutMs) || 5000;
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

  async run(request) {
    await this.start();
    if (this.current) throw new RuntimeFailure("busy", "已有代码正在运行。");
    const id = ++this.requestId;
    this.onStatus({ kind: "running", message: "正在运行" });
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!this.current || this.current.id !== id) return;
        const error = new RuntimeFailure("timeout", `运行超过 ${this.timeoutMs}ms，已终止并重建 Python。`, { id });
        this.current = null;
        reject(error);
        this.restart("timeout");
      }, this.timeoutMs);
      this.current = { id, resolve, reject, timer };
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

  restart(reason = "restart") {
    if (this.disposed) return;
    const error = new RuntimeFailure("cancelled", reason === "timeout" ? "运行超时。" : "运行已取消。");
    this.failCurrent(error);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.start().catch(() => {});
  }

  cancel() {
    if (!this.current) return false;
    this.restart("cancel");
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.failCurrent(new RuntimeFailure("disposed", "运行时已经释放。"));
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.generation += 1;
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
