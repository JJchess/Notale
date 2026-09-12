interface BrowserPyodide {
  loadPackage(names: string[]): Promise<void>;
  runPythonAsync(source: string): Promise<unknown>;
  setStdout(options: { batched(text: string): void }): void;
  setStderr(options: { batched(text: string): void }): void;
}

let runtime: Promise<BrowserPyodide> | undefined;
const started = performance.now();

function timing(mark: string) {
  self.postMessage({ type: "timing", mark, milliseconds: performance.now() - started });
}

async function initialize(packages: string[]): Promise<BrowserPyodide> {
  const indexURL = new URL("./pyodide/", import.meta.url).href;
  const moduleUrl = new URL("./pyodide/pyodide.mjs", import.meta.url).href;
  const { loadPyodide } = await import(moduleUrl) as { loadPyodide(options: { indexURL: string; packageBaseUrl: string }): Promise<BrowserPyodide> };
  const pyodide = await loadPyodide({ indexURL, packageBaseUrl: indexURL });
  timing("pythonReady");
  if (packages.length) {
    await pyodide.loadPackage(packages);
    timing("packagesReady");
  }
  return pyodide;
}

self.onmessage = async (message: MessageEvent<{ type: "init" | "run"; packages?: string[]; source?: string }>) => {
  try {
    if (message.data.type === "init") {
      runtime ??= initialize(message.data.packages ?? []);
      await runtime;
      self.postMessage({ type: "ready" });
      return;
    }
    const pyodide = await runtime;
    if (!pyodide) throw new Error("Python runtime was not initialized");
    let output = "";
    pyodide.setStdout({ batched: (text) => { output += `${text}\n`; } });
    pyodide.setStderr({ batched: (text) => { output += `${text}\n`; } });
    const result = await pyodide.runPythonAsync(message.data.source ?? "");
    if (result !== undefined && result !== null) output += String(result);
    self.postMessage({ type: "result", output: output.trimEnd() });
  } catch (error) {
    self.postMessage({ type: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
};
