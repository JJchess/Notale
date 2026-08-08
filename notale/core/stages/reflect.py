"""[6] Reflect & Accrete —— 跨次复利（本次为最小实现）。

library-delta：从反例台账沉淀坑条目（同一断言反复出现 = 工程坑，值得入库）。
组件库尚不存在 → newComponents 恒空（Voyager 准入：真跑通才入库，暂无库可入）。
quality-report：最终交付，未跑的检查如实列出——达标是证明，不是声称。
"""

from __future__ import annotations

from collections import Counter

from notale.core.models import (
    AssembledDeck,
    ConsistencyReport,
    CounterexampleLedger,
    LibraryDelta,
    QualityReport,
    VerificationReport,
    VerifyStatus,
)
from notale.core.stages.verify import UNIMPLEMENTED_LAYERS


def build_library_delta(ledgers: list[CounterexampleLedger]) -> LibraryDelta:
    failures = Counter(
        f for ledger in ledgers for entry in ledger.entries for f in entry.failedAssertion
    )
    return LibraryDelta(
        newComponents=[],
        pitfallEntries=[f"{f}（×{n}）" for f, n in failures.most_common()],
        misconceptionEntries=[],
    )


def build_quality_report(
    deck: AssembledDeck,
    deck_path: str,
    reports: list[VerificationReport],
    consistency: ConsistencyReport,
) -> QualityReport:
    verified = [r.pageId for r in reports if r.status == VerifyStatus.VERIFIED]
    degraded = [r.pageId for r in reports if r.status == VerifyStatus.DEGRADED]
    notes = []
    if consistency.duplicateContentFlags:
        notes.append(f"近重复页：{consistency.duplicateContentFlags}")
    if consistency.planCoverage:
        notes.append(f"计划未被覆盖的章节：{consistency.planCoverage}")
    notes.append("L1–L6 未实现：本 deck 未经执行/学科/交互/视觉/多样性/教学验证（fail-closed，不冒充已核实）")
    return QualityReport(
        deck=deck_path,
        script=None,  # 多形态输出未实现
        exercises=None,
        mindMap=None,
        canaryLeakageSummary=None,  # 掺沙库未建
        unimplementedLayers=list(UNIMPLEMENTED_LAYERS),
        verifiedPages=verified,
        degradedPages=degraded,
        note="；".join(notes),
    )
