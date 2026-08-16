"""Transient-vs-permanent failure taxonomy and a retry runner.

Ported from deckbase ``or_images/retry_policy.py``, which is pure stdlib and has
nothing image-specific in it. notale had no retry at all, and paid for it: a
20-page run lost ten pages to "Concurrency limit exceeded" and 429s in a single
afternoon.

The detail that matters and that hand-rolled retries usually miss: 429 is not
just another 4xx. deckbase's own comment records that lumping it in killed every
concurrent run the moment the provider throttled. It gets its own, much longer
backoff ladder here.
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

T = TypeVar("T")


class PermanentError(RuntimeError):
    """Retrying will not help: auth, a bad request, a missing model."""

    def __init__(self, message: str, *, error_class: str = "permanent") -> None:
        super().__init__(message)
        self.error_class = error_class


class TransientError(RuntimeError):
    """Worth retrying: rate limits, timeouts, upstream 5xx."""

    def __init__(self, message: str, *, error_class: str = "transient") -> None:
        super().__init__(message)
        self.error_class = error_class


@dataclass(frozen=True)
class RetryPolicy:
    timeout_sec: float = 150.0
    # Overall budget. Rate limits may use all five; ordinary transient failures
    # are capped separately at three. An explicit smaller max_attempts remains
    # an upper bound for every class.
    max_attempts: int = 5
    transient_max_attempts: int = 3
    backoff_base_sec: float = 2.0
    backoff_cap_sec: float = 8.0
    # A throttle needs to be waited out, not hammered. Same reason deckbase keeps
    # this ladder an order of magnitude longer than the 5xx one.
    rate_limit_base_sec: float = 20.0
    rate_limit_cap_sec: float = 120.0
    jitter: float = 0.0

    def attempt_limit(self, error_class: str) -> int:
        """Return the total attempt budget for one classified failure."""

        if error_class == "rate_limit":
            return max(1, self.max_attempts)
        return max(1, min(self.max_attempts, self.transient_max_attempts))

    def sleep_for_attempt(self, attempt: int, error_class: str) -> float:
        if error_class == "rate_limit":
            base, cap = self.rate_limit_base_sec, self.rate_limit_cap_sec
        else:
            base, cap = self.backoff_base_sec, self.backoff_cap_sec
        delay = min(cap, base * (2 ** max(0, attempt - 1)))
        if self.jitter:
            delay *= 1.0 + random.uniform(-self.jitter, self.jitter)
        return max(0.0, delay)


def classify_status(code: int, body: str = "") -> Exception:
    """Map an HTTP status onto the taxonomy. 429 is deliberately its own class."""
    text = f"HTTP {code}: {body[:200]}"
    if code == 429:
        return TransientError(text, error_class="rate_limit")
    if code in (401, 403):
        return PermanentError(text, error_class="auth")
    if code == 408:
        return TransientError(text, error_class="timeout")
    if 400 <= code < 500:
        return PermanentError(text, error_class="client")
    if code >= 500:
        return TransientError(text, error_class="server")
    return PermanentError(text)


def classify_exception(exc: BaseException) -> Exception:
    """Best-effort taxonomy for an arbitrary client exception."""
    if isinstance(exc, (PermanentError, TransientError)):
        return exc
    status = getattr(exc, "status_code", None) or getattr(
        getattr(exc, "response", None), "status_code", None
    )
    if isinstance(status, int):
        return classify_status(status, str(exc))
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return TransientError(str(exc), error_class="timeout")
    if isinstance(exc, OSError):
        return TransientError(str(exc), error_class="network")
    text = str(exc).lower()
    class_name = type(exc).__name__.lower()
    if "rate limit" in text or "concurrency limit" in text or "429" in text:
        return TransientError(str(exc), error_class="rate_limit")
    if "timeout" in class_name or "timed out" in text:
        return TransientError(str(exc), error_class="timeout")
    if any(marker in class_name for marker in ("connection", "network", "protocol", "readerror", "writeerror")):
        return TransientError(str(exc), error_class="network")
    if any(
        marker in text
        for marker in (
            "connection error",
            "connection reset",
            "temporarily",
            "unavailable",
            "overloaded",
            "try again later",
            "502",
            "503",
        )
    ):
        return TransientError(str(exc), error_class="server")
    return PermanentError(str(exc))


async def run_with_retry(
    operation: Callable[[], Awaitable[T]],
    *,
    policy: RetryPolicy | None = None,
    on_retry: Callable[[int, str, float], None] | None = None,
) -> tuple[T, dict[str, Any]]:
    """Run ``operation``, retrying transient failures. Returns (result, meta)."""
    policy = policy or RetryPolicy()
    started = time.monotonic()
    last: BaseException | None = None
    attempt = 0
    maximum = max(policy.max_attempts, 1)
    for attempt in range(1, maximum + 1):
        try:
            async with asyncio.timeout(policy.timeout_sec):
                result = await operation()
            return result, {
                "ok": True,
                "attempts": attempt,
                "t_total_sec": round(time.monotonic() - started, 3),
                "error_class": "",
            }
        except asyncio.CancelledError:
            # Cancellation is control flow from the caller, never an upstream
            # failure. Retrying it can make shutdowns and run timeouts hang.
            raise
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException as exc:  # noqa: BLE001 — classified immediately below
            classified = classify_exception(exc)
            limit = policy.attempt_limit(classified.error_class)
            if isinstance(classified, PermanentError):
                # Preserve ordinary application errors (KeyError, ValueError,
                # etc.) so adding retry does not rewrite callers' contracts.
                has_http_status = isinstance(
                    getattr(exc, "status_code", None)
                    or getattr(getattr(exc, "response", None), "status_code", None),
                    int,
                )
                last = classified if isinstance(exc, PermanentError) or has_http_status else exc
                break
            last = classified
            if attempt >= limit:
                break
            delay = policy.sleep_for_attempt(attempt, classified.error_class)
            if on_retry is not None:
                on_retry(attempt, classified.error_class, delay)
            await asyncio.sleep(delay)
    assert last is not None
    setattr(last, "attempts", attempt)
    setattr(last, "t_total_sec", round(time.monotonic() - started, 3))
    raise last
