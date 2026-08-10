"""Run-scoped tools for independently governed Notale workers.

The builder surface is intentionally semantic and file-backed: one ``submit_page``
call writes the page, performs deterministic delivery checks, and accepts the final
artifact. Failed pages remain in ``workspace/page.html`` for targeted repair. The
private scratch directory is reserved for harness checks and is not exposed to the
model as a tool surface.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from openharness.tools.base import BaseTool, ToolExecutionContext, ToolResult
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from notale.core.models import AgentTaskState, PageArtifact, PageStatus, SkillAssignment
from notale.utils.config import get_config
from notale.utils.skill_catalog import load_skill_descriptor


_TOOLS_CONFIG = get_config().tools


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _inside(root: Path, candidate: str) -> Path:
    if not candidate or Path(candidate).is_absolute():
        raise ValueError("path must be a non-empty relative path")
    resolved = (root / candidate).resolve()
    root = root.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError("path escapes the allowed workspace")
    return resolved


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class ManagedToolState:
    run_dir: Path
    worker_dir: Path
    task: AgentTaskState
    allowed_skills: dict[str, dict[str, Any]]
    submit_validator: Callable[[dict[str, Any]], Any]
    validation_context: dict[str, Any] = field(default_factory=dict)
    tool_state: dict[str, Any] = field(default_factory=dict)
    event_callback: Callable[[str, dict[str, Any]], None] | None = None
    submission: Any | None = None

    @property
    def workspace(self) -> Path:
        return self.worker_dir / "workspace"

    @property
    def scratch(self) -> Path:
        return self.workspace / "scratch"

    @property
    def page_path(self) -> Path:
        return self.workspace / "page.html"

    @property
    def task_path(self) -> Path:
        return self.worker_dir / "task.json"

    def save_task(self) -> None:
        self.task.updatedAt = _now()
        _atomic_write(self.task_path, self.task.model_dump_json(indent=2))

    def save_submission(self) -> None:
        value = self.submission
        if hasattr(value, "model_dump_json"):
            text = value.model_dump_json(indent=2)
        else:
            text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
        _atomic_write(self.worker_dir / "submission.json", text)

    def save_tool_state(self) -> None:
        _atomic_write(
            self.worker_dir / "tool-state.json",
            json.dumps(self.tool_state, ensure_ascii=False, indent=2, default=str),
        )

    def event(self, kind: str, **fields: Any) -> None:
        if self.event_callback is not None:
            self.event_callback(kind, fields)

    def skill_progress_key(self, name: str) -> str:
        return name

    def skill_is_loaded(self, name: str) -> bool:
        if name not in self.allowed_skills:
            return False
        key = self.skill_progress_key(name)
        epoch = int(self.tool_state.get("skillReloadEpoch", 0) or 0)
        loaded_epochs = self.tool_state.get("skillLoadedEpochs") or {}
        return (
            name in (self.tool_state.get("loadedSkills") or [])
            and loaded_epochs.get(key) == epoch
        )

    def missing_loaded_skills(self) -> list[str]:
        missing: list[str] = []
        for name in self.allowed_skills:
            if self.skill_is_loaded(name):
                continue
            missing.append(name)
        return missing

    def complete_step(self, step_id: str, evidence: str) -> None:
        step = next((item for item in self.task.steps if item.id == step_id), None)
        if step is None or step.status == "completed":
            return
        step.status = "completed"
        step.evidence = evidence
        step.updatedAt = _now()
        self.task.status = "in_progress"
        self.save_task()
        self.event("task-updated", stepId=step.id, status="completed", evidence=evidence,
                   source="harness")

    def complete_all_steps(self, evidence: str) -> None:
        for step in self.task.steps:
            if step.status != "completed":
                step.status = "completed"
                step.evidence = evidence
                step.updatedAt = _now()
                self.event("task-updated", stepId=step.id, status="completed",
                           evidence=evidence, source="harness")
        self.save_task()

def load_assigned_skills(
    skills_root: Path,
    assignments: list[SkillAssignment],
) -> dict[str, dict[str, Any]]:
    """Load each assigned skill plus only its selected profile and local instruction."""
    assigned: dict[str, dict[str, Any]] = {}
    for assignment in assignments:
        descriptor = load_skill_descriptor(skills_root, assignment.name)
        parts = [descriptor.body]
        if assignment.profile is not None:
            if assignment.profile not in descriptor.profiles:
                raise ValueError(
                    f"profile does not belong to skill: "
                    f"{assignment.name}:{assignment.profile}"
                )
            parts.append(descriptor.profile_references[assignment.profile])
        elif descriptor.profiles:
            raise ValueError(f"skill requires one profile: {assignment.name}")
        if assignment.instruction:
            parts.append("# Assignment Instruction\n\n" + assignment.instruction)
        content = "\n\n".join(parts)
        assigned[assignment.name] = {
            "metadata": {
                "name": descriptor.name,
                "description": descriptor.description,
            },
            "content": content,
            "path": str(skills_root / assignment.name / "SKILL.md"),
            "assignment": assignment.model_dump(mode="json"),
            "sha256": _sha256(content),
            "catalogSha256": descriptor.sha256,
        }
    return assigned


class SkillReadInput(BaseModel):
    name: str
    offset: int = Field(default=0, ge=0)
    limit: int = Field(
        default=_TOOLS_CONFIG.skill_chunk_default_chars,
        ge=_TOOLS_CONFIG.skill_chunk_min_chars,
        le=_TOOLS_CONFIG.chunk_max_chars,
    )
    reload: bool = Field(
        default=False,
        description="Compatibility hint; only a harness-recorded compact opens a reload epoch",
    )


class AssignedSkillTool(BaseTool):
    name = "skill_read"
    description = (
        "Read an assigned skill sequentially in bounded chunks until nextOffset=EOF. "
        "Unassigned skills are denied."
    )
    input_model = SkillReadInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    def is_read_only(self, arguments: SkillReadInput) -> bool:
        return True

    async def execute(self, arguments: SkillReadInput, context: ToolExecutionContext) -> ToolResult:
        del context
        skill = self.state.allowed_skills.get(arguments.name)
        if skill is None:
            return ToolResult(output=f"skill is not assigned: {arguments.name}", is_error=True)
        content = str(skill["content"])
        loaded = self.state.tool_state.setdefault("loadedSkills", [])
        epoch = int(self.state.tool_state.get("skillReloadEpoch", 0) or 0)
        loaded_epochs = self.state.tool_state.setdefault("skillLoadedEpochs", {})
        key = self.state.skill_progress_key(arguments.name)
        if self.state.skill_is_loaded(arguments.name):
            return ToolResult(output=(
                f"skill {arguments.name!r} is already loaded "
                "in full and no compact has occurred; "
                "continue directly with the task. Model-supplied reload cannot override the harness."
            ), metadata={
                "skill": arguments.name,
                "alreadyLoaded": True,
                "reloadEpoch": epoch,
            })
        progress_store = self.state.tool_state.setdefault("skillReadProgress", {})
        progress = progress_store.get(key) or {}
        expected_offset = 0
        if (
            progress.get("reloadEpoch") == epoch
            and progress.get("totalChars") == len(content)
        ):
            expected_offset = int(progress.get("nextOffset") or 0)
        if arguments.offset != expected_offset:
            return ToolResult(
                output=(
                    f"skill {arguments.name!r} must be read "
                    f"sequentially; continue with offset={expected_offset}"
                ),
                is_error=True,
                metadata={
                    "skill": arguments.name,
                    "expectedOffset": expected_offset,
                    "reloadEpoch": epoch,
                },
            )
        chunk = content[arguments.offset : arguments.offset + arguments.limit]
        next_offset = arguments.offset + len(chunk)
        complete = next_offset >= len(content)
        progress_store[key] = {
            "skill": arguments.name,
            "reloadEpoch": epoch,
            "totalChars": len(content),
            "nextOffset": None if complete else next_offset,
            "complete": complete,
        }
        event_kind = "skill-chunk-read"
        if complete:
            if arguments.name not in loaded:
                loaded.append(arguments.name)
            loaded_epochs[key] = epoch
            event_kind = "skill-loaded"
        self.state.save_tool_state()
        self.state.event(
            event_kind,
            skill=arguments.name,
            profile=skill["assignment"].get("profile"),
            skillSha256=skill["sha256"],
            catalogSkillSha256=skill["catalogSha256"],
            offset=arguments.offset,
            returnedChars=len(chunk),
            totalChars=len(content),
            nextOffset=None if complete else next_offset,
            reloadEpoch=epoch,
        )
        header = (
            f"[skill name={arguments.name!r} offset={arguments.offset} "
            f"returnedChars={len(chunk)} totalChars={len(content)} "
            f"nextOffset={next_offset if not complete else 'EOF'}]\n"
        )
        return ToolResult(output=header + chunk, metadata={
            "skill": arguments.name,
            "profile": skill["assignment"].get("profile"),
            "skillSha256": skill["sha256"],
            "catalogSkillSha256": skill["catalogSha256"],
            "totalChars": len(content),
            "nextOffset": None if complete else next_offset,
            "complete": complete,
        })


class ArtifactReadInput(BaseModel):
    path: str
    offset: int = Field(default=0, ge=0)
    limit: int = Field(
        default=_TOOLS_CONFIG.artifact_chunk_default_chars,
        ge=1,
        le=_TOOLS_CONFIG.chunk_max_chars,
    )


class ArtifactReadTool(BaseTool):
    name = "artifact_read"
    description = "Read a shared run artifact by relative path with offset/limit. Agent state is private."
    input_model = ArtifactReadInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    def is_read_only(self, arguments: ArtifactReadInput) -> bool:
        return True

    async def execute(self, arguments: ArtifactReadInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            path = _inside(self.state.run_dir, arguments.path)
            if path == self.state.run_dir / "agents" or (self.state.run_dir / "agents") in path.parents:
                raise ValueError("other agent state is private")
            text = path.read_text(encoding="utf-8")
        except Exception as exc:
            return ToolResult(output=str(exc), is_error=True)
        chunk = text[arguments.offset : arguments.offset + arguments.limit]
        return ToolResult(
            output=(f"[artifact path={arguments.path!r} offset={arguments.offset} "
                    f"returnedChars={len(chunk)} totalChars={len(text)}]\n" + chunk),
            metadata={"path": arguments.path, "totalChars": len(text)},
        )


class ArtifactSearchInput(BaseModel):
    path: str
    query: str
    max_results: int = Field(
        default=_TOOLS_CONFIG.search_default_results,
        ge=1,
        le=_TOOLS_CONFIG.search_max_results,
    )


class ArtifactSearchTool(BaseTool):
    name = "artifact_search"
    description = "Search literal text in a shared run artifact and return matching lines."
    input_model = ArtifactSearchInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    def is_read_only(self, arguments: ArtifactSearchInput) -> bool:
        return True

    async def execute(self, arguments: ArtifactSearchInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            path = _inside(self.state.run_dir, arguments.path)
            if path == self.state.run_dir / "agents" or (self.state.run_dir / "agents") in path.parents:
                raise ValueError("other agent state is private")
            text = path.read_text(encoding="utf-8")
        except Exception as exc:
            return ToolResult(output=str(exc), is_error=True)
        matches = [
            f"{number}: {line}" for number, line in enumerate(text.splitlines(), 1)
            if arguments.query.lower() in line.lower()
        ][: arguments.max_results]
        return ToolResult(output="\n".join(matches) or "(no matches)")


class ContextReadInput(BaseModel):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(
        default=_TOOLS_CONFIG.context_chunk_default_chars,
        ge=_TOOLS_CONFIG.context_chunk_min_chars,
        le=_TOOLS_CONFIG.chunk_max_chars,
    )


class ContextReadTool(BaseTool):
    name = "context_read"
    description = (
        "Read the PageContext assigned to this builder in bounded chunks. Takes no path; "
        "continue at nextOffset until EOF."
    )
    input_model = ContextReadInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    def is_read_only(self, arguments: ContextReadInput) -> bool:
        return True

    async def execute(self, arguments: ContextReadInput, context: ToolExecutionContext) -> ToolResult:
        del context
        relative = str(self.state.validation_context.get("context_path", ""))
        try:
            path = _inside(self.state.run_dir, relative)
            text = path.read_text(encoding="utf-8")
        except Exception as exc:
            return ToolResult(output=str(exc), is_error=True)
        if arguments.offset >= len(text) and text:
            return ToolResult(output=f"offset {arguments.offset} exceeds totalChars={len(text)}",
                              is_error=True)
        chunk = text[arguments.offset : arguments.offset + arguments.limit]
        next_offset = arguments.offset + len(chunk)
        if next_offset >= len(text):
            self.state.complete_step("load-context", f"read {relative} sha256={_sha256(text)}")
        header = (
            f"[context offset={arguments.offset} returnedChars={len(chunk)} totalChars={len(text)} "
            f"nextOffset={next_offset if next_offset < len(text) else 'EOF'}]\n"
        )
        return ToolResult(output=header + chunk, metadata={
            "path": relative, "sha256": _sha256(text),
            "nextOffset": next_offset if next_offset < len(text) else None,
        })


class SubmitPageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    html: str = Field(min_length=1)
    designSpec: dict[str, Any] = Field(default_factory=dict)
    boundReferences: list[str] = Field(default_factory=list)
    speakerNotes: str = ""

    @model_validator(mode="before")
    @classmethod
    def accept_json_encoded_metadata(cls, value: Any) -> Any:
        """Tolerate providers that stringify structured tool arguments."""
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        for key in ("designSpec", "boundReferences"):
            raw = normalized.get(key)
            if not isinstance(raw, str):
                continue
            try:
                normalized[key] = json.loads(raw)
            except json.JSONDecodeError:
                if key == "boundReferences" and raw.strip():
                    normalized[key] = [raw.strip()]
        return normalized


_DOCUMENT_SHELL = re.compile(
    r"<!doctype\b[^>]*>|</?\s*(?:html|head|body)\b[^>]*>",
    re.I,
)


def _normalize_page_fragment(html: str) -> tuple[str, int]:
    """Remove a document shell while preserving all page-owned content.

    The assembled slide supplies the outer document and embeds this fragment in an
    iframe. Models occasionally emit harmless ``html/head/body`` wrappers despite
    that contract. Repairing those wrappers is deterministic infrastructure work,
    not a reason to spend another agent turn rereading and rewriting the page.
    """
    normalized, removed = _DOCUMENT_SHELL.subn("", html)
    return normalized.strip(), removed


class PageReadInput(BaseModel):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(
        default=_TOOLS_CONFIG.page_read_default_chars,
        ge=1,
        le=_TOOLS_CONFIG.chunk_max_chars,
    )


class PageReadTool(BaseTool):
    name = "page_read"
    description = "Read a bounded chunk of workspace/page.html for recovery or inspection."
    input_model = PageReadInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    def is_read_only(self, arguments: PageReadInput) -> bool:
        return True

    async def execute(self, arguments: PageReadInput, context: ToolExecutionContext) -> ToolResult:
        del context
        if not self.state.page_path.is_file():
            return ToolResult(output="page.html does not exist", is_error=True)
        text = self.state.page_path.read_text(encoding="utf-8")
        chunk = text[arguments.offset : arguments.offset + arguments.limit]
        return ToolResult(output=(f"[page.html recovery-read offset={arguments.offset} "
                                  f"returnedChars={len(chunk)} totalChars={len(text)}; "
                                  "use only for targeted recovery]\n" + chunk))


class PageSearchInput(BaseModel):
    query: str = Field(min_length=1)
    max_results: int = Field(
        default=_TOOLS_CONFIG.search_default_results,
        ge=1,
        le=_TOOLS_CONFIG.search_max_results,
    )


class PageSearchTool(BaseTool):
    name = "page_search"
    description = "Search literal text in workspace/page.html and return matching line numbers."
    input_model = PageSearchInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    def is_read_only(self, arguments: PageSearchInput) -> bool:
        return True

    async def execute(self, arguments: PageSearchInput, context: ToolExecutionContext) -> ToolResult:
        del context
        if not self.state.page_path.is_file():
            return ToolResult(output="page.html does not exist", is_error=True)
        text = self.state.page_path.read_text(encoding="utf-8")
        matches = [f"{number}: {line}" for number, line in enumerate(text.splitlines(), 1)
                   if arguments.query.lower() in line.lower()][: arguments.max_results]
        return ToolResult(output="\n".join(matches) or "(no matches)")


class PagePatchInput(BaseModel):
    old: str = Field(min_length=1)
    new: str


class PagePatchTool(BaseTool):
    name = "page_patch"
    description = (
        "Repair one exact occurrence in the page retained after a failed submit_page; "
        "the harness automatically rechecks and submits the repaired page."
    )
    input_model = PagePatchInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: PagePatchInput, context: ToolExecutionContext) -> ToolResult:
        del context
        missing_skills = self.state.missing_loaded_skills()
        if missing_skills:
            return ToolResult(
                output=(
                    "page_patch blocked: read every assigned skill to nextOffset=EOF first; "
                    f"missing={missing_skills}"
                ),
                is_error=True,
                metadata={"missingSkills": missing_skills},
            )
        if not self.state.page_path.is_file():
            return ToolResult(output="page.html does not exist", is_error=True)
        metadata = self.state.tool_state.get("pageSubmission")
        if not isinstance(metadata, dict):
            return ToolResult(
                output=(
                    "page_patch is available only after submit_page retained a failed page; "
                    "call submit_page with the complete HTML and metadata"
                ),
                is_error=True,
            )
        text = self.state.page_path.read_text(encoding="utf-8")
        count = text.count(arguments.old)
        if count != 1:
            return ToolResult(output=f"old string must occur exactly once; occurrences={count}",
                              is_error=True)
        updated = text.replace(arguments.old, arguments.new, 1)
        _atomic_write(self.state.page_path, updated)
        digest = _sha256(updated)
        self.state.event("page-patched", chars=len(updated), sha256=digest)
        return _validate_and_accept_page(self.state, metadata)


class DictSubmitInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payload: dict[str, Any]

    @model_validator(mode="before")
    @classmethod
    def accept_direct_artifact(cls, value: Any) -> Any:
        """Normalize native tool calls and provider-stringified structured fields."""
        if not isinstance(value, dict):
            return value
        payload = value.get("payload") if "payload" in value else value
        if isinstance(payload, str) and payload.strip().startswith("{"):
            try:
                decoded_payload = json.loads(payload)
            except json.JSONDecodeError:
                decoded_payload = None
            if isinstance(decoded_payload, dict):
                payload = decoded_payload
        if not isinstance(payload, dict):
            return value
        normalized = dict(payload)
        for key, raw in normalized.items():
            if not isinstance(raw, str) or not raw.strip().startswith(("[", "{")):
                continue
            try:
                decoded = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(decoded, (list, dict)):
                normalized[key] = decoded
        return {"payload": normalized}


class SubmitArtifactTool(BaseTool):
    description = "Submit the validated structured artifact; accepted submission proves task completion."

    def __init__(self, state: ManagedToolState, name: str) -> None:
        self.state = state
        self.name = name
        self.input_model = DictSubmitInput

    async def execute(self, arguments: DictSubmitInput, context: ToolExecutionContext) -> ToolResult:
        del context
        payload: Any = arguments.payload
        if hasattr(payload, "model_dump"):
            payload = payload.model_dump(mode="json")
        try:
            validated = self.state.submit_validator(payload)
        except (ValidationError, ValueError, TypeError) as exc:
            return ToolResult(output=f"submission rejected: {exc}", is_error=True)
        self.state.submission = validated
        self.state.save_submission()
        self.state.complete_all_steps("validated structured submission accepted")
        self.state.task.status = "completed"
        self.state.task.submittedArtifact = "submission.json"
        self.state.save_task()
        self.state.event("submission-accepted", artifact="submission.json")
        return ToolResult(output="submission accepted", metadata={"accepted": True})


_SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script\s*>", re.I | re.S)


def _page_failure(
    state: ManagedToolState,
    html: str,
    failures: list[str],
    *,
    scripts: int = 0,
) -> ToolResult:
    state.event("page-checked", passed=False, htmlChars=len(html), failures=failures)
    return ToolResult(
        output=json.dumps({
            "passed": False,
            "failures": failures,
            "htmlChars": len(html),
            "inlineScripts": scripts,
        }, ensure_ascii=False, indent=2),
        is_error=True,
        metadata={"validationFailed": True},
    )


def _validate_and_accept_page(
    state: ManagedToolState,
    metadata: dict[str, Any],
) -> ToolResult:
    """Run the deterministic page gate and persist an accepted submission."""
    from notale.core.stages.page_check import page_delivery_failures

    if not state.page_path.is_file():
        return ToolResult(output="workspace/page.html does not exist", is_error=True)
    html = state.page_path.read_text(encoding="utf-8")
    payload = dict(metadata)
    payload.update({
        "pageId": str(state.validation_context.get("page_id", state.task.workerId)),
        "html": html,
        "status": PageStatus.DRAFTED.value,
    })
    try:
        page = PageArtifact.model_validate(payload)
    except ValidationError as exc:
        return _page_failure(state, html, [f"page schema rejected: {exc}"])

    failures = page_delivery_failures(
        page,
        set(state.validation_context.get("valid_record_ids", [])),
        run_dir=state.run_dir,
    )
    scripts = _SCRIPT.findall(html)
    if scripts:
        check_file = state.scratch / ".inline-page-check.js"
        check_file.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write(check_file, "\n;\n".join(scripts))
        try:
            checked = subprocess.run(
                ["node", "--check", check_file.name], cwd=check_file.parent,
                capture_output=True, text=True,
                timeout=_TOOLS_CONFIG.inline_js_check_timeout_sec, check=False,
            )
            if checked.returncode != 0:
                failures.append(
                    "inline JS syntax error: "
                    + checked.stderr.strip()[: _TOOLS_CONFIG.inline_js_error_max_chars]
                )
        except (OSError, subprocess.SubprocessError) as exc:
            failures.append(f"inline JS syntax check unavailable: {exc}")

    pending = [
        step.id for step in state.task.steps
        if step.id not in {"implement-check", "submit-page"} and step.status != "completed"
    ]
    if pending:
        failures.append(f"required harness events are missing before submission: {pending}")
    if failures:
        return _page_failure(state, html, failures, scripts=len(scripts))

    try:
        validated = state.submit_validator(page.model_dump(mode="json"))
    except (ValidationError, ValueError, TypeError) as exc:
        return _page_failure(state, html, [f"submission rejected: {exc}"], scripts=len(scripts))

    digest = _sha256(html)
    state.complete_step("implement-check", f"page checks passed sha256={digest}")
    state.event("page-checked", passed=True, sha256=digest, htmlChars=len(html))
    state.submission = validated
    state.save_submission()
    state.complete_step("submit-page", f"submission.json sha256={digest}")
    state.complete_all_steps(f"validated page accepted sha256={digest}")
    state.task.status = "completed"
    state.task.submittedArtifact = "submission.json"
    state.save_task()
    state.event("submission-accepted", artifact="submission.json", sha256=digest)
    return ToolResult(
        output=json.dumps({
            "passed": True,
            "accepted": True,
            "sha256": digest,
            "htmlChars": len(html),
            "inlineScripts": len(scripts),
        }, ensure_ascii=False),
        metadata={"accepted": True, "sha256": digest},
    )


class SubmitPageTool(BaseTool):
    name = "submit_page"
    description = (
        "Write the complete HTML fragment and page metadata, run schema/offline/reference/inline-JS "
        "checks, and atomically accept the page when all checks pass."
    )
    input_model = SubmitPageInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: SubmitPageInput, context: ToolExecutionContext) -> ToolResult:
        del context
        missing_skills = self.state.missing_loaded_skills()
        if missing_skills:
            return ToolResult(
                output=(
                    "submit_page blocked: read every assigned skill to nextOffset=EOF first; "
                    f"missing={missing_skills}"
                ),
                is_error=True,
                metadata={"missingSkills": missing_skills},
            )
        html, removed_shell_tags = _normalize_page_fragment(arguments.html)
        if not html:
            return ToolResult(
                output="page fragment is empty after document-shell normalization",
                is_error=True,
            )
        metadata = arguments.model_dump(mode="json", exclude={"html"})
        self.state.page_path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write(self.state.page_path, html)
        self.state.tool_state["pageSubmission"] = metadata
        self.state.save_tool_state()
        digest = _sha256(html)
        self.state.event(
            "page-written", chars=len(html), sha256=digest,
            normalizedDocumentShellTags=removed_shell_tags,
        )
        result = _validate_and_accept_page(self.state, metadata)
        result.metadata["normalizedDocumentShellTags"] = removed_shell_tags
        return result


class ReportBlockerInput(BaseModel):
    reason: str = Field(min_length=1, max_length=_TOOLS_CONFIG.blocker_reason_max_chars)
    evidence: str = Field(default="", max_length=_TOOLS_CONFIG.blocker_evidence_max_chars)


class ReportBlockerTool(BaseTool):
    name = "report_blocker"
    description = "Stop this worker as genuinely blocked with a concise reason and evidence."
    input_model = ReportBlockerInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: ReportBlockerInput, context: ToolExecutionContext) -> ToolResult:
        del context
        self.state.task.status = "blocked"
        for step in self.state.task.steps:
            if step.status != "completed":
                step.status = "blocked"
                step.evidence = arguments.evidence or arguments.reason
                step.updatedAt = _now()
        self.state.save_task()
        self.state.event("task-blocked", reason=arguments.reason, evidence=arguments.evidence)
        return ToolResult(output="blocker recorded; stop work and return")


def build_managed_tools(
    state: ManagedToolState,
    allowed_names: list[str],
    *,
    submit_tool: str,
    role_name: str,
    extra_tools: list[BaseTool] | None = None,
) -> list[BaseTool]:
    """Instantiate exactly the authorized tools, preserving whitelist order."""
    extras = {tool.name: tool for tool in extra_tools or []}
    factories: dict[str, Callable[[], BaseTool]] = {
        "skill_read": lambda: AssignedSkillTool(state),
        "artifact_read": lambda: ArtifactReadTool(state),
        "artifact_search": lambda: ArtifactSearchTool(state),
        "context_read": lambda: ContextReadTool(state),
        "page_read": lambda: PageReadTool(state),
        "page_search": lambda: PageSearchTool(state),
        "page_patch": lambda: PagePatchTool(state),
        "report_blocker": lambda: ReportBlockerTool(state),
    }
    if {"acquire_media", "generate_media"} & set(allowed_names):
        from notale.tools.media import AcquireMediaTool, GenerateMediaTool

        factories.update({
            "acquire_media": lambda: AcquireMediaTool(state),
            "generate_media": lambda: GenerateMediaTool(state),
        })

    tools: list[BaseTool] = []
    for name in allowed_names:
        if name in extras:
            tool = extras[name]
        elif name == submit_tool:
            tool = (
                SubmitPageTool(state)
                if name == "submit_page"
                else SubmitArtifactTool(state, name)
            )
        else:
            factory = factories.get(name)
            tool = factory() if factory else None
        if tool is None:
            raise ValueError(f"role {role_name} declares unavailable tool: {name}")
        tools.append(tool)
    return tools
