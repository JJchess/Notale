import { loadPyodide } from "../assets/lib/pyodide/pyodide.mjs";
import { CODE_LIMITS as DEFAULT_LIMITS } from './limits.js';

const PYODIDE_BASE = new URL("../assets/lib/pyodide/", import.meta.url).href;

const RUNNER_SOURCE = String.raw`
import json, sys, math, types, traceback, time, random
from notale_prototype_bridge import send

class TraceLimit(RuntimeError): pass

def _notale_run(files_json, entry, observe_source, tests_source, limits_json, seed):
    np = sys.modules.get('numpy')
    files = json.loads(files_json)
    source_lines = files[entry].splitlines()
    limits = json.loads(limits_json)
    frames, batch, previous = [], [], None
    bytes_used = 0
    last_sent = time.monotonic()
    observation_error = None
    exceptional = set()
    truncated = None

    def within(path, actual, key):
        maximum = limits[key]
        if actual > maximum:
            raise TraceLimit(f'{path}: {key} exceeded (actual={actual}, limit={maximum})')

    def error(exc, kind):
        stack = traceback.extract_tb(exc.__traceback__)
        own = [x for x in stack if x.filename in (entry, 'lesson/observe.py', 'lesson/tests.py')]
        at = own[-1] if own else (stack[-1] if stack else None)
        return {'kind':kind, 'message':str(exc), 'source': {'file':at.filename,'line':at.lineno,'column':1} if at else None,
                'traceback': ''.join(traceback.format_exception(type(exc),exc,exc.__traceback__))}

    def safe(value, path='state', depth=0, seen=None, sampled=None):
        within(path, depth, 'maxDepth')
        if seen is None: seen=set()
        if np is not None and isinstance(value, np.ndarray): value=value.tolist()
        elif np is not None and isinstance(value, np.generic): value=value.item()
        if value is None or isinstance(value,(bool,int)): return value
        if isinstance(value,float):
            if not math.isfinite(value): raise ValueError(path + ': non-finite number')
            return value
        if isinstance(value,str):
            within(path, len(value), 'maxString')
            return value
        if not isinstance(value,(dict,list,tuple)): raise TypeError(path + ': unsupported ' + type(value).__name__)
        if id(value) in seen: raise ValueError(path + ': cyclic value')
        if sampled is not None and isinstance(value,(list,tuple)) and len(value)>limits['maxItems']:
            # A long sequence is the host's capacity problem, not the lesson's: keep evenly spaced items and say so.
            total, n = len(value), limits['maxItems']
            value=[value[round(i*(total-1)/(n-1))] for i in range(n)]
            sampled.append({'path':path,'from':total,'to':n})
        within(path, len(value), 'maxItems')
        seen.add(id(value))
        try:
            if isinstance(value,dict):
                if any(not isinstance(k,str) for k in value): raise TypeError(path + ': keys must be strings')
                return {k:safe(v,path+'.'+k,depth+1,seen,sampled) for k,v in value.items()}
            return [safe(v,path+'['+str(i)+']',depth+1,seen,sampled) for i,v in enumerate(value)]
        finally: seen.remove(id(value))

    def flush():
        nonlocal last_sent
        if batch:
            send(json.dumps(batch,ensure_ascii=False))
            batch.clear()
            last_sent=time.monotonic()

    def capture(frame,event,line,arg=None):
        nonlocal previous, bytes_used, observation_error, truncated
        if observation_error or truncated: return
        ctx=types.SimpleNamespace(function=frame.f_code.co_name,event=event,
            source={'file':entry,'line':max(1,line),'text':source_lines[line-1] if 0<line<=len(source_lines) else ''},
            locals=types.MappingProxyType(frame.f_locals),globals=types.MappingProxyType(frame.f_globals),
            return_value=arg if event=='return' else None)
        try:
            raw=observe(ctx)
            if raw is None:return
            if not isinstance(raw,dict):raise TypeError('observe must return dict or None')
            sampled=[]
            state=safe(raw,sampled=sampled)
            if state==previous:return
            step={'sequence':len(frames),'source':{'file':entry,'line':max(1,line),'column':1},'state':state}
            if sampled: step['sampled']=sampled
            encoded=json.dumps(step,ensure_ascii=False).encode()
            if len(frames)>=limits['maxFrames'] or bytes_used+len(encoded)>limits['maxPayloadBytes']:
                # Capacity, not correctness: keep what was recorded and report where recording stopped.
                truncated={'frame':len(frames),'bytes':bytes_used,'limit':'maxFrames' if len(frames)>=limits['maxFrames'] else 'maxPayloadBytes'}
                return
            bytes_used+=len(encoded)
            frames.append(step);batch.append(step);previous=state
            if len(frames)==1 or len(batch)>=16 or time.monotonic()-last_sent>=.05:flush()
        except TraceLimit:raise
        except BaseException as exc:
            observation_error=error(exc,'observation')
            observation_error['context']={'function':ctx.function,'event':event,'locals':list(ctx.locals)[:24]}

    # The observer sees a function's interface only: its arguments at call, its value at return.
    # Line events exposed half-updated locals and made observers depend on statement shapes.
    def trace(frame,event,arg):
        if frame.f_code.co_filename!=entry:return None
        key=id(frame)
        if event=='call':capture(frame,'call',frame.f_lineno)
        elif event=='exception':
            capture(frame,'exception',frame.f_lineno)
            exceptional.add(key)
        elif event=='return':
            if key not in exceptional:capture(frame,'return',frame.f_lineno,arg)
            exceptional.discard(key)
        return trace

    ns={'__name__':'__main__','__file__':entry}
    runtime_error=None;tests=[]
    try:
        observer={'__name__':'__observer__'}
        exec(compile(observe_source,'lesson/observe.py','exec'),observer)
        observe=observer.get('observe')
        if not callable(observe):raise TypeError('observe.py must define observe(context)')
    except BaseException as exc:
        return json.dumps({'ok':False,'error':error(exc,'observation'),'frames':[],'tests':[]})
    random.seed(seed)
    if np is not None: np.random.seed(seed)
    old_trace=sys.gettrace()
    try:
        code=compile(files[entry],entry,'exec')
        sys.settrace(trace)
        exec(code,ns,ns)
    except BaseException as exc:runtime_error=error(exc,'limit' if isinstance(exc,TraceLimit) else 'runtime')
    finally:sys.settrace(old_trace);flush()
    if not runtime_error and tests_source.strip():
        try:
            tn={'__name__':'__tests__'}
            exec(compile(tests_source,'lesson/tests.py','exec'),tn)
            raw_tests=tn['run_tests'](ns)
            if not isinstance(raw_tests,(list,tuple)):raise TypeError('run_tests must return a list')
            for test_index,item in enumerate(raw_tests):
                tests.append({'name':str(item.get('name','test')),'passed':bool(item.get('passed',False)),
                    'message':str(item.get('message','')),'expected':safe(item.get('expected'),f'tests[{test_index}].expected'),'observed':safe(item.get('observed'),f'tests[{test_index}].observed')})
        except BaseException as exc:runtime_error=error(exc,'tests')
    failure=runtime_error or observation_error
    return json.dumps({'ok':failure is None,'error':failure,'observationError':observation_error,'frames':frames,'tests':tests,'truncated':truncated},ensure_ascii=False)
`;

