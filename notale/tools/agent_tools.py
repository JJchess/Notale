"""Run-scoped tools for independently governed Notale workers.

The builder surface is intentionally semantic and file-backed: a model emits the page
HTML once into ``workspace/page.html``; checking and submission subsequently pass only
small metadata and a content hash.  Scratch files remain available as an instrumented,
private escape hatch but can never become the submitted artifact.
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

import yaml
from openharness.tools.base import BaseTool, ToolExecutionContext, ToolResult
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from notale.core.models import AgentTaskState, PageArtifact, PageStatus
from notale.utils.config import get_config


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


class EmptyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


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
    def candidate_path(self) -> Path:
        return self.worker_dir / "candidate.json"

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
        skill = self.allowed_skills[name]
        return f"{name}::{skill['entrypoint']}"

    def skill_is_loaded(self, name: str) -> bool:
        if name not in self.allowed_skills:
            return False
        key = self.skill_progress_key(name)
        epoch = int(self.tool_state.get("skillReloadEpoch", 0) or 0)
        loaded_epochs = self.tool_state.get("skillLoadedEpochs") or {}
        loaded_entrypoints = self.tool_state.get("loadedSkillEntrypoints") or {}
        return (
            name in (self.tool_state.get("loadedSkills") or [])
            and loaded_entrypoints.get(name) == self.allowed_skills[name]["entrypoint"]
            and loaded_epochs.get(key) == epoch
        )

    def missing_loaded_skills(self) -> list[str]:
        missing: list[str] = []
        for name, skill in self.allowed_skills.items():
            if self.skill_is_loaded(name):
                continue
            locked = skill.get("locked_entrypoint")
            missing.append(f"{name}:{locked}" if locked else name)
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

    def invalidate_candidate(self, reason: str) -> None:
        if self.candidate_path.exists():
            self.candidate_path.unlink()
        self.tool_state.pop("pageCandidate", None)
        self.save_tool_state()
        self.event("page-candidate-invalidated", reason=reason)

    def has_current_candidate(self) -> bool:
        if not self.page_path.is_file() or not self.candidate_path.is_file():
            return False
        try:
            candidate = json.loads(self.candidate_path.read_text(encoding="utf-8"))
            return candidate.get("sha256") == _sha256(self.page_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return False

    def record_scratch(self, tool: str, *, is_error: bool) -> None:
        usage = self.tool_state.setdefault("scratchUsage", {"calls": 0, "errors": 0, "tools": {}})
        usage["calls"] = int(usage.get("calls", 0)) + 1
        if is_error:
            usage["errors"] = int(usage.get("errors", 0)) + 1
        tools = usage.setdefault("tools", {})
        tools[tool] = int(tools.get(tool, 0)) + 1
        self.save_tool_state()
        self.event("scratch-used", tool=tool, isError=is_error)


_SKILL_TOKEN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _parse_skill_document(text: str) -> tuple[dict[str, Any], str]:
    metadata: dict[str, Any] = {}
    body = text
    if text.startswith("---\n"):
        marker = text.find("\n---\n", 4)
        if marker >= 0:
            metadata = yaml.safe_load(text[4:marker]) or {}
            body = text[marker + 5 :]
    return metadata, body.strip()


def load_assigned_skills(
    skills_root: Path,
    names: list[str],
    entrypoints: dict[str, str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Load one authorized entrypoint per skill without exposing sibling resources."""

    locked_entrypoints = dict(entrypoints or {})
    unknown = sorted(set(locked_entrypoints) - set(names))
    if unknown:
        raise ValueError(f"skill entrypoints name unassigned skills: {unknown}")
    assigned: dict[str, dict[str, Any]] = {}
    for name in names:
        if _SKILL_TOKEN.fullmatch(name) is None:
            raise ValueError(f"invalid assigned skill name: {name!r}")
        path = skills_root / name / "SKILL.md"
        if not path.is_file():
            raise ValueError(f"assigned skill not found: {name}")
        text = path.read_text(encoding="utf-8")
        metadata, body = _parse_skill_document(text)
        declared = str(metadata.get("name", name))
        if declared != name:
            raise ValueError(f"skill directory/name mismatch: {name} != {declared}")
        entrypoint_dir = path.parent / "entrypoints"
        locked = locked_entrypoints.get(name)
        if locked is not None and _SKILL_TOKEN.fullmatch(locked) is None:
            raise ValueError(f"invalid skill entrypoint for {name}: {locked!r}")
        skill_metadata = metadata.get("metadata") or {}
        if not isinstance(skill_metadata, dict):
            raise ValueError(f"skill metadata must be a mapping: {name}")
        default_entrypoint = str(skill_metadata.get("default-entrypoint") or "default")
        if _SKILL_TOKEN.fullmatch(default_entrypoint) is None:
            raise ValueError(
                f"invalid default skill entrypoint for {name}: {default_entrypoint!r}"
            )
        resolved_entrypoint = locked or default_entrypoint
        selected_path = path
        selected_metadata = metadata
        selected_body = body
        if resolved_entrypoint != default_entrypoint:
            selected_path = entrypoint_dir / f"{resolved_entrypoint}.md"
            if not selected_path.is_file():
                raise ValueError(
                    f"assigned skill entrypoint not found: {name}:{resolved_entrypoint}"
                )
            entrypoint_metadata, selected_body = _parse_skill_document(
                selected_path.read_text(encoding="utf-8")
            )
            if entrypoint_metadata:
                entrypoint_name = str(entrypoint_metadata.get("name", name))
                if entrypoint_name != name:
                    raise ValueError(
                        f"skill entrypoint name mismatch: {name} != {entrypoint_name}"
                    )
                selected_metadata = {**metadata, **entrypoint_metadata}
        if not selected_body:
            raise ValueError(f"assigned skill entrypoint is empty: {name}:{resolved_entrypoint}")
        assigned[name] = {
            "metadata": selected_metadata,
            "content": selected_body,
            "path": str(selected_path),
            "entrypoint": resolved_entrypoint,
            "locked_entrypoint": locked,
        }
    return assigned


