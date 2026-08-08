"""orchestrator —— 确定性 workflow 主干（HARNESS P1：主干是 workflow，不是 agent）。

七阶段编排：[0] intake → [1] research fan-out → [2] contract（人在环）→
[3+4] per-page fan-out（build → verify → 反例制导返工 ≤MAX，超限降级）→
[5] assemble → [6] reflect。

纪律：
- 自主性只在页内局部；阶段间只通过落盘 artifact 传递（层级链）；
- 写操作单线程：worker 只写自己那一页的产物，共享文件（globals/契约/deck/报告）只有这里写；
- WIP 门禁：只有 verified / degraded 页进成品；
- 断点续跑：artifact 已落盘的阶段整体跳过；页级只重做非终态页。
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path

from notale.core.models import (
    CourseBrief,
    CounterexampleLedger,
    Globals,
    LedgerEntry,
    Outline,
    PageArtifact,
    PageSpec,
    PageStatus,
    PedagogyNote,
    PrepRecord,
    VerificationReport,
    VerifyStatus,
)
from notale.utils.llm import LLMClient
from notale.core.state import Manifest
from notale.web import deck as assemble_stage
from notale.core.stages import reflect as reflect_stage
from notale.agents.builder import build_page, compile_context
from notale.core.stages.contract import ConfirmHook, auto_confirm, contract
from notale.core.stages.intake import intake
from notale.agents.research import research
from notale.core.stages.verify import MAX_ATTEMPTS, make_fallback_page, verify_page
from notale.tools.retriever import Retriever

CONCURRENCY = 8  # per-page fan-out 并发上限（≤16，分批见 HARNESS §2）


def _write(run_dir: Path, name: str, text: str) -> None:
    (run_dir / name).write_text(text, encoding="utf-8")


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
    verified: list[str]
    degraded: list[str]


async def _build_verify_repair(
    llm: LLMClient,
    spec: PageSpec,
    context,
    prep_store: dict[str, PrepRecord],
    globals_: Globals,
    manifest: Manifest,
    sem: asyncio.Semaphore,
) -> tuple[PageArtifact, list[VerificationReport], CounterexampleLedger]:
    """单页的 build→verify→返工循环。返工带全部历史反例；超限降级安全页。"""
    async with sem:
        ledger_file = manifest.run_dir / f"ledger/{spec.pageId}.json"
        ledger = (
            CounterexampleLedger.model_validate_json(ledger_file.read_text())
            if ledger_file.exists()
            else CounterexampleLedger(pageId=spec.pageId)
        )
        reports: list[VerificationReport] = []
        # 进程可能在 drafted 落盘后、验证回执落盘前中断。恢复时先回到可重做态，
        # 避免下一次构建触发非法 drafted→drafted。
        if manifest.data.pages[spec.pageId].status == PageStatus.DRAFTED:
            manifest.transition(
                spec.pageId,
                PageStatus.RETURNED_FOR_REPAIR,
                reason="resume-recovered-incomplete-draft",
            )
        while True:
            built = await build_page(llm, context, active_constraints=ledger.activeConstraints)
            for e in built.events:
                manifest.event(**e)
            manifest.transition(spec.pageId, PageStatus.DRAFTED)
            _write(manifest.run_dir, f"pages/{spec.pageId}.json", built.page.model_dump_json(indent=2))

            report = verify_page(built.page, spec, globals_, prep_store)
            reports.append(report)
            if report.status == VerifyStatus.VERIFIED:
                built.page.status = PageStatus.VERIFIED
                manifest.transition(spec.pageId, PageStatus.VERIFIED)
                _write(
                    manifest.run_dir,
                    f"pages/{spec.pageId}.json",
                    built.page.model_dump_json(indent=2),
                )
                _write(
                    manifest.run_dir,
                    f"verification/{spec.pageId}.json",
                    report.model_dump_json(indent=2),
                )
                return built.page, reports, ledger

            # 返工：报错 → 追加台账 → 带全部历史反例重生成（不是裸重试）
            import datetime

            ledger.entries.append(
                LedgerEntry(
                    attemptNo=ledger.attemptCount + 1,
                    failedAssertion=report.newFailure,
                    timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                )
            )
            ledger.attemptCount += 1
            _write(
                manifest.run_dir,
                f"ledger/{spec.pageId}.json",
                ledger.model_dump_json(indent=2),
            )
            if ledger.attemptCount >= MAX_ATTEMPTS:
                reason = f"返工 {MAX_ATTEMPTS} 次仍不过：{report.newFailure}"
                fallback = make_fallback_page(spec, prep_store, reason)
                manifest.transition(spec.pageId, PageStatus.RETURNED_FOR_REPAIR)
                manifest.transition(spec.pageId, PageStatus.DEGRADED, reason=reason)
                report.status = VerifyStatus.DEGRADED
                report.fallbackHtml = fallback.html
                report.reason = reason
                report.humanReviewQueue = True
                _write(  # 成品页必须落安全页，不是最后一次脏草稿
                    manifest.run_dir, f"pages/{spec.pageId}.json", fallback.model_dump_json(indent=2)
                )
                _write(
                    manifest.run_dir,
                    f"verification/{spec.pageId}.json",
                    report.model_dump_json(indent=2),
                )
                return fallback, reports, ledger
            manifest.transition(spec.pageId, PageStatus.RETURNED_FOR_REPAIR)


async def generate(
    llm: LLMClient,
    retriever: Retriever,
    query: str,
    *,
    out_root: Path = Path("runs"),
    uploaded_material: str | None = None,
    confirm: ConfirmHook = auto_confirm,
    resume_dir: Path | None = None,
    research_client_factory=None,  # 测试注入：research agent 的 SupportsStreamingMessages 工厂
) -> GenerateResult:
    manifest = Manifest.load(resume_dir) if resume_dir else Manifest.create(out_root, query)
    run_dir = manifest.run_dir
    for sub in ("pages", "verification", "ledger"):
        (run_dir / sub).mkdir(exist_ok=True)

    # ---- [0] Intake（resume：已落盘则跳过）----
    if (run_dir / "course-brief.json").exists():
        brief = CourseBrief.model_validate_json((run_dir / "course-brief.json").read_text())
    else:
        brief = await intake(llm, query, uploaded_material)
        _dump(run_dir, "course-brief.json", brief)
        manifest.event("stage-done", stage="intake")

    # ---- [1] Research fan-out ----
    if (run_dir / "prep-records.json").exists():
        prep_records = [
            PrepRecord.model_validate(r)
            for r in json.loads((run_dir / "prep-records.json").read_text())
        ]
        pedagogy_notes = [
            PedagogyNote.model_validate(p)
            for p in json.loads((run_dir / "pedagogy-notes.json").read_text())
        ]
    else:
        res = await research(
            brief, retriever, uploaded_material,
            client_factory=research_client_factory, workspace=run_dir,
        )
        for e in res.events:
            manifest.event(**e)
        prep_records, pedagogy_notes = res.prep_records, res.pedagogy_notes
        _dump(run_dir, "prep-records.json", prep_records)
        _dump(run_dir, "pedagogy-notes.json", pedagogy_notes)
        _dump(run_dir, "research-notes.json", res.research_notes)
        manifest.event("stage-done", stage="research", records=len(prep_records))

    prep_store = {r.recordId: r for r in prep_records}

    # ---- [2] Curriculum Contract（人在环）----
    if (run_dir / "page-specs.json").exists():
        outline = Outline.model_validate_json((run_dir / "outline.json").read_text())
        globals_ = Globals.model_validate_json((run_dir / "globals.json").read_text())
        specs = [PageSpec.model_validate(s) for s in json.loads((run_dir / "page-specs.json").read_text())]
    else:
        c = await contract(llm, brief, prep_records, pedagogy_notes, confirm)
        for e in c.events:
            manifest.event(**e)
        outline, globals_, specs = c.outline, c.globals, c.page_specs
        _dump(run_dir, "outline.json", outline)
        _dump(run_dir, "globals.json", globals_)
        _dump(run_dir, "page-specs.json", specs)
        manifest.register_pages([s.pageId for s in specs])
        manifest.event("stage-done", stage="contract", pages=len(specs))

    # ---- [3+4] Per-page fan-out：build → verify → 返工/降级 ----
    spec_by_id = {s.pageId: s for s in specs}
    todo = [pid for pid in manifest.todo_pages() if pid in spec_by_id]
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one_page(pid: str):
        spec = spec_by_id[pid]
        context = compile_context(spec, globals_, specs, prep_store)
        return await _build_verify_repair(llm, spec, context, prep_store, globals_, manifest, sem)

    results = await asyncio.gather(*[one_page(pid) for pid in todo])
    manifest.event("stage-done", stage="build-verify", done=len(todo))

    # 收集本 run 全部成品页（verified + degraded，含 resume 前已完成的）
    pages: list[PageArtifact] = []
    reports: list[VerificationReport] = []
    ledgers: list[CounterexampleLedger] = []
    for spec in specs:
        state = manifest.data.pages.get(spec.pageId)
        if state is None or state.status not in {PageStatus.VERIFIED, PageStatus.DEGRADED}:
            continue  # WIP 门禁：草稿文件存在也不能进入 assemble
        page_file = run_dir / f"pages/{spec.pageId}.json"
        if page_file.exists():
            pages.append(PageArtifact.model_validate_json(page_file.read_text()))
        report_file = run_dir / f"verification/{spec.pageId}.json"
        if report_file.exists():
            reports.append(VerificationReport.model_validate_json(report_file.read_text()))
        ledger_file = run_dir / f"ledger/{spec.pageId}.json"
        if ledger_file.exists():
            ledgers.append(CounterexampleLedger.model_validate_json(ledger_file.read_text()))
    del results  # 页产物以落盘为准（主编排上下文不留整页 HTML，只留状态）

    # ---- [5] Assemble & Global pass ----
    deck, deck_html = assemble_stage.write_deck_package(
        run_dir, pages, specs, brief.topic, language=brief.language
    )
    deck_path = run_dir / "deck.html"
    consistency = assemble_stage.consistency_report(pages, specs, globals_, outline)
    _dump(run_dir, "assembled-deck.json", deck)
    _dump(run_dir, "consistency-report.json", consistency)
    manifest.event("stage-done", stage="assemble", pages=len(pages))

    # ---- [6] Reflect & Accrete ----
    delta = reflect_stage.build_library_delta(ledgers)
    quality = reflect_stage.build_quality_report(deck, str(deck_path), reports, consistency)
    _dump(run_dir, "library-delta.json", delta)
    _dump(run_dir, "quality-report.json", quality)
    manifest.event("stage-done", stage="reflect")

    return GenerateResult(
        run_dir=run_dir,
        deck_path=deck_path,
        verified=quality.verifiedPages,
        degraded=quality.degradedPages,
    )
