#!/usr/bin/env python3
"""Sandbox-side client for the harness-owned Builder Check broker."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path


def parser() -> argparse.ArgumentParser:
    out = argparse.ArgumentParser(
        prog="workflow-check",
        description="Run the host Builder Check for one page and return its rendered report.",
    )
    out.add_argument("page")
    out.add_argument("--shot", action="store_true")
    out.add_argument("--shot-dir", default=".codex-shots")
    out.add_argument("--wait", type=int, default=1200)
    out.add_argument("--after", action="append", default=[])
    out.add_argument("--crop")
    out.add_argument("--zoom", type=int, default=2)
    out.add_argument("--json", action="store_true")
    return out


def main() -> int:
    args = parser().parse_args()
    raw_dir = os.environ.get("WORKFLOW_CHECK_DIR")
    if not raw_dir:
        print("workflow-check: host check broker is unavailable", file=sys.stderr)
        return 2
    root = Path(raw_dir)
    requests = root / "requests"
    responses = root / "responses"
    requests.mkdir(parents=True, exist_ok=True)
    responses.mkdir(parents=True, exist_ok=True)
    request_id = uuid.uuid4().hex
    request = {
        "id": request_id,
        "page": args.page,
        "shot": args.shot,
        "shot_dir": args.shot_dir,
        "wait": args.wait,
        "after": args.after,
        "crop": args.crop,
        "zoom": args.zoom,
        "json": args.json,
    }
    temporary = requests / f".{request_id}.tmp"
    destination = requests / f"{request_id}.json"
    temporary.write_text(json.dumps(request, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, destination)

    response = responses / f"{request_id}.json"
    deadline = time.monotonic() + int(os.environ.get("WORKFLOW_CHECK_TIMEOUT", "300"))
    while time.monotonic() < deadline:
        if response.is_file():
            try:
                result = json.loads(response.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                print(f"workflow-check: invalid broker response: {error}", file=sys.stderr)
                return 2
            if result.get("stdout"):
                print(result["stdout"], end="" if result["stdout"].endswith("\n") else "\n")
            if result.get("stderr"):
                print(result["stderr"], file=sys.stderr, end="" if result["stderr"].endswith("\n") else "\n")
            return int(result.get("returncode", 2))
        time.sleep(0.1)
    print("workflow-check: host check timed out", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