class SkillReadInput(BaseModel):
    name: str
    entrypoint: str | None = Field(
        default=None,
        pattern=r"^[a-z0-9][a-z0-9-]*$",
        description="Exact entrypoint from the assigned PageContext.skills item",
    )
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
        "Read an assigned skill entrypoint sequentially in bounded chunks until nextOffset=EOF. "
        "Use the exact entrypoint from PageContext.skills when present; unassigned skills and "
        "entrypoints are denied."
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
        resolved_entrypoint = str(skill["entrypoint"])
        locked_entrypoint = skill.get("locked_entrypoint")
        if locked_entrypoint is not None and arguments.entrypoint != locked_entrypoint:
            return ToolResult(
                output=(
                    f"skill entrypoint mismatch for {arguments.name}: pass "
                    f"entrypoint={locked_entrypoint!r} exactly as assigned in PageContext"
                ),
                is_error=True,
                metadata={
                    "skill": arguments.name,
                    "expectedEntrypoint": locked_entrypoint,
                },
            )
        if locked_entrypoint is None and arguments.entrypoint not in (
            None,
            resolved_entrypoint,
        ):
            return ToolResult(
                output=(
                    f"skill entrypoint is not assigned: "
                    f"{arguments.name}:{arguments.entrypoint}"
                ),
                is_error=True,
            )
        loaded = self.state.tool_state.setdefault("loadedSkills", [])
        epoch = int(self.state.tool_state.get("skillReloadEpoch", 0) or 0)
        loaded_epochs = self.state.tool_state.setdefault("skillLoadedEpochs", {})
        key = self.state.skill_progress_key(arguments.name)
        if self.state.skill_is_loaded(arguments.name):
            return ToolResult(output=(
                f"skill {arguments.name!r} entrypoint {resolved_entrypoint!r} is already loaded "
                "in full and no compact has occurred; "
                "continue directly with the task. Model-supplied reload cannot override the harness."
            ), metadata={
                "skill": arguments.name,
                "entrypoint": resolved_entrypoint,
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
                    f"skill {arguments.name!r} entrypoint {resolved_entrypoint!r} must be read "
                    f"sequentially; continue with offset={expected_offset}"
                ),
                is_error=True,
                metadata={
                    "skill": arguments.name,
                    "entrypoint": resolved_entrypoint,
                    "expectedOffset": expected_offset,
                    "reloadEpoch": epoch,
                },
            )
        chunk = content[arguments.offset : arguments.offset + arguments.limit]
        next_offset = arguments.offset + len(chunk)
        complete = next_offset >= len(content)
        progress_store[key] = {
            "skill": arguments.name,
            "entrypoint": resolved_entrypoint,
            "reloadEpoch": epoch,
            "totalChars": len(content),
            "nextOffset": None if complete else next_offset,
            "complete": complete,
        }
        event_kind = "skill-chunk-read"
        if complete:
            if arguments.name not in loaded:
                loaded.append(arguments.name)
            loaded_entrypoints = self.state.tool_state.setdefault("loadedSkillEntrypoints", {})
            loaded_entrypoints[arguments.name] = resolved_entrypoint
            loaded_epochs[key] = epoch
            event_kind = "skill-loaded"
        self.state.save_tool_state()
        self.state.event(
            event_kind,
            skill=arguments.name,
            entrypoint=resolved_entrypoint,
            offset=arguments.offset,
            returnedChars=len(chunk),
            totalChars=len(content),
            nextOffset=None if complete else next_offset,
            reloadEpoch=epoch,
        )
        header = (
            f"[skill name={arguments.name!r} entrypoint={resolved_entrypoint!r} "
            f"offset={arguments.offset} "
            f"returnedChars={len(chunk)} totalChars={len(content)} "
            f"nextOffset={next_offset if not complete else 'EOF'}]\n"
        )
        return ToolResult(output=header + chunk, metadata={
            "skill": arguments.name,
            "entrypoint": resolved_entrypoint,
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


class PageWriteInput(BaseModel):
    html: str = Field(min_length=1)


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


class PageWriteTool(BaseTool):
    name = "page_write"
    description = (
        "Create or fully replace the assigned workspace/page.html fragment. "
        "Harmless doctype/html/head/body wrapper tags are removed automatically."
    )
    input_model = PageWriteInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: PageWriteInput, context: ToolExecutionContext) -> ToolResult:
        del context
        missing_skills = self.state.missing_loaded_skills()
        if missing_skills:
            return ToolResult(
                output=(
                    "page_write blocked: read every assigned skill to nextOffset=EOF first; "
                    f"missing={missing_skills}"
                ),
                is_error=True,
                metadata={"missingSkills": missing_skills},
            )
        html, removed_shell_tags = _normalize_page_fragment(arguments.html)
        if not html:
            return ToolResult(output="page fragment is empty after document-shell normalization",
                              is_error=True)
        self.state.page_path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write(self.state.page_path, html)
        self.state.invalidate_candidate("page_write")
        digest = _sha256(html)
        self.state.event(
            "page-written", chars=len(html), sha256=digest,
            normalizedDocumentShellTags=removed_shell_tags,
        )
        normalization = (
            f" normalizedDocumentShellTags={removed_shell_tags}."
            if removed_shell_tags else ""
        )
        return ToolResult(output=(
            f"page.html written chars={len(html)} sha256={digest}.{normalization} "
            "Next required action: call check_page now. Do not reread page.html unless "
            "check_page reports a concrete failure."
        ), metadata={"sha256": digest, "normalizedDocumentShellTags": removed_shell_tags})


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
        if self.state.has_current_candidate():
            return ToolResult(output=(
                "page_read skipped: the current page already passed check_page. "
                "Call submit_page now."
            ), metadata={"candidateReady": True})
        text = self.state.page_path.read_text(encoding="utf-8")
        chunk = text[arguments.offset : arguments.offset + arguments.limit]
        return ToolResult(output=(f"[page.html recovery-read offset={arguments.offset} "
                                  f"returnedChars={len(chunk)} totalChars={len(text)}; "
                                  "do not scan the whole file; call check_page]\n" + chunk))


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
        if self.state.has_current_candidate():
            return ToolResult(output=(
                "page_search skipped: the current page already passed check_page. "
                "Call submit_page now."
            ), metadata={"candidateReady": True})
        text = self.state.page_path.read_text(encoding="utf-8")
        matches = [f"{number}: {line}" for number, line in enumerate(text.splitlines(), 1)
                   if arguments.query.lower() in line.lower()][: arguments.max_results]
        return ToolResult(output="\n".join(matches) or "(no matches)")


class PagePatchInput(BaseModel):
    old: str = Field(min_length=1)
    new: str


class PagePatchTool(BaseTool):
    name = "page_patch"
    description = "Replace one exact occurrence in workspace/page.html; use page_write as fallback."
    input_model = PagePatchInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: PagePatchInput, context: ToolExecutionContext) -> ToolResult:
        del context
        if not self.state.page_path.is_file():
            return ToolResult(output="page.html does not exist", is_error=True)
        text = self.state.page_path.read_text(encoding="utf-8")
        count = text.count(arguments.old)
        if count != 1:
            return ToolResult(output=f"old string must occur exactly once; occurrences={count}",
                              is_error=True)
        updated = text.replace(arguments.old, arguments.new, 1)
        _atomic_write(self.state.page_path, updated)
        self.state.invalidate_candidate("page_patch")
        digest = _sha256(updated)
        self.state.event("page-patched", chars=len(updated), sha256=digest)
        return ToolResult(output=(
            f"page.html patched chars={len(updated)} sha256={digest}. "
            "Call check_page now; do not reread unless that check fails."
        ))


