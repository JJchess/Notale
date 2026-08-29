#!/usr/bin/env python3
"""Run the existing read-only illustration adapter from the isolated workflow lab."""

import os
import sys
from pathlib import Path


target = Path(__file__).resolve().parents[3] / "vendor/skills/make-illustration/scripts/gen.py"
if not target.is_file():
    raise SystemExit(f"Legacy illustration adapter not found: {target}")
os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])
