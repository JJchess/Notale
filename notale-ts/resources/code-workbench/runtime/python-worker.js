import { loadPyodide } from "../assets/lib/pyodide/pyodide.mjs";

const PYODIDE_BASE = new URL("../assets/lib/pyodide/", import.meta.url).href;
const DEFAULT_LIMITS = Object.freeze({
  maxFrames: 2400,
  maxPayloadBytes: 4_000_000,
  maxOutputChars: 80_000,
  maxSourceChars: 200_000,
  maxItems: 160,
  maxDepth: 7,
  maxString: 1200,
});

const RUNNER_SOURCE = String.raw`
import json as _notale_json
import math as _notale_math
import os as _notale_os
import random as _notale_random
import shutil as _notale_shutil
import sys as _notale_sys
import traceback as _notale_traceback
import types as _notale_types


class _NotaleTraceLimit(RuntimeError):
    pass


class _NotaleTraceAdapterError(RuntimeError):
    pass


def _notale_limits(raw):
    supplied = _notale_json.loads(raw or "{}")
    defaults = {
        "maxFrames": 2400,
        "maxPayloadBytes": 4_000_000,
        "maxSourceChars": 200_000,
        "maxItems": 160,
        "maxDepth": 7,
        "maxString": 1200,
    }
    for key, value in supplied.items():
        if key in defaults and isinstance(value, (int, float)) and not isinstance(value, bool):
            defaults[key] = max(1, int(value))
    return defaults


def _notale_safe(value, limits, depth=0, seen=None):
    if seen is None:
        seen = set()
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if _notale_math.isfinite(value) else repr(value)
    if isinstance(value, str):
        return value[:limits["maxString"]]
    if depth >= limits["maxDepth"]:
        return f"<{type(value).__name__}>"

    identity = id(value)
    if identity in seen:
        return "<cycle>"
    seen.add(identity)
    try:
        if isinstance(value, dict):
            output = {}
            for index, (key, item) in enumerate(value.items()):
                if index >= limits["maxItems"]:
                    output["…"] = f"{len(value) - limits['maxItems']} more"
                    break
                output[str(key)[:limits["maxString"]]] = _notale_safe(item, limits, depth + 1, seen)
            return output
        if isinstance(value, (list, tuple)):
            output = [_notale_safe(item, limits, depth + 1, seen) for item in value[:limits["maxItems"]]]
            if len(value) > limits["maxItems"]:
                output.append(f"<{len(value) - limits['maxItems']} more>")
            return output
        if isinstance(value, (set, frozenset)):
            ordered = sorted(value, key=lambda item: repr(item))
            return [_notale_safe(item, limits, depth + 1, seen) for item in ordered[:limits["maxItems"]]]
        if hasattr(value, "__dict__"):
            return {
                "__type__": type(value).__name__,
                **_notale_safe(vars(value), limits, depth + 1, seen),
            }
        return repr(value)[:limits["maxString"]]
    except BaseException:
        return f"<{type(value).__name__}>"
    finally:
        seen.discard(identity)


def _notale_changed_indices(previous, current):
    if not isinstance(previous, (list, tuple)) or not isinstance(current, (list, tuple)):
        return []
    return [
        index
        for index in range(max(len(previous), len(current)))
        if index >= len(previous) or index >= len(current) or previous[index] != current[index]
    ]


def _notale_changed_keys(previous, current):
    if not isinstance(previous, dict) or not isinstance(current, dict):
        return []
    keys = set(previous) | set(current)
    return sorted(str(key) for key in keys if previous.get(key) != current.get(key))


_notale_support = _notale_types.ModuleType("notale_trace")
_notale_support.safe_snapshot = lambda value: value
_notale_support.changed_indices = _notale_changed_indices
_notale_support.changed_keys = _notale_changed_keys
_notale_sys.modules["notale_trace"] = _notale_support


def _notale_normalize_path(filename):
    if not isinstance(filename, str) or not filename or "\\" in filename:
        raise ValueError("文件名必须是非空的相对 POSIX 路径。")
    normalized = _notale_os.path.normpath(filename).replace("\\", "/")
    if normalized.startswith("/") or normalized == ".." or normalized.startswith("../"):
        raise ValueError(f"不安全的课程文件路径：{filename}")
    if not normalized.endswith(".py"):
        raise ValueError(f"Python 运行时只接受 .py 文件：{filename}")
    return normalized


def _notale_load_adapter(source, filename, limits):
    namespace = {
        "__name__": "__notale_trace_adapter__",
        "__file__": filename,
        "__builtins__": __builtins__,
        "LIMITS": limits,
    }
    exec(compile(source or "", filename, "exec"), namespace, namespace)
    capture = namespace.get("capture")
    if not callable(capture):
        raise _NotaleTraceAdapterError("trace.py 必须定义 capture(frame, event, previous_state)。")
    return namespace


def _notale_error(exc, user_files, fallback_line=1, kind="runtime"):
    file_map = user_files if isinstance(user_files, dict) else {path: _notale_os.path.basename(path) for path in user_files}
    file_map = dict(file_map)
    file_map[_notale_os.path.abspath("<lesson/trace.py>")] = "lesson/trace.py"
    file_map[_notale_os.path.abspath("<lesson/tests.py>")] = "lesson/tests.py"
    original = exc
    while exc.__cause__ is not None:
        exc = exc.__cause__
    if isinstance(exc, SyntaxError):
        absolute = _notale_os.path.abspath(exc.filename or "")
        filename = file_map.get(absolute, _notale_os.path.basename(exc.filename or ""))
        return {
            "kind": "syntax",
            "message": f"SyntaxError: {exc.msg}",
            "source": {"file": filename or "starter.py", "line": exc.lineno or 1, "column": exc.offset or 1},
            "traceback": "".join(_notale_traceback.format_exception_only(type(exc), exc)).strip(),
        }

    traceback_object = exc.__traceback__
    entries = [
        entry
        for entry in (_notale_traceback.extract_tb(traceback_object) if traceback_object else [])
        if _notale_os.path.abspath(entry.filename) in file_map
    ]
    if entries:
        entry = entries[-1]
        absolute = _notale_os.path.abspath(entry.filename)
        source = {"file": file_map.get(absolute, _notale_os.path.basename(entry.filename)), "line": entry.lineno or 1, "column": 1}
    else:
        source = ({"file": "lesson/trace.py" if kind == "trace" else "lesson/tests.py", "line": 1, "column": 1}
                  if kind in ("trace", "tests") else
                  {"file": "starter.py", "line": fallback_line or 1, "column": 1})
    message = str(exc) if isinstance(exc, (_NotaleTraceLimit, _NotaleTraceAdapterError)) else f"{type(exc).__name__}: {exc}"
    return {
        "kind": kind,
        "message": message,
        "source": source,
        "traceback": "".join(
            _notale_traceback.format_exception(type(original), original, original.__traceback__)
            if traceback_object
            else _notale_traceback.format_exception_only(type(exc), exc)
        ).strip(),
    }


def _notale_run(files_json, entry, trace_source, tests_source, limits_json, seed):
    limits = _notale_limits(limits_json)
    files = _notale_json.loads(files_json)
    if not isinstance(files, dict) or not files:
        return _notale_json.dumps({"ok": False, "error": {"kind": "configuration", "message": "课程没有可执行文件。", "source": {"file": "starter.py", "line": 1, "column": 1}}, "frames": [], "tests": []}, ensure_ascii=False)

    normalized_files = {}
    total_source = 0
    for filename, source in files.items():
        safe_name = _notale_normalize_path(filename)
        if not isinstance(source, str):
            raise TypeError(f"{safe_name} 的内容必须是字符串。")
        total_source += len(source)
        normalized_files[safe_name] = source
    if total_source > limits["maxSourceChars"]:
        raise ValueError(f"课程源代码超过 {limits['maxSourceChars']} 个字符。")

    entry = _notale_normalize_path(entry)
    if entry not in normalized_files:
        raise ValueError(f"入口文件不存在：{entry}")

    root = "/tmp/notale-code-runtime"
    for module_name, module in list(_notale_sys.modules.items()):
        module_file = getattr(module, "__file__", "")
        if module_file and _notale_os.path.abspath(module_file).startswith(root + _notale_os.sep):
            _notale_sys.modules.pop(module_name, None)
    _notale_shutil.rmtree(root, ignore_errors=True)
    _notale_os.makedirs(root, exist_ok=True)
    for filename, source in normalized_files.items():
        path = _notale_os.path.join(root, filename)
        _notale_os.makedirs(_notale_os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(source)

    absolute_files = {_notale_os.path.abspath(_notale_os.path.join(root, filename)): filename for filename in normalized_files}
    user_file_set = set(absolute_files)
    namespace = {
        "__name__": "__main__",
        "__file__": entry,
        "__builtins__": __builtins__,
    }
    try:
        adapter = _notale_load_adapter(trace_source, "<lesson/trace.py>", limits)
        capture = adapter["capture"]
        before_execution = adapter.get("before_execution")
        finalize = adapter.get("finalize")
        if callable(before_execution):
            before_execution(namespace)
    except BaseException as exc:
        error = _notale_error(exc, absolute_files, kind="trace")
        return _notale_json.dumps({"ok": False, "error": error, "frames": [], "tests": []}, ensure_ascii=False)

    frames = []
    previous_state = None
    previous_lines = {}
    last_user_line = 1
    payload_bytes = 0

    def append_step(raw, filename, line):
        nonlocal previous_state, payload_bytes
        if raw is None:
            return
        if not isinstance(raw, dict):
            raw = {"state": raw}
        safe = _notale_safe(raw, limits)
        state = safe.get("state", {})
        step = {
            "sequence": len(frames),
            "source": {
                "file": absolute_files.get(_notale_os.path.abspath(filename), _notale_os.path.basename(filename)),
                "line": max(1, int(line or 1)),
                "column": max(1, int(safe.get("column", 1) or 1)),
            },
            "kind": str(safe.get("kind", "generic")),
            "state": state,
            "focus": safe.get("focus", []) if isinstance(safe.get("focus", []), list) else [],
            "changes": safe.get("changes", []) if isinstance(safe.get("changes", []), list) else [],
            "metrics": safe.get("metrics", {}) if isinstance(safe.get("metrics", {}), dict) else {},
        }
        if safe.get("annotation") is not None:
            step["annotation"] = str(safe["annotation"])[:limits["maxString"]]
        signature = _notale_json.dumps(step, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if frames:
            previous = dict(frames[-1])
            previous.pop("sequence", None)
            candidate = dict(step)
            candidate.pop("sequence", None)
            if previous == candidate:
                return
        payload_bytes += len(signature.encode("utf-8"))
        if len(frames) >= limits["maxFrames"]:
            raise _NotaleTraceLimit(f"执行轨迹超过 {limits['maxFrames']} 帧，请缩小输入或减少循环。")
        if payload_bytes > limits["maxPayloadBytes"]:
            raise _NotaleTraceLimit(f"执行轨迹超过 {limits['maxPayloadBytes']} 字节，请缩小快照。")
        frames.append(step)
        previous_state = state

    def capture_frame(frame, event, line):
        try:
            raw = capture(frame, event, previous_state)
        except BaseException as exc:
            raise _NotaleTraceAdapterError(f"trace.py 捕获失败：{type(exc).__name__}: {exc}") from exc
        append_step(raw, frame.f_code.co_filename, line)

    def tracer(frame, event, arg):
        nonlocal last_user_line
        filename = _notale_os.path.abspath(frame.f_code.co_filename)
        if filename not in user_file_set:
            return None
        frame_id = id(frame)
        if event == "call":
            previous_lines[frame_id] = frame.f_lineno
            return tracer
        if event == "line":
            prior = previous_lines.get(frame_id, frame.f_lineno)
            capture_frame(frame, "line", prior)
            previous_lines[frame_id] = frame.f_lineno
            last_user_line = frame.f_lineno
        elif event == "return":
            capture_frame(frame, "return", previous_lines.get(frame_id, frame.f_lineno))
            previous_lines.pop(frame_id, None)
        return tracer

    previous_trace = _notale_sys.gettrace()
    previous_cwd = _notale_os.getcwd()
    path_added = False
    _notale_random.seed(int(seed or 0))
    try:
        _notale_os.chdir(root)
        if root not in _notale_sys.path:
            _notale_sys.path.insert(0, root)
            path_added = True
        source = normalized_files[entry]
        compiled = compile(source, _notale_os.path.join(root, entry), "exec")
        _notale_sys.settrace(tracer)
        exec(compiled, namespace, namespace)
    except BaseException as exc:
        error_kind = "trace" if isinstance(exc, _NotaleTraceAdapterError) else ("limit" if isinstance(exc, _NotaleTraceLimit) else "runtime")
        error = _notale_error(exc, absolute_files, last_user_line, error_kind)
        return _notale_json.dumps({"ok": False, "error": error, "frames": frames, "tests": []}, ensure_ascii=False)
    finally:
        _notale_sys.settrace(previous_trace)
        _notale_os.chdir(previous_cwd)
        if path_added:
            try:
                _notale_sys.path.remove(root)
            except ValueError:
                pass

    if callable(finalize):
        try:
            append_step(finalize(namespace, previous_state), _notale_os.path.join(root, entry), last_user_line)
        except BaseException as exc:
            error = _notale_error(exc, absolute_files, last_user_line, "trace")
            return _notale_json.dumps({"ok": False, "error": error, "frames": frames, "tests": []}, ensure_ascii=False)

    tests = []
    if tests_source and tests_source.strip():
        test_namespace = {"__name__": "__notale_tests__", "__file__": "<lesson/tests.py>", "__builtins__": __builtins__}
        try:
            exec(compile(tests_source, "<lesson/tests.py>", "exec"), test_namespace, test_namespace)
            run_tests = test_namespace.get("run_tests")
            if not callable(run_tests):
                raise TypeError("tests.py 必须定义 run_tests(namespace)。")
            raw_tests = run_tests(namespace)
            if not isinstance(raw_tests, (list, tuple)):
                raise TypeError("run_tests 必须返回测试结果列表。")
            for index, raw in enumerate(raw_tests[:80]):
                item = raw if isinstance(raw, dict) else {"name": f"测试 {index + 1}", "passed": bool(raw)}
                tests.append({
                    "name": str(item.get("name", f"测试 {index + 1}"))[:limits["maxString"]],
                    "passed": bool(item.get("passed", False)),
                    "message": str(item.get("message", ""))[:limits["maxString"]],
                    "expected": _notale_safe(item.get("expected"), limits),
                    "observed": _notale_safe(item.get("observed"), limits),
                })
        except BaseException as exc:
            error = _notale_error(exc, absolute_files, kind="tests")
            return _notale_json.dumps({"ok": False, "error": error, "frames": frames, "tests": tests}, ensure_ascii=False)

    return _notale_json.dumps({"ok": True, "frames": frames, "tests": tests}, ensure_ascii=False)
`;

