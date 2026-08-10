"""Deterministic workflow around persistent, skill-equipped agent loops.

Pipeline: intake → research fan-out → curriculum contract → per-page Builder loops →
assemble → delivery report.

纪律：
- 自主性只在页内局部；阶段间只通过落盘 artifact 传递（层级链）；
- 写操作单线程：worker 只写自己那一页的产物，共享文件（globals/契约/deck/报告）只有这里写；
- WIP 门禁：只有 completed / degraded 页进成品；
- 断点续跑：artifact 已落盘的阶段整体跳过；页级只重做非终态页。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from notale import __version__

from notale.core.models import (
    BuilderPlan,
    CourseBrief,
    Globals,
    Outline,
    PageArtifact,
    PageSpec,
    PageStatus,
    PageType,
    PedagogyNote,
    PrepRecord,
    PrepRecordOrigin,
)
from notale.core.state import Manifest
from notale.web import deck as assemble_stage
from notale.core.stages import report as report_stage
from notale.agents.builder import BuilderWorker, build_page, compile_context
from notale.core.stages.contract import ConfirmHook, auto_confirm, contract
from notale.core.stages.intake import intake
from notale.agents.research import research
from notale.core.stages.page_check import make_fallback_page
from notale.tools.retriever import Retriever
from notale.tools.media import ensure_asset_manifest, ensure_media_budget
from notale.core.observability import ExperimentLogger, RunEmergencyLimitExceeded, now
from notale.roles.profiles import BUILDER, INTAKE, PLANNER, RESEARCH
from notale.utils.config import CONFIG_PATH, SKILLS_PATH, get_config
from notale.utils.skill_catalog import load_skill_catalog, migrate_builder_plan

_CONFIG = get_config()
_SKILL_CATALOG = load_skill_catalog(BUILDER, SKILLS_PATH)
CONCURRENCY = _CONFIG.pipeline.page_concurrency

_PAGE_PRIORITY = {
    PageType.SIM_EXPLORABLE: 0,
    PageType.CODE_RUNNABLE: 1,
    PageType.FORMULA_DERIVATION: 2,
    PageType.WORKED_EXAMPLE: 2,
    PageType.NARRATIVE_SCENE: 3,
    PageType.QUIZ_CHECK: 3,
    PageType.SECTION_BREAK: 4,
}


def _research_agent_count() -> int:
    """Return the number of Research workers that this process would launch."""
    if not _CONFIG.research.enabled:
        return 0
    return sum(branch.enabled for branch in _CONFIG.research.branches)


def _prioritized_page_ids(todo: list[str], specs: list[PageSpec]) -> list[str]:
    spec_by_id = {spec.pageId: spec for spec in specs}
    original = {spec.pageId: index for index, spec in enumerate(specs)}
    return sorted(
        (page_id for page_id in todo if page_id in spec_by_id),
        key=lambda page_id: (
            _PAGE_PRIORITY.get(spec_by_id[page_id].pageType, 9),
            original[page_id],
        ),
    )


def _write(run_dir: Path, name: str, text: str) -> None:
    path = run_dir / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _dump(run_dir: Path, name: str, obj: object) -> None:
    if isinstance(obj, list):
        text = json.dumps(
            [o.model_dump(mode="json") for o in obj], ensure_ascii=False, indent=2
        )
    else:
        text = obj.model_dump_json(indent=2)  # type: ignore[attr-defined]
    _write(run_dir, name, text)


@dataclass
class GenerateResult:
    run_dir: Path
    deck_path: Path
    completed: list[str]
    degraded: list[str]
    usage: dict[str, int] = field(default_factory=dict)


async def _build_page(
    llm: Any | None,
    spec: PageSpec,
    context,
    prep_store: dict[str, PrepRecord],
    manifest: Manifest,
    sem: asyncio.Semaphore,
    logger: ExperimentLogger,
) -> PageArtifact:
    """Run one page Builder; all check/repair turns stay inside that agent loop."""
    async with sem:
        page_stage = f"page:{spec.pageId}"
        logger.stage_start(page_stage)
        state = manifest.data.pages[spec.pageId].status
        if state == PageStatus.PENDING:
            manifest.transition(spec.pageId, PageStatus.DRAFTED, reason="builder-started")
        elif state != PageStatus.DRAFTED:
            raise ValueError(f"cannot build terminal page {spec.pageId}: {state.value}")
        worker = BuilderWorker(
            llm=llm, run_dir=manifest.run_dir, context=context, logger=logger
        )
        try:
            page = await build_page(worker)
        except Exception as exc:
            if isinstance(exc, RunEmergencyLimitExceeded):
                raise
            reason = f"builder agent failed before a valid submission: {type(exc).__name__}: {exc}"
            fallback = make_fallback_page(spec, prep_store, reason)
            manifest.transition(spec.pageId, PageStatus.DEGRADED, reason=reason)
            _write(
                manifest.run_dir,
                f"pages/{spec.pageId}.json",
                fallback.model_dump_json(indent=2),
            )
            manifest.event("builder-failed", pageId=spec.pageId, reason=reason)
            logger.stage_end(page_stage, status="degraded", reason=reason)
            return fallback

        page.status = PageStatus.COMPLETED
        _write(
            manifest.run_dir,
            f"pages/{spec.pageId}.json",
            page.model_dump_json(indent=2),
        )
        manifest.transition(spec.pageId, PageStatus.COMPLETED)
        logger.stage_end(page_stage, status="completed")
        return page


async def _generate_session(
    llm: Any | None,
    retriever: Retriever,
    query: str,
    *,
    manifest: Manifest,
    logger: ExperimentLogger,
    uploaded_material: str | None = None,
    confirm: ConfirmHook = auto_confirm,
    research_client_factory=None,  # 测试注入：research agent 的 SupportsStreamingMessages 工厂
) -> GenerateResult:
    run_dir = manifest.run_dir
    for sub in ("pages", "input", "page-contexts", "agents", "assets"):
        (run_dir / sub).mkdir(exist_ok=True)
    ensure_asset_manifest(run_dir)
    ensure_media_budget(run_dir)
    _write(run_dir, "input/query.txt", query)
    if uploaded_material is not None:
        _write(run_dir, "input/material.txt", uploaded_material)

    # ---- [0] Intake（resume：已落盘则跳过）----
    logger.stage_start("intake")
    if (run_dir / "course-brief.json").exists():
        brief = CourseBrief.model_validate_json((run_dir / "course-brief.json").read_text())
        logger.stage_end("intake", status="skipped")
    else:
        brief = await intake(llm, query, run_dir=run_dir, logger=logger)
        _dump(run_dir, "course-brief.json", brief)
        manifest.event("stage-done", stage="intake")
        logger.stage_end("intake")

    # ---- [1] Research fan-out ----
    logger.stage_start("research")
    if (run_dir / "prep-records.json").exists():
        prep_records = [
            PrepRecord.model_validate(r)
            for r in json.loads((run_dir / "prep-records.json").read_text())
        ]
        pedagogy_notes = [
            PedagogyNote.model_validate(p)
            for p in json.loads((run_dir / "pedagogy-notes.json").read_text())
        ]
        logger.stage_end("research", status="skipped")
    elif _research_agent_count() == 0:
        prep_records = []
        pedagogy_notes = []
        _dump(run_dir, "prep-records.json", prep_records)
        _dump(run_dir, "pedagogy-notes.json", pedagogy_notes)
        _dump(run_dir, "research-notes.json", [])
        reason = (
            "disabled-by-config"
            if not _CONFIG.research.enabled
            else "no-enabled-branches"
        )
        manifest.event(
            "stage-skipped", stage="research", reason=reason, agents=0
        )
        logger.stage_end(
            "research", status="skipped", reason=reason, agents=0
        )
    else:
        res = await research(
            llm, brief, retriever, uploaded_material,
            client_factory=research_client_factory, workspace=run_dir,
            logger=logger,
        )
        for e in res.events:
            manifest.event(**e)
        prep_records, pedagogy_notes = res.prep_records, res.pedagogy_notes
        _dump(run_dir, "prep-records.json", prep_records)
        _dump(run_dir, "pedagogy-notes.json", pedagogy_notes)
        _dump(run_dir, "research-notes.json", res.research_notes)
        manifest.event(
            "stage-done",
            stage="research",
            records=len(prep_records),
            agents=_research_agent_count(),
        )
        logger.stage_end(
            "research", records=len(prep_records), agents=_research_agent_count()
        )

    # ---- [2] Curriculum Contract（人在环）----
    logger.stage_start("contract")
    contract_resumed = (run_dir / "page-specs.json").exists()
    if contract_resumed:
        outline = Outline.model_validate_json((run_dir / "outline.json").read_text())
        globals_ = Globals.model_validate_json((run_dir / "globals.json").read_text())
        specs = [PageSpec.model_validate(s) for s in json.loads((run_dir / "page-specs.json").read_text())]
        builder_plan_path = run_dir / "builder-plan.json"
        if not builder_plan_path.exists():
            raise ValueError(
                "legacy unfinished run lacks builder-plan.json; start a new experiment"
            )
        persisted_builder_plan = json.loads(builder_plan_path.read_text())
        builder_plan, migrated = migrate_builder_plan(persisted_builder_plan)
        builder_plan = _SKILL_CATALOG.normalize_plan(
            builder_plan, {spec.pageId for spec in specs}
        )
        if migrated:
            migration_event = {
                "kind": "builder-plan-migrated",
                "fromSchemaVersion": 1,
                "toSchemaVersion": 2,
                "source": "builder-plan.json",
                "persistedArtifactRewritten": False,
            }
            manifest.event(**migration_event)
            logger.append("agent-traces.jsonl", {"ts": now(), **migration_event})
        planner_records_path = run_dir / "planner-prep-records.json"
        planner_prep_records = (
            [
                PrepRecord.model_validate(record)
                for record in json.loads(planner_records_path.read_text())
            ]
            if planner_records_path.exists()
            else []
        )
        logger.stage_end("contract", status="skipped")
    else:
        c = await contract(
            llm, brief, prep_records, pedagogy_notes, confirm,
            run_dir=run_dir, logger=logger,
        )
        for e in c.events:
            manifest.event(**e)
            if e.get("kind") == "builder-plan-selected":
                logger.append("agent-traces.jsonl", {"ts": now(), **e})
        outline, globals_, specs, builder_plan = (
            c.outline, c.globals, c.page_specs, c.builder_plan
        )
        planner_prep_records = c.supplemental_prep_records
        _dump(run_dir, "outline.json", outline)
        _dump(run_dir, "globals.json", globals_)
        _dump(run_dir, "page-specs.json", specs)
        _dump(run_dir, "builder-plan.json", builder_plan)
        _dump(run_dir, "planner-prep-records.json", planner_prep_records)
        manifest.register_pages([s.pageId for s in specs])
        manifest.event("stage-done", stage="contract", pages=len(specs))
        logger.stage_end("contract", pages=len(specs))

    effective_builder_plan = builder_plan.model_dump(mode="json")
    logger.append("agent-traces.jsonl", {
        "ts": now(),
        "kind": "builder-plan-effective",
        "source": "resume" if contract_resumed else "contract",
        "builderPlan": effective_builder_plan,
        "builderPlanSha256": hashlib.sha256(json.dumps(
            effective_builder_plan,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")).hexdigest(),
        "skillCatalogSha256": _SKILL_CATALOG.sha256,
    })

    invalid_planner_records = [
        record.recordId
        for record in planner_prep_records
        if record.origin != PrepRecordOrigin.PLANNER_GENERATED
        or record.evidence is not None
        or not record.recordId.startswith("planner-")
    ]
    if invalid_planner_records:
        raise ValueError(
            "planner-prep-records.json contains records with invalid provenance: "
            f"{invalid_planner_records}"
        )
    merged_prep_records = [*prep_records, *planner_prep_records]
    merged_ids = [record.recordId for record in merged_prep_records]
    if len(merged_ids) != len(set(merged_ids)):
        raise ValueError("merged prep records contain duplicate recordId values")
    prep_store = {record.recordId: record for record in merged_prep_records}
    missing_bindings = sorted({
        record_id
        for spec in specs
        for record_id in spec.boundPrepRecords
        if record_id not in prep_store
    })
    if missing_bindings:
        raise ValueError(
            "page specs bind missing prep records; the run cannot resume safely: "
            f"{missing_bindings}"
        )

    # ---- [3] Per-page fan-out: one persistent Builder loop per page ----
    spec_by_id = {s.pageId: s for s in specs}
    todo = _prioritized_page_ids(manifest.todo_pages(), specs)
    logger.stage_start("build")
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one_page(pid: str):
        spec = spec_by_id[pid]
        context = compile_context(
            spec, globals_, specs, prep_store, builder_plan, outline=outline
        )
        _write(
            run_dir,
            f"page-contexts/{pid}.json",
            context.model_dump_json(indent=2, exclude_none=True),
        )
        return await _build_page(
            llm, spec, context, prep_store, manifest, sem, logger
        )

    results = await asyncio.gather(*[one_page(pid) for pid in todo])
    manifest.event("stage-done", stage="build", done=len(todo))
    logger.stage_end("build", pages=len(todo))

    # Collect all terminal pages, including pages completed before a resume.
    pages: list[PageArtifact] = []
    for spec in specs:
        state = manifest.data.pages.get(spec.pageId)
        if state is None or state.status not in {PageStatus.COMPLETED, PageStatus.DEGRADED}:
            continue  # WIP 门禁：草稿文件存在也不能进入 assemble
        page_file = run_dir / f"pages/{spec.pageId}.json"
        if page_file.exists():
            pages.append(PageArtifact.model_validate_json(page_file.read_text()))
    del results  # 页产物以落盘为准（主编排上下文不留整页 HTML，只留状态）

    # ---- [4] Assemble & Global pass ----
    logger.stage_start("assemble")
    deck, _ = assemble_stage.write_deck_package(
        run_dir,
        pages,
        specs,
        brief.topic,
        language=brief.language,
        style_tokens=_SKILL_CATALOG.resolved_style_tokens(builder_plan),
    )
    deck_path = run_dir / "deck.html"
    consistency = assemble_stage.consistency_report(pages, specs, globals_, outline)
    _dump(run_dir, "assembled-deck.json", deck)
    _dump(run_dir, "consistency-report.json", consistency)
    manifest.event("stage-done", stage="assemble", pages=len(pages))
    logger.stage_end("assemble", pages=len(pages))

    # ---- [5] Delivery report; experience accretion remains human-supervised ----
    logger.stage_start("report")
    completed_pages = manifest.pages_by_status(PageStatus.COMPLETED)
    degraded_pages = manifest.pages_by_status(PageStatus.DEGRADED)
    quality = report_stage.build_quality_report(
        str(deck_path), completed_pages, degraded_pages, consistency
    )
    _dump(run_dir, "quality-report.json", quality)
    manifest.event("stage-done", stage="report")
    logger.stage_end("report")

    return GenerateResult(
        run_dir=run_dir,
        deck_path=deck_path,
        completed=quality.completedPages,
        degraded=quality.degradedPages,
    )


async def generate(
    llm: Any | None,
    retriever: Retriever,
    query: str,
    *,
    out_root: Path = Path("runs"),
    uploaded_material: str | None = None,
    confirm: ConfirmHook = auto_confirm,
    resume_dir: Path | None = None,
    research_client_factory=None,
) -> GenerateResult:
    """Run one observable generation session; resume appends a new session."""
    manifest = Manifest.load(resume_dir) if resume_dir else Manifest.create(out_root, query)
    config = {
        "notaleVersion": __version__,
        "configSchemaVersion": _CONFIG.schema_version,
        "agentProtocolVersion": _CONFIG.versions.agent_protocol,
        "loggingSchemaVersion": _CONFIG.versions.logging_schema,
        "query": query,
        "resume": bool(resume_dir),
        "configFile": str(CONFIG_PATH),
        "configSha256": hashlib.sha256(CONFIG_PATH.read_bytes()).hexdigest(),
        "declaredConfig": _CONFIG.model_dump(mode="json"),
        # Backward-compatible alias retained for existing experiment readers.
        "configuration": _CONFIG.model_dump(mode="json"),
        "effectivePolicy": {
            "modelCapabilities": _CONFIG.model_capabilities.model_dump(mode="json"),
            "governance": _CONFIG.governance.model_dump(mode="json"),
            "research": {
                "enabled": _CONFIG.research.enabled,
                "agentCount": _research_agent_count(),
                "enabledBranches": [
                    branch.id
                    for branch in _CONFIG.research.branches
                    if _CONFIG.research.enabled and branch.enabled
                ],
            },
            "roleCompaction": {
                name: _CONFIG.agents.role_for(name).auto_compact_threshold_tokens
                for name in ("intake", "research", "planner", "builder")
            },
        },
        "llm": {
            "model": getattr(llm, "model", _CONFIG.model.name),
            "baseUrl": getattr(llm, "base_url", _CONFIG.model.base_url),
            "timeoutSec": getattr(llm, "timeout", _CONFIG.model.http_timeout_sec),
            "apiKeyEnv": getattr(llm, "api_key_env", _CONFIG.model.api_key_env),
        },
        "agentRoles": {
            role.name: {
                "model": getattr(llm, "model", role.model),
                "baseUrl": getattr(llm, "base_url", role.base_url),
                "maxTurnsPerQuery": role.max_turns,
                "maxOutputTokensPerCall": role.max_tokens,
                "maxTotalTurns": role.max_total_turns,
                "maxDurationSec": role.max_duration_sec,
                "maxTotalTokens": role.max_total_tokens,
                "requestTimeoutSec": role.request_timeout_sec,
                "maxQueryDurationSec": role.max_query_duration_sec,
                "maxProviderAttempts": role.max_provider_attempts,
                "contextWindowTokens": role.context_window_tokens,
                "autoCompactThresholdTokens": role.auto_compact_threshold_tokens,
                "skillPolicy": role.skill_policy.metadata(),
                "allowedTools": role.allowed_tools,
                "roleDocument": role.document_metadata(),
                "systemPrompt": role.rendered_system_prompt(),
            }
            for role in (INTAKE, RESEARCH, PLANNER, BUILDER)
        },
    }
    logger = ExperimentLogger(manifest.run_dir, config=config)
    try:
        result = await _generate_session(
            llm, retriever, query, manifest=manifest, logger=logger,
            uploaded_material=uploaded_material, confirm=confirm,
            research_client_factory=research_client_factory,
        )
    except BaseException as exc:
        logger.finish("failed", error=exc)
        raise
    logger.finish("completed")
    result.usage = {
        "prompt_tokens": logger.metrics["promptTokens"],
        "completion_tokens": logger.metrics["completionTokens"],
        "reasoning_tokens": logger.metrics["reasoningTokens"],
        "total_tokens": logger.metrics["totalTokens"],
        "calls": logger.metrics["calls"],
    }
    return result
