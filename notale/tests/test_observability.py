import json
from pathlib import Path

from notale.core.models import PageRun, PageRunStatus, RunState
from notale.core.observability import EventLog, build_summary


def test_event_stream_is_ordered_redacted_and_summarizable(tmp_path: Path):
    log = EventLog(tmp_path)
    log.emit("run.started", api_key="secret", input_tokens=12)
    log.emit("builder.started", agent_id="builder:p1", page=1)
    log.emit("llm.call.started", agent_id="builder:p1", page=1)
    log.emit("llm.call.completed", agent_id="builder:p1", page=1, duration_ms=10)
    log.emit("agent.turn", agent_id="builder:p1", page=1, input_tokens=8, output_tokens=3)
    log.emit("tool.completed", agent_id="builder:p1", page=1, tool="edit_page", is_error=False)
    log.emit("builder.completed", agent_id="builder:p1", page=1)
    log.emit("llm.call.started", agent_id="component:p1:widget", page=1)
    log.emit("agent.turn", agent_id="component:p1:widget", page=1, input_tokens=4, output_tokens=2)
    log.emit(
        "component.validated", agent_id="component:p1:widget", page=1,
        component_kind="widget", component_id="p1-widget-aaaaaaaaaaaa",
        model_calls=1, repair_calls=0,
    )
    log.emit("llm.call.started", agent_id="inspection:p1", page=1)
    log.emit(
        "llm.call.completed", agent_id="inspection:p1", page=1, duration_ms=5
    )
    log.emit(
        "agent.turn", agent_id="inspection:p1", page=1,
        input_tokens=3, output_tokens=1,
    )
    log.emit(
        "inspection.rendered", agent_id="builder:p1", page=1,
        round=1, revision=2,
    )
    log.emit(
        "inspection.revised", agent_id="builder:p1", page=1,
        round=1, revision=2, output_revision=3, inspector_revisions=1,
    )
    log.emit(
        "inspection.accepted", agent_id="builder:p1", page=1,
        rounds=2, revision=3,
    )
    records = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    assert [item["seq"] for item in records] == list(range(1, 17))
    assert records[0]["payload"]["api_key"] == "[redacted]"
    assert records[0]["payload"]["input_tokens"] == 12

    state = RunState(
        run_id="r", topic="t", contract_hash="h", created_at="now",
        plan_status="completed", pages=[PageRun(status=PageRunStatus.COMPLETED)],
    )
    summary = build_summary(tmp_path, state, "completed")
    assert summary["model_calls"] == 3
    assert summary["total_tokens"] == 21
    assert summary["tool_calls"] == 1
    assert summary["peak_builder_concurrency"] == 1
    assert summary["components"]["created"] == 1
    assert summary["components"]["model_calls"] == 1
    assert summary["inspection"]["renders"] == 1
    assert summary["inspection"]["submitted"] == 1
    assert summary["inspection"]["model_calls"] == 1
    assert summary["inspection"]["revisions"] == 1
    assert summary["inspection"]["input_tokens"] == 3
    assert summary["inspection"]["output_tokens"] == 1


def test_large_tool_payload_is_hashed_not_duplicated(tmp_path: Path):
    log = EventLog(tmp_path)
    log.emit("tool.completed", html="x" * 20000)
    payload = json.loads((tmp_path / "events.jsonl").read_text())["payload"]["html"]
    assert payload["chars"] == 20000
    assert len(payload["sha256"]) == 64
