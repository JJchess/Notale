"""Persistent, run-local OpenHarness workers with task and submission gates."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

from openharness.api.client import ApiMessageCompleteEvent
from openharness.api.openai_client import OpenAICompatibleClient
from openharness.api.usage import UsageSnapshot
from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock
from pydantic import BaseModel

from notale.agents.runtime import AgentBase
from notale.core.models import AgentCheckpoint, AgentTaskState, AgentTaskStep
from notale.core.observability import ExperimentLogger, now
from notale.roles.base import RoleSpec
from notale.tools.agent_tools import (
    ArtifactReadTool,
    ArtifactSearchTool,
    AssignedSkillTool,
    CheckPageTool,
    ContextReadTool,
    DictSubmitInput,
    ManagedToolState,
    PagePatchTool,
    PageReadTool,
    PageSearchTool,
    PageWriteTool,
    ReportBlockerTool,
    ScratchPatchTool,
    ScratchReadTool,
    ScratchSearchTool,
    ScratchWriteTool,
    SubmitArtifactTool,
    SubmitPageTool,
    load_assigned_skills,
)
from notale.tools.media import AcquireMediaTool, GenerateMediaTool
from notale.utils.config import get_config
from notale.utils.parsing import extract_json


SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills"
_PROGRESS_CONFIG = get_config().governance.progress


class ManagedAgentBudgetExceeded(RuntimeError):
    """A worker exhausted its persistent turn, time, or token budget."""


class ManagedAgentBlocked(RuntimeError):
    """A worker used report_blocker and stopped without a fabricated artifact."""


class ManagedAgentStalled(RuntimeError):
    """A worker made no observable task progress and was stopped with a checkpoint."""


class _ObservedStreamingClient:
    """Bound one provider stream and expose stalls before an assistant turn exists."""

    def __init__(
        self,
        inner: Any,
        *,
        logger: ExperimentLogger | None,
        identity: str,
        role: RoleSpec,
    ) -> None:
        self.inner = inner
        self.logger = logger
        self.identity = identity
        self.role = role

    def __getattr__(self, name: str) -> Any:
        """Preserve fixture hooks and harmless client metadata through the wrapper."""
        return getattr(self.inner, name)

    async def stream_message(self, request):
        for attempt in range(1, self.role.max_provider_attempts + 1):
            call_id = uuid.uuid4().hex
            started = time.monotonic()
            first_event = True
            fields = {
                "callId": call_id,
                "agent": self.identity,
                "role": self.role.name,
                "model": request.model,
                "messageCount": len(request.messages),
                "toolCount": len(request.tools),
                "maxOutputTokens": request.max_tokens,
                "timeoutSec": self.role.request_timeout_sec,
                "attempt": attempt,
                "maxAttempts": self.role.max_provider_attempts,
            }
            if self.logger:
                self.logger.provider_call_started(self.identity, self.role.name)
                self.logger.append("llm-calls.jsonl", {
                    "ts": now(), "kind": "provider-call-start", **fields,
                })
            try:
                async with asyncio.timeout(self.role.request_timeout_sec):
                    async for event in self.inner.stream_message(request):
                        if first_event:
                            first_event = False
                            if self.logger:
                                self.logger.append("llm-calls.jsonl", {
                                    "ts": now(), "kind": "provider-call-first-event", **fields,
                                    "firstEventSec": round(time.monotonic() - started, 3),
                                })
                        yield event
                if self.logger:
                    self.logger.append("llm-calls.jsonl", {
                        "ts": now(), "kind": "provider-call-end", **fields,
                        "status": "success",
                        "durationSec": round(time.monotonic() - started, 3),
                        "receivedEvent": not first_event,
                    })
                return
            except BaseException as exc:
                timed_out = isinstance(exc, TimeoutError)
                if self.logger:
                    self.logger.provider_call_failed(
                        self.identity, self.role.name, timed_out=timed_out
                    )
                    self.logger.append("llm-calls.jsonl", {
                        "ts": now(), "kind": "provider-call-end", **fields,
                        "status": "timeout" if timed_out else "error",
                        "durationSec": round(time.monotonic() - started, 3),
                        "receivedEvent": not first_event,
                        "error": {"type": type(exc).__name__, "message": str(exc)},
                    })
                # Retrying after any streamed event could duplicate partial tool/text output.
                if not (timed_out and first_event and attempt < self.role.max_provider_attempts):
                    raise


class _CompletionClientAdapter:
    """Offline-test bridge: drive governance tools around a legacy canned JSON client.

    Production never uses this adapter: a configured client is converted to the native
    OpenHarness OpenAI streaming client. Keeping the bridge makes deterministic tests
    exercise the real tool/task/session machinery without network access.
    """

    def __init__(
        self,
        inner: Any,
        state: ManagedToolState,
        *,
        purpose: str,
        submit_tool: str,
    ) -> None:
        self.inner = inner
        self.state = state
        self.purpose = purpose
        self.submit_tool = submit_tool
        self.prompts: list[str] = []
        self._fixture_page: dict[str, Any] | None = None

    def prepare(self, prompt: str) -> None:
        self.prompts.append(prompt)

    async def stream_message(self, request):
        if not request.tools:  # OpenHarness's compaction summarizer call
            message = ConversationMessage(
                role="assistant",
                content=[TextBlock(text=(
                    "<analysis>fixture compaction</analysis>"
                    "<summary>Objective, task state, accepted constraints, and next step preserved.</summary>"
                ))],
            )
            yield ApiMessageCompleteEvent(
                message=message,
                usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                stop_reason="end_turn",
            )
            return
        if self.submit_tool == "submit_page" and self.state.submission is None:
            load_step = next((step for step in self.state.task.steps if step.id == "load-context"), None)
            if load_step is not None and load_step.status != "completed":
                message = ConversationMessage(
                    role="assistant", content=[ToolUseBlock(name="context_read", input={})]
                )
                yield ApiMessageCompleteEvent(
                    message=message,
                    usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                    stop_reason="tool_use",
                )
                return
            for name, skill in self.state.allowed_skills.items():
                if self.state.skill_is_loaded(name):
                    continue
                epoch = int(self.state.tool_state.get("skillReloadEpoch", 0) or 0)
                key = self.state.skill_progress_key(name)
                progress = (self.state.tool_state.get("skillReadProgress") or {}).get(key) or {}
                offset = 0
                if progress.get("reloadEpoch") == epoch:
                    offset = int(progress.get("nextOffset") or 0)
                tool_input: dict[str, Any] = {"name": name, "offset": offset}
                if skill.get("locked_entrypoint") is not None:
                    tool_input["entrypoint"] = skill["locked_entrypoint"]
                message = ConversationMessage(
                    role="assistant",
                    content=[ToolUseBlock(name="skill_read", input=tool_input)],
                )
                yield ApiMessageCompleteEvent(
                    message=message,
                    usage=UsageSnapshot(input_tokens=1, output_tokens=1),
                    stop_reason="tool_use",
                )
                return
            if self._fixture_page is None:
                content = "\n\n".join(self.prompts)
                raw = await self.inner.complete(
                    [{"role": "user", "content": content}], purpose=self.purpose
                )
                self._fixture_page = dict(extract_json(raw))
            if not self.state.page_path.is_file():
                message = ConversationMessage(
                    role="assistant",
                    content=[ToolUseBlock(
                        name="page_write", input={"html": str(self._fixture_page.get("html", ""))}
                    )],
                )
            elif not self.state.candidate_path.is_file():
                metadata = {
                    key: self._fixture_page.get(key, default)
                    for key, default in (
                        ("designSpec", {}),
                        ("boundReferences", []), ("speakerNotes", ""),
                    )
                }
                message = ConversationMessage(
                    role="assistant",
                    content=[ToolUseBlock(name="check_page", input=metadata)],
                )
            else:
                message = ConversationMessage(
                    role="assistant", content=[ToolUseBlock(name="submit_page", input={})]
                )
        elif self.state.submission is None:
            content = "\n\n".join(self.prompts)
            raw = await self.inner.complete(
                [{"role": "user", "content": content}], purpose=self.purpose
            )
            message = ConversationMessage(
                role="assistant",
                content=[ToolUseBlock(name=self.submit_tool, input={"payload": extract_json(raw)})],
            )
        else:
            message = ConversationMessage(
                role="assistant", content=[TextBlock(text="Structured artifact submitted.")]
            )
        yield ApiMessageCompleteEvent(
            message=message,
            usage=UsageSnapshot(input_tokens=1, output_tokens=1),
            stop_reason="tool_use" if message.tool_uses else "end_turn",
        )


def _atomic_json(path: Path, value: BaseModel | dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, BaseModel):
        text = value.model_dump_json(indent=2)
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _native_client(llm: Any, profile: RoleSpec) -> tuple[Any, RoleSpec]:
    """Resolve one model config into an OpenHarness streaming client and role."""
    if hasattr(llm, "stream_message"):
        return llm, profile
    inner = getattr(llm, "inner", llm)
    # FakeClient and compatible fixtures are intentionally completed by the test bridge.
    if any(cls.__name__ == "FakeClient" for cls in type(inner).__mro__):
        return inner, profile
    base_url = getattr(inner, "base_url", profile.base_url)
    model = getattr(inner, "model", profile.model)
    api_key_env = getattr(inner, "api_key_env", profile.api_key_env)
    api_key = (os.environ.get(api_key_env) or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(f"缺 API key：设环境变量 {api_key_env} 或 OPENAI_API_KEY")
    configured_timeout = getattr(inner, "timeout", None)
    timeout = (
        min(float(configured_timeout), profile.request_timeout_sec)
        if configured_timeout
        else profile.request_timeout_sec
    )
    native = OpenAICompatibleClient(api_key, base_url=base_url, timeout=timeout)
    return native, replace(profile, model=model, base_url=base_url, api_key_env=api_key_env)


class ManagedAgent:
    """One independently governed agent loop persisted beneath a run directory."""

    def __init__(
        self,
        *,
        run_dir: Path,
        stage: str,
        worker_id: str,
        role: RoleSpec,
        objective: str,
        acceptance_criteria: list[str],
        steps: list[tuple[str, str]],
        submit_tool: str,
        submit_validator: Callable[[dict[str, Any]], Any],
        llm: Any,
        logger: ExperimentLogger | None = None,
        extra_tools: list[Any] | None = None,
        validation_context: dict[str, Any] | None = None,
        purpose: str | None = None,
        assigned_skills: list[str] | None = None,
        assigned_skill_entrypoints: dict[str, str] | None = None,
    ) -> None:
        if not worker_id or any(x in worker_id for x in ("/", "\\", "..")):
            raise ValueError(f"unsafe worker id: {worker_id!r}")
        self.run_dir = Path(run_dir).resolve()
        self.worker_dir = self.run_dir / "agents" / stage / worker_id
        self.worker_dir.mkdir(parents=True, exist_ok=True)
        (self.worker_dir / "workspace").mkdir(exist_ok=True)
        (self.worker_dir / "workspace" / "scratch").mkdir(exist_ok=True)
        self.role = role
        self.logger = logger
        self.submit_tool = submit_tool
        self.submit_validator = submit_validator
        self.checkpoint_path = self.worker_dir / "session.json"
        self._compact_count = 0
        self._checkpoint_id = uuid.uuid4().hex
        self._progress_snapshot: dict[str, Any] = {}
        self._last_progress_turn = 0
        self._no_progress_turns = 0
        self._prose_only_turns = 0
        self._last_tool_error_signature = ""
        self._repeated_tool_error_count = 0
        self._last_validation_signature = ""
        self._repeated_validation_error_count = 0
        self._stalled_reason = ""

        task_path = self.worker_dir / "task.json"
        if task_path.exists():
            task = AgentTaskState.model_validate_json(task_path.read_text(encoding="utf-8"))
            if task.role != role.name or task.workerId != worker_id:
                raise ValueError("persisted task identity does not match worker")
        else:
            task = AgentTaskState(
                workerId=worker_id,
                role=role.name,
                objective=objective,
                acceptanceCriteria=acceptance_criteria,
                steps=[AgentTaskStep(id=key, description=description) for key, description in steps],
                status="pending",
                startedAt=now(),
                updatedAt=now(),
            )

        skill_names = assigned_skills if assigned_skills is not None else role.skills
        unauthorized_skills = sorted(set(skill_names) - set(role.skills))
        if unauthorized_skills:
            raise ValueError(
                f"role {role.name} does not permit assigned skills: {unauthorized_skills}"
            )
        skill_entrypoints = dict(assigned_skill_entrypoints or {})
        skills = load_assigned_skills(SKILLS_ROOT, skill_names, skill_entrypoints)
        allowed = set(role.allowed_tools)
        for name, skill in skills.items():
            metadata = skill["metadata"]
            required = set(
                metadata.get("required_tools") or metadata.get("allowed-tools") or []
            )
            denied = sorted(required - allowed)
            if denied:
                raise ValueError(f"skill {name} requires tools denied by role {role.name}: {denied}")

        tool_state_path = self.worker_dir / "tool-state.json"
        tool_state = (
            json.loads(tool_state_path.read_text(encoding="utf-8"))
            if tool_state_path.exists() else {}
        )
        tool_state.update({
            "assignedSkills": skill_names,
            "assignedSkillEntrypoints": skill_entrypoints,
            "allowedTools": role.allowed_tools,
            "systemProfiles": role.system_profile_metadata(),
        })
        identity = f"{stage}:{worker_id}"

        def record_event(kind: str, fields: dict[str, Any]) -> None:
            if logger:
                logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": kind, "agent": identity, **fields,
                })

        self.state = ManagedToolState(
            run_dir=self.run_dir,
            worker_dir=self.worker_dir,
            task=task,
            allowed_skills=skills,
            submit_validator=submit_validator,
            validation_context=validation_context or {},
            tool_state=tool_state,
            event_callback=record_event,
        )
        self.state.save_task()
        self.state.save_tool_state()
        self._progress_snapshot = self._capture_progress_snapshot()
        if (self.worker_dir / "submission.json").exists():
            saved = json.loads((self.worker_dir / "submission.json").read_text(encoding="utf-8"))
            self.state.submission = submit_validator(saved)
            if all(step.status == "completed" for step in task.steps):
                task.status = "completed"
                task.submittedArtifact = "submission.json"
                self.state.save_task()

        available: dict[str, Any] = {
            "skill_read": AssignedSkillTool(self.state),
            "artifact_read": ArtifactReadTool(self.state),
            "artifact_search": ArtifactSearchTool(self.state),
            "context_read": ContextReadTool(self.state),
            "acquire_media": AcquireMediaTool(self.state),
            "generate_media": GenerateMediaTool(self.state),
            "page_write": PageWriteTool(self.state),
            "page_read": PageReadTool(self.state),
            "page_search": PageSearchTool(self.state),
            "page_patch": PagePatchTool(self.state),
            "scratch_read": ScratchReadTool(self.state),
            "scratch_write": ScratchWriteTool(self.state),
            "scratch_search": ScratchSearchTool(self.state),
            "scratch_patch": ScratchPatchTool(self.state),
            "check_page": CheckPageTool(self.state),
            "report_blocker": ReportBlockerTool(self.state),
        }
        available[submit_tool] = (
            SubmitPageTool(self.state)
            if submit_tool == "submit_page"
            else SubmitArtifactTool(self.state, submit_tool)
        )
        for tool in extra_tools or []:
            available[tool.name] = tool
        unknown = sorted(allowed - set(available))
        if unknown:
            raise ValueError(f"role {role.name} declares unavailable tools: {unknown}")
        tools = [available[name] for name in role.allowed_tools]

        native, effective_role = _native_client(llm, role)
        if any(cls.__name__ == "FakeClient" for cls in type(native).__mro__):
            native = _CompletionClientAdapter(
                native, self.state, purpose=purpose or role.name, submit_tool=submit_tool
            )
        native = _ObservedStreamingClient(
            native, logger=logger, identity=identity, role=effective_role
        )
        self.client = native
        self.role = effective_role
        self.base = AgentBase(
            effective_role,
            client=native,
            workspace=self.state.workspace,
            logger=logger,
            identity=identity,
            tools=tools,
            inline_skills=False,
            checkpoint_callback=self._save_checkpoint,
            tool_result_callback=self._record_tool_result,
            tool_metadata={
                "stage": stage,
                "workerId": worker_id,
                "roleVersion": role.version,
                "pageType": (validation_context or {}).get("page_type"),
            },
            return_on_max_turns=True,
            terminal_tools={submit_tool},
        )
        self._restore_checkpoint()
        if logger:
            logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "skills-assigned", "agent": f"{stage}:{worker_id}",
                "skills": skill_names,
                "skillEntrypoints": skill_entrypoints,
                "allowedTools": role.allowed_tools,
                "systemProfiles": role.system_profile_metadata(),
            })

    @staticmethod
    def _signature(value: Any) -> str:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _capture_progress_snapshot(self) -> dict[str, Any]:
        workspace_files: dict[str, str] = {}
        if self.state.workspace.exists():
            for path in sorted(self.state.workspace.rglob("*")):
                if not path.is_file():
                    continue
                relative = str(path.relative_to(self.state.workspace))
                try:
                    workspace_files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
                except OSError:
                    workspace_files[relative] = "unreadable"
        fetch_records = self.state.tool_state.get("fetchRecords") or []
        return {
            "taskStatus": self.state.task.status,
            "steps": [
                {"id": step.id, "status": step.status, "evidence": step.evidence}
                for step in self.state.task.steps
            ],
            "submissionAccepted": self.state.submission is not None,
            "workspaceFiles": workspace_files,
            "loadedSkills": sorted(set(self.state.tool_state.get("loadedSkills") or [])),
            "loadedSkillEntrypoints": dict(
                self.state.tool_state.get("loadedSkillEntrypoints") or {}
            ),
            "skillReadProgress": dict(self.state.tool_state.get("skillReadProgress") or {}),
            "uniqueReads": len(self.state.tool_state.get("governanceReads") or []),
            "fetchRecordCount": len(fetch_records),
            "candidate": dict(self.state.tool_state.get("pageCandidate") or {}),
        }

    def _mark_stalled(self, reason: str) -> None:
        if self._stalled_reason:
            return
        self._stalled_reason = reason
        self.state.task.status = "stalled"
        self.state.tool_state["governance"] = {
            "status": "stalled",
            "reason": reason,
            "turn": self.state.task.totalTurns,
            "noProgressTurns": self._no_progress_turns,
            "proseOnlyTurns": self._prose_only_turns,
            "repeatedToolErrorCount": self._repeated_tool_error_count,
            "repeatedValidationErrorCount": self._repeated_validation_error_count,
        }
        self.state.save_task()
        self.state.save_tool_state()
        if self.logger:
            self.logger.record_stalled(self.base.identity, self.role.name, reason)

    def _record_tool_result(
        self, tool: str, arguments: dict[str, Any], output: str, is_error: bool
    ) -> None:
        if not is_error and tool in {
            "skill_read", "context_read", "artifact_read", "artifact_search"
        }:
            reads = self.state.tool_state.setdefault("governanceReads", [])
            read_signature = self._signature({"tool": tool, "arguments": arguments})
            if read_signature not in reads:
                reads.append(read_signature)
                self.state.save_tool_state()
        if is_error:
            signature = self._signature({
                "tool": tool,
                "arguments": arguments,
                "output": " ".join(output.split()),
            })
            if signature == self._last_tool_error_signature:
                self._repeated_tool_error_count += 1
            else:
                self._last_tool_error_signature = signature
                self._repeated_tool_error_count = 1
        else:
            self._last_tool_error_signature = ""
            self._repeated_tool_error_count = 0

        if tool == "check_page":
            if is_error:
                try:
                    parsed = json.loads(output)
                    failures = parsed.get("failures", output)
                except (json.JSONDecodeError, TypeError, AttributeError):
                    failures = output
                validation_signature = self._signature(failures)
                if validation_signature == self._last_validation_signature:
                    self._repeated_validation_error_count += 1
                else:
                    self._last_validation_signature = validation_signature
                    self._repeated_validation_error_count = 1
            else:
                self._last_validation_signature = ""
                self._repeated_validation_error_count = 0

        reason = ""
        if self._repeated_tool_error_count >= _PROGRESS_CONFIG.repeated_tool_error_limit:
            reason = (
                f"same tool failure repeated {self._repeated_tool_error_count} times: {tool}"
            )
        elif (
            self._repeated_validation_error_count
            >= _PROGRESS_CONFIG.repeated_validation_error_limit
        ):
            reason = (
                "same validation failure repeated "
                f"{self._repeated_validation_error_count} times"
            )
        if reason:
            self._mark_stalled(reason)
            self._save_checkpoint("stalled:repeated-error")
            raise ManagedAgentStalled(f"{self.base.identity} stalled: {reason}")

    def _restore_checkpoint(self) -> None:
        if not self.checkpoint_path.exists():
            return
        saved = AgentCheckpoint.model_validate_json(self.checkpoint_path.read_text(encoding="utf-8"))
        if saved.roleVersion != self.role.version:
            if self.state.submission is not None:
                return
            # A role/protocol upgrade can change the context schema and skill contract. Replaying
            # old messages would mix both protocols, so preserve the run/task budget but restart
            # this unfinished worker from its new authoritative prompt and context.
            self.state.task.status = "pending"
            for step in self.state.task.steps:
                step.status = "pending"
                step.evidence = ""
            self.state.save_task()
            self.state.tool_state.update({
                "loadedSkills": [],
                "loadedSkillEntrypoints": {},
                "skillReadProgress": {},
                "governanceReads": [],
            })
            self.state.save_tool_state()
            if self.logger:
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(),
                    "kind": "checkpoint-protocol-restart",
                    "agent": self.base.identity,
                    "savedRoleVersion": saved.roleVersion,
                    "currentRoleVersion": self.role.version,
                    "preservedTotalTurns": self.state.task.totalTurns,
                })
            return
        messages = [ConversationMessage.model_validate(message) for message in saved.messages]
        if messages:
            self.base.load_messages(messages)
        self._compact_count = saved.compactCount
        self._checkpoint_id = saved.checkpointId
        self._progress_snapshot = saved.progressSnapshot or self._capture_progress_snapshot()
        self._last_progress_turn = saved.lastProgressTurn
        self._no_progress_turns = saved.noProgressTurns
        self._prose_only_turns = saved.proseOnlyTurns
        self._last_tool_error_signature = saved.lastToolErrorSignature
        self._repeated_tool_error_count = saved.repeatedToolErrorCount
        self._last_validation_signature = saved.lastValidationSignature
        self._repeated_validation_error_count = saved.repeatedValidationErrorCount
        self._stalled_reason = saved.stalledReason
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "checkpoint-restored", "agent": self.base.identity,
                "messages": len(messages), "totalTurns": self.state.task.totalTurns,
            })

    def _save_checkpoint(self, reason: str) -> None:
        if reason == "assistant-turn":
            # Persist every turn immediately. A process loss in the middle of a long
            # QueryEngine call must not reset the worker's total-turn budget on resume.
            self.state.task.totalTurns += 1
            self.state.save_task()
            current = self._capture_progress_snapshot()
            changed = [
                key for key in current
                if current.get(key) != self._progress_snapshot.get(key)
            ]
            if changed:
                self._last_progress_turn = self.state.task.totalTurns
                self._no_progress_turns = 0
                self._progress_snapshot = current
                if self.logger:
                    self.logger.record_progress(
                        self.base.identity, self.role.name,
                        progressed=True, reason="changed:" + ",".join(changed),
                    )
            else:
                self._no_progress_turns += 1
                if self.logger:
                    self.logger.record_progress(
                        self.base.identity, self.role.name,
                        progressed=False,
                        reason=f"no observable change for {self._no_progress_turns} turns",
                    )
            if self.base.last_turn_had_tools:
                self._prose_only_turns = 0
            else:
                self._prose_only_turns += 1
        if reason in {
            "compact:microcompact_end", "compact:compact_end",
            "compact:context_collapse_end", "compact:session_memory_end",
        }:
            self._compact_count += 1
            self.state.tool_state["skillReloadEpoch"] = self._compact_count
            self.state.tool_state["loadedSkills"] = []
            self.state.tool_state["loadedSkillEntrypoints"] = {}
            self.state.tool_state["skillReadProgress"] = {}
            self.state.save_tool_state()
        usage = self.base.engine.total_usage
        checkpoint = AgentCheckpoint(
            workerId=self.state.task.workerId,
            role=self.role.name,
            roleVersion=self.role.version,
            checkpointId=self._checkpoint_id,
            messages=[message.model_dump(mode="json") for message in self.base.engine.messages],
            usage={"inputTokens": usage.input_tokens, "outputTokens": usage.output_tokens},
            toolMetadata=dict(self.base.engine.tool_metadata),
            totalTurns=self.state.task.totalTurns,
            compactCount=self._compact_count,
            progressSnapshot=self._progress_snapshot,
            lastProgressTurn=self._last_progress_turn,
            noProgressTurns=self._no_progress_turns,
            proseOnlyTurns=self._prose_only_turns,
            lastToolErrorSignature=self._last_tool_error_signature,
            repeatedToolErrorCount=self._repeated_tool_error_count,
            lastValidationSignature=self._last_validation_signature,
            repeatedValidationErrorCount=self._repeated_validation_error_count,
            stalledReason=self._stalled_reason,
            updatedAt=now(),
        )
        _atomic_json(self.checkpoint_path, checkpoint)
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "checkpoint", "agent": self.base.identity,
                "reason": reason, "messages": len(checkpoint.messages),
                "totalTurns": checkpoint.totalTurns, "compactCount": checkpoint.compactCount,
            })
        if reason == "assistant-turn" and self.state.submission is None:
            stall_reason = ""
            if self._no_progress_turns >= _PROGRESS_CONFIG.no_progress_turns:
                stall_reason = f"no observable progress for {self._no_progress_turns} turns"
            elif self._prose_only_turns >= _PROGRESS_CONFIG.prose_only_turns:
                stall_reason = f"no tool use for {self._prose_only_turns} consecutive turns"
            if stall_reason:
                self._mark_stalled(stall_reason)
                # Persist the stalled flag after the regular checkpoint written above.
                checkpoint.stalledReason = self._stalled_reason
                _atomic_json(self.checkpoint_path, checkpoint)
                raise ManagedAgentStalled(
                    f"{self.base.identity} stalled: {self._stalled_reason}"
                )
            used_tokens = usage.input_tokens + usage.output_tokens
            if used_tokens >= self.role.max_total_tokens:
                self.state.task.status = "failed"
                self.state.save_task()
                raise ManagedAgentBudgetExceeded(
                    f"{self.base.identity} exhausted token budget after turn "
                    f"{self.state.task.totalTurns}: tokens={used_tokens}/{self.role.max_total_tokens}"
                )
            if self.logger:
                self.logger.enforce_run_limits()

    async def run_task(self, prompt: str) -> Any:
        if self.state.submission is not None:
            return self.state.submission
        if self._stalled_reason:
            raise ManagedAgentStalled(
                f"{self.base.identity} remains stalled: {self._stalled_reason}"
            )
        self.state.task.status = "in_progress"
        self.state.save_task()
        task_snapshot = self.state.task.model_dump(mode="json")
        prompt = (
            prompt
            + "\n\nHarness task state (authoritative; do not manually narrate progress):\n"
            + json.dumps(task_snapshot, ensure_ascii=False)
            + "\nNormal tool events update this ledger automatically. Use report_blocker only for a real blocker."
        )
        if hasattr(self.client, "prepare"):
            self.client.prepare(prompt)
        started = time.monotonic()
        next_prompt = prompt
        while self.state.submission is None:
            if self.logger:
                self.logger.enforce_run_limits()
            remaining_turns = self.role.max_total_turns - self.state.task.totalTurns
            remaining_time = self.role.max_duration_sec - self.state.task.elapsedSec
            usage = self.base.engine.total_usage
            used_tokens = usage.input_tokens + usage.output_tokens
            remaining_tokens = self.role.max_total_tokens - used_tokens
            if remaining_turns <= 0 or remaining_time <= 0 or remaining_tokens <= 0:
                self.state.task.status = "failed"
                self.state.save_task()
                self._save_checkpoint("budget-exhausted")
                raise ManagedAgentBudgetExceeded(
                    f"{self.base.identity} exhausted budget: turns={self.state.task.totalTurns}/"
                    f"{self.role.max_total_turns}, activeSec={self.state.task.elapsedSec:.1f}/"
                    f"{self.role.max_duration_sec}, tokens={used_tokens}/{self.role.max_total_tokens}"
                )
            self.base.set_max_turns(min(self.role.max_turns, remaining_turns))
            try:
                query_timeout = min(remaining_time, self.role.max_query_duration_sec)
                async with asyncio.timeout(query_timeout):
                    result = await self.base.run(next_prompt)
            except BaseException as exc:
                self.state.task.elapsedSec += time.monotonic() - started
                self.state.task.status = (
                    "stalled" if isinstance(exc, ManagedAgentStalled) else "failed"
                )
                self.state.save_task()
                self._save_checkpoint("query-error")
                raise
            elapsed = time.monotonic() - started
            started = time.monotonic()
            self.state.task.elapsedSec += elapsed
            self.state.save_task()
            self._save_checkpoint("query-complete")
            if self.state.task.status == "blocked":
                raise ManagedAgentBlocked(f"{self.base.identity} reported a blocker")
            if self.state.submission is None:
                pending = [step.id for step in self.state.task.steps if step.status != "completed"]
                next_prompt = (
                    "No structured artifact has been accepted. Continue this same task. "
                    f"Harness-observed pending steps: {pending}. Use the task tools and {self.submit_tool}; "
                    "a prose answer is not completion. Do not manually update the ledger."
                )
                if hasattr(self.client, "prepare"):
                    self.client.prepare(next_prompt)
        return self.state.submission
