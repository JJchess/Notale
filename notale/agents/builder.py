"""[3] One persistent, skill-equipped OpenHarness worker per lecture page."""

from __future__ import annotations

import json
import re
from pathlib import Path

from notale.agents.managed import ManagedAgent
from notale.core.models import (
    AssignedSkill,
    BuilderNarrativeContext,
    BuilderPageBrief,
    BuilderSource,
    Globals,
    NarrativeChapterContext,
    Outline,
    PageArtifact,
    PageContext,
    PageSpec,
    PageStatus,
    PageType,
    PrepRecord,
    SourceGuardrails,
    VisualContract,
)
from notale.core.observability import ExperimentLogger
from notale.roles.profiles import BUILDER, builder_profile
from notale.utils.config import get_config


_BASE_SKILLS = ["page-builder-core"]
_CONFIG = get_config()
_DEFAULT_STYLE_TOKENS = {
    "bg": "#0b0e14",
    "surface": "#141923",
    "ink": "#f3f5f7",
    "muted": "#9ba6b5",
    "accent": "#69a8ff",
    "accent-2": "#f0b429",
    "line": "rgba(243, 245, 247, 0.16)",
    "font": '"Noto Sans SC", system-ui, sans-serif',
    "mono": '"SFMono-Regular", Consolas, monospace',
}
_VISUAL_TOKEN_KEYS = set(_DEFAULT_STYLE_TOKENS)


def _mentions(text: str, key: str) -> bool:
    key = key.strip()
    if not key:
        return False
    if re.fullmatch(r"[A-Za-z0-9_]+", key):
        return re.search(
            rf"(?<![A-Za-z0-9_]){re.escape(key)}(?![A-Za-z0-9_])", text, re.I
        ) is not None
    return key.lower() in text.lower()


def _visual_tokens(globals_: Globals) -> dict[str, str]:
    """Normalize old flat token names while keeping the Builder contract fixed."""
    raw = {str(key): str(value) for key, value in globals_.styleTokens.items()}
    aliases = {
        "primary": "accent",
        "secondary": "accent-2",
        "neutral": "ink",
    }
    normalized = dict(_DEFAULT_STYLE_TOKENS)
    for key, value in raw.items():
        target = aliases.get(key, key)
        if target in _VISUAL_TOKEN_KEYS and value.strip():
            normalized[target] = value.strip()
    return normalized


def compile_context(
    spec: PageSpec,
    globals_: Globals,
    all_specs: list[PageSpec],
    prep_store: dict[str, PrepRecord],
    outline: Outline | None = None,
) -> PageContext:
    idx = next(i for i, item in enumerate(all_specs) if item.pageId == spec.pageId)
    catalog = set(BUILDER.skills)
    skills = [name for name in _BASE_SKILLS if name in catalog]
    skill_entrypoints: dict[str, str] = {}
    page_design = _CONFIG.agents.builder_page_design
    if page_design.enabled:
        if page_design.skill not in catalog:
            raise ValueError(
                f"configured Builder page-design skill is not authorized: {page_design.skill}"
            )
        skills.append(page_design.skill)
        skill_entrypoints[page_design.skill] = page_design.entrypoint
    if spec.pageType == PageType.SIM_EXPLORABLE and "create-sim" in catalog:
        skills.append("create-sim")
    if spec.pageType == PageType.CODE_RUNNABLE and "create-code-runtime" in catalog:
        skills.append("create-code-runtime")
    records = [prep_store[rid] for rid in spec.boundPrepRecords if rid in prep_store]
    source_text = json.dumps(
        [
            {
                "content": record.content,
                "invariants": record.invariants,
                "validRange": record.validRange,
                "knownInaccuracies": record.knownInaccuracies,
                "nonPhysicalVisualMappings": record.nonPhysicalVisualMappings,
            }
            for record in records
        ],
        ensure_ascii=False,
        sort_keys=True,
    )
    convention_text = "\n".join(
        (spec.centralMessage, spec.learningAction, spec.narrativeRole, source_text)
    )
    terminology = {
        key: value for key, value in globals_.terminology.items()
        if _mentions(convention_text, key)
    }
    notation = {
        key: value for key, value in globals_.notation.items()
        if _mentions(convention_text, key)
    }

    chapter_context = NarrativeChapterContext()
    throughline = ""
    if outline is not None:
        throughline = outline.throughline
        position = idx + 1
        chapter = next(
            (
                candidate for candidate in outline.chapters
                if candidate.pageRange[0] <= position <= candidate.pageRange[1]
            ),
            None,
        )
        if chapter is not None:
            chapter_context = NarrativeChapterContext(
                title=chapter.title,
                goal=chapter.narrativeGoal,
            )

    return PageContext(
        page=BuilderPageBrief(
            id=spec.pageId,
            type=spec.pageType,
            claim=spec.centralMessage,
            learningAction=spec.learningAction,
            terminology=terminology,
            notation=notation,
        ),
        narrative=BuilderNarrativeContext(
            throughline=throughline,
            chapter=chapter_context,
            pageRole=spec.narrativeRole or f"推进本页命题：{spec.centralMessage}",
            links=spec.continuity,
        ),
        visualContract=VisualContract(
            direction=globals_.artDirection,
            motif=globals_.visualMotif,
            tokens=_visual_tokens(globals_),
        ),
        sources=[
            BuilderSource(
                id=record.recordId,
                content=record.content,
                guardrails=SourceGuardrails(
                    invariants=record.invariants,
                    validRange=record.validRange,
                    limitations=record.knownInaccuracies,
                    visualMappings=record.nonPhysicalVisualMappings,
                ),
                citationUrl=record.evidence.url if record.evidence else None,
            )
            for record in records
        ],
        skills=[
            AssignedSkill(name=name, entrypoint=skill_entrypoints.get(name))
            for name in skills
        ],
    )


