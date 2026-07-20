"""零依赖 .env 加载器（不引 python-dotenv，守住最小依赖/离线原则）。

统一密钥文件放在**项目根** `lecture-agent/.env`（挨着 pyproject.toml；所有读 key 的消费者都在本包内）。
组合根 container.py 启动时调用 load_env()，故跑生成前不必再手动 `source .env`。

约定：**不覆盖已存在的环境变量**（`os.environ.setdefault`）——即真实环境里显式设过的值优先，
.env 只补空缺。这样 CI/临时 `KEY=... cmd` 覆盖仍生效，文件只作默认兜底。
"""

from __future__ import annotations

import os
from pathlib import Path


def default_env_path() -> Path:
    """项目根的 .env：utils/env.py → lecture_agent/ → lecture-agent/（根）/.env。"""
    return Path(__file__).resolve().parents[2] / ".env"


def load_env(dotenv_path: str | Path | None = None) -> None:
    """把 .env 里的 KEY=VALUE 灌进 os.environ（已存在的不覆盖）。文件不存在则静默跳过。"""
    p = Path(dotenv_path) if dotenv_path else default_env_path()
    if not p.is_file():
        return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, val)
