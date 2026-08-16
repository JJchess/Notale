"""Compare image backends against one identical backplate contract."""

from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import math
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

from notale.style_studio.backplate import (
    ImageChannel,
    SafeArea,
    backplate_prompt,
    validate_safe_areas,
)
from notale.style_studio.paths import style_build_gallery_root
from notale.style_studio.registry import get_pack
from notale.tools.media import inspect_image
from notale.tools.media_backends import (
    ImageBackend,
    ImageRequest,
    available_backends,
    get_backend,
)
from notale.utils.config import get_config
from notale.utils.retry import RetryPolicy, run_with_retry

_MEDIA_CONFIG = get_config().media
_SAFE_RUN_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$")

DEFAULT_SAFE_AREAS = (
    SafeArea("title", 0.06, 0.10, 0.52, 0.22),
    SafeArea("cell", 0.06, 0.72, 0.42, 0.16),
)


@dataclass
class BenchAttempt:
    backend: str
    repeat: int
    ok: bool
    duration_sec: float
    bytes: int = 0
    mime_type: str = ""
    width: int = 0
    height: int = 0
    model: str = ""
    output: str = ""
    cost: float | None = None
    cost_source: str = "unavailable"
    error: str = ""
    error_class: str = ""
    attempts: int = 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "backend": self.backend,
            "repeat": self.repeat,
            "ok": self.ok,
            "duration_sec": round(self.duration_sec, 3),
            "bytes": self.bytes,
            "mime_type": self.mime_type,
            "width": self.width,
            "height": self.height,
            "model": self.model,
            "output": self.output,
            "cost": self.cost,
            "cost_source": self.cost_source,
            "error": self.error,
            "error_class": self.error_class,
            "attempts": self.attempts,
        }


def percentile(values: Sequence[float], fraction: float) -> float:
    """Return an interpolated percentile without a statistics dependency."""

    if not values:
        return 0.0
    ordered = sorted(float(value) for value in values)
    position = max(0.0, min(1.0, fraction)) * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return round(ordered[lower], 3)
    value = ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
    return round(value, 3)


def _usage_cost(usage: dict[str, Any]) -> tuple[float | None, str]:
    """Trust only the provider's explicit ``usage.cost`` field."""

    raw = usage.get("cost")
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw), "usage.cost"
    return None, "unavailable"


def aggregate(attempts: Sequence[BenchAttempt]) -> dict[str, Any]:
    by_backend: dict[str, list[BenchAttempt]] = {}
    for attempt in attempts:
        by_backend.setdefault(attempt.backend, []).append(attempt)
    summary: dict[str, Any] = {}
    for backend, items in by_backend.items():
        good = [item for item in items if item.ok]
        durations = [item.duration_sec for item in good]
        costs = [item.cost for item in good if item.cost is not None]
        summary[backend] = {
            "runs": len(items),
            "ok": len(good),
            "failed": len(items) - len(good),
            "success_rate": round(len(good) / len(items), 4) if items else 0.0,
            "p50_sec": percentile(durations, 0.50),
            "p95_sec": percentile(durations, 0.95),
            "total_attempts": sum(item.attempts for item in items),
            "total_bytes": sum(item.bytes for item in good),
            "total_cost": round(sum(costs), 8) if costs else None,
            "cost_source": "usage.cost" if costs else "unavailable",
            "error_classes": sorted(
                {item.error_class for item in items if item.error_class}
            ),
        }
    return summary


def _atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def _atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


async def _one(
    backend_name: str,
    request: ImageRequest,
    out_dir: Path,
    repeat: int,
    *,
    backend_factory: Callable[[str], ImageBackend],
    client_factory: Any,
    retry_policy: RetryPolicy,
) -> BenchAttempt:
    backend = backend_factory(backend_name)
    started = time.monotonic()
    try:
        result, meta = await run_with_retry(
            lambda: backend.generate(request, client_factory=client_factory),
            policy=retry_policy,
        )
        mime, extension, width, height = inspect_image(result.data)
        path = out_dir / f"{backend_name}-{repeat:02d}.{extension}"
        _atomic_bytes(path, result.data)
        cost, cost_source = _usage_cost(result.usage)
        return BenchAttempt(
            backend=backend_name,
            repeat=repeat,
            ok=True,
            duration_sec=time.monotonic() - started,
            bytes=len(result.data),
            mime_type=mime,
            width=width,
            height=height,
            model=result.model,
            output=path.name,
            cost=cost,
            cost_source=cost_source,
            attempts=int(meta.get("attempts", 1)),
        )
    except Exception as exc:  # a failed engine is a bench observation
        return BenchAttempt(
            backend=backend_name,
            repeat=repeat,
            ok=False,
            duration_sec=time.monotonic() - started,
            error=f"{type(exc).__name__}: {exc}"[:300],
            error_class=str(getattr(exc, "error_class", "") or ""),
            attempts=int(getattr(exc, "attempts", 1)),
        )


