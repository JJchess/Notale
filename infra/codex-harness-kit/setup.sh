#!/usr/bin/env bash
# Local dependency directory also works with relocated Conda Pythons whose venv is broken.
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${CODEX_KIT_PYTHON:-python3}" -m pip install --target "$KIT/.deps" -r "$KIT/requirements.txt"
