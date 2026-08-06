"""Parsing and deterministic preflight for screenshot-level visual quality."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ...ports.visual_review import VisualIssue, VisualReviewReport, VisualScores
from ...utils.jsonio import parse_json

_ROUTES = {"tokens", "composition", "media", "blockContent"}
_SCORE_KEYS = {
    "visualHierarchy": "visual_hierarchy",
    "composition": "composition",
    "assetIntegration": "asset_integration",
    "informationDensity": "information_density",
    "legibility": "legibility",
    "crossPageRhythm": "cross_page_rhythm",
}


def _score(value: Any) -> float:
    try:
        return max(0.0, min(5.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def parse_visual_review(raw: str) -> VisualReviewReport:
    """Parse a strict six-dimension response, dropping unroutable or incomplete issues."""
    data = parse_json(raw)
    scores_raw = data.get("scores") if isinstance(data.get("scores"), dict) else data
    score_values = {
        field_name: _score(scores_raw.get(json_name))
        for json_name, field_name in _SCORE_KEYS.items()
    }
    issues: list[VisualIssue] = []
    warnings: list[str] = []
    for item in data.get("issues") or []:
        if not isinstance(item, dict):
            continue
        route = str(item.get("route") or "")
        scene_id = str(item.get("sceneId") or "").strip()
        problem = str(item.get("problem") or "").strip()
        instruction = str(item.get("instruction") or "").strip()
        if route not in _ROUTES:
            warnings.append(f"忽略无法路由的视觉问题: {route or '[missing]'}")
            continue
        if not scene_id or not problem or not instruction:
            warnings.append("忽略缺少 sceneId/problem/instruction 的视觉问题")
            continue
        issues.append(
            VisualIssue(
                scene_id=scene_id,
                route=route,  # type: ignore[arg-type]
                problem=problem,
                instruction=instruction,
            )
        )
    return VisualReviewReport(
        scores=VisualScores(**score_values),
        issues=issues,
        summary=str(data.get("summary") or ""),
        warnings=warnings,
    )


def unavailable_visual_review(reason: str) -> VisualReviewReport:
    """Fail open: generation may continue, while observability retains the failure."""
    return VisualReviewReport(available=False, warnings=[reason[:240]])


@dataclass
class DeterministicVisualReport:
    issues: list[VisualIssue] = field(default_factory=list)
    hard_errors: list[str] = field(default_factory=list)


def _number(metric: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = metric.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None


def preflight_page_metrics(metrics: list[dict[str, Any]]) -> DeterministicVisualReport:
    """Find measurable visual failures without overruling browser hard errors.

    Ratios are expected in [0, 1]. Missing optional metrics are simply not judged.
    """
    report = DeterministicVisualReport()
    signatures: list[tuple[str, str]] = []
    for index, metric in enumerate(metrics):
        scene_id = str(metric.get("sceneId") or metric.get("scene_id") or f"page-{index + 1}")

        overflow_x = _number(metric, "overflowX", "overflow_x") or 0.0
        overflow_y = _number(metric, "overflowY", "overflow_y") or 0.0
        runtime_errors = (
            metric.get("runtimeErrors")
            or metric.get("runtime_errors")
            or metric.get("widgetErrors")
            or []
        )
        if overflow_x > 0 or overflow_y > 0:
            report.hard_errors.append(
                f"{scene_id}: browser overflow x={overflow_x:g}, y={overflow_y:g}"
            )
        if runtime_errors:
            report.hard_errors.append(f"{scene_id}: runtime error: {runtime_errors}")
        layout_clip = _number(metric, "layoutClip", "layout_clip") or 0.0
        math_clip = _number(metric, "mblockClip", "mblock_clip") or 0.0
        if metric.get("corrupt") or layout_clip > 0 or math_clip > 0:
            report.hard_errors.append(f"{scene_id}: browser detected corrupt or clipped content")
        if (
            (_number(metric, "overlapCount") or 0) > 0
            or (_number(metric, "hiddenContentCount") or 0) > 0
            or (_number(metric, "scaleFloor") or 1) < 0.9
            or metric.get("titleFit") is False
            or metric.get("widgetViewportFit") is False
        ):
            report.hard_errors.append(f"{scene_id}: Layout Director hard gate failed")

        subject = _number(metric, "mainSubjectRatio", "main_subject_ratio")
        occupied = _number(metric, "occupiedRatio", "contentAreaRatio", "occupied_ratio")
        whitespace = _number(metric, "whitespaceRatio", "whitespace_ratio")
        sparse_by_design = str(metric.get("sceneKind") or metric.get("scene_kind") or "") in {
            "hero",
            "section",
            "quiz",
        }
        if not sparse_by_design and subject is not None and subject < 0.18:
            report.issues.append(
                VisualIssue(
                    scene_id, "composition", "页面主体视觉面积过小。", "放大主视觉并重新分配标题、正文与主体区域。"
                )
            )
        if not sparse_by_design and (
            (whitespace is not None and whitespace > 0.62)
            or (occupied is not None and occupied < 0.38)
        ):
            report.issues.append(
                VisualIssue(
                    scene_id, "composition", "页面存在无意的巨大空白。", "调整构图区域比例，让核心内容形成明确视觉重心。"
                )
            )

        contrast = _number(metric, "minContrastRatio", "min_contrast_ratio")
        if contrast is not None and contrast < 4.5:
            report.issues.append(
                VisualIssue(
                    scene_id, "tokens", f"最小文字对比度仅 {contrast:.2f}:1。", "调整文字或背景 token，使普通文字对比度至少达到 4.5:1。"
                )
            )
        font_size = _number(metric, "minTextPx", "minFontSize", "min_font_size")
        body_size = _number(metric, "minBodyTextPx")
        aux_size = _number(metric, "minAuxTextPx")
        if font_size is not None and font_size < 14:
            report.hard_errors.append(f"{scene_id}: visible text below 14px ({font_size:g}px)")
        if body_size is not None and body_size < 16:
            report.hard_errors.append(f"{scene_id}: body text below 16px ({body_size:g}px)")
        if aux_size is not None and aux_size < 14:
            report.hard_errors.append(f"{scene_id}: annotation/control text below 14px ({aux_size:g}px)")

        signature = str(metric.get("compositionSignature") or "").strip()
        if signature:
            signatures.append((scene_id, signature))

    run_start = 0
    while run_start < len(signatures):
        run_end = run_start + 1
        while run_end < len(signatures) and signatures[run_end][1] == signatures[run_start][1]:
            run_end += 1
        if run_end - run_start >= 3:
            for scene_id, signature in signatures[run_start + 2 : run_end]:
                report.issues.append(
                    VisualIssue(
                        scene_id,
                        "composition",
                        f"连续页面重复构图签名 {signature}，跨页节奏单调。",
                        "在保持 Design DNA 的前提下改用不同空间变体或视觉重心。",
                    )
                )
        run_start = run_end
    return report
