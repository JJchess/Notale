"""Backplate backend comparison is reproducible and honest about cost."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pytest

from notale.style_studio.bench import aggregate, run_bench
from notale.style_studio.paths import USER_ROOT_ENV
from notale.tools.media_backends import ImageResult
from notale.utils.retry import PermanentError, RetryPolicy


def _png(width: int = 64, height: int = 36) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    # Deliberately noisy so the validated raster exceeds the production floor.
    raw = b"".join(
        b"\x00"
        + b"".join(bytes((x % 256, y % 256, (x * y) % 256)) for x in range(width))
        for y in range(height)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, level=0))
        + chunk(b"IEND", b"")
    )


class _Backend:
    def __init__(self, name: str, seen: list[str], *, fail_once: bool = False) -> None:
        self.name = name
        self.seen = seen
        self.fail_once = fail_once
        self.calls = 0

    async def generate(self, request, *, client_factory):
        del client_factory
        self.calls += 1
        self.seen.append(request.provider_prompt())
        if self.fail_once and self.calls == 1:
            raise RuntimeError("503 temporarily unavailable")
        return ImageResult(
            data=_png(),
            model=f"fake-{self.name}",
            usage={"cost": 0.125} if self.name == "priced" else {"tokens": 99},
        )


@pytest.mark.asyncio
async def test_bench_uses_one_contract_writes_real_extensions_and_reports_cost(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv(USER_ROOT_ENV, str(tmp_path / "packs"))
    seen: list[str] = []
    engines = {
        "priced": _Backend("priced", seen, fail_once=True),
        "unknown-cost": _Backend("unknown-cost", seen),
    }

    payload = await run_bench(
        pack_id="swiss-modern",
        composition_id="argument-split",
        backends=("priced", "unknown-cost"),
        repeats=1,
        run_id="test-run",
        backend_factory=engines.__getitem__,
        retry_policy=RetryPolicy(
            timeout_sec=1,
            backoff_base_sec=0,
            backoff_cap_sec=0,
            jitter=0,
        ),
    )

    assert payload["ok"] is True
    assert len(set(seen)) == 1
    assert "Avoid:" in seen[0]
    assert payload["summary"]["priced"]["total_attempts"] == 2
    assert payload["summary"]["priced"]["total_cost"] == 0.125
    assert payload["summary"]["priced"]["cost_source"] == "usage.cost"
    assert payload["summary"]["unknown-cost"]["total_cost"] is None
    out = Path(payload["out_dir"])
    assert (out / "priced-01.png").is_file()
    assert (out / "bench.json").is_file()
    report = (out / "report.md").read_text(encoding="utf-8")
    assert "Cost is reported only" in report
    assert "![priced repeat 1](priced-01.png)" in report
    assert "Review manually for readable text" in report


@pytest.mark.asyncio
async def test_bench_records_a_backend_failure_without_masking_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv(USER_ROOT_ENV, str(tmp_path / "packs"))

    class Broken:
        name = "broken"

        async def generate(self, request, *, client_factory):
            del request, client_factory
            raise PermanentError("not configured", error_class="auth")

    payload = await run_bench(
        pack_id="swiss-modern",
        composition_id="argument-split",
        backends=("broken",),
        run_id="failure",
        backend_factory=lambda _: Broken(),
        retry_policy=RetryPolicy(timeout_sec=1, jitter=0),
    )

    assert payload["ok"] is False
    assert payload["summary"]["broken"]["success_rate"] == 0
    assert payload["attempts"][0]["error_class"] == "auth"


@pytest.mark.asyncio
async def test_bench_rejects_unknown_composition_before_creating_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv(USER_ROOT_ENV, str(tmp_path / "packs"))
    with pytest.raises(ValueError, match="unknown composition"):
        await run_bench(
            pack_id="swiss-modern",
            composition_id="not-real",
            backends=("seedream",),
            run_id="unused",
        )
    assert not (tmp_path / "packs" / "_build").exists()


def test_aggregate_interpolates_latency_and_counts_bytes():
    from notale.style_studio.bench import BenchAttempt

    summary = aggregate(
        [
            BenchAttempt("a", 1, True, 1.0, bytes=10),
            BenchAttempt("a", 2, True, 3.0, bytes=20),
        ]
    )["a"]
    assert summary["p50_sec"] == 2.0
    assert summary["p95_sec"] == 2.9
    assert summary["total_bytes"] == 30
