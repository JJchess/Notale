"""artifacts schema roundtrip + evidence 绑定纪律。"""

import pytest

from notale.core.models import (
    Branch,
    CourseBrief,
    Evidence,
    Globals,
    PageArtifact,
    PageSpec,
    PageStatus,
    PageType,
    PrepRecord,
    QualityReport,
    ReferenceSource,
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


def test_page_artifact_has_no_interaction_metadata_claim():
    page = PageArtifact.model_validate({
        "pageId": "p1",
        "html": "<p>内容</p>",
        "interactionParams": {"stateModel": "handwritten frames"},
    })
    assert "interactionParams" not in page.model_dump()


def test_quality_report_describes_delivery_only():
    qr = QualityReport(completedPages=["p1"], degradedPages=["p2"])
    assert qr.completedPages == ["p1"]
    assert "unimplementedLayers" not in qr.model_dump()


def test_page_spec_typing():
    spec = PageSpec(pageId="p1", pageType=PageType.SIM_EXPLORABLE, centralMessage="单摆周期与振幅无关")
    assert spec.timeBudgetSec == 90
    assert "visualSubject" not in spec.model_dump()
    assert Globals().componentAPI == []
    assert PageStatus.PENDING.value == "pending"
    assert PageStatus("verified") == PageStatus.COMPLETED
    assert PageStatus("returned-for-repair") == PageStatus.DRAFTED