def _markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Backplate engine bench",
        "",
        f"- Pack: `{payload['pack_id']}`",
        f"- Composition: `{payload['composition_id']}`",
        f"- Prompt SHA-256: `{payload['prompt_sha256']}`",
        f"- Subject: {payload['subject']}",
        "",
        "| Backend | Success | p50 | p95 | Provider attempts | Bytes | Cost |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for backend, item in payload["summary"].items():
        cost = "unavailable" if item["total_cost"] is None else f"{item['total_cost']:.8g}"
        lines.append(
            f"| {backend} | {item['ok']}/{item['runs']} ({item['success_rate']:.0%}) "
            f"| {item['p50_sec']:.3f}s | {item['p95_sec']:.3f}s "
            f"| {item['total_attempts']} | {item['total_bytes']} | {cost} |"
        )
    lines.extend(["", "## Attempts", ""])
    for item in payload["attempts"]:
        verdict = "OK" if item["ok"] else "FAIL"
        detail = (
            f"{item['output']} ({item['width']}×{item['height']})"
            if item["ok"]
            else item["error"]
        )
        lines.append(
            f"- {verdict} `{item['backend']}` repeat {item['repeat']}: "
            f"{item['duration_sec']:.3f}s, {item['attempts']} provider attempt(s), {detail}"
        )
    images = [item for item in payload["attempts"] if item["ok"] and item["output"]]
    if images:
        lines.extend(["", "## Visual contract review", ""])
        for item in images:
            label = f"{item['backend']} repeat {item['repeat']}"
            lines.extend(
                [
                    f"### {label}",
                    "",
                    f"![{label}]({item['output']})",
                    "",
                    "Review manually for readable text, logos/watermarks, text-like panels, "
                    "safe-area calmness, crop behavior, and composition adherence.",
                    "",
                ]
            )
    lines.extend(
        [
            "",
            "> Cost is reported only when a backend returns numeric `usage.cost`; "
            "no price is inferred from tokens, bytes, or model names.",
            "",
        ]
    )
    return "\n".join(lines)


async def run_bench(
    *,
    pack_id: str,
    composition_id: str,
    backends: Sequence[str],
    repeats: int = 1,
    subject: str = "an abstract textured ground for a lecture slide",
    safe_areas: Sequence[SafeArea] = DEFAULT_SAFE_AREAS,
    run_id: str = "",
    backend_factory: Callable[[str], ImageBackend] = get_backend,
    client_factory: Any = None,
    retry_policy: RetryPolicy | None = None,
) -> dict[str, Any]:
    """Send one compiled contract to each backend and persist a comparison."""

    if repeats < 1:
        raise ValueError("repeats must be at least 1")
    names = [str(name).strip() for name in backends if str(name).strip()]
    if not names:
        raise ValueError("at least one backend is required")
    if backend_factory is get_backend:
        unknown = sorted(set(names) - set(available_backends()))
        if unknown:
            raise ValueError(
                f"unknown backends: {unknown}; known: {list(available_backends())}"
            )
    problems = validate_safe_areas(safe_areas)
    if problems:
        raise ValueError("; ".join(problems))

    pack = get_pack(pack_id)
    composition = next(
        (item for item in pack.compositions() if item.id == composition_id), None
    )
    if composition is None:
        known = [item.id for item in pack.compositions()]
        raise ValueError(
            f"unknown composition {composition_id!r} for {pack.id}; known: {known}"
        )
    channel = ImageChannel(
        pack_id=pack.id,
        style_prose=pack.description() or pack.label,
        style_anchor=pack.prompt_compile().get("style_anchor", ""),
        chrome_dialect=str(pack.chrome_rules().get("dialect") or ""),
        radius_scale=pack.radius_scale(),
        density_default=pack.density_default,
        palette=pack.notale_tokens(),
        forbidden=list(pack.hard_negatives()),
    )
    prompt, negative = backplate_prompt(
        channel=channel,
        subject=subject,
        safe_areas=safe_areas,
        composition=composition,
    )
    request = ImageRequest(prompt=prompt, negative_prompt=negative)

    resolved_run_id = run_id.strip() or dt.datetime.now(dt.timezone.utc).strftime(
        "%Y%m%dT%H%M%S%fZ"
    )
    if _SAFE_RUN_ID.fullmatch(resolved_run_id) is None:
        raise ValueError("run_id must contain only letters, digits, dot, dash, or underscore")
    destination = style_build_gallery_root() / "bench" / resolved_run_id
    if destination.exists():
        raise FileExistsError(f"bench output already exists: {destination}")
    destination.mkdir(parents=True)

    policy = retry_policy or RetryPolicy(timeout_sec=_MEDIA_CONFIG.request_timeout_sec)
    attempts: list[BenchAttempt] = []
    # Round-robin order avoids giving the first backend every warm-cache run.
    for repeat in range(1, repeats + 1):
        for backend_name in names:
            attempts.append(
                await _one(
                    backend_name,
                    request,
                    destination,
                    repeat,
                    backend_factory=backend_factory,
                    client_factory=client_factory,
                    retry_policy=policy,
                )
            )

    summary = aggregate(attempts)
    payload = {
        "schema_version": "notale_backplate_bench.v1",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "pack_id": pack.id,
        "composition_id": composition.id,
        "subject": subject,
        "safe_areas": [area.__dict__ for area in safe_areas],
        "backends": names,
        "repeats": repeats,
        "prompt_sha256": hashlib.sha256(
            request.provider_prompt().encode("utf-8")
        ).hexdigest(),
        "negative_prompt_sha256": hashlib.sha256(negative.encode("utf-8")).hexdigest(),
        "summary": summary,
        "attempts": [item.to_dict() for item in attempts],
        "ok": all(item.ok for item in attempts),
        "out_dir": str(destination),
        "report": str(destination / "report.md"),
    }
    _atomic_text(
        destination / "bench.json",
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    )
    _atomic_text(destination / "report.md", _markdown(payload))
    return payload


def run_bench_sync(**kwargs: Any) -> dict[str, Any]:
    return asyncio.run(run_bench(**kwargs))
