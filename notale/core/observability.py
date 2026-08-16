"""One append-only event stream plus a derived run summary."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from notale.core.models import RunState


_SECRET_PARTS = ("api_key", "apikey", "authorization", "bearer", "secret", "password")
_LARGE_TEXT = 12000


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _text_summary(value: str) -> dict[str, Any]:
    return {
        "chars": len(value),
        "sha256": hashlib.sha256(value.encode("utf-8")).hexdigest(),
        "preview": value[:400],
    }


def _safe(value: Any, key: str = "") -> Any:
    lowered = key.lower()
    if any(part in lowered for part in _SECRET_PARTS):
        return "[redacted]"
    if isinstance(value, str):
        return _text_summary(value) if len(value) > _LARGE_TEXT else value
    if isinstance(value, dict):
        return {str(k): _safe(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_safe(item) for item in value]
    return value


class EventLog:
    """Concurrency-safe JSONL writer. Detailed logs never become workflow state."""

    def __init__(self, run_dir: Path) -> None:
        self.run_dir = Path(run_dir)
        self.path = self.run_dir / "events.jsonl"
        self.session_id = uuid.uuid4().hex
        self.started = time.monotonic()
        self._lock = threading.Lock()
        self._seq = 0
        if self.path.is_file():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                try:
                    self._seq = max(self._seq, int(json.loads(line).get("seq", 0)))
                except (ValueError, TypeError, json.JSONDecodeError):
                    continue

    def emit(
        self,
        kind: str,
        *,
        agent_id: str = "",
        page: int | None = None,
        call_id: str = "",
        duration_ms: int | None = None,
        raw: bool = False,
        **payload: Any,
    ) -> None:
        with self._lock:
            self._seq += 1
            record: dict[str, Any] = {
                "seq": self._seq,
                "ts": now(),
                "monotonic_ms": round((time.monotonic() - self.started) * 1000),
                "session_id": self.session_id,
                "kind": kind,
            }
            if agent_id:
                record["agent_id"] = agent_id
            if page is not None:
                record["page"] = page
            if call_id:
                record["call_id"] = call_id
            if duration_ms is not None:
                record["duration_ms"] = duration_ms
            record["payload"] = payload if raw else _safe(payload)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
                handle.flush()


def build_summary(run_dir: Path, state: RunState, status: str, error: str = "") -> dict[str, Any]:
    """Derive compact metrics from events.jsonl; the event stream remains authoritative."""
    path = Path(run_dir) / "events.jsonl"
    calls = tool_calls = 0
    call_duration_ms = 0
    peak = active = 0
    agents: dict[str, dict[str, Any]] = {}
    terminal_usage: dict[str, tuple[int, int]] = {}
    stages: dict[str, int] = {}
    errors: list[dict[str, Any]] = []
    page_metrics: dict[int, dict[str, Any]] = {}
    model: dict[str, Any] = {}
    planner: dict[str, Any] = {"groups": 0, "peak_group_concurrency": 0}
    style: dict[str, Any] = {}
    components: dict[str, Any] = {
        "created": 0,
        "failed": 0,
        "model_calls": 0,
        "model_duration_ms": 0,
        "repair_calls": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "by_kind": {},
    }
    inspection: dict[str, Any] = {
        "renders": 0,
        "render_failures": 0,
        "rejected": 0,
        "submitted": 0,
        "model_calls": 0,
        "model_duration_ms": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "revisions": 0,
    }
    active_planner_groups = 0
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = str(event.get("kind", ""))
            payload = event.get("payload") or {}
            agent = str(event.get("agent_id", ""))
            page_number = int(event.get("page", 0) or 0)
            if kind == "run.snapshot":
                model = dict(payload.get("model") or {})
            elif kind == "llm.call.started":
                calls += 1
                if agent.startswith("component:"):
                    components["model_calls"] += 1
                elif agent.startswith("inspection:"):
                    inspection["model_calls"] += 1
            elif kind == "llm.call.completed":
                call_duration_ms += int(event.get("duration_ms", 0) or 0)
                if agent.startswith("component:"):
                    components["model_duration_ms"] += int(event.get("duration_ms", 0) or 0)
                elif agent.startswith("inspection:"):
                    inspection["model_duration_ms"] += int(event.get("duration_ms", 0) or 0)
            elif kind == "agent.turn":
                bucket = agents.setdefault(agent, {"turns": 0, "tools": 0, "input_tokens": 0, "output_tokens": 0})
                bucket["turns"] += 1
                bucket["input_tokens"] += int(payload.get("input_tokens", 0) or 0)
                bucket["output_tokens"] += int(payload.get("output_tokens", 0) or 0)
                if page_number and not agent.startswith(("component:", "inspection:")):
                    page_bucket = page_metrics.setdefault(page_number, {})
                    page_bucket["turns"] = int(page_bucket.get("turns", 0)) + 1
                    page_bucket["input_tokens"] = int(page_bucket.get("input_tokens", 0)) + int(payload.get("input_tokens", 0) or 0)
                    page_bucket["output_tokens"] = int(page_bucket.get("output_tokens", 0)) + int(payload.get("output_tokens", 0) or 0)
                if agent.startswith("component:"):
                    components["input_tokens"] += int(payload.get("input_tokens", 0) or 0)
                    components["output_tokens"] += int(payload.get("output_tokens", 0) or 0)
                    if page_number:
                        component_usage = page_metrics.setdefault(page_number, {}).setdefault(
                            "component", {}
                        )
                        component_usage["input_tokens"] = int(component_usage.get("input_tokens", 0)) + int(payload.get("input_tokens", 0) or 0)
                        component_usage["output_tokens"] = int(component_usage.get("output_tokens", 0)) + int(payload.get("output_tokens", 0) or 0)
                elif agent.startswith("inspection:"):
                    inspection["input_tokens"] += int(payload.get("input_tokens", 0) or 0)
                    inspection["output_tokens"] += int(payload.get("output_tokens", 0) or 0)
                    if page_number:
                        inspection_usage = page_metrics.setdefault(page_number, {}).setdefault(
                            "inspection", {}
                        )
                        inspection_usage["input_tokens"] = int(
                            inspection_usage.get("input_tokens", 0)
                        ) + int(payload.get("input_tokens", 0) or 0)
                        inspection_usage["output_tokens"] = int(
                            inspection_usage.get("output_tokens", 0)
                        ) + int(payload.get("output_tokens", 0) or 0)
            elif kind in {"agent.completed", "agent.blocked", "agent.failed"}:
                terminal_usage[agent] = (
                    int(payload.get("input_tokens", 0) or 0),
                    int(payload.get("output_tokens", 0) or 0),
                )
            elif kind == "tool.completed":
                tool_calls += 1
                agents.setdefault(agent, {"turns": 0, "tools": 0, "input_tokens": 0, "output_tokens": 0})["tools"] += 1
                if page_number:
                    page_bucket = page_metrics.setdefault(page_number, {})
                    page_bucket["tool_calls"] = int(page_bucket.get("tool_calls", 0)) + 1
                    tools = page_bucket.setdefault("tool_counts", {})
                    tool = str(payload.get("tool", ""))
                    tools[tool] = int(tools.get(tool, 0)) + 1
                if payload.get("is_error"):
                    errors.append({
                        "kind": "tool.failed", "agent_id": agent,
                        "page": event.get("page"), "error": payload.get("output", ""),
                    })
            elif kind == "builder.started":
                active += 1
                peak = max(peak, active)
                page_metrics.setdefault(page_number, {}).update({
                    "style": payload.get("style", {}),
                    "tools": payload.get("tools", []),
                    "page_type": payload.get("page_type", ""),
                    "composition": payload.get("composition", ""),
                })
            elif kind in {"builder.completed", "builder.degraded"}:
                active = max(0, active - 1)
                page_metrics.setdefault(page_number, {}).update({
                    "builder_duration_ms": int(event.get("duration_ms", 0) or 0),
                    "builder_result": kind.removeprefix("builder."),
                })
            elif kind == "component.repair.started":
                components["repair_calls"] += 1
            elif kind == "component.validated":
                components["created"] += 1
                component_kind = str(payload.get("component_kind", "unknown"))
                bucket = components["by_kind"].setdefault(
                    component_kind,
                    {"created": 0, "model_calls": 0, "repair_calls": 0, "duration_ms": 0},
                )
                bucket["created"] += 1
                bucket["model_calls"] += int(payload.get("model_calls", 0) or 0)
                bucket["repair_calls"] += int(payload.get("repair_calls", 0) or 0)
                bucket["duration_ms"] += int(event.get("duration_ms", 0) or 0)
                if page_number:
                    component_usage = page_metrics.setdefault(page_number, {}).setdefault(
                        "component", {}
                    )
                    component_usage.update({
                        "kind": component_kind,
                        "component_id": payload.get("component_id", ""),
                        "model_calls": int(payload.get("model_calls", 0) or 0),
                        "repair_calls": int(payload.get("repair_calls", 0) or 0),
                        "duration_ms": int(event.get("duration_ms", 0) or 0),
                    })
            elif kind == "component.failed":
                components["failed"] += 1
            elif kind == "inspection.rendered":
                inspection["renders"] += 1
                if page_number:
                    page_metrics.setdefault(page_number, {}).setdefault(
                        "inspection", {}
                    ).update({
                        "status": "rendered",
                        "rounds": int(payload.get("round", 0) or 0),
                        "latest_revision": int(payload.get("revision", 0) or 0),
                    })
            elif kind == "inspection.failed":
                inspection["render_failures"] += 1
                if page_number:
                    page_metrics.setdefault(page_number, {}).setdefault(
                        "inspection", {}
                    ).update({
                        "status": "failed",
                        "reason": payload.get("error", ""),
                    })
            elif kind == "inspection.rejected":
                inspection["rejected"] += 1
            elif kind == "inspection.revised":
                inspection["revisions"] += 1
                if page_number:
                    page_metrics.setdefault(page_number, {}).setdefault(
                        "inspection", {}
                    ).update({
                        "status": "revised",
                        "rounds": int(payload.get("round", 0) or 0),
                        "latest_revision": int(payload.get("output_revision", 0) or 0),
                        "revisions": int(payload.get("inspector_revisions", 0) or 0),
                    })
            elif kind == "inspection.accepted":
                inspection["submitted"] += 1
                if page_number:
                    page_metrics.setdefault(page_number, {}).setdefault(
                        "inspection", {}
                    ).update({
                        "status": "submitted",
                        "rounds": int(payload.get("rounds", 0) or 0),
                        "latest_revision": int(payload.get("revision", 0) or 0),
                    })
            elif kind == "planner.group.started":
                planner["groups"] += 1
                active_planner_groups += 1
                planner["peak_group_concurrency"] = max(
                    planner["peak_group_concurrency"], active_planner_groups
                )
            elif kind in {"planner.group.completed", "planner.group.failed"}:
                active_planner_groups = max(0, active_planner_groups - 1)
            elif kind == "style.generated":
                # Only the generated path calls a model; naming a pack skips this.
                style.update({
                    "description": payload.get("description", ""),
                    "body_chars": int(payload.get("body_chars", 0) or 0),
                    "token_keys": payload.get("token_keys", []),
                    "compositions": payload.get("compositions", []),
                    "duration_ms": int(event.get("duration_ms", 0) or 0),
                })
            elif kind == "style.completed":
                style.update({
                    "name": payload.get("name", ""),
                    "sha256": payload.get("sha256", ""),
                    "pack_id": payload.get("pack_id", ""),
                    "pack_version": payload.get("version", ""),
                })
            elif kind == "style.pack.selected":
                style["pack_source"] = payload.get("source", "")
            elif kind == "style.pack.built":
                style["pack_source"] = "generated"
                style["parent_pack_id"] = payload.get("parent_id", "")
            elif kind == "style.started":
                style["request_bytes"] = int(payload.get("request_bytes", 0) or 0)
            elif kind == "planner.plan.completed":
                planner.update(payload)
            elif kind == "stage.completed":
                stages[str(payload.get("stage", ""))] = int(event.get("duration_ms", 0) or 0)
            if kind.endswith(".failed") or kind == "tool.failed":
                errors.append({"kind": kind, "agent_id": agent, "page": event.get("page"), "error": payload.get("error", "")})

    for agent, bucket in agents.items():
        if agent in terminal_usage:
            bucket["input_tokens"], bucket["output_tokens"] = terminal_usage[agent]
    for agent, usage in terminal_usage.items():
        agents.setdefault(agent, {
            "turns": 0, "tools": 0,
            "input_tokens": usage[0], "output_tokens": usage[1],
        })
    input_tokens = sum(int(bucket["input_tokens"]) for bucket in agents.values())
    output_tokens = sum(int(bucket["output_tokens"]) for bucket in agents.values())
    for number, metrics in page_metrics.items():
        usage = terminal_usage.get(f"builder:p{number}")
        if usage is not None:
            metrics["builder_input_tokens"], metrics["builder_output_tokens"] = usage
            metrics["input_tokens"] = usage[0]
            metrics["output_tokens"] = usage[1]

    pages = []
    for number, page in enumerate(state.pages, 1):
        pages.append({
            "page": number,
            "status": page.status.value,
            "attempts": page.attempts,
            "error": page.error,
            **page_metrics.get(number, {}),
        })
    return {
        "status": status,
        "error": error,
        "run_id": state.run_id,
        "topic": state.topic,
        "model": model,
        "model_calls": calls,
        "model_call_duration_ms": call_duration_ms,
        "average_model_call_ms": round(call_duration_ms / calls) if calls else 0,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "tool_calls": tool_calls,
        "peak_builder_concurrency": peak,
        "planner": planner,
        "style": style,
        "components": components,
        "inspection": inspection,
        "stages_ms": stages,
        "agents": agents,
        "pages": pages,
        "errors": errors,
        "deck": str(Path(run_dir) / "deck.html"),
    }


def write_summary(run_dir: Path, value: dict[str, Any]) -> None:
    path = Path(run_dir) / "summary.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
