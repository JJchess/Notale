"""逐页质量门保留完整内容并输出可路由问题。"""

from __future__ import annotations

import json
from typing import Any

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.evaluation.page_quality import review_page
from lecture_agent.engine import GeneratorOptions, generate_lecture
from lecture_agent.engine.pipeline import _merge_render_quality
from lecture_agent.ports.llm import Message
from lecture_agent.ports.renderer import RenderReport


async def test_page_review_keeps_chart_values_and_routes_block_issue() -> None:
    response = json.dumps(
        {
            "score": 5.5,
            "pass": False,
            "blockIssues": [
                {
                    "blockId": "c1",
                    "severity": "major",
                    "problem": "数据终点与 caption 不一致",
                    "instruction": "重新计算序列并明确示意数据",
                }
            ],
            "pageIssues": [],
        },
        ensure_ascii=False,
    )
    fake = FakeClient(by_purpose={"quality:page": response})
    review = await review_page(
        fake,
        topic="学习率",
        scene={
            "id": "p1",
            "kind": "content",
            "blocks": [
                {
                    "id": "c1",
                    "type": "chart",
                    "chartType": "line",
                    "categories": ["0", "1", "2"],
                    "series": [{"name": "eta", "values": [5, 20, 0]}],
                    "caption": "学习率从 5 增至 50。",
                }
            ],
        },
        brief={
            "objective": "学生能读出调度端点",
            "keyClaim": "调度值随阶段变化",
            "misconception": "曲线形状正确就等于数值正确",
            "visualTask": "读出起点、峰值、终点",
            "evidencePolicy": "synthetic",
        },
    )

    assert not review.passed and review.score == 5.5
    assert review.block_issues[0]["blockId"] == "c1"
    system_prompt = fake.calls[0][1][0]["content"]
    prompt = fake.calls[0][1][1]["content"]
    assert '"values": [5, 20, 0]' in prompt
    assert "学习率从 5 增至 50" in prompt
    assert "读出起点、峰值、终点" in prompt
    assert "更新位移与梯度的点积必须 < 0" in system_prompt
    assert "只显示一个选中状态不算比较" in system_prompt
    assert "loss/accuracy 不能代替学习率" in system_prompt
    assert "一维切片不能证明鞍点" in system_prompt
    assert "初始值、最小值、最大值" in system_prompt
    assert "无故中英混排算问题" in system_prompt
    assert "不能据此宣称某方法普遍更快" in system_prompt
    assert "不得为了配合下山叙事把非极值点改名为山顶" in system_prompt
    assert "不能表述成保证逃离任意局部极小值" in system_prompt


async def test_page_review_rejects_minor_issue_even_when_model_says_pass() -> None:
    fake = FakeClient(
        by_purpose={
            "quality:page": json.dumps(
                {
                    "score": 9.8,
                    "pass": True,
                    "blockIssues": [
                        {
                            "blockId": "b1",
                            "severity": "minor",
                            "problem": "封面提示对比度不足",
                            "instruction": "提高提示文字颜色对比度",
                        }
                    ],
                    "pageIssues": [],
                },
                ensure_ascii=False,
            )
        }
    )
    review = await review_page(
        fake,
        topic="学习率",
        scene={"id": "p1", "kind": "statement", "blocks": [{"id": "b1", "type": "statement", "statement": "结论"}]},
        brief={"objective": "学生能复述结论", "keyClaim": "结论", "misconception": "", "visualTask": "突出结论", "evidencePolicy": "none"},
    )
    assert not review.passed
    assert review.block_issues[0]["severity"] == "minor"


