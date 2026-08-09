"""Build the run-level delivery summary from terminal manifest state."""

from __future__ import annotations

from notale.core.models import ConsistencyReport, QualityReport


def build_quality_report(
    deck_path: str,
    completed_pages: list[str],
    degraded_pages: list[str],
    consistency: ConsistencyReport,
) -> QualityReport:
    notes: list[str] = []
    if consistency.duplicateContentFlags:
        notes.append(f"近重复页：{consistency.duplicateContentFlags}")
    if consistency.planCoverage:
        notes.append(f"计划未被覆盖的章节：{consistency.planCoverage}")
    return QualityReport(
        deck=deck_path,
        completedPages=completed_pages,
        degradedPages=degraded_pages,
        note="；".join(notes),
    )
