"""Managed worker governance, semantic tools, persistence, and repair tests."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from notale.agents.builder import BuilderWorker, compile_context
from notale.agents.managed import ManagedAgent, ManagedAgentStalled
from notale.core.observability import ExperimentLogger
from notale.core.models import (
    Branch,
    BuilderPlan,
    Globals,
    PageSpec,
    PageType,
    PrepRecord,
    SkillAssignment,
)
from notale.roles.base import RoleSkillPolicy, RoleSpec
from notale.tools.agent_tools import (
    ArtifactReadInput,
    ArtifactSearchInput,
    DictSubmitInput,
    ContextReadInput,
    PagePatchInput,
    PageReadInput,
    SkillReadInput,
    SubmitPageInput,
)
from oh_fake import FakeClient


CORE_PLAN = BuilderPlan()


def _role(**overrides) -> RoleSpec:
    authorized = tuple(overrides.pop("skills", []))
    values = {
        "name": "test-worker",
        "system_prompt": "Use tools and submit.",
        "allowed_tools": ["report_blocker", "submit_research"],
        "skill_policy": RoleSkillPolicy(assignable=authorized),
        "max_turns": 12,
        "max_total_turns": 20,
        "max_duration_sec": 60,
        "max_total_tokens": 100_000,
        "version": "2",
    }
    values.update(overrides)
    return RoleSpec(**values)


def _agent(tmp_path: Path, *, llm=None, role=None) -> ManagedAgent:
    return ManagedAgent(
        run_dir=tmp_path,
        stage="test",
        worker_id="w1",
        role=role or _role(),
        objective="Produce one test artifact.",
        acceptance_criteria=["payload accepted"],
        steps=[("inspect", "inspect input"), ("finish", "finish work")],
        submit_tool="submit_research",
        submit_validator=lambda payload: dict(payload),
        llm=llm or FakeClient(by_purpose={"test": '{"ok": true}'}),
        purpose="test",
    )


async def _load_all_assigned_skills(agent: ManagedAgent) -> None:
    reader = next(tool for tool in agent.tools if tool.name == "skill_read")
    for name in agent.state.allowed_skills:
        offset = 0
        while True:
            result = await reader.execute(
                SkillReadInput(name=name, offset=offset),
                None,  # type: ignore[arg-type]
            )
            assert not result.is_error
            next_offset = result.metadata.get("nextOffset")
            if next_offset is None:
                break
            offset = int(next_offset)


async def test_valid_submission_is_authoritative_task_evidence(tmp_path):
    agent = _agent(tmp_path)
    submit = next(tool for tool in agent.tools if tool.name == "submit_research")
    direct = DictSubmitInput.model_validate({"ok": True})
    assert direct.payload == {"ok": True}
    assert DictSubmitInput(payload={"legacy": True}).payload == {"legacy": True}
    encoded = DictSubmitInput.model_validate({
        "items": '[{"id":"r1"}]',
        "settings": '{"mode":"strict"}',
        "literal": "[not valid JSON",
    })
    assert encoded.payload == {
        "items": [{"id": "r1"}],
        "settings": {"mode": "strict"},
        "literal": "[not valid JSON",
    }
    whole_payload = DictSubmitInput.model_validate({
        "payload": '{"items":[{"id":"r1"}],"mode":"strict"}',
    })
    assert whole_payload.payload == {
        "items": [{"id": "r1"}], "mode": "strict",
    }
    result = await submit.execute(direct, None)  # type: ignore[arg-type]
    assert not result.is_error
    task = json.loads((agent.worker_dir / "task.json").read_text())
    assert task["status"] == "completed"
    assert all(step["status"] == "completed" for step in task["steps"])
    assert all("validated structured submission" in step["evidence"] for step in task["steps"])


def test_tool_catalog_matches_whitelist_order_and_fails_closed(tmp_path):
    agent = _agent(tmp_path / "valid")
    assert [tool.name for tool in agent.tools] == [
        "report_blocker", "submit_research",
    ]
    with pytest.raises(ValueError, match="unavailable tool: unknown_tool"):
        _agent(
            tmp_path / "invalid",
            role=_role(allowed_tools=["unknown_tool", "submit_research"]),
        )


def test_skill_metadata_does_not_expand_role_permissions(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "submit_research"],
        skills=["web-access"],
    )
    agent = _agent(tmp_path, role=role)
    assert [tool.name for tool in agent.tools] == ["skill_read", "submit_research"]
    assert agent.state.tool_state["assignedSkills"] == []


def test_role_upgrade_restarts_unfinished_checkpoint_but_preserves_budget(tmp_path):
    first = _agent(tmp_path, role=_role(version="old"))
    first.state.task.steps[0].status = "completed"
    first.state.task.steps[0].evidence = "old context"
    first.state.task.totalTurns = 4
    first.state.save_task()
    first.state.tool_state["governanceReads"] = ["old-read"]
    first.state.save_tool_state()
    first._save_checkpoint("test-fixture")

    upgraded = _agent(tmp_path, role=_role(version="new"))
    assert upgraded.state.task.totalTurns == 4
    assert upgraded.state.task.status == "pending"
    assert all(step.status == "pending" and not step.evidence for step in upgraded.state.task.steps)
    assert upgraded.state.tool_state["governanceReads"] == []


def test_builder_skill_cannot_expand_role_permissions(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "submit_research"],
        skills=["create-sim"],
    )
    agent = _agent(tmp_path, role=role)
    assert [tool.name for tool in agent.tools] == ["skill_read", "submit_research"]


async def test_long_artifact_supports_offsets_and_full_search(tmp_path):
    (tmp_path / "input").mkdir()
    (tmp_path / "input/material.txt").write_text("A" * 120000 + "\nTAIL-NEEDLE\n")
    role = _role(allowed_tools=["artifact_read", "artifact_search", "submit_research"])
    agent = _agent(tmp_path, role=role)
    reader = next(tool for tool in agent.tools if tool.name == "artifact_read")
    chunk = await reader.execute(
        ArtifactReadInput(path="input/material.txt", offset=110000, limit=12000), None  # type: ignore[arg-type]
    )
    assert not chunk.is_error and "totalChars=120013" in chunk.output and "TAIL-NEEDLE" in chunk.output
    search = next(tool for tool in agent.tools if tool.name == "artifact_search")
    found = await search.execute(
        ArtifactSearchInput(path="input/material.txt", query="TAIL-NEEDLE"), None  # type: ignore[arg-type]
    )
    assert not found.is_error and "TAIL-NEEDLE" in found.output


async def test_large_skill_is_read_in_complete_bounded_chunks(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "context_read", "acquire_media", "generate_media",
                       "submit_page", "page_read", "page_search", "page_patch"],
        skills=["narrative-keynote"],
    )
    agent = ManagedAgent(
        run_dir=tmp_path, stage="builder", worker_id="p1", role=role,
        objective="page", acceptance_criteria=["valid"], steps=[],
        submit_tool="submit_page", submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p1", "context_path": "context.json"},
        assigned_skills=[SkillAssignment(
            name="narrative-keynote", profile="paper-and-ink"
        )],
    )
    skill = next(tool for tool in agent.tools if tool.name == "skill_read")
    first = await skill.execute(SkillReadInput(name="narrative-keynote", limit=256), None)  # type: ignore[arg-type]
    assert not first.is_error and "totalChars=" in first.output and "nextOffset=256" in first.output
    assert agent.state.tool_state.get("loadedSkills") in (None, [])
    repeated = await skill.execute(SkillReadInput(name="narrative-keynote", limit=256), None)  # type: ignore[arg-type]
    assert repeated.is_error and repeated.metadata["expectedOffset"] == 256
    offset = 256
    while True:
        chunk = await skill.execute(
            SkillReadInput(name="narrative-keynote", offset=offset, limit=256),
            None,  # type: ignore[arg-type]
        )
        assert not chunk.is_error
        next_offset = chunk.metadata["nextOffset"]
        if next_offset is None:
            break
        offset = int(next_offset)
    assert agent.state.tool_state["loadedSkills"] == ["narrative-keynote"]
    assert "loadedSkillEntrypoints" not in agent.state.tool_state
    denied = await skill.execute(
        SkillReadInput(name="narrative-keynote", limit=256, reload=True), None  # type: ignore[arg-type]
    )
    assert not denied.is_error and "cannot override the harness" in denied.output
    agent.state.tool_state["skillReloadEpoch"] = 1
    agent.state.save_tool_state()
    reloaded = await skill.execute(
        SkillReadInput(name="narrative-keynote", limit=256, reload=True), None  # type: ignore[arg-type]
    )
    assert "nextOffset=256" in reloaded.output


async def test_single_skill_document_is_loaded_and_auditable(tmp_path):
    tools = [
        "skill_read", "context_read", "acquire_media", "generate_media",
        "submit_page", "page_read", "page_search", "page_patch",
    ]
    role = _role(allowed_tools=tools, skills=["narrative-keynote"])
    logger = ExperimentLogger(tmp_path, config={})
    agent = ManagedAgent(
        run_dir=tmp_path,
        stage="builder",
        worker_id="narrative",
        role=role,
        objective="page",
        acceptance_criteria=["valid"],
        steps=[],
        submit_tool="submit_page",
        submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p1", "context_path": "context.json"},
        logger=logger,
        assigned_skills=[SkillAssignment(
            name="narrative-keynote", profile="paper-and-ink"
        )],
    )
    skill = next(tool for tool in agent.tools if tool.name == "skill_read")
    loaded = await skill.execute(
        SkillReadInput(name="narrative-keynote"),
        None,  # type: ignore[arg-type]
    )
    assert not loaded.is_error and loaded.metadata["nextOffset"] is None
    assert "# Narrative Keynote" in loaded.output
    assert "# Paper and Ink" in loaded.output
    assert "# Neon Cyber" not in loaded.output
    state = json.loads((agent.worker_dir / "tool-state.json").read_text())
    assert "assignedSkillEntrypoints" not in state
    assert "loadedSkillEntrypoints" not in state
    trace = [
        json.loads(line)
        for line in (tmp_path / "logs/agent-traces.jsonl").read_text().splitlines()
    ]
    loaded_event = next(record for record in trace if record["kind"] == "skill-loaded")
    assert loaded_event["skill"] == "narrative-keynote"
    assert "entrypoint" not in loaded_event
    assert loaded_event["nextOffset"] is None


async def test_atomic_submit_retains_failure_and_patch_auto_submits(tmp_path):
    prep = PrepRecord(recordId="r1", branch=[Branch.NEITHER], content={"claim": "partition"})
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="partition",
        learningAction="trace partition", boundPrepRecords=["r1"],
    )
    context = compile_context(spec, Globals(), [spec], {"r1": prep}, CORE_PLAN)
    (tmp_path / "page-contexts").mkdir()
    (tmp_path / "page-contexts/p1.json").write_text(context.model_dump_json())
    worker = BuilderWorker(
        llm=FakeClient(by_purpose={"build:p1": '{"html":"<section data-notale-page><p>partition</p></section>"}'}),
        run_dir=tmp_path, context=context,
    )
    context_reader = next(tool for tool in worker.agent.tools if tool.name == "context_read")
    submitter = next(tool for tool in worker.agent.tools if tool.name == "submit_page")
    await context_reader.execute(ContextReadInput(), None)  # type: ignore[arg-type]
    rejected = await submitter.execute(
        SubmitPageInput(
            html="<section data-notale-page><p>partition TODO</p></section>",
            boundReferences=["r1"], speakerNotes="explain",
        ),
        None,  # type: ignore[arg-type]
    )
    assert rejected.is_error and "TODO" in rejected.output
    assert worker.agent.state.submission is None
    assert (worker.agent.worker_dir / "workspace/page.html").is_file()
    patched = next(tool for tool in worker.agent.tools if tool.name == "page_patch")
    accepted = await patched.execute(
        PagePatchInput(old="partition TODO", new="partition invariant"),
        None,  # type: ignore[arg-type]
    )
    assert not accepted.is_error and accepted.metadata["accepted"] is True
    assert worker.agent.state.submission is not None
    reader = next(tool for tool in worker.agent.tools if tool.name == "page_read")
    recovered = await reader.execute(PageReadInput(), None)  # type: ignore[arg-type]
    assert not recovered.is_error and "partition invariant" in recovered.output
    assert set(submitter.input_model.model_json_schema()["properties"]) == {
        "html", "designSpec", "boundReferences", "speakerNotes",
    }
    assert not (worker.agent.worker_dir / "candidate.json").exists()


async def test_atomic_submit_normalizes_document_shell_before_check(tmp_path):
    prep = PrepRecord(recordId="r1", branch=[Branch.NEITHER], content={"claim": "partition"})
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="partition",
        boundPrepRecords=["r1"],
    )
    context = compile_context(spec, Globals(), [spec], {"r1": prep}, CORE_PLAN)
    (tmp_path / "page-contexts").mkdir()
    (tmp_path / "page-contexts/p1.json").write_text(context.model_dump_json())
    worker = BuilderWorker(
        llm=FakeClient(by_purpose={"build:p1": '{"html":"<p>partition</p>"}'}),
        run_dir=tmp_path, context=context,
    )
    context_reader = next(tool for tool in worker.agent.tools if tool.name == "context_read")
    submitter = next(tool for tool in worker.agent.tools if tool.name == "submit_page")
    await context_reader.execute(ContextReadInput(), None)  # type: ignore[arg-type]
    await _load_all_assigned_skills(worker.agent)
    result = await submitter.execute(SubmitPageInput(
        html=("<!doctype html><html><head><style>.x{color:red}</style></head>"
            "<body><section data-notale-page><p>partition</p></section></body></html>"
        ),
        boundReferences=["r1"], speakerNotes="explain",
    ), None)  # type: ignore[arg-type]
    saved = (worker.agent.worker_dir / "workspace/page.html").read_text()
    assert not result.is_error and result.metadata["normalizedDocumentShellTags"] == 7
    assert "<body" not in saved.lower() and "<html" not in saved.lower()


def test_submit_page_accepts_json_encoded_metadata():
    parsed = SubmitPageInput.model_validate({
        "html": "<section data-notale-page><p>x</p></section>",
        "designSpec": '{"layout":"split"}',
        "boundReferences": '["r1"]',
        "speakerNotes": "explain",
    })
    assert parsed.designSpec == {"layout": "split"}
    assert parsed.boundReferences == ["r1"]


async def test_successful_page_patch_ends_agent_loop_without_submit_round_trip(tmp_path):
    from openharness.api.client import ApiMessageCompleteEvent
    from openharness.api.usage import UsageSnapshot
    from openharness.engine.messages import ConversationMessage, ToolUseBlock

    class RepairClient:
        def __init__(self) -> None:
            self.calls = 0

        async def stream_message(self, request):
            del request
            self.calls += 1
            tool = (
                ToolUseBlock(name="submit_page", input={
                    "html": "<section data-notale-page><p>partition TODO</p></section>",
                    "designSpec": {}, "boundReferences": [], "speakerNotes": "",
                })
                if self.calls == 1
                else ToolUseBlock(name="page_patch", input={
                    "old": "partition TODO", "new": "partition invariant",
                })
            )
            yield ApiMessageCompleteEvent(
                message=ConversationMessage(role="assistant", content=[tool]),
                usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                stop_reason="tool_use",
            )

    client = RepairClient()
    role = _role(
        name="builder",
        allowed_tools=["submit_page", "page_patch", "report_blocker"],
    )
    agent = ManagedAgent(
        run_dir=tmp_path, stage="builder", worker_id="p1", role=role,
        objective="page", acceptance_criteria=["valid"],
        steps=[("implement-check", "check"), ("submit-page", "submit")],
        submit_tool="submit_page", submit_validator=lambda value: value,
        llm=client, purpose="build:p1",
        validation_context={"page_id": "p1", "valid_record_ids": []},
    )

    artifact = await agent.run_task("build and repair")

    assert client.calls == 2
    assert artifact["html"] == (
        "<section data-notale-page><p>partition invariant</p></section>"
    )
    assert agent.state.task.status == "completed"


async def test_completed_skill_overshoot_is_idempotent(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "context_read", "acquire_media", "generate_media",
                       "submit_page", "page_read", "page_search", "page_patch"],
        skills=["create-sim"],
    )
    agent = ManagedAgent(
        run_dir=tmp_path, stage="builder", worker_id="p1", role=role,
        objective="page", acceptance_criteria=["valid"], steps=[],
        submit_tool="submit_page", submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p1", "context_path": "context.json"},
        assigned_skills=["create-sim"],
    )
    skill = next(tool for tool in agent.tools if tool.name == "skill_read")
    await skill.execute(SkillReadInput(name="create-sim"), None)  # type: ignore[arg-type]
    repeated = await skill.execute(
        SkillReadInput(name="create-sim", offset=12000), None  # type: ignore[arg-type]
    )
    assert not repeated.is_error and "already loaded in full" in repeated.output


async def test_checkpoint_and_submission_restore_without_recalling_model(tmp_path):
    first_client = FakeClient(by_purpose={"test": '{"ok": true}'})
    first = _agent(tmp_path, llm=first_client)
    artifact = await first.run_task("complete the test")
    assert artifact == {"ok": True}
    checkpoint = json.loads((first.worker_dir / "session.json").read_text())
    assert checkpoint["messages"] and checkpoint["totalTurns"] == 1
    for name in ("task.json", "tool-state.json", "session.json", "submission.json"):
        assert (first.worker_dir / name).exists()

    second_client = FakeClient(by_purpose={"test": '{"ok": false}'})
    restored = _agent(tmp_path, llm=second_client)
    artifact2 = await restored.run_task("must not run")
    assert artifact2 == {"ok": True}
    assert second_client.calls == []
    assert len(restored.engine.messages) == len(checkpoint["messages"])


async def test_protocol_8_unfinished_checkpoint_resumes_without_migration(tmp_path):
    """A hand-authored v8 worker fixture protects existing half-finished runs."""
    worker = tmp_path / "agents/test/w1"
    (worker / "workspace/scratch").mkdir(parents=True)
    (worker / "task.json").write_text(json.dumps({
        "workerId": "w1",
        "role": "test-worker",
        "objective": "Produce one test artifact.",
        "acceptanceCriteria": ["payload accepted"],
        "steps": [
            {"id": "inspect", "description": "inspect input", "status": "completed"},
            {"id": "finish", "description": "finish work", "status": "pending"},
        ],
        "status": "in_progress",
        "totalTurns": 3,
        "elapsedSec": 1.5,
        "startedAt": "2026-01-01T00:00:00+00:00",
        "updatedAt": "2026-01-01T00:00:01+00:00",
    }), encoding="utf-8")
    (worker / "tool-state.json").write_text("{}", encoding="utf-8")
    (worker / "session.json").write_text(json.dumps({
        "workerId": "w1",
        "role": "test-worker",
        "roleVersion": "8",
        "checkpointId": "protocol-8-fixture",
        "messages": [{
            "role": "user",
            "content": [{"type": "text", "text": "saved unfinished request"}],
        }],
        "usage": {"inputTokens": 11, "outputTokens": 7},
        "toolMetadata": {
            "stage": "test", "workerId": "w1", "roleVersion": "8",
            "pageType": None,
        },
        "totalTurns": 3,
        "compactCount": 1,
        "progressSnapshot": {"fixture": True},
        "lastProgressTurn": 2,
        "noProgressTurns": 1,
        "proseOnlyTurns": 0,
        "lastToolErrorSignature": "",
        "repeatedToolErrorCount": 0,
        "lastValidationSignature": "",
        "repeatedValidationErrorCount": 0,
        "stalledReason": "",
        "updatedAt": "2026-01-01T00:00:01+00:00",
    }), encoding="utf-8")

    client = FakeClient(by_purpose={"test": '{"resumed": true}'})
    agent = _agent(tmp_path, role=_role(version="8"), llm=client)

    assert agent.checkpoint.checkpointId == "protocol-8-fixture"
    assert agent.checkpoint.compactCount == 1
    assert agent.state.task.totalTurns == 3
    assert len(agent.engine.messages) == 1
    assert await agent.run_task("continue") == {"resumed": True}
    assert agent.state.task.totalTurns == 4


async def test_builder_atomic_submit_completes_in_one_model_turn(tmp_path):
    role = _role(
        name="builder", max_turns=2, max_total_turns=6,
        allowed_tools=["submit_page", "page_patch", "report_blocker"],
    )
    payload = json.dumps({"html": "<section data-notale-page><p>partition</p></section>"})
    agent = ManagedAgent(
        run_dir=tmp_path, stage="builder", worker_id="p1", role=role,
        objective="page", acceptance_criteria=["valid"],
        steps=[("implement-check", "check"), ("submit-page", "submit")],
        submit_tool="submit_page", submit_validator=lambda value: value,
        llm=FakeClient(by_purpose={"build:p1": payload}), purpose="build:p1",
        validation_context={"page_id": "p1", "valid_record_ids": []},
    )
    artifact = await agent.run_task("build")
    task = json.loads((agent.worker_dir / "task.json").read_text())
    session = json.loads((agent.worker_dir / "session.json").read_text())
    assert artifact["html"].startswith("<section")
    assert task["status"] == "completed" and task["totalTurns"] == 1
    assert len(session["messages"]) == 2


async def test_completed_builder_is_not_reopened_by_an_outer_repair_loop(tmp_path):
    prep = PrepRecord(
        recordId="r1", branch=[Branch.NEITHER], content={"claim": "partition invariant"}
    )
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE,
        centralMessage="partition invariant", learningAction="explain invariant",
        boundPrepRecords=["r1"],
    )
    context = compile_context(spec, Globals(), [spec], {"r1": prep}, CORE_PLAN)
    (tmp_path / "page-contexts").mkdir()
    (tmp_path / "page-contexts/p1.json").write_text(context.model_dump_json(), encoding="utf-8")
    page = json.dumps({
        "html": "<section data-notale-page><p>partition invariant</p></section>",
        "boundReferences": ["r1"],
    })
    client = FakeClient(by_purpose={"build:p1": page})
    worker = BuilderWorker(llm=client, run_dir=tmp_path, context=context)

    await worker.build()
    before = json.loads((tmp_path / "agents/builder/p1/session.json").read_text())
    await worker.build()
    after = json.loads((tmp_path / "agents/builder/p1/session.json").read_text())
    task = json.loads((tmp_path / "agents/builder/p1/task.json").read_text())
    assert before["checkpointId"] == after["checkpointId"]
    assert after["messages"] == before["messages"]
    assert not any(step["id"].startswith("repair-") for step in task["steps"])
    assert len([purpose for purpose, _ in client.calls if purpose == "build:p1"]) == 1


def test_context_budget_reserves_system_and_tool_schema(tmp_path):
    agent = _agent(tmp_path)
    assert agent.engine._context_window_tokens == 1000000
    assert agent.context_overhead_tokens > 0
    assert agent.engine._auto_compact_threshold_tokens < agent.role.auto_compact_threshold_tokens
    assert agent.role.max_total_tokens == 100_000


async def test_low_threshold_compacts_and_checkpoints(tmp_path):
    from openharness.api.client import ApiMessageCompleteEvent
    from openharness.api.usage import UsageSnapshot
    from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock

    class CompactThenSubmitClient:
        def __init__(self):
            self.normal_calls = 0

        async def stream_message(self, request):
            if not request.tools:
                message = ConversationMessage(role="assistant", content=[TextBlock(text=(
                    "<analysis>compact fixture</analysis>"
                    "<summary>Preserve objective, evidence, and next submission step.</summary>"
                ))])
            else:
                self.normal_calls += 1
                message = ConversationMessage(role="assistant", content=(
                    [ToolUseBlock(
                        name="artifact_read",
                        input={
                            "path": "input/large.txt",
                            "offset": (self.normal_calls - 1) * 12000,
                            "limit": 12000,
                        },
                    )]
                    if self.normal_calls <= 4
                    else [ToolUseBlock(
                        name="submit_research", input={"payload": {"ok": True}}
                    )]
                ))
            yield ApiMessageCompleteEvent(
                message=message,
                usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                stop_reason="tool_use" if message.tool_uses else "end_turn",
            )

    (tmp_path / "input").mkdir()
    (tmp_path / "input/large.txt").write_text("alpha beta gamma delta " * 3000)
    role = _role(
        allowed_tools=["artifact_read", "report_blocker", "submit_research"],
        context_window_tokens=4000,
        auto_compact_threshold_tokens=1200,
        max_tokens=256,
        max_total_tokens=20_000,
    )
    agent = _agent(tmp_path, role=role, llm=CompactThenSubmitClient())
    await agent.run_task("read and submit")
    checkpoint = json.loads((agent.worker_dir / "session.json").read_text())
    assert checkpoint["compactCount"] >= 1


async def test_provider_stall_has_hard_timeout_and_auditable_call(tmp_path):
    class StallingClient:
        async def stream_message(self, request):
            await asyncio.sleep(1)
            if False:
                yield request

    role = _role(
        request_timeout_sec=0.02, max_query_duration_sec=0.1,
        max_provider_attempts=1,
    )
    logged_dir = tmp_path / "logged"
    logged = ExperimentLogger(logged_dir, config={"model": "stalling-fixture"})
    observed = ManagedAgent(
        run_dir=logged_dir, stage="test", worker_id="w1", role=role,
        objective="timeout", acceptance_criteria=["bounded"], steps=[],
        submit_tool="submit_research", submit_validator=lambda payload: payload,
        llm=StallingClient(), logger=logged,
    )
    with pytest.raises(RuntimeError, match="failed before an assistant turn"):
        await observed.run_task("must time out")
    logged.finish("failed")
    records = [
        json.loads(line)
        for line in (logged_dir / "logs/llm-calls.jsonl").read_text().splitlines()
    ]
    assert [record["kind"] for record in records] == [
        "provider-call-start", "provider-call-end",
    ]
    assert records[-1]["status"] == "timeout" and records[-1]["receivedEvent"] is False
    summary = json.loads((logged_dir / "logs/summary.json").read_text())
    assert summary["metrics"]["providerCalls"] == 1
    assert summary["metrics"]["providerTimeouts"] == 1


async def test_provider_stall_before_first_event_retries_once(tmp_path):
    class OnceStallingClient:
        def __init__(self):
            self.calls = 0

        async def stream_message(self, request):
            self.calls += 1
            if self.calls == 1:
                await asyncio.sleep(1)
            message = ConversationMessage(role="assistant", content=(
                [ToolUseBlock(name="submit_research", input={"payload": {"ok": True}})]
                if self.calls == 2 else [TextBlock(text="submitted")]
            ))
            yield ApiMessageCompleteEvent(
                message=message,
                usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                stop_reason="tool_use",
            )

    from openharness.api.client import ApiMessageCompleteEvent
    from openharness.api.usage import UsageSnapshot
    from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock

    logged = ExperimentLogger(tmp_path, config={"model": "retry-fixture"})
    client = OnceStallingClient()
    role = _role(
        request_timeout_sec=0.02,
        max_query_duration_sec=0.5,
        max_provider_attempts=2,
    )
    agent = ManagedAgent(
        run_dir=tmp_path, stage="test", worker_id="retry", role=role,
        objective="retry", acceptance_criteria=["bounded"], steps=[],
        submit_tool="submit_research", submit_validator=lambda payload: payload,
        llm=client, logger=logged,
    )
    assert await agent.run_task("retry once") == {"ok": True}
    logged.finish("completed")
    assert client.calls == 2
    summary = json.loads((tmp_path / "logs/summary.json").read_text())
    assert summary["metrics"]["providerCalls"] == 2
    assert summary["metrics"]["providerTimeouts"] == 1
    assert summary["metrics"]["retries"] == 1


async def test_prose_only_worker_is_stalled_and_checkpointed(tmp_path):
    from openharness.api.client import ApiMessageCompleteEvent
    from openharness.api.usage import UsageSnapshot
    from openharness.engine.messages import ConversationMessage, TextBlock

    class ProseOnlyClient:
        async def stream_message(self, request):
            del request
            yield ApiMessageCompleteEvent(
                message=ConversationMessage(
                    role="assistant", content=[TextBlock(text="I am still considering it.")]
                ),
                usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                stop_reason="end_turn",
            )

    agent = _agent(tmp_path, role=_role(max_total_turns=20), llm=ProseOnlyClient())
    with pytest.raises(ManagedAgentStalled, match="no tool use"):
        await agent.run_task("finish with tools")

    task = json.loads((agent.worker_dir / "task.json").read_text())
    checkpoint = json.loads((agent.worker_dir / "session.json").read_text())
    assert task["status"] == "stalled"
    assert checkpoint["proseOnlyTurns"] == 3
    assert checkpoint["stalledReason"]


async def test_repeated_identical_tool_failure_stalls_worker(tmp_path):
    from openharness.api.client import ApiMessageCompleteEvent
    from openharness.api.usage import UsageSnapshot
    from openharness.engine.messages import ConversationMessage, ToolUseBlock

    class RepeatingFailureClient:
        async def stream_message(self, request):
            del request
            yield ApiMessageCompleteEvent(
                message=ConversationMessage(role="assistant", content=[ToolUseBlock(
                    name="artifact_read", input={"path": "missing.txt"}
                )]),
                usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                stop_reason="tool_use",
            )

    role = _role(
        allowed_tools=["artifact_read", "submit_research"],
        max_total_turns=20,
    )
    agent = _agent(tmp_path, role=role, llm=RepeatingFailureClient())
    with pytest.raises(ManagedAgentStalled, match="same tool failure repeated 3 times"):
        await agent.run_task("read and submit")

    checkpoint = json.loads((agent.worker_dir / "session.json").read_text())
    assert checkpoint["repeatedToolErrorCount"] == 3
    assert checkpoint["stalledReason"].startswith("same tool failure")


def test_llm_stages_do_not_call_legacy_complete_directly():
    root = Path(__file__).resolve().parents[1]
    targets = [
        root / "core/stages/intake.py",
        root / "agents/research.py",
        root / "core/stages/contract.py",
        root / "agents/builder.py",
    ]
    assert all(".complete(" not in path.read_text(encoding="utf-8") for path in targets)