_PROMPT = """Build only page {page_id}. Call context_read until nextOffset=EOF for the complete compiled context.
The context field `skills` is the complete and exact skill assignment for this worker. For each item
in order, call skill_read until nextOffset=EOF before writing the page. When an item contains an
`entrypoint`, pass that exact value on every chunk. Never derive, guess, or invent a skill name or
entrypoint from the page type.
Preserve `page.claim`, the page-local conventions, `narrative`, and `visualContract`. Narrative links
are internal continuity constraints: do not expose page IDs, relation names, or planning cues as
visible copy. Write one self-contained 1280x720 fragment whose single root has `data-notale-page`.
Use the locked `--notale-*` visual tokens supplied by the shared runtime; do not redefine them.
Call page_write once; use page_patch only for targeted repair. The page file itself is
the workspace, so do not create a second planning or HTML copy.
Use `sources` as the complete factual basis for the page and preserve every source guardrail. You may
mechanically derive examples, states, and computed results from them, but do not add a new
subject-matter conclusion.
If the page contains a teaching interaction, its instructional state must come from an actually
executed domain model (algorithm, equation, state machine, evaluator, or data transform). Controls
may submit inputs or move a trace cursor; DOM/SVG/Canvas may only project model output. Never handwrite
successive frames or directly mutate displayed teaching state to imitate computation.
After page_write, call check_page immediately; do not reread the page unless check_page returns a
specific failure. The fragment may contain inline CSS/native JS but no document shell,
CDN, remote font/image, fetch/import, placeholder, NaN, or undefined. Call check_page with
the small metadata fields, then call submit_page with no arguments. Harness events maintain
the task ledger. Prose is not a submission."""


class BuilderWorker:
    """One persistent page worker; tool failures are repaired inside its own loop."""

    def __init__(
        self,
        *,
        llm,
        run_dir: Path,
        context: PageContext,
        logger: ExperimentLogger | None = None,
    ) -> None:
        self.context = context
        page_brief = context.page
        role = builder_profile(page_brief.type)
        valid_ids = context.source_ids

        def validate(payload: dict) -> PageArtifact:
            payload = dict(payload)
            payload["pageId"] = page_brief.id
            payload["status"] = PageStatus.DRAFTED.value
            references = [str(item) for item in payload.get("boundReferences", [])]
            if not references:
                raise ValueError("page must cite at least one record from its compiled context")
            if len(references) != len(set(references)):
                raise ValueError("page boundReferences must not contain duplicates")
            payload["boundReferences"] = references
            unknown = sorted(set(references) - valid_ids)
            if unknown:
                raise ValueError(f"page binds records outside compiled context: {unknown}")
            return PageArtifact.model_validate(payload)

        self.agent = ManagedAgent(
            run_dir=run_dir,
            stage="builder",
            worker_id=page_brief.id,
            role=role,
            objective=f"构建讲义单页 {page_brief.id}：{page_brief.claim}",
            acceptance_criteria=[
                "仅实现本页的唯一中心信息。",
                "遵守锁定的视觉、叙事、资料边界与离线运行约束。",
                "若含教学性交互，状态由真实领域模型执行产生，界面只投影模型结果。",
                "页面 schema 有效，并通过 submit_page 提交。",
            ],
            steps=[
                ("load-context", "读取完整页面上下文并加载需要的 skill。"),
                ("implement-check", "实现页面，必要时在私有 workspace 中检查。"),
                ("submit-page", "通过结构化工具提交页面。"),
            ],
            submit_tool="submit_page",
            submit_validator=validate,
            llm=llm,
            logger=logger,
            validation_context={
                "valid_record_ids": sorted(valid_ids),
                "page_id": page_brief.id,
                "page_type": page_brief.type.value,
                "context_path": f"page-contexts/{page_brief.id}.json",
            },
            purpose=f"build:{page_brief.id}",
            assigned_skills=context.skill_names,
            assigned_skill_entrypoints=context.skill_entrypoints,
        )

    async def build(self) -> PageArtifact:
        page = await self.agent.run_task(
            _PROMPT.format(page_id=self.context.page.id)
        )
        return PageArtifact.model_validate(page)


async def build_page(worker: BuilderWorker) -> PageArtifact:
    """Small compatibility surface used by the deterministic orchestrator."""
    return await worker.build()
