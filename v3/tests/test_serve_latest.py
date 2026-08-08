import os
from pathlib import Path

from serve_latest import deck_url, newest_deck


def write_deck(root: Path, run_id: str, mtime_ns: int) -> Path:
    deck = root / "runs" / run_id / "deck.html"
    deck.parent.mkdir(parents=True)
    deck.write_text("<!doctype html>", encoding="utf-8")
    os.utime(deck, ns=(mtime_ns, mtime_ns))
    return deck


def test_newest_deck_ignores_incomplete_runs(tmp_path: Path) -> None:
    older = write_deck(tmp_path, "older", 1_000_000_000)
    newer = write_deck(tmp_path, "newer", 2_000_000_000)
    (tmp_path / "runs" / "incomplete").mkdir()

    assert newest_deck(tmp_path) == newer
    assert newest_deck(tmp_path) != older


def test_deck_url_is_root_relative_and_quoted(tmp_path: Path) -> None:
    deck = write_deck(tmp_path, "含 空格", 1_000_000_000)

    assert deck_url(deck, tmp_path) == "/runs/%E5%90%AB%20%E7%A9%BA%E6%A0%BC/deck.html"


def test_newest_deck_returns_none_without_completed_run(tmp_path: Path) -> None:
    assert newest_deck(tmp_path) is None
