"""Deterministic editor/Worker/Run/Reset renderer for create_code_runtime."""

from __future__ import annotations

import html
import json
from pathlib import Path

from notale.tools.create_code_runtime.models import CodeRuntimeSpec


_ASSET_ROOT = Path(__file__).resolve().parent / "assets"


def _script_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def render_code_runtime_fragment(spec: CodeRuntimeSpec, *, language: str) -> str:
    template = (_ASSET_ROOT / "code-runtime.html.tmpl").read_text(encoding="utf-8")
    chinese = language.lower().startswith("zh") or any("\u4e00" <= c <= "\u9fff" for c in language)
    labels = {
        "run": "运行" if chinese else "Run",
        "reset": "重置" if chinese else "Reset",
        "tests": "测试" if chinese else "Tests",
        "ready": "运行 starter code" if chinese else "Running starter code",
        "passed": "全部通过" if chinese else "All tests passed",
        "failed": "仍有测试未通过" if chinese else "Some tests still fail",
        "timeout": "执行超时" if chinese else "Execution timed out",
    }
    replacements = {
        "__NOTALE_TITLE__": html.escape(spec.title),
        "__NOTALE_INSTRUCTION__": html.escape(spec.instruction),
        "__NOTALE_STARTER__": _script_json(spec.starter_code),
        "__NOTALE_FIXTURES__": _script_json([item.runtime_payload() for item in spec.fixtures]),
        "__NOTALE_LABELS__": _script_json(labels),
        "__NOTALE_RUN_LABEL__": labels["run"],
        "__NOTALE_RESET_LABEL__": labels["reset"],
        "__NOTALE_TESTS_LABEL__": labels["tests"],
    }
    for source, target in replacements.items():
        template = template.replace(source, target)
    return template
