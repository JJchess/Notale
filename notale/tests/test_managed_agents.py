"""Managed worker governance, semantic tools, persistence, and repair tests."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from notale.agents.builder import BuilderWorker, compile_context
from notale.agents.managed import ManagedAgent, ManagedAgentStalled
from notale.core.observability import ExperimentLogger
from notale.core.models import Branch, Globals, PageSpec, PageType, PrepRecord
from notale.roles.base import RoleSpec
from notale.tools.agent_tools import (
    ArtifactReadInput,
    ArtifactSearchInput,
    DictSubmitInput,
    ContextReadInput,
    EmptyInput,
    PageCandidateInput,
    PagePatchInput,
    PageReadInput,
    PageWriteInput,
    ScratchWriteInput,
    SkillReadInput,
)
from notale.utils.llm import FakeClient


def _role(**overrides) -> RoleSpec:
    values = {
        "name": "test-worker",
        "system_prompt": "Use tools and submit.",
        "allowed_tools": ["report_blocker", "submit_research"],
        "skills": [],
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
    reader = next(tool for tool in agent.base.tools if tool.name == "skill_read")
    for name, assigned in agent.state.allowed_skills.items():
        offset = 0
        while True:
            entrypoint = assigned.get("locked_entrypoint")
            result = await reader.execute(
                SkillReadInput(name=name, entrypoint=entrypoint, offset=offset),
                None,  # type: ignore[arg-type]
            )
            assert not result.is_error
            next_offset = result.metadata.get("nextOffset")
            if next_offset is None:
                break
            offset = int(next_offset)


async def test_valid_submission_is_authoritative_task_evidence(tmp_path):
    agent = _agent(tmp_path)
    submit = next(tool for tool in agent.base.tools if tool.name == "submit_research")
    result = await submit.execute(DictSubmitInput(payload={"ok": True}), None)  # type: ignore[arg-type]
    assert not result.is_error
    task = json.loads((agent.worker_dir / "task.json").read_text())
    assert task["status"] == "completed"
    assert all(step["status"] == "completed" for step in task["steps"])
    assert all("validated structured submission" in step["evidence"] for step in task["steps"])


def test_skill_required_tools_fail_closed(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "submit_research"],
        skills=["course-intake"],
    )
    with pytest.raises(ValueError, match="requires tools denied"):
        _agent(tmp_path, role=role)


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


def test_standard_allowed_tools_skill_metadata_fail_closed(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "submit_research"],
        skills=["create-sim"],
    )
    with pytest.raises(ValueError, match="requires tools denied"):
        _agent(tmp_path, role=role)


async def test_scratch_is_worker_scoped_and_instrumented(tmp_path):
    role = _role(allowed_tools=["scratch_write", "submit_research"])
    agent = _agent(tmp_path, role=role)
    writer = next(tool for tool in agent.base.tools if tool.name == "scratch_write")
    escaped = await writer.execute(
        ScratchWriteInput(path="../escape.txt", content="bad"), None  # type: ignore[arg-type]
    )
    assert escaped.is_error and not (agent.worker_dir / "workspace/escape.txt").exists()
    written = await writer.execute(
        ScratchWriteInput(path="notes/idea.txt", content="safe"), None  # type: ignore[arg-type]
    )
    assert not written.is_error
    state = json.loads((agent.worker_dir / "tool-state.json").read_text())
    assert state["scratchUsage"] == {
        "calls": 2, "errors": 1, "tools": {"scratch_write": 2}
    }


async def test_long_artifact_supports_offsets_and_full_search(tmp_path):
    (tmp_path / "input").mkdir()
    (tmp_path / "input/material.txt").write_text("A" * 120000 + "\nTAIL-NEEDLE\n")
    role = _role(allowed_tools=["artifact_read", "artifact_search", "submit_research"])
    agent = _agent(tmp_path, role=role)
    reader = next(tool for tool in agent.base.tools if tool.name == "artifact_read")
    chunk = await reader.execute(
        ArtifactReadInput(path="input/material.txt", offset=110000, limit=12000), None  # type: ignore[arg-type]
    )
    assert not chunk.is_error and "totalChars=120013" in chunk.output and "TAIL-NEEDLE" in chunk.output
    search = next(tool for tool in agent.base.tools if tool.name == "artifact_search")
    found = await search.execute(
        ArtifactSearchInput(path="input/material.txt", query="TAIL-NEEDLE"), None  # type: ignore[arg-type]
    )
    assert not found.is_error and "TAIL-NEEDLE" in found.output


async def test_large_skill_is_read_in_complete_bounded_chunks(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "context_read", "acquire_media", "generate_media",
                       "page_write", "page_read", "page_search",
                       "page_patch", "check_page", "submit_page"],
        skills=["page-builder-core"],
    )
    agent = ManagedAgent(
        run_dir=tmp_path, stage="builder", worker_id="p1", role=role,
        objective="page", acceptance_criteria=["valid"], steps=[],
        submit_tool="submit_page", submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p1", "context_path": "context.json"},
    )
    skill = next(tool for tool in agent.base.tools if tool.name == "skill_read")
    first = await skill.execute(SkillReadInput(name="page-builder-core", limit=256), None)  # type: ignore[arg-type]
    assert not first.is_error and "totalChars=" in first.output and "nextOffset=256" in first.output
    assert agent.state.tool_state.get("loadedSkills") in (None, [])
    repeated = await skill.execute(SkillReadInput(name="page-builder-core", limit=256), None)  # type: ignore[arg-type]
    assert repeated.is_error and repeated.metadata["expectedOffset"] == 256
    offset = 256
    while True:
        chunk = await skill.execute(
            SkillReadInput(name="page-builder-core", offset=offset, limit=256),
            None,  # type: ignore[arg-type]
        )
        assert not chunk.is_error
        next_offset = chunk.metadata["nextOffset"]
        if next_offset is None:
            break
        offset = int(next_offset)
    assert agent.state.tool_state["loadedSkills"] == ["page-builder-core"]
    assert agent.state.tool_state["loadedSkillEntrypoints"] == {
        "page-builder-core": "default"
    }
    denied = await skill.execute(
        SkillReadInput(name="page-builder-core", limit=256, reload=True), None  # type: ignore[arg-type]
    )
    assert not denied.is_error and "cannot override the harness" in denied.output
    agent.state.tool_state["skillReloadEpoch"] = 1
    agent.state.save_tool_state()
    reloaded = await skill.execute(
        SkillReadInput(name="page-builder-core", limit=256, reload=True), None  # type: ignore[arg-type]
    )
    assert "nextOffset=256" in reloaded.output


async def test_frontend_slides_entrypoint_is_locked_and_auditable(tmp_path):
    tools = [
        "skill_read", "context_read", "acquire_media", "generate_media",
        "page_write", "page_read", "page_search", "page_patch", "check_page", "submit_page",
    ]
    role = _role(allowed_tools=tools, skills=["frontend-slides"])
    logger = ExperimentLogger(tmp_path, config={})
    agent = ManagedAgent(
        run_dir=tmp_path,
        stage="builder",
        worker_id="notale-page",
        role=role,
        objective="page",
        acceptance_criteria=["valid"],
        steps=[],
        submit_tool="submit_page",
        submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p1", "context_path": "context.json"},
        assigned_skill_entrypoints={"frontend-slides": "notale-page"},
        logger=logger,
    )
    skill = next(tool for tool in agent.base.tools if tool.name == "skill_read")
    missing = await skill.execute(
        SkillReadInput(name="frontend-slides"), None  # type: ignore[arg-type]
    )
    wrong = await skill.execute(
        SkillReadInput(name="frontend-slides", entrypoint="full-deck"),
        None,  # type: ignore[arg-type]
    )
    assert missing.is_error and wrong.is_error
    loaded = await skill.execute(
        SkillReadInput(name="frontend-slides", entrypoint="notale-page"),
        None,  # type: ignore[arg-type]
    )
    assert not loaded.is_error and loaded.metadata["nextOffset"] is None
    assert "# Notale Page Composition" in loaded.output
    assert "# Frontend Slides" not in loaded.output
    state = json.loads((agent.worker_dir / "tool-state.json").read_text())
    assert state["assignedSkillEntrypoints"] == {"frontend-slides": "notale-page"}
    assert state["loadedSkillEntrypoints"] == {"frontend-slides": "notale-page"}
    trace = [
        json.loads(line)
        for line in (tmp_path / "logs/agent-traces.jsonl").read_text().splitlines()
    ]
    loaded_event = next(record for record in trace if record["kind"] == "skill-loaded")
    assert loaded_event["skill"] == "frontend-slides"
    assert loaded_event["entrypoint"] == "notale-page"
    assert loaded_event["nextOffset"] is None

    full_deck = ManagedAgent(
        run_dir=tmp_path,
        stage="builder",
        worker_id="full-deck",
        role=role,
        objective="deck",
        acceptance_criteria=["valid"],
        steps=[],
        submit_tool="submit_page",
        submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p2", "context_path": "context.json"},
    )
    full_deck_skill = next(tool for tool in full_deck.base.tools if tool.name == "skill_read")
    default = await full_deck_skill.execute(
        SkillReadInput(name="frontend-slides"), None  # type: ignore[arg-type]
    )
    assert not default.is_error and default.metadata["entrypoint"] == "full-deck"
    assert "# Frontend Slides" in default.output


async def test_frontend_slides_planner_entrypoint_uses_planner_tool_contract(tmp_path):
    role = _role(
        name="planner",
        allowed_tools=[
            "skill_read", "artifact_read", "artifact_search", "submit_contract",
        ],
        skills=["frontend-slides"],
    )
    agent = ManagedAgent(
        run_dir=tmp_path,
        stage="planner",
        worker_id="main",
        role=role,
        objective="visual contract",
        acceptance_criteria=["valid"],
        steps=[],
        submit_tool="submit_contract",
        submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"ok":true}'}),
        assigned_skill_entrypoints={"frontend-slides": "planner-contract"},
    )
    reader = next(tool for tool in agent.base.tools if tool.name == "skill_read")
    loaded = await reader.execute(
        SkillReadInput(name="frontend-slides", entrypoint="planner-contract"),
        None,  # type: ignore[arg-type]
    )
    assert not loaded.is_error
    assert "# Notale Deck Visual Contract" in loaded.output
    assert "page_write" not in agent.role.allowed_tools


async def test_page_candidate_is_hash_bound_and_submit_carries_no_html(tmp_path):
    prep = PrepRecord(recordId="r1", branch=[Branch.NEITHER], content={"claim": "partition"})
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="partition",
        learningAction="trace partition", boundPrepRecords=["r1"],
    )
    context = compile_context(spec, Globals(), [spec], {"r1": prep})
    (tmp_path / "page-contexts").mkdir()
    (tmp_path / "page-contexts/p1.json").write_text(context.model_dump_json())
    worker = BuilderWorker(
        llm=FakeClient(by_purpose={"build:p1": '{"html":"<section data-notale-page><p>partition</p></section>"}'}),
        run_dir=tmp_path, context=context,
    )
    writer = next(tool for tool in worker.agent.base.tools if tool.name == "page_write")
    context_reader = next(tool for tool in worker.agent.base.tools if tool.name == "context_read")
    checker = next(tool for tool in worker.agent.base.tools if tool.name == "check_page")
    submitter = next(tool for tool in worker.agent.base.tools if tool.name == "submit_page")
    await context_reader.execute(ContextReadInput(), None)  # type: ignore[arg-type]
    blocked = await writer.execute(
        PageWriteInput(html="<section data-notale-page><p>partition</p></section>"),
        None,  # type: ignore[arg-type]
    )
    assert blocked.is_error and "frontend-slides:notale-page" in blocked.output
    await _load_all_assigned_skills(worker.agent)
    await writer.execute(PageWriteInput(html="<section data-notale-page><p>partition</p></section>"), None)  # type: ignore[arg-type]
    checked = await checker.execute(
        PageCandidateInput(boundReferences=["r1"], speakerNotes="explain"), None  # type: ignore[arg-type]
    )
    assert not checked.is_error
    patched = next(tool for tool in worker.agent.base.tools if tool.name == "page_patch")
    await patched.execute(PagePatchInput(old="partition", new="partition invariant"), None)  # type: ignore[arg-type]
    stale = await submitter.execute(EmptyInput(), None)  # type: ignore[arg-type]
    assert stale.is_error and "check_page" in stale.output
    await checker.execute(
        PageCandidateInput(boundReferences=["r1"], speakerNotes="explain"), None  # type: ignore[arg-type]
    )
    reader = next(tool for tool in worker.agent.base.tools if tool.name == "page_read")
    skipped = await reader.execute(PageReadInput(), None)  # type: ignore[arg-type]
    assert not skipped.is_error and "Call submit_page now" in skipped.output
    accepted = await submitter.execute(EmptyInput(), None)  # type: ignore[arg-type]
    assert not accepted.is_error
    assert "html" not in submitter.input_model.model_json_schema().get("properties", {})


async def test_page_write_normalizes_document_shell_before_check(tmp_path):
    spec = PageSpec(pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="partition")
    context = compile_context(spec, Globals(), [spec], {})
    (tmp_path / "page-contexts").mkdir()
    (tmp_path / "page-contexts/p1.json").write_text(context.model_dump_json())
    worker = BuilderWorker(
        llm=FakeClient(by_purpose={"build:p1": '{"html":"<p>partition</p>"}'}),
        run_dir=tmp_path, context=context,
    )
    writer = next(tool for tool in worker.agent.base.tools if tool.name == "page_write")
    checker = next(tool for tool in worker.agent.base.tools if tool.name == "check_page")
    await _load_all_assigned_skills(worker.agent)
    result = await writer.execute(PageWriteInput(html=(
        "<!doctype html><html><head><style>.x{color:red}</style></head>"
            "<body><section data-notale-page><p>partition</p></section></body></html>"
    )), None)  # type: ignore[arg-type]
    saved = (worker.agent.worker_dir / "workspace/page.html").read_text()
    assert not result.is_error and result.metadata["normalizedDocumentShellTags"] == 7
    assert "<body" not in saved.lower() and "<html" not in saved.lower()
    checked = await checker.execute(PageCandidateInput(speakerNotes="explain"), None)  # type: ignore[arg-type]
    assert not checked.is_error


async def test_completed_skill_overshoot_is_idempotent(tmp_path):
    role = _role(
        allowed_tools=["skill_read", "context_read", "acquire_media", "generate_media",
                       "page_write", "page_read", "page_search",
                       "page_patch", "check_page", "submit_page"],
        skills=["page-builder-core"],
    )
    agent = ManagedAgent(
        run_dir=tmp_path, stage="builder", worker_id="p1", role=role,
        objective="page", acceptance_criteria=["valid"], steps=[],
        submit_tool="submit_page", submit_validator=lambda payload: payload,
        llm=FakeClient(by_purpose={"test-worker": '{"html":"<p>x</p>"}'}),
        validation_context={"page_id": "p1", "context_path": "context.json"},
    )
    skill = next(tool for tool in agent.base.tools if tool.name == "skill_read")
    await skill.execute(SkillReadInput(name="page-builder-core"), None)  # type: ignore[arg-type]
    repeated = await skill.execute(
        SkillReadInput(name="page-builder-core", offset=12000), None  # type: ignore[arg-type]
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
    assert len(restored.base.engine.messages) == len(checkpoint["messages"])


async def test_builder_crosses_query_cap_and_continues_same_session(tmp_path):
    role = _role(
        name="builder", max_turns=2, max_total_turns=6,
        allowed_tools=["page_write", "check_page", "submit_page", "report_blocker"],
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
    assert task["status"] == "completed" and task["totalTurns"] == 3
    assert len(session["messages"]) == 6


async def test_completed_builder_is_not_reopened_by_an_outer_repair_loop(tmp_path):
    prep = PrepRecord(
        recordId="r1", branch=[Branch.NEITHER], content={"claim": "partition invariant"}
    )
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE,
        centralMessage="partition invariant", learningAction="explain invariant",
        boundPrepRecords=["r1"],
    )
    context = compile_context(spec, Globals(), [spec], {"r1": prep})
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
    assert agent.base.engine._context_window_tokens == 1000000
    assert agent.base.context_overhead_tokens > 0
    assert agent.base.engine._auto_compact_threshold_tokens < agent.role.auto_compact_threshold_tokens
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