class ScratchPathInput(BaseModel):
    path: str
    offset: int = Field(default=0, ge=0)
    limit: int = Field(
        default=_TOOLS_CONFIG.scratch_read_default_chars,
        ge=1,
        le=_TOOLS_CONFIG.chunk_max_chars,
    )


class ScratchWriteInput(BaseModel):
    path: str
    content: str


class ScratchPatchInput(BaseModel):
    path: str
    old: str = Field(min_length=1)
    new: str


class ScratchSearchInput(BaseModel):
    path: str
    query: str = Field(min_length=1)
    max_results: int = Field(
        default=_TOOLS_CONFIG.search_default_results,
        ge=1,
        le=_TOOLS_CONFIG.search_max_results,
    )


class ScratchReadTool(BaseTool):
    name = "scratch_read"
    description = "Read a bounded chunk of a private scratch file; scratch cannot be submitted."
    input_model = ScratchPathInput

    def __init__(self, state: ManagedToolState) -> None: self.state = state
    def is_read_only(self, arguments: ScratchPathInput) -> bool: return True

    async def execute(self, arguments: ScratchPathInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            text = _inside(self.state.scratch, arguments.path).read_text(encoding="utf-8")
            output = text[arguments.offset : arguments.offset + arguments.limit]
            self.state.record_scratch(self.name, is_error=False)
            return ToolResult(output=output)
        except Exception as exc:
            self.state.record_scratch(self.name, is_error=True)
            return ToolResult(output=str(exc), is_error=True)


class ScratchWriteTool(BaseTool):
    name = "scratch_write"
    description = "Write a private scratch file; scratch cannot be submitted."
    input_model = ScratchWriteInput

    def __init__(self, state: ManagedToolState) -> None: self.state = state

    async def execute(self, arguments: ScratchWriteInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            path = _inside(self.state.scratch, arguments.path)
            _atomic_write(path, arguments.content)
            self.state.record_scratch(self.name, is_error=False)
            return ToolResult(output=f"scratch/{arguments.path} written")
        except Exception as exc:
            self.state.record_scratch(self.name, is_error=True)
            return ToolResult(output=str(exc), is_error=True)


class ScratchPatchTool(BaseTool):
    name = "scratch_patch"
    description = "Replace one exact occurrence in a private scratch file."
    input_model = ScratchPatchInput

    def __init__(self, state: ManagedToolState) -> None: self.state = state

    async def execute(self, arguments: ScratchPatchInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            path = _inside(self.state.scratch, arguments.path)
            text = path.read_text(encoding="utf-8")
            if text.count(arguments.old) != 1:
                raise ValueError(f"old string must occur exactly once; occurrences={text.count(arguments.old)}")
            _atomic_write(path, text.replace(arguments.old, arguments.new, 1))
            self.state.record_scratch(self.name, is_error=False)
            return ToolResult(output=f"scratch/{arguments.path} patched")
        except Exception as exc:
            self.state.record_scratch(self.name, is_error=True)
            return ToolResult(output=str(exc), is_error=True)


class ScratchSearchTool(BaseTool):
    name = "scratch_search"
    description = "Search literal text in a private scratch file."
    input_model = ScratchSearchInput

    def __init__(self, state: ManagedToolState) -> None: self.state = state
    def is_read_only(self, arguments: ScratchSearchInput) -> bool: return True

    async def execute(self, arguments: ScratchSearchInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            text = _inside(self.state.scratch, arguments.path).read_text(encoding="utf-8")
            matches = [f"{number}: {line}" for number, line in enumerate(text.splitlines(), 1)
                       if arguments.query.lower() in line.lower()][: arguments.max_results]
            self.state.record_scratch(self.name, is_error=False)
            return ToolResult(output="\n".join(matches) or "(no matches)")
        except Exception as exc:
            self.state.record_scratch(self.name, is_error=True)
            return ToolResult(output=str(exc), is_error=True)


class DictSubmitInput(BaseModel):
    payload: dict[str, Any]


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


class PageCandidateInput(BaseModel):
    designSpec: dict[str, Any] = Field(default_factory=dict)
    boundReferences: list[str] = Field(default_factory=list)
    speakerNotes: str = ""


_SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script\s*>", re.I | re.S)


class CheckPageTool(BaseTool):
    name = "check_page"
    description = (
        "Check workspace/page.html with schema, offline-delivery and inline-JS syntax rules; "
        "store a hash-bound candidate for submit_page."
    )
    input_model = PageCandidateInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: PageCandidateInput, context: ToolExecutionContext) -> ToolResult:
        del context
        from notale.core.stages.page_check import page_delivery_failures

        if not self.state.page_path.is_file():
            return ToolResult(output="page.html does not exist; call page_write first", is_error=True)
        html = self.state.page_path.read_text(encoding="utf-8")
        payload = arguments.model_dump(mode="json")
        payload.update({
            "pageId": str(self.state.validation_context.get("page_id", self.state.task.workerId)),
            "html": html,
            "status": PageStatus.DRAFTED.value,
        })
        try:
            page = PageArtifact.model_validate(payload)
        except ValidationError as exc:
            return ToolResult(output=f"page schema rejected: {exc}", is_error=True)
        failures = page_delivery_failures(
            page,
            set(self.state.validation_context.get("valid_record_ids", [])),
            run_dir=self.state.run_dir,
        )
        scripts = _SCRIPT.findall(html)
        if scripts:
            check_file = self.state.scratch / ".inline-page-check.js"
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
        if failures:
            self.state.invalidate_candidate("check_page_failed")
            return ToolResult(output=json.dumps({
                "passed": False, "failures": failures, "htmlChars": len(html),
            }, ensure_ascii=False, indent=2), is_error=True)
        digest = _sha256(html)
        candidate = {
            "sha256": digest,
            "page": page.model_dump(mode="json"),
            "checkedAt": _now(),
        }
        _atomic_write(self.state.candidate_path, json.dumps(candidate, ensure_ascii=False, indent=2))
        self.state.tool_state["pageCandidate"] = {"sha256": digest, "checkedAt": candidate["checkedAt"]}
        self.state.save_tool_state()
        self.state.complete_step("implement-check", f"check_page passed sha256={digest}")
        self.state.event("page-checked", passed=True, sha256=digest, htmlChars=len(html))
        return ToolResult(output=json.dumps({
            "passed": True, "sha256": digest, "htmlChars": len(html),
            "inlineScripts": len(scripts),
        }, ensure_ascii=False), metadata={"candidateSha256": digest})


class SubmitPageTool(BaseTool):
    name = "submit_page"
    description = "Submit the last passing hash-bound page candidate. Takes no HTML and no metadata."
    input_model = EmptyInput

    def __init__(self, state: ManagedToolState) -> None:
        self.state = state

    async def execute(self, arguments: EmptyInput, context: ToolExecutionContext) -> ToolResult:
        del arguments, context
        if not self.state.page_path.is_file() or not self.state.candidate_path.is_file():
            return ToolResult(output="no passing page candidate; call check_page first", is_error=True)
        html = self.state.page_path.read_text(encoding="utf-8")
        candidate = json.loads(self.state.candidate_path.read_text(encoding="utf-8"))
        digest = _sha256(html)
        if digest != candidate.get("sha256"):
            self.state.invalidate_candidate("stale_candidate")
            return ToolResult(output="page.html changed after check_page; check again", is_error=True)
        pending = [
            step.id for step in self.state.task.steps
            if step.id != "submit-page" and step.status != "completed"
        ]
        if pending:
            return ToolResult(
                output=f"required harness events are missing before submission: {pending}",
                is_error=True,
            )
        try:
            validated = self.state.submit_validator(candidate["page"])
        except (ValidationError, ValueError, TypeError) as exc:
            return ToolResult(output=f"submission rejected: {exc}", is_error=True)
        self.state.submission = validated
        self.state.save_submission()
        self.state.complete_step("submit-page", f"submission.json sha256={digest}")
        self.state.complete_all_steps(f"accepted page candidate sha256={digest}")
        self.state.task.status = "completed"
        self.state.task.submittedArtifact = "submission.json"
        self.state.save_task()
        self.state.event("submission-accepted", artifact="submission.json", sha256=digest)
        return ToolResult(output="submission accepted", metadata={"accepted": True, "sha256": digest})


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
