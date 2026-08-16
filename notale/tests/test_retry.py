"""Retry taxonomy. The 429 ladder is the whole reason this exists."""

from __future__ import annotations

import asyncio

import pytest

from notale.utils.retry import (
    PermanentError,
    RetryPolicy,
    TransientError,
    classify_exception,
    classify_status,
    run_with_retry,
)


@pytest.mark.parametrize(
    "code,cls,error_class",
    [
        (429, TransientError, "rate_limit"),
        (500, TransientError, "server"),
        (503, TransientError, "server"),
        (408, TransientError, "timeout"),
        (401, PermanentError, "auth"),
        (403, PermanentError, "auth"),
        (400, PermanentError, "client"),
        (404, PermanentError, "client"),
    ],
)
def test_status_taxonomy(code, cls, error_class):
    error = classify_status(code, "body")
    assert isinstance(error, cls)
    assert error.error_class == error_class


def test_rate_limit_waits_far_longer_than_a_server_error():
    """Lumping 429 in with 5xx is what kills a run the moment a provider throttles."""
    policy = RetryPolicy(jitter=0.0)
    assert policy.sleep_for_attempt(1, "rate_limit") == 20.0
    assert policy.sleep_for_attempt(1, "server") == 2.0
    assert policy.sleep_for_attempt(4, "rate_limit") == 120.0  # capped
    assert policy.sleep_for_attempt(4, "server") == 8.0


def test_concurrency_limit_text_is_read_as_a_rate_limit():
    """The exact message that cost ten pages in one run."""
    error = classify_exception(RuntimeError("Concurrency limit exceeded for account"))
    assert isinstance(error, TransientError)
    assert error.error_class == "rate_limit"


def test_upstream_5xx_text_is_transient():
    assert isinstance(classify_exception(RuntimeError("503 temporarily unavailable")), TransientError)
    overloaded = classify_exception(
        RuntimeError("Our servers are currently overloaded. Please try again later.")
    )
    assert isinstance(overloaded, TransientError)
    assert overloaded.error_class == "server"


def test_client_timeout_and_connection_errors_are_transient():
    class APIConnectionError(RuntimeError):
        pass

    class APITimeoutError(RuntimeError):
        pass

    assert classify_exception(APIConnectionError("Connection error")).error_class == "network"
    assert classify_exception(APITimeoutError("Request timed out")).error_class == "timeout"


@pytest.mark.asyncio
async def test_transient_failure_is_retried_then_succeeds():
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise classify_status(503, "boom")
        return "ok"

    result, meta = await run_with_retry(
        flaky, policy=RetryPolicy(backoff_base_sec=0, backoff_cap_sec=0, jitter=0.0)
    )
    assert result == "ok"
    assert meta["attempts"] == 3 and meta["ok"] is True


@pytest.mark.asyncio
async def test_permanent_failure_is_not_retried():
    calls = {"n": 0}

    async def denied():
        calls["n"] += 1
        raise classify_status(401, "nope")

    with pytest.raises(PermanentError):
        await run_with_retry(denied, policy=RetryPolicy(backoff_base_sec=0, jitter=0.0))
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_attempts_are_bounded():
    calls = {"n": 0}

    async def always():
        calls["n"] += 1
        raise classify_status(429, "slow down")

    with pytest.raises(TransientError):
        await run_with_retry(
            always,
            policy=RetryPolicy(max_attempts=2, rate_limit_base_sec=0, rate_limit_cap_sec=0, jitter=0.0),
        )
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_default_rate_limit_budget_uses_full_long_ladder(monkeypatch):
    calls = 0
    sleeps: list[float] = []

    async def no_wait(delay):
        sleeps.append(delay)

    async def throttled():
        nonlocal calls
        calls += 1
        raise classify_status(429, "slow down")

    monkeypatch.setattr(asyncio, "sleep", no_wait)
    with pytest.raises(TransientError) as caught:
        await run_with_retry(throttled, policy=RetryPolicy(jitter=0))
    assert calls == 5
    assert sleeps == [20, 40, 80, 120]
    assert caught.value.attempts == 5


@pytest.mark.asyncio
async def test_default_server_budget_is_three_attempts(monkeypatch):
    calls = 0
    sleeps: list[float] = []

    async def no_wait(delay):
        sleeps.append(delay)

    async def unavailable():
        nonlocal calls
        calls += 1
        raise classify_status(503, "offline")

    monkeypatch.setattr(asyncio, "sleep", no_wait)
    with pytest.raises(TransientError):
        await run_with_retry(unavailable, policy=RetryPolicy(jitter=0))
    assert calls == 3
    assert sleeps == [2, 4]


@pytest.mark.asyncio
async def test_per_attempt_timeout_is_retried(monkeypatch):
    calls = 0

    async def no_wait(_delay):
        return None

    async def hangs():
        nonlocal calls
        calls += 1
        await asyncio.Event().wait()

    monkeypatch.setattr(asyncio, "sleep", no_wait)
    with pytest.raises(TransientError) as caught:
        await run_with_retry(
            hangs,
            policy=RetryPolicy(timeout_sec=0.001, max_attempts=2, jitter=0),
        )
    assert calls == 2
    assert caught.value.error_class == "timeout"


@pytest.mark.asyncio
async def test_cancellation_is_never_retried():
    calls = 0

    async def cancelled():
        nonlocal calls
        calls += 1
        raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        await run_with_retry(cancelled)
    assert calls == 1