async def test_pipeline_routes_quality_issue_back_to_exact_block() -> None:
    skeleton = json.dumps(
        {
            "id": "quality-demo",
            "title": "学习率",
            "scenes": [
                {
                    "id": "p1",
                    "kind": "statement",
                    "brief": {
                        "objective": "学生能准确说出步长关系",
                        "keyClaim": "更新范数等于学习率乘梯度范数",
                        "misconception": "梯度只给方向",
                        "visualTask": "突出乘法关系",
                        "evidencePolicy": "derived",
                    },
                    "notes": "定义核心关系。",
                    "blocks": [
                        {"id": "b1", "type": "statement", "role": "claim", "intent": "陈述更新范数"}
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )
    review = json.dumps(
        {
            "score": 4,
            "pass": False,
            "blockIssues": [
                {
                    "blockId": "b1",
                    "severity": "critical",
                    "problem": "把梯度误说成只给方向",
                    "instruction": "改为更新范数等于学习率乘梯度范数",
                }
            ],
            "pageIssues": [],
        },
        ensure_ascii=False,
    )
    clean_review = json.dumps(
        {"score": 9.8, "pass": True, "blockIssues": [], "pageIssues": []}, ensure_ascii=False
    )

    class QualityFake(FakeClient):
        def __init__(self) -> None:
            super().__init__(
                by_purpose={
                    "plan:skeleton": skeleton,
                    "quality:page": review,
                    "notes": '{"note":"学习率与梯度范数共同决定更新范数。"}',
                }
            )
            self.statement_calls = 0
            self.quality_calls = 0

        async def complete(
            self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
        ) -> str:
            if purpose == "quality:page":
                self.calls.append((purpose, messages))
                self.quality_calls += 1
                return review if self.quality_calls == 1 else clean_review
            if purpose == "block:statement":
                self.calls.append((purpose, messages))
                self.statement_calls += 1
                text = "梯度只给方向。" if self.statement_calls == 1 else "更新范数等于学习率乘梯度范数。"
                return json.dumps({"type": "statement", "statement": text}, ensure_ascii=False)
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    fake: Any = QualityFake()
    result = await generate_lecture(
        fake,
        topic="学习率",
        pages=1,
        options=GeneratorOptions(plan_perspectives=1, sections=False, quality_rounds=1),
    )

    assert fake.statement_calls == 2
    assert result.doc["scenes"][0]["blocks"][0]["statement"] == "更新范数等于学习率乘梯度范数。"
    assert "brief" not in result.doc["scenes"][0], "内部质量契约不得泄漏到最终 LectureDoc"
    assert fake.quality_calls == 2, "回炉后的页必须再审，最终分数才可信"
    assert result.quality[0]["sceneId"] == "p1" and result.quality[0]["score"] == 9.8


def test_browser_metrics_can_veto_semantic_high_score() -> None:
    quality = [{"sceneId": "p1", "score": 9.8, "pass": True}]
    report = RenderReport(
        ok=False,
        page_metrics=[
            {
                "i": 0,
                "overflowX": 0,
                "overflowY": 0,
                "layoutClip": 0,
                "mblockClip": 0,
                "dynamicBlank": [],
                "plotWarnings": 0,
                "chartMinWidthUse": 0.52,
                "widgetMinHeight": None,
                "minTextPx": 14,
            }
        ],
    )
    _merge_render_quality(quality, [{"id": "p1"}], report)
    assert quality[0]["semanticScore"] == 9.8
    assert quality[0]["score"] == 7.0
    assert not quality[0]["pass"] and not quality[0]["renderPass"]
    assert "52%" in quality[0]["renderIssues"][0]


def test_plot_warning_marker_vetoes_semantic_score() -> None:
    quality = [{"sceneId": "p1", "score": 9.8, "pass": True}]
    report = RenderReport(
        ok=False,
        page_metrics=[
            {
                "i": 0,
                "overflowX": 0,
                "overflowY": 0,
                "layoutClip": 0,
                "mblockClip": 0,
                "dynamicBlank": [],
                "plotWarnings": 1,
                "minTextPx": 14,
            }
        ],
    )
    _merge_render_quality(quality, [{"id": "p1"}], report)
    assert quality[0]["score"] == 4.0
    assert not quality[0]["pass"]


def test_widget_runtime_error_vetoes_semantic_score() -> None:
    quality = [{"sceneId": "p1", "score": 9.8, "pass": True}]
    report = RenderReport(
        ok=False,
        page_metrics=[
            {
                "i": 0,
                "overflowX": 0,
                "overflowY": 0,
                "layoutClip": 0,
                "mblockClip": 0,
                "dynamicBlank": [],
                "widgetErrors": ["Assignment to constant variable"],
                "plotWarnings": 0,
                "minTextPx": 14,
            }
        ],
    )
    _merge_render_quality(quality, [{"id": "p1"}], report)
    assert quality[0]["score"] == 2.0
    assert not quality[0]["pass"]
    assert "Assignment to constant variable" in quality[0]["renderIssues"][0]


async def test_page_issue_can_replan_block_type_and_regenerate_whole_page() -> None:
    skeleton = json.dumps(
        {
            "id": "replan-demo",
            "title": "重规划",
            "scenes": [
                {
                    "id": "p1",
                    "kind": "content",
                    "headline": "旧标题",
                    "notes": "旧规划。",
                    "brief": {
                        "objective": "学生能识别风险",
                        "keyClaim": "风险需要醒目标记",
                        "misconception": "普通正文足够醒目",
                        "visualTask": "突出风险",
                        "evidencePolicy": "none",
                    },
                    "blocks": [
                        {"id": "b1", "type": "statement", "role": "claim", "intent": "普通陈述", "size": "m"}
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )
    replanned = json.dumps(
        {
            "scene": {
                "id": "p1",
                "kind": "content",
                "headline": "风险提示",
                "notes": "用醒目提示完成目标。",
                "brief": {
                    "objective": "学生能识别风险",
                    "keyClaim": "风险需要醒目标记",
                    "misconception": "普通正文足够醒目",
                    "visualTask": "突出风险",
                    "evidencePolicy": "none",
                },
                "blocks": [
                    {"id": "b1-new", "type": "callout", "role": "claim", "intent": "醒目标出风险", "size": "l"}
                ],
            }
        },
        ensure_ascii=False,
    )
    bad = json.dumps(
        {
            "score": 5,
            "pass": False,
            "blockIssues": [],
            "pageIssues": ["statement 类型无法形成必要的风险视觉层级，需改 block 类型"],
        },
        ensure_ascii=False,
    )
    clean = json.dumps(
        {"score": 9.8, "pass": True, "blockIssues": [], "pageIssues": []}, ensure_ascii=False
    )

    class ReplanFake(FakeClient):
        def __init__(self) -> None:
            super().__init__(
                by_purpose={
                    "plan:skeleton": skeleton,
                    "block:statement": '{"type":"statement","statement":"普通风险。"}',
                    "quality:replan": replanned,
                    "block:callout": '{"type":"callout","label":"风险","text":"必须醒目标出。"}',
                    "notes": '{"note":"指出风险视觉层级。"}',
                }
            )
            self.reviews = 0

        async def complete(
            self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
        ) -> str:
            if purpose == "quality:page":
                self.calls.append((purpose, messages))
                self.reviews += 1
                return bad if self.reviews == 1 else clean
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    fake: Any = ReplanFake()
    result = await generate_lecture(
        fake,
        topic="风险",
        pages=1,
        options=GeneratorOptions(plan_perspectives=1, sections=False, quality_rounds=2),
    )
    assert result.doc["scenes"][0]["headline"] == "风险提示"
    assert result.doc["scenes"][0]["blocks"][0]["type"] == "callout"
    assert result.quality[0]["semanticScore"] == 9.8
    assert result.quality[0]["renderVerified"] is False


async def test_rejected_replan_does_not_lock_wrong_block_type() -> None:
    brief = {
        "objective": "学生能识别风险",
        "learningAction": "inspect",
        "requiredEvidence": "醒目的风险层级",
        "keyClaim": "风险需要醒目标记",
        "misconception": "普通正文足够醒目",
        "visualTask": "突出风险",
        "evidencePolicy": "none",
    }
    skeleton = json.dumps(
        {
            "id": "retry-replan",
            "title": "风险",
            "scenes": [
                {
                    "id": "p1",
                    "kind": "content",
                    "headline": "旧标题",
                    "notes": "旧规划。",
                    "brief": brief,
                    "blocks": [
                        {"id": "b1", "type": "statement", "role": "claim", "intent": "普通陈述", "size": "m"}
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )
    invalid = {
        "scene": {
            "id": "p1",
            "kind": "content",
            "headline": "风险提示",
            "notes": "改用醒目提示。",
            "brief": brief,
            "blocks": [
                {"id": "b2", "type": "callout", "role": "claim", "intent": "醒目标出风险", "size": "jumbo"}
            ],
        }
    }
    valid = json.loads(json.dumps(invalid, ensure_ascii=False))
    valid["scene"]["blocks"][0]["size"] = "lg"
    issue = json.dumps(
        {"score": 5, "pass": False, "blockIssues": [], "pageIssues": ["必须更换 block 类型"]},
        ensure_ascii=False,
    )
    clean = json.dumps(
        {"score": 9.8, "pass": True, "blockIssues": [], "pageIssues": []}, ensure_ascii=False
    )

    class RetryFake(FakeClient):
        def __init__(self) -> None:
            super().__init__(
                by_purpose={
                    "plan:skeleton": skeleton,
                    "block:statement": '{"type":"statement","statement":"普通风险。"}',
                    "block:callout": '{"type":"callout","label":"风险","text":"必须醒目标出。"}',
                    "notes": '{"note":"指出风险视觉层级。"}',
                }
            )
            self.reviews = 0
            self.replans = 0

        async def complete(
            self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
        ) -> str:
            if purpose == "quality:page":
                self.calls.append((purpose, messages))
                self.reviews += 1
                return issue if self.reviews <= 2 else clean
            if purpose == "quality:replan":
                self.calls.append((purpose, messages))
                self.replans += 1
                return json.dumps(invalid if self.replans == 1 else valid, ensure_ascii=False)
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    fake: Any = RetryFake()
    result = await generate_lecture(
        fake,
        topic="风险",
        pages=1,
        options=GeneratorOptions(plan_perspectives=1, sections=False, quality_rounds=3),
    )
    assert fake.replans == 2
    assert result.doc["scenes"][0]["blocks"][0]["type"] == "callout"
    assert result.quality[0]["semanticScore"] == 9.8


async def test_same_page_replans_once_then_repairs_existing_widget() -> None:
    widget_html = (
        "<style>.w{color:var(--ink);background:var(--bg2)}</style>"
        "<div class=w><canvas id=cv width=320 height=180></canvas></div>"
        "<script>const c=document.getElementById('cv').getContext('2d');"
        "const ink=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();"
        "let t=0;function update(){c.clearRect(0,0,320,180);c.fillStyle=ink;"
        "c.fillRect(t%320,80,8,8);t++;requestAnimationFrame(update)}update();</script>"
    )
    brief = {
        "objective": "学生能读出方向",
        "keyClaim": "箭头必须指向负梯度",
        "misconception": "正梯度是下降方向",
        "visualTask": "二维坐标中的负梯度箭头",
        "evidencePolicy": "derived",
    }
    skeleton = json.dumps(
        {
            "id": "widget-repair",
            "title": "方向",
            "scenes": [
                {
                    "id": "p1",
                    "kind": "content",
                    "headline": "负梯度",
                    "notes": "演示方向。",
                    "brief": brief,
                    "blocks": [
                        {"id": "w1", "type": "sim", "engine": "widget", "role": "visualization", "intent": "画箭头", "size": "xl"}
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )
    replanned = json.dumps(
        {
            "scene": {
                "id": "p1",
                "kind": "content",
                "headline": "负梯度",
                "notes": "演示方向。",
                "brief": brief,
                "blocks": [
                    {"id": "w2", "type": "sim", "engine": "widget", "role": "visualization", "intent": "准确画负梯度箭头", "size": "xl"}
                ],
            }
        },
        ensure_ascii=False,
    )
    issue = json.dumps(
        {"score": 6, "pass": False, "blockIssues": [], "pageIssues": ["箭头方向仍错误"]},
        ensure_ascii=False,
    )
    clean = json.dumps(
        {"score": 9.8, "pass": True, "blockIssues": [], "pageIssues": []}, ensure_ascii=False
    )

    class WidgetRepairFake(FakeClient):
        def __init__(self) -> None:
            super().__init__(
                by_purpose={
                    "plan:skeleton": skeleton,
                        "widget:plan": json.dumps(
                            {
                                "core_insight": "方向",
                                "render_medium": "canvas",
                                "state_model": [{"name": "step", "type": "int", "range": "0..1", "init": "1"}],
                                "interactions": [{"trigger": "reset click", "effect": "重画箭头"}],
                                "update": "update() 重画箭头",
                                "initial_paint": "首帧显示箭头",
                                "visible_encodings": [{"quantity": "方向", "mark": "箭头", "where": "画布"}],
                                "comparison_states": [],
                                "interaction_loop": {
                                    "action": "点击复位",
                                    "model_update": "恢复 step=1",
                                    "visible_change": "箭头回到初态",
                                    "history": "保留前态箭头",
                                    "reset": "恢复同一初态",
                                },
                                "math_model": {"formula": "none", "screen_mapping": "not applicable", "invariants": []},
                                "verification_cases": [{"input": "reset", "expected": "step=1"}],
                            },
                            ensure_ascii=False,
                        ),
                        "widget:build": (
                            '{"title":"方向","widget_type":"interactive",'
                            '"loading_messages":["准备"],"assistant_text":"观察箭头方向。"}'
                            f"\n<widget_code>{widget_html}</widget_code>"
                        ),
                    "quality:replan": replanned,
                    "widget:quality-repair": widget_html,
                    "notes": '{"note":"负梯度方向可由点积验证。"}',
                }
            )
            self.review_count = 0

        async def complete(
            self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
        ) -> str:
            if purpose == "quality:page":
                self.calls.append((purpose, messages))
                self.review_count += 1
                return issue if self.review_count <= 2 else clean
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    fake: Any = WidgetRepairFake()
    result = await generate_lecture(
        fake,
        topic="负梯度",
        pages=1,
        options=GeneratorOptions(plan_perspectives=1, sections=False, quality_rounds=2),
    )
    purposes = [purpose for purpose, _messages in fake.calls]
    assert purposes.count("quality:replan") == 1
    assert purposes.count("widget:quality-repair") == 1
    assert result.quality[0]["semanticScore"] == 9.8
