from __future__ import annotations

import json
from copy import deepcopy

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.plan_validation import (
    plan_skeleton_signature,
    validate_absolute_frame_plan,
)
from lecture_agent.domain.planning import plan_lecture
from lecture_agent.domain.skills import load_skill_catalog, lower_planning_placeholder, plan_menu
from lecture_agent.domain.themes import theme_menu


def _plan(*, block_type: str = "statement", width: int = 960, height: int = 440) -> dict:
    block: dict = {"id": "b1", "type": block_type, "role": "claim", "intent": "解释结论"}
    if block_type in {"state-sim", "model-sim", "geometry-sim"}:
        block["role"] = "visualization"
        block["interactionBrief"] = {
            "stateModel": [{"name": "p", "type": "number", "range_or_values": "0..1", "initial": 0}],
            "controls": [{"trigger": "滑块", "effect": "重算"}],
            "update": "按参数重算",
            "initialPaint": "初态完整可见",
            "visibleEncodings": [{"quantity": "状态", "mark": "位置", "where": "主舞台"}],
            "history": "保留参考态",
            "reset": "恢复 p=0",
            "verificationCases": [{"input": "初态", "expected": "初态"}, {"input": "操作", "expected": "改变"}, {"input": "复位", "expected": "初态"}],
            "aestheticDirection": "paper-editorial",
            "signatureDetail": "强调变化",
        }
        if block_type != "state-sim":
            block["interactionBrief"]["mathModel"] = {"formula": "x=p", "screenMapping": "映射到位置", "invariants": "确定性"}
    return {
        "id": "demo",
        "title": "Demo",
        "designBrief": {"audience": {"stage": "university"}, "purpose": "explanation", "density": "medium", "designDNA": {}},
        "scenes": [
            {
                "id": "p1",
                "kind": "content",
                "headline": "结论",
                "brief": {"objective": "解释结论", "learningAction": "explain", "requiredEvidence": "可见结论", "keyClaim": "结论", "misconception": "", "visualTask": "突出结论", "evidencePolicy": "derived"},
                "visualBrief": {"designIntent": "聚焦", "selectedCapabilities": [block_type], "compositionFamily": "poster"},
                "layout": {"kind": "frames", "canvas": {"width": 1280, "height": 720}, "titleFrame": {"x": 64, "y": 32, "w": 1152, "h": 112, "z": 5}, "frames": [{"blockId": "b1", "x": 160, "y": 176, "w": width, "h": height, "z": 1, "role": "primary", "clip": False}]},
                "blocks": [block],
            }
        ],
    }


def test_absolute_frame_validator_is_read_only_and_rejects_second_size_contract() -> None:
    doc = _plan(block_type="state-sim", width=240, height=240)
    doc["scenes"][0]["blocks"][0]["size"] = "xl"
    before = deepcopy(doc)
    errors = validate_absolute_frame_plan(
        doc,
        pages=1,
        allowed_types={"state-sim"},
    )
    assert doc == before
    assert any("禁止 size" in error for error in errors)
    assert any("至少需要 760x420" in error for error in errors)


def test_mechanical_lowering_preserves_planner_owned_signature() -> None:
    registry, planning = load_skill_catalog()
    doc = _plan(block_type="model-sim", width=960, height=440)
    before = plan_skeleton_signature(doc)
    block = doc["scenes"][0]["blocks"][0]
    lowered = lower_planning_placeholder(dict(block), planning)
    block.clear()
    block.update(lowered)
    assert block["type"] == "sim" and block["engine"] == "widget"
    assert plan_skeleton_signature(doc) == before
    assert registry["sim"].skill == "create-sim"


class _RepairingPlanner(FakeClient):
    def __init__(self, invalid: dict, valid: dict) -> None:
        super().__init__(by_purpose={
            "plan:perspectives": json.dumps({"perspectives": [{"name": "教师", "focus": "主线", "mustCover": [], "questions": []}], "knowledgeForms": []}, ensure_ascii=False)
        })
        self._plans = [invalid, valid]

    async def complete(self, messages, *, json_mode=True, purpose="chat"):
        if purpose == "plan:skeleton":
            self.calls.append((purpose, messages))
            return json.dumps(self._plans.pop(0), ensure_ascii=False)
        return await super().complete(messages, json_mode=json_mode, purpose=purpose)


async def test_planner_repairs_whole_plan_in_same_conversation() -> None:
    invalid = _plan(block_type="state-sim", width=240, height=240)
    invalid["scenes"][0]["blocks"][0]["size"] = "xl"
    valid = _plan()
    registry, planning = load_skill_catalog()
    llm = _RepairingPlanner(invalid, valid)
    result = await plan_lecture(
        llm,
        topic="中性主题",
        pages=1,
        type_menu=plan_menu(registry, planning),
        theme_menu=theme_menu(),
        authoring_rules="",
        perspectives_n=1,
        absolute_frames=True,
    )
    assert result.doc == valid
    skeleton_calls = [messages for purpose, messages in llm.calls if purpose == "plan:skeleton"]
    assert len(skeleton_calls) == 2
    assert len(skeleton_calls[1]) == 3
    feedback = json.loads(skeleton_calls[1][-1]["content"])
    assert feedback["previousPlan"] == invalid
    assert any("至少需要 760x420" in error for error in feedback["validationErrors"])
