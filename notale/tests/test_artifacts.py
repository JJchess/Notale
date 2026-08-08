"""artifacts schema roundtrip + evidence 绑定纪律。"""

import pytest

from notale.core.models import (
    Branch,
    CounterexampleLedger,
    CourseBrief,
    Evidence,
    Globals,
    LedgerEntry,
    PageSpec,
    PageStatus,
    PageType,
    PrepRecord,
    QualityReport,
    ReferenceSource,
    VerificationReport,
    VerifyStatus,
)
from notale.core.evidence import EvidenceBindingError, bind_evidence, new_fetch_record


def test_course_brief_roundtrip():
    brief = CourseBrief(
        topic="二叉树",
        audience="大二",
        durationMin=60,
        rawQuery="60 分钟《数据结构》讲义，大二",
    )
    back = CourseBrief.model_validate_json(brief.model_dump_json())
    assert back.intensity.value == "standard" and back.language == "zh"


def test_prep_record_multi_branch_and_defaults():
    rec = PrepRecord(recordId="r1", branch=[Branch.CONSTRUCTIBLE, Branch.CHECKABLE])
    assert rec.referenceSource == ReferenceSource.NONE
    assert rec.evidence is None  # 无出处 ≠ 已核实
    assert PrepRecord.model_validate_json(rec.model_dump_json()).recordId == "r1"


def test_evidence_binding_ok_and_forgery_rejected():
    fetch = new_fetch_record("https://example.com/doc", "快速排序的平均复杂度是 O(n log n)。证明略。")
    ev = bind_evidence(fetch, "平均复杂度是 O(n log n)")
    assert ev.url == "https://example.com/doc" and ev.fetchedAt == fetch.fetchedAt
    with pytest.raises(EvidenceBindingError):
        bind_evidence(fetch, "平均复杂度是 O(n)")  # 张冠李戴：不是字面子串
    with pytest.raises(EvidenceBindingError):
        bind_evidence(fetch, "   ")  # 空引文


def test_evidence_binding_tolerates_whitespace_drift():
    fetch = new_fetch_record("u", "第一行\n\n  第二行   第三行")
    ev = bind_evidence(fetch, "第二行 第三行")
    assert isinstance(ev, Evidence)


def test_counterexample_ledger_active_constraints():
    ledger = CounterexampleLedger(pageId="p1", attemptCount=2)
    ledger.entries.append(LedgerEntry(attemptNo=1, failedAssertion=["出现占位文本"], timestamp="t1"))
    ledger.entries.append(LedgerEntry(attemptNo=2, referenceMismatch=["r1 比对失败"], timestamp="t2"))
    assert ledger.activeConstraints == ["出现占位文本", "r1 比对失败"]


def test_verification_report_shapes():
    rep = VerificationReport(pageId="p1", status=VerifyStatus.RETURNED_FOR_REPAIR, newFailure=["f"])
    assert rep.humanReviewQueue is False
    rep2 = VerificationReport(
        pageId="p2", status=VerifyStatus.DEGRADED, fallbackHtml="<div>safe</div>", reason="超限", humanReviewQueue=True
    )
    assert rep2.fallbackHtml


def test_quality_report_honest_defaults():
    qr = QualityReport(unimplementedLayers=["L1", "L2", "L3", "L4", "L5", "L6"])
    assert qr.canaryLeakageSummary is None  # 掺沙未建，如实 None


def test_page_spec_typing():
    spec = PageSpec(pageId="p1", pageType=PageType.SIM_EXPLORABLE, centralMessage="单摆周期与振幅无关")
    assert spec.timeBudgetSec == 90
    assert Globals().componentAPI == []
    assert PageStatus.PENDING.value == "pending"
