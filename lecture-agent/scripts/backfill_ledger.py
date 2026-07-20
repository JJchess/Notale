"""一次性回填历史实验产物到 results/ledger.jsonl。

扫两类既有产物：
  - results/matrix_*/**/deck.json（配套 result.json，取 model/topic/tokens/耗时/gate）
  - data/corpus/*.lecture.json（单次生成产物，没有 result.json，能力画像仍可从 deck 本身数出）

历史产物无法精确重建当时的 agent 代码指纹 —— 诚实标 `code.label="historical"`、
`agent_fingerprint=None`，不去凭空编造；往后 `container.run_generation` 记的新记录才有精确指纹。

幂等：`run_id` 由来源路径派生（确定性），重复跑本脚本不会在账本里堆重复行。

用法：
  uv run python scripts/backfill_ledger.py
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from lecture_agent.adapters.store import LedgerStore
from lecture_agent.domain.telemetry import profile_deck
from lecture_agent.schema import CodeMarker, Cost, ExperimentRecord

ROOT = Path(__file__).resolve().parent.parent


def _run_id_of(path: Path) -> str:
    rel = path.resolve().relative_to(ROOT).as_posix()
    return f"backfill:{rel}"


def _record_from_matrix(deck_path: Path, existing_ids: set[str]) -> ExperimentRecord | None:
    run_id = _run_id_of(deck_path)
    if run_id in existing_ids:
        return None
    result_path = deck_path.with_name("result.json")
    doc: dict[str, Any] = json.loads(deck_path.read_text(encoding="utf-8"))
    rec: dict[str, Any] = (
        json.loads(result_path.read_text(encoding="utf-8")) if result_path.exists() else {}
    )
    usage = rec.get("usage") or {}
    mtime = deck_path.stat().st_mtime
    return ExperimentRecord(
        run_id=run_id,
        ts=datetime.fromtimestamp(mtime).isoformat(),
        source="backfill",
        code=CodeMarker(label="historical"),
        model=rec.get("model"),
        llm_cfg=rec.get("config"),
        generator_cfg="matrix",
        theme=doc.get("theme"),
        topic=rec.get("topic"),
        pages_target=rec.get("pages_target"),
        ok=bool(rec.get("ok", True)),
        elapsed_s=rec.get("elapsed_s"),
        pages=rec.get("pages"),
        blocks=rec.get("blocks"),
        dropped=[] if isinstance(rec.get("dropped"), int) else list(rec.get("dropped") or []),
        errors=rec.get("error_samples") or [],
        warnings=[],
        perspectives=rec.get("perspectives"),
        cost=Cost(**usage) if usage else Cost(),
        profile=profile_deck(doc),
    )


def _record_from_corpus(deck_path: Path, existing_ids: set[str]) -> ExperimentRecord | None:
    run_id = _run_id_of(deck_path)
    if run_id in existing_ids:
        return None
    doc: dict[str, Any] = json.loads(deck_path.read_text(encoding="utf-8"))
    mtime = deck_path.stat().st_mtime
    return ExperimentRecord(
        run_id=run_id,
        ts=datetime.fromtimestamp(mtime).isoformat(),
        source="backfill",
        code=CodeMarker(label="historical"),
        theme=doc.get("theme"),
        topic=doc.get("title"),
        pages=len(doc.get("scenes", [])),
        blocks=sum(len(s.get("blocks") or []) for s in doc.get("scenes", [])),
        profile=profile_deck(doc),
    )


def main() -> None:
    ledger = LedgerStore(ROOT / "results" / "ledger.jsonl")
    existing_ids = {r.run_id for r in ledger.read_all()}

    added = 0
    for deck_path in sorted((ROOT / "results").glob("matrix_*/**/deck.json")):
        rec = _record_from_matrix(deck_path, existing_ids)
        if rec is not None:
            ledger.append(rec)
            existing_ids.add(rec.run_id)
            added += 1

    for deck_path in sorted((ROOT / "data" / "corpus").glob("*.lecture.json")):
        rec = _record_from_corpus(deck_path, existing_ids)
        if rec is not None:
            ledger.append(rec)
            existing_ids.add(rec.run_id)
            added += 1

    print(f"✓ 回填 {added} 条实验记录 → {ledger.path}")


if __name__ == "__main__":
    main()
