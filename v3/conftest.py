"""让 tests/ 能直接 import v3 根目录下的模块（llm 等）。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
