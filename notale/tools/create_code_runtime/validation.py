"""Deterministic validation for create_code_runtime specifications."""

from __future__ import annotations

import json
import re
from pathlib import Path

from notale.tools.create_code_runtime.models import CodeRuntimeSpec
from notale.utils.node import run_node


_RUNTIME_BANNED = re.compile(
    r"\b(?:eval|Function|require|process|fetch|XMLHttpRequest|WebSocket|EventSource|"
    r"Worker|SharedWorker|importScripts|WebAssembly|document|window|parent|top|opener|navigator|location)\b|"
    r"\bimport\s*(?:\(|['\"])",
)


def runtime_source_failures(spec: CodeRuntimeSpec) -> list[str]:
    failures: list[str] = []
    for label, source in (("starter_code", spec.starter_code), ("reference_code", spec.reference_code)):
        if _RUNTIME_BANNED.search(source):
            failures.append(f"{label} uses a forbidden host or dynamic-code capability")
        if not re.search(r"\bfunction\s+solve\s*\(|\b(?:const|let|var)\s+solve\s*=", source):
            failures.append(f"{label} must define synchronous solve(input)")
    try:
        json.dumps([item.runtime_payload() for item in spec.fixtures], ensure_ascii=False)
    except (TypeError, ValueError):
        failures.append("fixtures must contain only JSON-compatible inputs and expected values")
    return failures


async def validate_runtime_execution(
    spec: CodeRuntimeSpec,
    *,
    workspace: Path,
    timeout_sec: float,
    error_chars: int,
) -> list[str]:
    failures = runtime_source_failures(spec)
    if failures:
        return failures
    workspace.mkdir(parents=True, exist_ok=True)
    spec_path = workspace / "runtime-spec.json"
    script_path = workspace / "runtime-check.cjs"
    spec_path.write_text(
        json.dumps(
            {
                "starter_code": spec.starter_code,
                "reference_code": spec.reference_code,
                "fixtures": [item.runtime_payload() for item in spec.fixtures],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    script_path.write_text(_NODE_RUNTIME_CHECK, encoding="utf-8")
    try:
        result = await run_node(
            [str(script_path), str(spec_path)], cwd=workspace, timeout_sec=timeout_sec
        )
        if result.returncode:
            detail = (result.stdout + result.stderr).decode("utf-8", errors="replace")
            return ["runtime fixture validation failed: " + detail[:error_chars]]
        return []
    finally:
        spec_path.unlink(missing_ok=True)
        script_path.unlink(missing_ok=True)


_NODE_RUNTIME_CHECK = r'''"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const {isDeepStrictEqual} = require("node:util");
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
function run(source, input) {
  const sandbox = Object.create(null);
  sandbox.__input = JSON.parse(JSON.stringify(input));
  const context = vm.createContext(sandbox, {codeGeneration:{strings:false,wasm:false}});
  new vm.Script('"use strict";\n' + source + '\n;if(typeof solve!=="function") throw new Error("solve(input) is missing");')
    .runInContext(context, {timeout:750});
  const value = new vm.Script('__result = solve(__input)').runInContext(context, {timeout:750});
  if (value && typeof value.then === "function") throw new Error("solve(input) must be synchronous");
  return JSON.parse(JSON.stringify(value));
}
for (const fixture of spec.fixtures) {
  const reference = run(spec.reference_code, fixture.input);
  if (!isDeepStrictEqual(reference, fixture.expected)) {
    throw new Error(`reference mismatch for ${fixture.name}: ${JSON.stringify(reference)} != ${JSON.stringify(fixture.expected)}`);
  }
  run(spec.starter_code, fixture.input);
}
process.stdout.write("ok");
'''
