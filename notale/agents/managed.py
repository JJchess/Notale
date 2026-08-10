"""Persistent, run-local OpenHarness workers with task and submission gates."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import traceback
import uuid
from collections import defaultdict, deque
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

from openharness.api.client import ApiMessageCompleteEvent
from openharness.api.openai_client import OpenAICompatibleClient
from openharness.api.usage import UsageSnapshot
from openharness.config.settings import PermissionSettings
from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock
from openharness.engine.query import MaxTurnsExceeded
from openharness.engine.query_engine import QueryEngine
from openharness.engine.stream_events import (
    AssistantTurnComplete,
    CompactProgressEvent,
    ErrorEvent,
    StatusEvent,
    ToolExecutionCompleted,
    ToolExecutionStarted,
)
from openharness.permissions.checker import PermissionChecker
from openharness.permissions.modes import PermissionMode
from openharness.services.token_estimation import estimate_tokens
from openharness.tools.base import ToolRegistry
from pydantic import BaseModel

from notale.core.models import (
    AgentCheckpoint,
    AgentTaskState,
    AgentTaskStep,
    SkillAssignment,
)
from notale.core.observability import ExperimentLogger, now
from notale.roles.base import RoleSpec
from notale.tools.agent_tools import (
    ManagedToolState,
    build_managed_tools,
    load_assigned_skills,
)
from notale.utils.config import get_config
from notale.utils.parsing import extract_json


SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills"
_CONFIG = get_config()
_PROGRESS_CONFIG = _CONFIG.governance.progress
_RUNTIME_CONFIG = _CONFIG.runtime


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
                self.logger.metrics["retries"] += int(attempt > 1)
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
            submission = {
                key: self._fixture_page.get(key, default)
                for key, default in (
                    ("html", ""), ("designSpec", {}),
                    ("boundReferences", []), ("speakerNotes", ""),
                )
            }
            message = ConversationMessage(
                role="assistant", content=[ToolUseBlock(name="submit_page", input=submission)]
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


def _atomic_json(path: Path, value: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(value.model_dump_json(indent=2), encoding="utf-8")
    tmp.replace(path)


def _native_client(llm: Any, profile: RoleSpec) -> tuple[Any, RoleSpec]:
    """Resolve one model config into an OpenHarness streaming client and role."""
    if llm is not None and hasattr(llm, "stream_message"):
        return llm, profile
    inner = getattr(llm, "inner", llm) if llm is not None else None
    # FakeClient and compatible fixtures are intentionally completed by the test bridge.
    if inner is not None and any(cls.__name__ == "FakeClient" for cls in type(inner).__mro__):
        return inner, profile
    base_url = getattr(inner, "base_url", profile.base_url)
    model = getattr(inner, "model", profile.model)
    api_key_env = getattr(inner, "api_key_env", profile.api_key_env)
    api_key = (os.environ.get(api_key_env) or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(f"缺 API key：设环境变量 {api_key_env} 或 OPENAI_API_KEY")
    configured_timeout = getattr(inner, "timeout", _CONFIG.model.http_timeout_sec)
    timeout = min(float(configured_timeout), profile.request_timeout_sec)
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
        assigned_skills: list[str | SkillAssignment] | None = None,
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

        raw_assignments = assigned_skills if assigned_skills is not None else []
        assignments = [
            item if isinstance(item, SkillAssignment) else SkillAssignment(name=item)
            for item in raw_assignments
        ]
        skill_names = [item.name for item in assignments]
        if len(skill_names) != len(set(skill_names)):
            raise ValueError("assigned skills contain duplicate names")
        unauthorized_skills = sorted(set(skill_names) - set(role.authorized_skills))
        if unauthorized_skills:
            raise ValueError(
                f"role {role.name} does not permit assigned skills: {unauthorized_skills}"
            )
        skills = load_assigned_skills(SKILLS_ROOT, assignments)

        tool_state_path = self.worker_dir / "tool-state.json"
        tool_state = (
            json.loads(tool_state_path.read_text(encoding="utf-8"))
            if tool_state_path.exists() else {}
        )
        tool_state.pop("assignedSkillEntrypoints", None)
        tool_state.pop("loadedSkillEntrypoints", None)
        tool_state.pop("systemProfiles", None)
        if submit_tool == "submit_page":
            tool_state.pop("pageCandidate", None)
            (self.worker_dir / "candidate.json").unlink(missing_ok=True)
        tool_state.update({
            "assignedSkills": skill_names,
            "skillAssignments": [item.model_dump(mode="json") for item in assignments],
            "allowedTools": role.allowed_tools,
            "skillPolicy": role.skill_policy.metadata(),
            "roleDocument": role.document_metadata(),
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
        progress_snapshot = self._capture_progress_snapshot()
        if (self.worker_dir / "submission.json").exists():
            saved = json.loads((self.worker_dir / "submission.json").read_text(encoding="utf-8"))
            self.state.submission = submit_validator(saved)
            if all(step.status == "completed" for step in task.steps):
                task.status = "completed"
                task.submittedArtifact = "submission.json"
                self.state.save_task()

        tools = build_managed_tools(
            self.state,
            role.allowed_tools,
            submit_tool=submit_tool,
            role_name=role.name,
            extra_tools=extra_tools,
        )

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
        self.identity = identity
        self.tools = tools
        registry = ToolRegistry()
        for tool in tools:
            registry.register(tool)
        self.system_prompt = effective_role.rendered_system_prompt()
        tool_schema = json.dumps(registry.to_api_schema(), ensure_ascii=False, default=str)
        self.context_overhead_tokens = int(
            _RUNTIME_CONFIG.context_token_safety_factor
            * (estimate_tokens(self.system_prompt) + estimate_tokens(tool_schema))
        )
        compact_threshold = max(
            _RUNTIME_CONFIG.minimum_message_compact_threshold_tokens,
            effective_role.auto_compact_threshold_tokens - self.context_overhead_tokens,
        )
        tool_metadata = {
            "stage": stage,
            "workerId": worker_id,
            "roleVersion": effective_role.version,
            "pageType": (validation_context or {}).get("page_type"),
        }
        self.engine = QueryEngine(
            api_client=native,
            tool_registry=registry,
            permission_checker=PermissionChecker(
                PermissionSettings(mode=PermissionMode.FULL_AUTO)
            ),
            cwd=self.state.workspace,
            model=effective_role.model,
            system_prompt=self.system_prompt,
            max_turns=effective_role.max_turns,
            max_tokens=effective_role.max_tokens,
            context_window_tokens=effective_role.context_window_tokens,
            auto_compact_threshold_tokens=compact_threshold,
            permission_prompt=None,
            ask_user_prompt=None,
            tool_metadata=tool_metadata,
        )
        self._compact_metadata_cursor = 0
        self.last_turn_had_tools = False
        self.checkpoint = AgentCheckpoint(
            workerId=worker_id,
            role=effective_role.name,
            roleVersion=effective_role.version,
            checkpointId=uuid.uuid4().hex,
            progressSnapshot=progress_snapshot,
            toolMetadata=tool_metadata,
            updatedAt=now(),
        )
        self._restore_checkpoint()
        if logger:
            logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "skills-assigned", "agent": f"{stage}:{worker_id}",
                "skills": skill_names,
                "assignments": [item.model_dump(mode="json") for item in assignments],
                "allowedTools": role.allowed_tools,
                "skillPolicy": role.skill_policy.metadata(),
                "roleDocument": role.document_metadata(),
            })

    def _record_hidden_compactions(self) -> None:
        """Promote OpenHarness microcompact metadata into Notale's audit stream."""
        checkpoints = self.engine.tool_metadata.get("compact_checkpoints", [])
        if not isinstance(checkpoints, list):
            return
        new = checkpoints[self._compact_metadata_cursor :]
        self._compact_metadata_cursor = len(checkpoints)
        for entry in new:
            if (
                not isinstance(entry, dict)
                or entry.get("checkpoint") != "query_microcompact_end"
                or int(entry.get("tokens_freed", 0) or 0) <= 0
            ):
                continue
            if self.logger:
                self.logger.record_control_event(self.identity, self.role.name, "compact")
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "compact", "agent": self.identity,
                    "event": {"phase": "microcompact_end", **entry},
                })
            self._save_checkpoint("compact:microcompact_end")

    async def _run_query(self, prompt: str) -> str:
        """Run one QueryEngine invocation inside this persistent worker."""
        pending_inputs: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
        receipts: list[dict[str, Any]] = []
        text = ""
        turns = 0
        terminal_error: str | None = None
        turn_started = time.monotonic()
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "agent-start", "agent": self.identity,
                "role": self.role.name, "model": self.role.model,
                "baseUrl": self.role.base_url, "maxTurns": self.role.max_turns,
                "maxTokens": self.role.max_tokens,
                "systemPrompt": self.system_prompt, "prompt": prompt,
            })
            self.logger.summary(self.identity, "agent started", model=self.role.model)
        try:
            async for event in self.engine.submit_message(prompt):
                self._record_hidden_compactions()
                if isinstance(event, ToolExecutionStarted):
                    pending_inputs[event.tool_name].append(dict(event.tool_input))
                    if self.logger:
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "tool-start", "agent": self.identity,
                            "tool": event.tool_name, "input": event.tool_input,
                        })
                elif isinstance(event, ToolExecutionCompleted):
                    tool_input = (
                        pending_inputs[event.tool_name].popleft()
                        if pending_inputs[event.tool_name]
                        else {}
                    )
                    receipts.append({
                        "name": event.tool_name,
                        "args": tool_input,
                        "output": str(event.output)[: _RUNTIME_CONFIG.tool_receipt_preview_chars],
                        "is_error": event.is_error,
                    })
                    if self.logger:
                        validation_failure = False
                        if event.is_error and event.tool_name in {"submit_page", "page_patch"}:
                            try:
                                parsed_output = json.loads(str(event.output))
                                validation_failure = (
                                    isinstance(parsed_output, dict)
                                    and isinstance(parsed_output.get("failures"), list)
                                )
                            except (json.JSONDecodeError, TypeError):
                                pass
                        self.logger.record_tool(
                            self.identity,
                            self.role.name,
                            event.tool_name,
                            is_error=event.is_error,
                            error_kind=(
                                "external"
                                if event.tool_name in {
                                    "web_search", "fetch_web", "acquire_media", "generate_media"
                                }
                                else "validation"
                                if validation_failure
                                else "protocol"
                            ),
                        )
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "tool-end", "agent": self.identity,
                            "tool": event.tool_name, "output": event.output,
                            "isError": event.is_error,
                        })
                    self._record_tool_result(
                        event.tool_name, tool_input, event.output, event.is_error
                    )
                    self._save_checkpoint("tool-execution")
                    turn_started = time.monotonic()
                    if self.state.submission is not None:
                        break
                elif isinstance(event, AssistantTurnComplete):
                    turns += 1
                    self.last_turn_had_tools = bool(event.message.tool_uses)
                    if event.message.text:
                        text = event.message.text
                    if self.logger:
                        message = (
                            event.message.model_dump(mode="json")
                            if hasattr(event.message, "model_dump")
                            else str(event.message)
                        )
                        usage = {
                            "input_tokens": event.usage.input_tokens,
                            "output_tokens": event.usage.output_tokens,
                        }
                        duration_sec = round(time.monotonic() - turn_started, 3)
                        context_tokens = event.usage.input_tokens
                        page_type = str(self.engine.tool_metadata.get("pageType") or "") or None
                        self.logger.record_turn(
                            self.identity,
                            self.role.name,
                            usage,
                            duration_sec=duration_sec,
                            context_tokens=context_tokens,
                            page_type=page_type,
                        )
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "assistant-turn", "agent": self.identity,
                            "turn": turns, "message": message, "usage": usage,
                        })
                        context = [
                            item.model_dump(mode="json") for item in self.engine.messages
                        ]
                        self.logger.append("llm-calls.jsonl", {
                            "ts": now(), "kind": "openharness-turn", "agent": self.identity,
                            "role": self.role.name, "model": self.role.model,
                            "baseUrl": self.role.base_url, "turn": turns,
                            "durationSec": duration_sec,
                            "messageCount": len(context),
                            "contextHash": hashlib.sha256(json.dumps(
                                context, ensure_ascii=False, separators=(",", ":")
                            ).encode("utf-8")).hexdigest(),
                            "contextOverheadTokens": self.context_overhead_tokens,
                            "contextTokens": context_tokens,
                            "usage": usage,
                        })
                    self._save_checkpoint("assistant-turn")
                    turn_started = time.monotonic()
                elif isinstance(event, CompactProgressEvent):
                    if self.logger:
                        if event.phase in {
                            "compact_end", "context_collapse_end", "session_memory_end"
                        }:
                            self.logger.record_control_event(
                                self.identity, self.role.name, "compact"
                            )
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "compact", "agent": self.identity,
                            "event": event.__dict__,
                        })
                    self._save_checkpoint(f"compact:{event.phase}")
                elif isinstance(event, (ErrorEvent, StatusEvent)):
                    if isinstance(event, ErrorEvent):
                        terminal_error = event.message
                    if self.logger:
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": type(event).__name__,
                            "agent": self.identity, "event": event.__dict__,
                        })
            self._record_hidden_compactions()
        except MaxTurnsExceeded:
            if self.logger:
                self.logger.record_control_event(self.identity, self.role.name, "max-turns")
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "max-turns", "agent": self.identity,
                    "turns": turns, "partialResponse": text,
                })
        except BaseException as exc:
            if self.logger:
                self.logger.metrics["errors"] += 1
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "agent-error", "agent": self.identity,
                    "error": {
                        "type": type(exc).__name__,
                        "message": str(exc),
                        "traceback": "".join(traceback.format_exception(exc)),
                    },
                })
            raise
        if terminal_error is not None and turns == 0:
            raise RuntimeError(
                f"OpenHarness query failed before an assistant turn: {terminal_error}"
            )
        usage = self.engine.total_usage
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "agent-end", "agent": self.identity,
                "turns": turns, "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens, "response": text,
                "toolReceipts": receipts,
            })
            self.logger.summary(
                self.identity,
                "agent complete",
                turns=turns,
                tokens=usage.input_tokens + usage.output_tokens,
            )
        return text

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
            "skillReadProgress": dict(self.state.tool_state.get("skillReadProgress") or {}),
            "uniqueReads": len(self.state.tool_state.get("governanceReads") or []),
            "fetchRecordCount": len(fetch_records),
            "toolErrorSignature": getattr(
                getattr(self, "checkpoint", None), "lastToolErrorSignature", ""
            ),
            "pageSubmissionReady": isinstance(
                self.state.tool_state.get("pageSubmission"), dict
            ),
        }

    def _mark_stalled(self, reason: str) -> None:
        if self.checkpoint.stalledReason:
            return
        self.checkpoint.stalledReason = reason
        self.state.task.status = "stalled"
        self.state.tool_state["governance"] = {
            "status": "stalled",
            "reason": reason,
            "turn": self.state.task.totalTurns,
            "noProgressTurns": self.checkpoint.noProgressTurns,
            "proseOnlyTurns": self.checkpoint.proseOnlyTurns,
            "repeatedToolErrorCount": self.checkpoint.repeatedToolErrorCount,
            "repeatedValidationErrorCount": self.checkpoint.repeatedValidationErrorCount,
        }
        self.state.save_task()
        self.state.save_tool_state()
        if self.logger:
            self.logger.record_stalled(self.identity, self.role.name, reason)

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
            if signature == self.checkpoint.lastToolErrorSignature:
                self.checkpoint.repeatedToolErrorCount += 1
            else:
                self.checkpoint.lastToolErrorSignature = signature
                self.checkpoint.repeatedToolErrorCount = 1
        else:
            self.checkpoint.lastToolErrorSignature = ""
            self.checkpoint.repeatedToolErrorCount = 0

        if tool in {"submit_page", "page_patch"}:
            failures: Any | None = None
            if is_error:
                try:
                    parsed = json.loads(output)
                    if isinstance(parsed, dict):
                        failures = parsed.get("failures")
                except (json.JSONDecodeError, TypeError, AttributeError):
                    pass
            if failures is not None:
                validation_signature = self._signature(failures)
                if validation_signature == self.checkpoint.lastValidationSignature:
                    self.checkpoint.repeatedValidationErrorCount += 1
                else:
                    self.checkpoint.lastValidationSignature = validation_signature
                    self.checkpoint.repeatedValidationErrorCount = 1
            elif not is_error:
                self.checkpoint.lastValidationSignature = ""
                self.checkpoint.repeatedValidationErrorCount = 0

        reason = ""
        if (
            self.checkpoint.repeatedToolErrorCount
            >= _PROGRESS_CONFIG.repeated_tool_error_limit
        ):
            reason = (
                "same tool failure repeated "
                f"{self.checkpoint.repeatedToolErrorCount} times: {tool}"
            )
        elif (
            self.checkpoint.repeatedValidationErrorCount
            >= _PROGRESS_CONFIG.repeated_validation_error_limit
        ):
            reason = (
                "same validation failure repeated "
                f"{self.checkpoint.repeatedValidationErrorCount} times"
            )
        if reason:
            self._mark_stalled(reason)
            self._save_checkpoint("stalled:repeated-error")
            raise ManagedAgentStalled(f"{self.identity} stalled: {reason}")

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
                "skillReadProgress": {},
                "governanceReads": [],
            })
            self.state.save_tool_state()
            if self.logger:
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(),
                    "kind": "checkpoint-protocol-restart",
                    "agent": self.identity,
                    "savedRoleVersion": saved.roleVersion,
                    "currentRoleVersion": self.role.version,
                    "preservedTotalTurns": self.state.task.totalTurns,
                })
            return
        messages = [ConversationMessage.model_validate(message) for message in saved.messages]
        if messages:
            self.engine.load_messages(messages)
        if not saved.progressSnapshot:
            saved.progressSnapshot = self._capture_progress_snapshot()
        self.checkpoint = saved
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "checkpoint-restored", "agent": self.identity,
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
                if current.get(key) != self.checkpoint.progressSnapshot.get(key)
            ]
            if changed:
                self.checkpoint.lastProgressTurn = self.state.task.totalTurns
                self.checkpoint.noProgressTurns = 0
                self.checkpoint.progressSnapshot = current
                if self.logger:
                    self.logger.record_progress(
                        self.identity, self.role.name,
                        progressed=True, reason="changed:" + ",".join(changed),
                    )
            else:
                self.checkpoint.noProgressTurns += 1
                if self.logger:
                    self.logger.record_progress(
                        self.identity, self.role.name,
                        progressed=False,
                        reason=(
                            "no observable change for "
                            f"{self.checkpoint.noProgressTurns} turns"
                        ),
                    )
            if self.last_turn_had_tools:
                self.checkpoint.proseOnlyTurns = 0
            else:
                self.checkpoint.proseOnlyTurns += 1
        if reason in {
            "compact:microcompact_end", "compact:compact_end",
            "compact:context_collapse_end", "compact:session_memory_end",
        }:
            self.checkpoint.compactCount += 1
            self.state.tool_state["skillReloadEpoch"] = self.checkpoint.compactCount
            self.state.tool_state["loadedSkills"] = []
            self.state.tool_state["skillReadProgress"] = {}
            self.state.save_tool_state()
        usage = self.engine.total_usage
        self.checkpoint.messages = [
            message.model_dump(mode="json") for message in self.engine.messages
        ]
        self.checkpoint.usage = {
            "inputTokens": usage.input_tokens,
            "outputTokens": usage.output_tokens,
        }
        self.checkpoint.toolMetadata = dict(self.engine.tool_metadata)
        self.checkpoint.totalTurns = self.state.task.totalTurns
        self.checkpoint.updatedAt = now()
        _atomic_json(self.checkpoint_path, self.checkpoint)
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "checkpoint", "agent": self.identity,
                "reason": reason, "messages": len(self.checkpoint.messages),
                "totalTurns": self.checkpoint.totalTurns,
                "compactCount": self.checkpoint.compactCount,
            })
        if reason == "assistant-turn" and self.state.submission is None:
            stall_reason = ""
            if self.checkpoint.noProgressTurns >= _PROGRESS_CONFIG.no_progress_turns:
                stall_reason = (
                    f"no observable progress for {self.checkpoint.noProgressTurns} turns"
                )
            elif self.checkpoint.proseOnlyTurns >= _PROGRESS_CONFIG.prose_only_turns:
                stall_reason = (
                    f"no tool use for {self.checkpoint.proseOnlyTurns} consecutive turns"
                )
            if stall_reason:
                self._mark_stalled(stall_reason)
                # Persist the stalled flag after the regular checkpoint written above.
                _atomic_json(self.checkpoint_path, self.checkpoint)
                raise ManagedAgentStalled(
                    f"{self.identity} stalled: {self.checkpoint.stalledReason}"
                )
            used_tokens = usage.input_tokens + usage.output_tokens
            if used_tokens >= self.role.max_total_tokens:
                self.state.task.status = "failed"
                self.state.save_task()
                raise ManagedAgentBudgetExceeded(
                    f"{self.identity} exhausted token budget after turn "
                    f"{self.state.task.totalTurns}: tokens={used_tokens}/{self.role.max_total_tokens}"
                )
            if self.logger:
                self.logger.enforce_run_limits()

    async def run_task(self, prompt: str) -> Any:
        if self.state.submission is not None:
            return self.state.submission
        if self.checkpoint.stalledReason:
            raise ManagedAgentStalled(
                f"{self.identity} remains stalled: {self.checkpoint.stalledReason}"
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
            usage = self.engine.total_usage
            used_tokens = usage.input_tokens + usage.output_tokens
            remaining_tokens = self.role.max_total_tokens - used_tokens
            if remaining_turns <= 0 or remaining_time <= 0 or remaining_tokens <= 0:
                self.state.task.status = "failed"
                self.state.save_task()
                self._save_checkpoint("budget-exhausted")
                raise ManagedAgentBudgetExceeded(
                    f"{self.identity} exhausted budget: turns={self.state.task.totalTurns}/"
                    f"{self.role.max_total_turns}, activeSec={self.state.task.elapsedSec:.1f}/"
                    f"{self.role.max_duration_sec}, tokens={used_tokens}/{self.role.max_total_tokens}"
                )
            self.engine.set_max_turns(min(self.role.max_turns, remaining_turns))
            try:
                query_timeout = min(remaining_time, self.role.max_query_duration_sec)
                async with asyncio.timeout(query_timeout):
                    await self._run_query(next_prompt)
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
                raise ManagedAgentBlocked(f"{self.identity} reported a blocker")
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
