#!/usr/bin/env python3
"""Run the existing read-only media adapter from the isolated workflow lab."""

import os
import sys
from pathlib import Path


target = Path(__file__).resolve().parents[5] / "vendor/skills/web-media-getter/webmedia.py"
if not target.is_file():
    raise SystemExit(f"Legacy media adapter not found: {target}")
os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])