let pyodide = null;
let runner = null;
let pythonVersion = "";
let activeRunId = null;
let needsNumpy = null;
let numpyReady = false;

// Same conservative source inspection as the TS workbench; never execute code to
// discover dependencies. Syntax errors are reported by the course runner.
const DEPENDENCY_SOURCE = String.raw`
def _notale_needs_numpy(sources_json):
    import ast
    dynamic = {"__import__", "import_module", "exec", "eval", "compile",
               "getattr", "globals", "locals", "vars", "__builtins__",
               "__dict__", "__globals__", "__getattribute__", "__subclasses__",
               "attrgetter", "methodcaller"}
    for source in json.loads(sources_json):
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                if any(alias.name.split('.')[0] in {'numpy', 'importlib', 'builtins'} for alias in node.names):
                    return True
            elif isinstance(node, ast.ImportFrom):
                if (node.module or '').split('.')[0] in {'numpy', 'importlib', 'builtins'}:
                    return True
            elif isinstance(node, ast.Name) and node.id in dynamic:
                return True
            # Observer context.locals/context.globals are snapshots, not calls
            # to Python introspection builtins. Keep actual dynamic methods.
            elif isinstance(node, ast.Attribute) and node.attr in dynamic - {'locals', 'globals', 'vars'}:
                return True
    return False
`;