let pyodide = null;
let runner = null;
let pythonVersion = "";

// Inspect authored sources, never execute them to discover dependencies. Dynamic
// import/introspection conservatively prepares NumPy before any user side effect.
const DEPENDENCY_SOURCE = String.raw`
def _notale_needs_numpy(sources_json):
    import ast
    dynamic = {"__import__", "import_module", "exec", "eval", "compile",
               "getattr", "globals", "locals", "vars", "__builtins__",
               "__dict__", "__globals__", "__getattribute__", "__subclasses__",
               "attrgetter", "methodcaller"}
    for source in _notale_json.loads(sources_json):
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue  # The original runner reports authored syntax errors.
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                if any(alias.name.split(".")[0] in {"numpy", "importlib", "builtins"}
                       for alias in node.names):
                    return True
            elif isinstance(node, ast.ImportFrom):
                if (node.module or "").split(".")[0] in {"numpy", "importlib", "builtins"}:
                    return True
            elif isinstance(node, ast.Name) and node.id in dynamic:
                return True
            elif isinstance(node, ast.Attribute) and node.attr in dynamic:
                return True
    return False
`;
let needsNumpy = null;
let numpyReady = false;

const ready = (async () => {
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE, packageBaseUrl: PYODIDE_BASE });
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
      await pyodide.loadPackage("numpy", { messageCallback: () => {}, errorCallback: () => {} });
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
