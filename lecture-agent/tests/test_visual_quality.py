from __future__ import annotations

import asyncio
import json

import pytest
from lecture_agent.adapters.visual.gemini import GeminiVisualReviewer
from lecture_agent.domain.evaluation.visual_quality import (
    parse_visual_review,
    preflight_page_metrics,
)
from lecture_agent.ports.visual_review import VisualReviewRequest


def _response(*, issues: list[dict[str, str]] | None = None) -> str:
    return json.dumps(
        {
            "scores": {
                "visualHierarchy": 4.2,
                "composition": 3.8,
                "assetIntegration": 4.0,
                "informationDensity": 3.7,
                "legibility": 4.4,
                "crossPageRhythm": 3.5,
            },
            "issues": issues or [],
            "summary": "整体完成，但节奏可改善。",
        }
    )


def test_parse_visual_review_clamps_scores_and_requires_routes() -> None:
    raw = json.loads(_response())
    raw["scores"]["visualHierarchy"] = 9
    raw["issues"] = [
        {
            "sceneId": "s1",
            "route": "composition",
            "problem": "主体过小",
            "instruction": "放大主体",
        },
        {
            "sceneId": "s2",
            "route": "unknown",
            "problem": "问题",
            "instruction": "修复",
        },
        {"sceneId": "s3", "route": "media", "problem": "缺少修复指令"},
    ]
    report = parse_visual_review(json.dumps(raw))
    assert report.scores.visual_hierarchy == 5.0
    assert [(issue.scene_id, issue.route) for issue in report.issues] == [("s1", "composition")]
    assert len(report.warnings) == 2


def test_deterministic_preflight_keeps_hard_errors_separate() -> None:
    metrics = [
        {
            "sceneId": "s1",
            "mainSubjectRatio": 0.1,
            "whitespaceRatio": 0.75,
            "minContrastRatio": 3.2,
            "minFontSize": 12,
            "compositionSignature": "split-left",
            "overflowY": 20,
        },
        {"sceneId": "s2", "compositionSignature": "split-left"},
        {
            "sceneId": "s3",
            "compositionSignature": "split-left",
            "widgetErrors": ["widget failed"],
        },
    ]
    report = preflight_page_metrics(metrics)
    assert len(report.hard_errors) == 2
    assert {issue.route for issue in report.issues} == {"composition", "tokens"}
    assert any(issue.scene_id == "s3" and "重复构图" in issue.problem for issue in report.issues)


def test_deterministic_preflight_accepts_real_headless_clip_metric() -> None:
    report = preflight_page_metrics(
        [{"i": 0, "sceneId": "s0", "mblockClip": 7, "widgetErrors": ["ReferenceError"]}]
    )
    assert len(report.hard_errors) == 2


def test_deterministic_preflight_uses_browser_subpixel_tolerances() -> None:
    report = preflight_page_metrics(
        [{"sceneId": "s0", "overflowX": 1, "overflowY": 4, "layoutClip": 4, "mblockClip": 4}]
    )
    assert report.hard_errors == []


def test_deterministic_preflight_reads_browser_min_text_metric() -> None:
    report = preflight_page_metrics([{"sceneId": "s1", "minTextPx": 11}])

    assert [(issue.scene_id, issue.route) for issue in report.issues] == [("s1", "tokens")]


def test_deterministic_preflight_allows_intentional_sparse_navigation_pages() -> None:
    report = preflight_page_metrics(
        [
            {
                "sceneId": "cover",
                "sceneKind": "hero",
                "occupiedRatio": 0.2,
                "mainSubjectRatio": 0.1,
                "whitespaceRatio": 0.8,
            },
            {
                "sceneId": "section",
                "sceneKind": "section",
                "occupiedRatio": 0.2,
                "mainSubjectRatio": 0.1,
                "whitespaceRatio": 0.8,
            },
            {
                "sceneId": "quiz",
                "sceneKind": "quiz",
                "occupiedRatio": 0.3,
                "mainSubjectRatio": 0.15,
                "whitespaceRatio": 0.7,
            },
        ]
    )
    assert report.issues == []


@pytest.mark.asyncio
async def test_gemini_adapter_no_key_is_fail_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    reviewer = GeminiVisualReviewer()
    report = await reviewer.review(VisualReviewRequest(contact_sheet=b"png"))
    assert not report.available
    assert "GEMINI_API_KEY" in report.warnings[0]


@pytest.mark.asyncio
async def test_gemini_adapter_builds_multimodal_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    reviewer = GeminiVisualReviewer(timeout=1)
    captured: dict[str, object] = {}

    async def fake_complete(body: dict[str, object], key: str) -> str:
        captured.update(body)
        assert key == "test-only"
        return _response(
            issues=[
                {
                    "sceneId": "s2",
                    "route": "media",
                    "problem": "裁剪切断主体",
                    "instruction": "移动焦点",
                }
            ]
        )

    monkeypatch.setattr(reviewer, "_complete", fake_complete)
    report = await reviewer.review(
        VisualReviewRequest(contact_sheet=b"sheet", failed_pages=[b"page"], deck_context={"pages": 3})
    )
    assert report.available and report.issues[0].route == "media"
    assert captured["model"] == "gemini-3.6-flash"
    assert captured["temperature"] == 0.2
    assert captured["reasoning_effort"] == "low"
    messages = captured["messages"]
    assert isinstance(messages, list)
    assert "sim/widget" in messages[0]["content"]  # type: ignore[index]
    assert "必须 route=`blockContent`" in messages[0]["content"]  # type: ignore[index]
    assert len(messages[1]["content"]) == 3  # type: ignore[index]


@pytest.mark.asyncio
async def test_gemini_adapter_timeout_and_parse_failure_fail_open(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    reviewer = GeminiVisualReviewer(timeout=0.01)

    async def hanging(_body: dict[str, object], _key: str) -> str:
        await asyncio.sleep(1)
        return _response()

    monkeypatch.setattr(reviewer, "_complete", hanging)
    timed_out = await reviewer.review(VisualReviewRequest(contact_sheet=b"sheet"))
    assert not timed_out.available
    assert "fail-open" in timed_out.warnings[0]

    async def malformed(_body: dict[str, object], _key: str) -> str:
        return "not json"

    monkeypatch.setattr(reviewer, "_complete", malformed)
    malformed_report = await reviewer.review(VisualReviewRequest(contact_sheet=b"sheet"))
    assert not malformed_report.available
    assert "fail-open" in malformed_report.warnings[0]


@pytest.mark.asyncio
async def test_gemini_adapter_repairs_invalid_json_without_resending_images(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    reviewer = GeminiVisualReviewer(timeout=1)
    calls: list[dict[str, object]] = []

    async def invalid_then_valid(body: dict[str, object], _key: str) -> str:
        calls.append(body)
        if len(calls) == 1:
            return '{"scores":{"visualHierarchy":3},"issues":[],"summary":"bad \\q"}'
        return _response()

    monkeypatch.setattr(reviewer, "_complete", invalid_then_valid)
    report = await reviewer.review(
        VisualReviewRequest(contact_sheet=b"sheet", failed_pages=[b"page"])
    )

    assert report.available
    assert len(calls) == 2
    repair_messages = calls[1]["messages"]
    assert isinstance(repair_messages, list)
    assert all(
        not isinstance(part, dict) or part.get("type") != "image_url"
        for message in repair_messages
        for part in (message.get("content") if isinstance(message.get("content"), list) else [])
    )