const ready = (async () => {
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE, packageBaseUrl: PYODIDE_BASE });
  pyodide.registerJsModule("notale_prototype_bridge", {send: raw => {
    self.postMessage({type:"frames",id:activeRunId,frames:JSON.parse(raw)});
  }});
  pyodide.runPython(RUNNER_SOURCE);
  pyodide.runPython(DEPENDENCY_SOURCE);
  needsNumpy = pyodide.globals.get("_notale_needs_numpy");
  runner = pyodide.globals.get("_notale_run");
  pythonVersion = pyodide.runPython("import platform; platform.python_version()");
  self.postMessage({ type: "ready", pythonVersion });
})();

function boundedLimits(value) {
  const source = value && typeof value === "object" ? value : {};
  const limits = {};
  for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
    const candidate = Number(source[key]);
    limits[key] = Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : fallback;
  }
  limits.maxFrames = Math.min(limits.maxFrames, 10_000);
  limits.maxPayloadBytes = Math.min(limits.maxPayloadBytes, 12_000_000);
  limits.maxOutputChars = Math.min(limits.maxOutputChars, 400_000);
  limits.maxSourceChars = Math.min(limits.maxSourceChars, 1_000_000);
  return limits;
}

async function runSource(message) {
  await ready;
  activeRunId = message.id;
  const limits = boundedLimits(message.limits);
  const stdout = [];
  const stderr = [];
  let outputLength = 0;
  const collect = (bucket) => (text) => {
    if (outputLength >= limits.maxOutputChars) return;
    const remaining = limits.maxOutputChars - outputLength;
    const chunk = String(text).slice(0, remaining);
    bucket.push(chunk);
    outputLength += chunk.length;
  };
  pyodide.setStdout({ batched: collect(stdout) });
  pyodide.setStderr({ batched: collect(stderr) });

  let rawResult = null;
  try {
    const files = Object.fromEntries(
      (Array.isArray(message.files) ? message.files : []).map((file) => [String(file.filename || ""), String(file.source || "")]),
    );
    if (!numpyReady && needsNumpy(JSON.stringify([...Object.values(files), String(message.traceSource || ""), String(message.testsSource || "")]))) {
      self.postMessage({ type: "preparing", id: message.id, message: "正在准备 NumPy" });
      await pyodide.loadPackage("numpy");
      pyodide.runPython("import numpy");
      numpyReady = true;
    }
    self.postMessage({ type: "executing", id: message.id });
    rawResult = runner(
      JSON.stringify(files),
      String(message.entry || "starter.py"),
      String(message.traceSource || ""),
      String(message.testsSource || ""),
      JSON.stringify(limits),
      Number(message.seed) || 0,
    );
    const serialized = typeof rawResult === "string" ? rawResult : rawResult.toString();
    const result = JSON.parse(serialized);
    const stdoutText = stdout.join("\n");
    const stderrText = stderr.join("\n");
    self.postMessage({
      type: result.ok ? "result" : "error",
      id: message.id,
      frames: Array.isArray(result.frames) ? result.frames : [],
      tests: Array.isArray(result.tests) ? result.tests : [],
      error: result.error || null,
      truncated: result.truncated || null,
      stdout: stdoutText,
      stderr: stderrText,
      outputTruncated: outputLength >= limits.maxOutputChars,
      pythonVersion,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      frames: [],
      tests: [],
      error: {
        kind: "worker",
        message: error?.message || String(error),
        source: null,
        traceback: error?.stack || "",
      },
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      pythonVersion,
    });
  } finally {
    rawResult?.destroy?.();
  }
}

let queue = Promise.resolve();
self.addEventListener("message", (event) => {
  if (event.data?.type !== "run") return;
  queue = queue.then(() => runSource(event.data));
});

ready.catch((error) => {
  self.postMessage({ type: "fatal", message: `工作台初始化失败（Python / NumPy）：${error?.message || String(error)}` });
});
