"""Structured experiment logging stays complete, append-only, and fail-open."""

import json

import pytest

from notale.core.observability import ExperimentLogger


def test_logging_failure_is_fail_open(tmp_path, capsys):
    logger = ExperimentLogger(tmp_path, config={})
    logger.logs_dir = tmp_path / "not-a-directory"
    logger.logs_dir.write_text("occupied", encoding="utf-8")

    logger.append("events.jsonl", {"kind": "still-running"})

    assert logger.audit_complete is False
    assert "LOG WARNING" in capsys.readouterr().err


def test_sessions_are_append_only(tmp_path):
    first = ExperimentLogger(tmp_path, config={"run": 1})
    first.finish("completed")
    second = ExperimentLogger(tmp_path, config={"run": 2})
    second.finish("completed")

    records = [json.loads(line) for line in (tmp_path / "logs/sessions.jsonl").read_text().splitlines()]
    assert len(records) == 4
    assert records[0]["sessionId"] != records[2]["sessionId"]


def test_finish_writes_profile_without_automatic_experience_artifacts(tmp_path):
    logger = ExperimentLogger(tmp_path, config={
        "effectivePolicy": {"governance": {"progress": {"noProgressTurns": 8}}}
    })
    logger.append("agent-traces.jsonl", {
        "ts": "now", "kind": "skills-assigned", "agent": "research:r1",
        "skills": ["web-access"],
        "allowedTools": ["web_search", "fetch_web"],
    })
    logger.append("agent-traces.jsonl", {
        "ts": "now", "kind": "skill-loaded", "agent": "research:r1",
        "skill": "web-access",
    })
    logger.finish("completed")

    profile = json.loads((tmp_path / "profile-snapshot.json").read_text())
    assert profile["sessionId"] == logger.session_id
    assert not (tmp_path / "experience-report.json").exists()
    assert not (tmp_path / "experience-candidates.json").exists()


def test_run_emergency_limits_are_high_but_enforced(tmp_path):
    from notale.core.observability import RunEmergencyLimitExceeded

    logger = ExperimentLogger(
        tmp_path, config={}, run_max_duration_sec=60, run_max_total_tokens=10
    )
    logger.metrics["totalTokens"] = 10
    with pytest.raises(RunEmergencyLimitExceeded, match="run tokens"):
        logger.enforce_run_limits()


def test_tool_errors_are_classified_for_gate_diagnostics(tmp_path):
    logger = ExperimentLogger(tmp_path, config={})
    logger.record_tool("research:r1", "research", "fetch_web", is_error=True,
                       error_kind="external")
    logger.record_tool("builder:p1", "builder", "submit_page", is_error=True,
                       error_kind="validation")
    logger.record_tool("builder:p1", "builder", "page_patch", is_error=True,
                       error_kind="protocol")
    logger.finish("completed")

    metrics = json.loads((tmp_path / "logs/summary.json").read_text())["metrics"]
    assert metrics["toolErrors"] == 3
    assert metrics["toolErrorKinds"] == {
        "external": 1, "validation": 1, "protocol": 1,
    }
    assert metrics["roles"]["builder"]["toolErrorKinds"]["protocol"] == 1
