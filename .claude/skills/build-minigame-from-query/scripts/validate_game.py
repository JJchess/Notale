#!/usr/bin/env python3
"""Validate the static contract of a generated native Web Component mini-game."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from pathlib import Path


PLACEHOLDER = re.compile(r"__[A-Z0-9_]+__")
TAG = re.compile(r"customElements\.define\(\s*[\"']([a-z0-9-]+)[\"']")
REMOTE = re.compile(r"https?://|[\"']//[^\"']+", re.IGNORECASE)


def require(pattern: str, text: str, message: str, failures: list[str]) -> None:
    if re.search(pattern, text, re.MULTILINE) is None:
        failures.append(message)


def validate(root: Path) -> list[str]:
    failures: list[str] = []
    index_path = root / "index.html"
    component_path = root / "game-component.js"
    for path in (index_path, component_path):
        if not path.is_file():
            failures.append(f"missing required file: {path.name}")
    if failures:
        return failures

    index = index_path.read_text(encoding="utf-8")
    component = component_path.read_text(encoding="utf-8")
    combined = index + "\n" + component

    leftovers = sorted(set(PLACEHOLDER.findall(combined)))
    if leftovers:
        failures.append(f"unresolved placeholders: {', '.join(leftovers)}")
    if REMOTE.search(combined):
        failures.append("remote URL or protocol-relative dependency found")
    if re.search(r"\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(", component):
        failures.append("runtime network API found")
    if re.search(r"window\.addEventListener\(\s*[\"']scroll[\"']", component):
        failures.append("window scroll listener found")

    tag_match = TAG.search(component)
    if tag_match is None:
        failures.append("customElements.define() with a kebab-case tag is required")
    else:
        tag_name = tag_match.group(1)
        if "-" not in tag_name:
            failures.append("custom-element tag must contain a hyphen")
        if re.search(rf"<{re.escape(tag_name)}(?:\s|>)", index) is None:
            failures.append(f"demo host does not mount <{tag_name}>")

    require(r"attachShadow\(\s*\{\s*mode:\s*[\"']open[\"']", component,
            "open Shadow Root is required", failures)
    for method in ("start", "reset", "getState"):
        require(rf"^\s+{method}\s*\(", component,
                f"public {method}() method is required", failures)
    for event_name in ("game-start", "game-progress", "game-complete", "game-reset"):
        if event_name not in component:
            failures.append(f"missing lifecycle event: {event_name}")

    if "aria-live" not in component:
        failures.append("aria-live status is required")
    if ":focus-visible" not in component:
        failures.append("visible focus styling is required")
    if "prefers-reduced-motion" not in component:
        failures.append("reduced-motion handling is required")
    require(r"addEventListener\(\s*[\"']keydown[\"']", component,
            "keyboard interaction handler is required", failures)
    require(r"addEventListener\(\s*[\"']click[\"']", component,
            "pointer or touch-compatible click handler is required", failures)

    node = shutil.which("node")
    if node:
        result = subprocess.run(
            [node, "--check", str(component_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            failures.append(f"JavaScript syntax check failed: {detail[-1] if detail else 'unknown error'}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Generated game directory.")
    args = parser.parse_args()
    try:
        failures = validate(args.directory.resolve())
    except (OSError, UnicodeError) as error:
        print(f"ERROR: {error}")
        return 1
    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("PASS: native Web Component mini-game contract is complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
