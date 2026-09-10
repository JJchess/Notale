#!/usr/bin/env bash
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${CODEX_KIT_PYTHON:-python3}"
if [[ -d "$KIT/.deps" ]]; then export PYTHONPATH="$KIT/.deps${PYTHONPATH:+:$PYTHONPATH}"; fi
exec "$PYTHON" "$KIT/run.py" "$@"
