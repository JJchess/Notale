"""ProposalStore（fs）—— 实现 ports.ProposalQueue。

**只写 results/proposals/**，绝不碰 skills/（支柱1：改生产契约必须人过 evolve 闸）。
id = 提案内容的 sha1（确定性，无 uuid/时间戳 → 可复现）。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def _pid(proposal: dict[str, Any]) -> str:
    blob = json.dumps(proposal, ensure_ascii=False, sort_keys=True)
    return "p_" + hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]


class ProposalStore:
    def __init__(self, root: str | Path = "results/proposals") -> None:
        self.root = Path(root)

    def enqueue(self, proposal: dict[str, Any]) -> str:
        pid = _pid(proposal)
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / f"{pid}.json").write_text(
            json.dumps({**proposal, "id": pid, "status": "pending"}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return pid

    def pending(self) -> list[dict[str, Any]]:
        if not self.root.exists():
            return []
        return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(self.root.glob("p_*.json"))]
