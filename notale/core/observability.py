"""Per-run structured experiment logs. Logging is fail-open by design."""

from __future__ import annotations

import contextvars
import datetime as dt
import json
import sys
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Any

from notale.utils.config import get_config


class RunEmergencyLimitExceeded(RuntimeError):
    """The shared run crossed a disaster-only time or token circuit breaker."""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


CURRENT_CALL: contextvars.ContextVar[tuple["ExperimentLogger", str] | None] = (
    contextvars.ContextVar("notale_current_call", default=None)
)


class ExperimentLogger:
    """Append-only JSONL recorder plus a concise human-readable runtime log."""

    def __init__(
        self,
        run_dir: Path,
        *,
        config: dict[str, Any],
        run_max_duration_sec: float | None = None,
        run_max_total_tokens: int | None = None,
    ) -> None:
        self.run_dir = Path(run_dir)
        self.logs_dir = self.run_dir / "logs"
        self.session_id = uuid.uuid4().hex
        self.started = time.monotonic()
        self.audit_complete = True
        self.write_errors: list[str] = []
        limits = get_config().governance.emergency_limits
        self.run_max_duration_sec = float(
            run_max_duration_sec or limits.run_max_duration_sec
        )
        self.run_max_total_tokens = int(
            run_max_total_tokens or limits.run_max_total_tokens
        )
        self.emergency_reason = ""
        self.config = config
        self._lock = threading.Lock()
        self._timers: dict[str, float] = {}
        self.metrics: dict[str, Any] = {
            "calls": 0, "promptTokens": 0, "completionTokens": 0,
            "reasoningTokens": 0, "totalTokens": 0, "toolCalls": 0,
            "toolErrors": 0, "retries": 0, "errors": 0, "compacts": 0,
            "maxTurnEvents": 0, "providerCalls": 0, "providerErrors": 0,
            "providerTimeouts": 0,
            "progressEvents": 0, "stalledWorkers": 0,
            "toolErrorKinds": {"external": 0, "validation": 0, "protocol": 0},
            "stages": {}, "agents": {}, "roles": {},
        }
        try:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:  # logging must never break generation
            self._fail(exc)
        self.append("sessions.jsonl", {
            "ts": now(), "kind": "session-start", "sessionId": self.session_id,
            "config": config,
        })
        try:
            (self.run_dir / "profile-snapshot.json").write_text(
                json.dumps({
                    "schemaVersion": 1,
                    "sessionId": self.session_id,
                    "capturedAt": now(),
                    "profile": config,
                }, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
        except Exception as exc:
            self._fail(exc)
        self.summary("run", "session started")

    def enforce_run_limits(self) -> None:
        """Fail only at the high, shared run-level emergency circuit breakers."""
        elapsed = time.monotonic() - self.started
        reason = ""
        if elapsed >= self.run_max_duration_sec:
            reason = f"run activeSec={elapsed:.1f}/{self.run_max_duration_sec:.1f}"
        elif int(self.metrics["totalTokens"]) >= self.run_max_total_tokens:
            reason = f"run tokens={self.metrics['totalTokens']}/{self.run_max_total_tokens}"
        if reason:
            self.emergency_reason = reason
            self.append("agent-traces.jsonl", {
                "ts": now(), "kind": "run-emergency-limit", "reason": reason,
            })
            raise RunEmergencyLimitExceeded(reason)

    def record_progress(self, agent: str, role: str, *, progressed: bool, reason: str) -> None:
        if progressed:
            self.metrics["progressEvents"] += 1
        self.append("agent-traces.jsonl", {
            "ts": now(), "kind": "governance-progress", "agent": agent,
            "role": role, "progressed": progressed, "reason": reason,
        })

    def record_stalled(self, agent: str, role: str, reason: str) -> None:
        self.metrics["stalledWorkers"] += 1
        self.append("agent-traces.jsonl", {
            "ts": now(), "kind": "worker-stalled", "agent": agent,
            "role": role, "reason": reason,
        })

    def _fail(self, exc: BaseException) -> None:
        message = f"{type(exc).__name__}: {exc}"
        self.audit_complete = False
        self.write_errors.append(message)
        print(f"[notale][LOG WARNING] audit incomplete: {message}", file=sys.stderr, flush=True)

    def append(self, filename: str, record: dict[str, Any]) -> None:
        payload = {"sessionId": self.session_id, **record}
        try:
            line = json.dumps(payload, ensure_ascii=False, default=str) + "\n"
            with self._lock:
                with (self.logs_dir / filename).open("a", encoding="utf-8") as handle:
                    handle.write(line)
        except Exception as exc:
            self._fail(exc)

    def summary(self, scope: str, message: str, **fields: Any) -> None:
        suffix = " ".join(f"{k}={v}" for k, v in fields.items())
        line = f"[{now()}] {scope}: {message}" + (f" {suffix}" if suffix else "")
        print(f"[notale] {scope}: {message}" + (f" {suffix}" if suffix else ""), flush=True)
        try:
            with self._lock:
                with (self.logs_dir / "runtime.log").open("a", encoding="utf-8") as handle:
                    handle.write(line + "\n")
        except Exception as exc:
            self._fail(exc)

    def http_attempt(self, call_id: str, **fields: Any) -> None:
        if int(fields.get("attempt", 1)) > 1:
            self.metrics["retries"] += 1
        self.append("llm-calls.jsonl", {
            "ts": now(), "kind": "http-attempt", "callId": call_id, **fields,
        })

    def provider_call_started(self, agent: str, role: str) -> None:
        self.metrics["providerCalls"] += 1
        for bucket_name, key in (("agents", agent), ("roles", role)):
            bucket = self.metrics[bucket_name].setdefault(key, {
                "calls": 0, "promptTokens": 0, "completionTokens": 0,
                "totalTokens": 0, "durationSec": 0.0, "contextPeakTokens": 0,
                "toolCalls": 0, "toolErrors": 0, "compacts": 0, "maxTurnEvents": 0,
            })
            bucket["providerCalls"] = int(bucket.get("providerCalls", 0)) + 1

    def provider_call_failed(self, agent: str, role: str, *, timed_out: bool) -> None:
        self.metrics["providerErrors"] += 1
        if timed_out:
            self.metrics["providerTimeouts"] += 1
        for bucket_name, key in (("agents", agent), ("roles", role)):
            bucket = self.metrics[bucket_name].setdefault(key, {
                "calls": 0, "promptTokens": 0, "completionTokens": 0,
                "totalTokens": 0, "durationSec": 0.0, "contextPeakTokens": 0,
                "toolCalls": 0, "toolErrors": 0, "compacts": 0, "maxTurnEvents": 0,
            })
            bucket["providerErrors"] = int(bucket.get("providerErrors", 0)) + 1
            if timed_out:
                bucket["providerTimeouts"] = int(bucket.get("providerTimeouts", 0)) + 1

    def stage_start(self, stage: str) -> None:
        self._timers[stage] = time.monotonic()
        self.append("sessions.jsonl", {"ts": now(), "kind": "stage-start", "stage": stage})
        self.summary(stage, "started")

    def stage_end(self, stage: str, *, status: str = "completed", **fields: Any) -> None:
        started = self._timers.pop(stage, None)
        duration = round(time.monotonic() - started, 3) if started is not None else 0.0
        self.metrics["stages"][stage] = {"status": status, "durationSec": duration, **fields}
        self.append("sessions.jsonl", {
            "ts": now(), "kind": "stage-end", "stage": stage,
            "status": status, "durationSec": duration, **fields,
        })
        self.summary(stage, status, durationSec=duration, **fields)

    def add_usage(self, usage: dict[str, int]) -> None:
        self.metrics["calls"] += 1
        for source, target in (
            ("prompt_tokens", "promptTokens"), ("input_tokens", "promptTokens"),
            ("completion_tokens", "completionTokens"), ("output_tokens", "completionTokens"),
            ("reasoning_tokens", "reasoningTokens"), ("total_tokens", "totalTokens"),
        ):
            if source in usage:
                self.metrics[target] += int(usage[source] or 0)
        if "total_tokens" not in usage:
            self.metrics["totalTokens"] += int(usage.get("input_tokens", 0) or 0)
            self.metrics["totalTokens"] += int(usage.get("output_tokens", 0) or 0)

    def record_turn(
        self,
        agent: str,
        role: str,
        usage: dict[str, int],
        *,
        duration_sec: float,
        context_tokens: int,
        page_type: str | None = None,
    ) -> None:
        self.add_usage(usage)
        for bucket_name, key in (("agents", agent), ("roles", role)):
            bucket = self.metrics[bucket_name].setdefault(key, {
                "calls": 0, "promptTokens": 0, "completionTokens": 0,
                "totalTokens": 0, "durationSec": 0.0, "contextPeakTokens": 0,
                "toolCalls": 0, "toolErrors": 0, "compacts": 0, "maxTurnEvents": 0,
            })
            bucket["calls"] += 1
            incoming = int(usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0) or 0)
            outgoing = int(usage.get("output_tokens", 0) or usage.get("completion_tokens", 0) or 0)
            bucket["promptTokens"] += incoming
            bucket["completionTokens"] += outgoing
            bucket["totalTokens"] += incoming + outgoing
            bucket["durationSec"] = round(float(bucket["durationSec"]) + duration_sec, 3)
            bucket["contextPeakTokens"] = max(int(bucket["contextPeakTokens"]), context_tokens)
            if page_type:
                bucket["pageType"] = page_type

    def record_tool(
        self,
        agent: str,
        role: str,
        tool: str,
        *,
        is_error: bool,
        error_kind: str = "protocol",
    ) -> None:
        self.metrics["toolCalls"] += 1
        if is_error:
            self.metrics["toolErrors"] += 1
            kinds = self.metrics.setdefault(
                "toolErrorKinds", {"external": 0, "validation": 0, "protocol": 0}
            )
            kinds[error_kind] = int(kinds.get(error_kind, 0)) + 1
        for bucket_name, key in (("agents", agent), ("roles", role)):
            bucket = self.metrics[bucket_name].setdefault(key, {
                "calls": 0, "promptTokens": 0, "completionTokens": 0,
                "totalTokens": 0, "durationSec": 0.0, "contextPeakTokens": 0,
                "toolCalls": 0, "toolErrors": 0, "compacts": 0, "maxTurnEvents": 0,
            })
            bucket["toolCalls"] += 1
            if is_error:
                bucket["toolErrors"] += 1
                kinds = bucket.setdefault(
                    "toolErrorKinds", {"external": 0, "validation": 0, "protocol": 0}
                )
                kinds[error_kind] = int(kinds.get(error_kind, 0)) + 1
            tools = bucket.setdefault("tools", {})
            entry = tools.setdefault(tool, {"calls": 0, "errors": 0})
            entry["calls"] += 1
            if is_error:
                entry["errors"] += 1

    def record_control_event(self, agent: str, role: str, kind: str) -> None:
        metric = {
            "compact": "compacts",
        }.get(kind, "maxTurnEvents")
        self.metrics[metric] += 1
        for bucket_name, key in (("agents", agent), ("roles", role)):
            bucket = self.metrics[bucket_name].setdefault(key, {
                "calls": 0, "promptTokens": 0, "completionTokens": 0,
                "totalTokens": 0, "durationSec": 0.0, "contextPeakTokens": 0,
                "toolCalls": 0, "toolErrors": 0, "compacts": 0, "maxTurnEvents": 0,
            })
            bucket[metric] += 1

    def finish(self, status: str, *, error: BaseException | None = None) -> None:
        for stage in list(self._timers):
            self.stage_end(stage, status="failed" if error else "interrupted")
        duration = round(time.monotonic() - self.started, 3)
        if error is not None:
            self.metrics["errors"] += 1
        record: dict[str, Any] = {
            "ts": now(), "kind": "session-end", "sessionId": self.session_id,
            "status": status, "durationSec": duration,
            "auditComplete": self.audit_complete, "metrics": self.metrics,
        }
        if error is not None:
            record["error"] = {
                "type": type(error).__name__, "message": str(error),
                "traceback": "".join(traceback.format_exception(error)),
            }
        self.append("sessions.jsonl", record)
        summary = {**record, "writeErrors": self.write_errors}
        try:
            (self.logs_dir / "summary.json").write_text(
                json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
            )
        except Exception as exc:
            self._fail(exc)
        self.summary("run", status, durationSec=duration, tokens=self.metrics["totalTokens"],
                     auditComplete=self.audit_complete)


class LoggedLLMClient:
    """Transparent legacy-client logger using hashes instead of quadratic snapshots."""

    def __init__(self, inner: Any, logger: ExperimentLogger) -> None:
        self.inner = inner
        self.logger = logger

    @property
    def usage(self):
        return getattr(self.inner, "usage", {})

    async def complete(self, messages, *, json_mode: bool = True, purpose: str = "chat") -> str:
        call_id = uuid.uuid4().hex
        started_at = now()
        started = time.monotonic()
        model = getattr(self.inner, "model", None)
        token = CURRENT_CALL.set((self.logger, call_id))
        try:
            response = await self.inner.complete(messages, json_mode=json_mode, purpose=purpose)
            duration = round(time.monotonic() - started, 3)
            usage = dict(getattr(self.inner, "last_usage", {}) or {})
            self.logger.add_usage(usage)
            self.logger.append("llm-calls.jsonl", {
                "ts": now(), "kind": "llm-call", "callId": call_id, "status": "success",
                "startedAt": started_at, "durationSec": duration, "purpose": purpose,
                "model": model, "jsonMode": json_mode, "messageCount": len(messages),
                "contextHash": __import__("hashlib").sha256(
                    json.dumps(messages, ensure_ascii=False, default=str).encode("utf-8")
                ).hexdigest(),
                "responseChars": len(response),
                "usage": usage,
            })
            self.logger.summary(purpose, "llm complete", durationSec=duration,
                                tokens=usage.get("total_tokens", "?"))
            return response
        except Exception as exc:
            self.logger.metrics["errors"] += 1
            self.logger.append("llm-calls.jsonl", {
                "ts": now(), "kind": "llm-call", "callId": call_id, "status": "error",
                "startedAt": started_at, "durationSec": round(time.monotonic() - started, 3),
                "purpose": purpose, "model": model, "jsonMode": json_mode,
                "messageCount": len(messages),
                "contextHash": __import__("hashlib").sha256(
                    json.dumps(messages, ensure_ascii=False, default=str).encode("utf-8")
                ).hexdigest(),
                "error": {"type": type(exc).__name__, "message": str(exc),
                          "traceback": "".join(traceback.format_exception(exc))},
            })
            raise
        finally:
            CURRENT_CALL.reset(token)
