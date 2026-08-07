"""Read-only validation and ownership signatures for absolute-frame plans.

This module deliberately never repairs a plan.  A failed plan must be returned to the same
planner conversation so capability selection and geometry are revised together.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable
from typing import Any

_SCENE_KINDS = {"hero", "content", "quiz", "statement", "section"}
_FRAME_ROLES = {"primary", "support", "practice", "decoration"}
_BLOCK_ROLES = {"claim", "evidence", "visualization", "practice", "support"}
_SIM_CAPABILITIES = {"state-sim", "model-sim", "geometry-sim"}
_INTERACTION_FIELDS = {
    "stateModel", "controls", "update", "initialPaint", "visibleEncodings",
    "history", "reset", "verificationCases", "aestheticDirection", "signatureDetail",
}
_CONTINUOUS_MODEL_SIGNALS = (
    "continuous", "over time", "time evolution", "phase", "velocity", "force vector",
    "trajectory", "x(t)", "v(t)", "f(t)", "连续", "随时间", "时间演化", "相位",
    "速度", "力矢量", "轨迹", "参数重算", "定量因果",
)
_DISCRETE_STATE_SIGNALS = (
    "step", "discrete", "insert", "delete", "tree", "graph", "array", "node", "edge",
    "单步", "离散", "插入", "删除", "树", "数组", "节点", "边", "前态", "后态",
)
_OBLIGATION_EQUIVALENTS: dict[str, set[str]] = {
    # A relational obligation asks for explicit visible relationships.  The concrete Skill depends
    # on topology: graph for named node/edge topology, diagram for other fixed relational structure.
    "graph": {"graph", "diagram"},
}


def _rect(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, dict):
        return None
    coordinates: list[float] = []
    for key in ("x", "y", "w", "h"):
        raw = value.get(key)
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            return None
        number = float(raw)
        if not math.isfinite(number):
            return None
        coordinates.append(number)
    return tuple(coordinates)  # type: ignore[return-value]


def _overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def _scene_text(scene: dict[str, Any]) -> str:
    brief_value = scene.get("brief")
    brief: dict[str, Any] = brief_value if isinstance(brief_value, dict) else {}
    values = [scene.get("headline"), scene.get("lead"), *brief.values()]
    return " ".join(str(value or "").lower() for value in values)


def _block_types(scene: dict[str, Any]) -> set[str]:
    return {
        str(block.get("type") or "")
        for block in (scene.get("blocks") or [])
        if isinstance(block, dict)
    }


def _validate_interaction(block: dict[str, Any], sid: str, errors: list[str]) -> None:
    brief = block.get("interactionBrief")
    if not isinstance(brief, dict):
        errors.append(f"{sid}/{block.get('id')}: {block.get('type')} 缺 interactionBrief")
        return
    missing = sorted(field for field in _INTERACTION_FIELDS if not brief.get(field))
    if missing:
        errors.append(
            f"{sid}/{block.get('id')}: interactionBrief 缺字段 {', '.join(missing)}"
        )
    if block.get("type") in {"model-sim", "geometry-sim"} and not isinstance(
        brief.get("mathModel"), dict
    ):
        errors.append(f"{sid}/{block.get('id')}: {block.get('type')} 缺 mathModel")


def validate_absolute_frame_plan(
    doc: dict[str, Any],
    *,
    pages: int,
    allowed_types: Iterable[str],
    evidence_obligations: Iterable[dict[str, str]] = (),
) -> list[str]:
    """Return all absolute-frame planning errors without mutating ``doc``."""

    errors: list[str] = []
    allowed = set(allowed_types)
    scenes = doc.get("scenes")
    if not isinstance(scenes, list):
        return ["顶层 scenes 必须是数组"]
    if len(scenes) != pages:
        errors.append(f"总页数必须恰好为 {pages}，当前为 {len(scenes)}")
    if not isinstance(doc.get("designBrief"), dict):
        errors.append("顶层缺 designBrief")

    global_ids: set[str] = set()
    scene_ids: set[str] = set()
    course_types: set[str] = set()
    for index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            errors.append(f"第 {index + 1} 页不是对象")
            continue
        sid = str(scene.get("id") or f"page-{index + 1}")
        if not scene.get("id"):
            errors.append(f"第 {index + 1} 页缺 scene id")
        elif sid in scene_ids:
            errors.append(f"scene id {sid!r} 重复")
        scene_ids.add(sid)
        kind = str(scene.get("kind") or "")
        if kind not in _SCENE_KINDS:
            errors.append(f"{sid}: 非法 scene kind {kind!r}")
        if not isinstance(scene.get("brief"), dict):
            errors.append(f"{sid}: 缺 brief")
        if not isinstance(scene.get("visualBrief"), dict):
            errors.append(f"{sid}: 缺 visualBrief")

        blocks = [block for block in (scene.get("blocks") or []) if isinstance(block, dict)]
        if not blocks:
            errors.append(f"{sid}: blocks 为空")
        block_by_id: dict[str, dict[str, Any]] = {}
        for block in blocks:
            bid = str(block.get("id") or "")
            if not bid:
                errors.append(f"{sid}: block 缺 id")
                continue
            if bid in global_ids:
                errors.append(f"{sid}: block id {bid!r} 全局重复")
            global_ids.add(bid)
            block_by_id[bid] = block
            block_type = str(block.get("type") or "")
            course_types.add(block_type)
            if block_type not in allowed:
                errors.append(f"{sid}/{bid}: 未知 capability {block_type!r}")
            if block.get("role") not in _BLOCK_ROLES:
                errors.append(f"{sid}/{bid}: 非法 block role {block.get('role')!r}")
            if "size" in block:
                errors.append(f"{sid}/{bid}: frames 模式禁止 size；唯一尺寸为 frame x/y/w/h")
            if block_type in _SIM_CAPABILITIES:
                _validate_interaction(block, sid, errors)
            if block_type == "media":
                for field in ("purpose", "placement", "subject", "relationshipToContent", "fidelity"):
                    if block.get(field) in (None, ""):
                        errors.append(f"{sid}/{bid}: media 缺 {field}")

        layout = scene.get("layout")
        if not isinstance(layout, dict) or layout.get("kind") != "frames":
            errors.append(f"{sid}: 缺 layout.kind=frames")
            continue
        canvas = layout.get("canvas")
        if not isinstance(canvas, dict) or canvas.get("width") != 1280 or canvas.get("height") != 720:
            errors.append(f"{sid}: canvas 必须为 1280x720")
        title = layout.get("titleFrame")
        needs_title = kind in {"content", "quiz", "statement"}
        if needs_title != isinstance(title, dict):
            errors.append(f"{sid}: titleFrame 与 scene kind 不匹配")
        title_rect = _rect(title) if isinstance(title, dict) else None
        if isinstance(title, dict) and title_rect is None:
            errors.append(f"{sid}: titleFrame 坐标必须是有限数值")

        raw_frames = layout.get("frames")
        frames = [frame for frame in (raw_frames or []) if isinstance(frame, dict)]
        refs = [str(frame.get("blockId") or "") for frame in frames]
        if len(frames) != len(blocks) or sorted(refs) != sorted(block_by_id) or len(refs) != len(set(refs)):
            errors.append(
                f"{sid}: block/frame 必须一一对应 blocks={sorted(block_by_id)} frames={sorted(refs)}"
            )

        valid_frames: list[tuple[dict[str, Any], tuple[float, float, float, float]]] = []
        for frame in frames:
            bid = str(frame.get("blockId") or "")
            rect = _rect(frame)
            if rect is None:
                errors.append(f"{sid}/{bid or '?'}: frame x/y/w/h 必须是有限数值")
                continue
            x, y, width, height = rect
            if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1280 or y + height > 720:
                errors.append(f"{sid}/{bid}: frame 越界或尺寸非正 ({x:g},{y:g},{width:g},{height:g})")
            role = str(frame.get("role") or "")
            if role not in _FRAME_ROLES:
                errors.append(f"{sid}/{bid}: 非法 frame role {role!r}")
            block = block_by_id.get(bid, {})
            if frame.get("clip") and str(block.get("type") or "") not in {"media", "video", "decoration"}:
                errors.append(f"{sid}/{bid}: 只有 media/video/decoration 可以 clip")
            if str(block.get("type") or "") in _SIM_CAPABILITIES | {"runnable"}:
                if width < 760 or height < 420:
                    errors.append(
                        f"{sid}/{bid}: {block.get('type')} viewport 至少需要 760x420，当前 {width:g}x{height:g}"
                    )
                if role != "primary":
                    errors.append(f"{sid}/{bid}: {block.get('type')} 必须是 primary frame")
            title_safe = not (
                role == "decoration"
                or (
                    str(block.get("type") or "") == "media"
                    and str(block.get("placement") or "") == "background"
                )
            )
            if title_safe and title_rect is not None and _overlap(title_rect, rect):
                errors.append(f"{sid}/{bid}: frame 侵入 titleFrame")
            valid_frames.append((frame, rect))

        for left in range(len(valid_frames)):
            frame_a, rect_a = valid_frames[left]
            for right in range(left + 1, len(valid_frames)):
                frame_b, rect_b = valid_frames[right]
                if not _overlap(rect_a, rect_b):
                    continue
                block_a = block_by_id.get(str(frame_a.get("blockId") or ""), {})
                block_b = block_by_id.get(str(frame_b.get("blockId") or ""), {})
                decorative = (
                    frame_a.get("role") == "decoration" or frame_b.get("role") == "decoration"
                    or block_a.get("type") in {"media", "video", "decoration"}
                    or block_b.get("type") in {"media", "video", "decoration"}
                )
                if not decorative:
                    errors.append(
                        f"{sid}: 非装饰 frames 重叠 {frame_a.get('blockId')} / {frame_b.get('blockId')}"
                    )

        types = _block_types(scene)
        brief_value = scene.get("brief")
        brief = brief_value if isinstance(brief_value, dict) else {}
        action = str(brief.get("learningAction") or "")
        if action in {"implement", "run", "debug"} and "runnable" not in types:
            errors.append(f"{sid}: {action} 学习证据必须由 runnable 承担")
        text = _scene_text(scene)
        continuous = any(signal in text for signal in _CONTINUOUS_MODEL_SIGNALS)
        discrete = any(signal in text for signal in _DISCRETE_STATE_SIGNALS)
        if continuous and "state-sim" in types and not discrete:
            errors.append(f"{sid}: 连续参数/时间模型不得路由为 state-sim，应使用 model-sim")

    for obligation in evidence_obligations:
        capability = str(obligation.get("capability") or "")
        accepted = _OBLIGATION_EQUIVALENTS.get(capability, {capability})
        if capability and capability in allowed and not (accepted & course_types):
            errors.append(
                f"课程证据义务 {obligation.get('knowledgeForm') or '?'} 缺 capability {capability}"
            )
    return errors


def plan_skeleton_signature(doc: dict[str, Any]) -> str:
    """Stable signature for planner-owned structure before and after mechanical lowering."""

    scenes: list[dict[str, Any]] = []
    for scene in doc.get("scenes") or []:
        if not isinstance(scene, dict):
            continue
        blocks = []
        for block in scene.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            blocks.append(
                {
                    "id": block.get("id"),
                    "capability": block.get("_planningType") or block.get("type"),
                    "role": block.get("role"),
                }
            )
        layout_value = scene.get("layout")
        layout = layout_value if isinstance(layout_value, dict) else {}
        frames = [
            {key: frame.get(key) for key in ("blockId", "x", "y", "w", "h", "z", "role")}
            for frame in (layout.get("frames") or [])
            if isinstance(frame, dict)
        ]
        scenes.append({"id": scene.get("id"), "blocks": blocks, "frames": frames})
    payload = json.dumps(scenes, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
