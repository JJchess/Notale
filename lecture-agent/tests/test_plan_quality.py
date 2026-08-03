"""fan-out 前整份骨架质检：只允许修规划，不能偷塞最终 block 内容。"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.evaluation.plan_quality import (
    refine_plan,
    replan_page,
    validate_plan_revision,
)


def _doc() -> dict:
    return {
        "id": "gd",
        "title": "梯度下降",
        "scenes": [
            {
                "id": "p1",
                "kind": "content",
                "headline": "学习率调度",
                "notes": "比较调度策略。",
                "brief": {
                    "objective": "学生能比较三种调度",
                    "keyClaim": "调度改变训练损失曲线",
                    "misconception": "调度只影响速度",
                    "visualTask": "画三条未经模型推导的损失曲线",
                    "evidencePolicy": "synthetic",
                },
                "blocks": [
                    {"id": "c1", "type": "chart", "role": "visualization", "intent": "画损失", "size": "l"}
                ],
            }
        ],
    }


async def test_refine_plan_can_replace_fake_outcome_with_directly_encoded_variable() -> None:
    candidate = _doc()["scenes"][0]
    candidate["brief"] = {
        "objective": "学生能从曲线读出不同调度下的学习率",
        "keyClaim": "调度规则直接决定 η(t)",
        "misconception": "调度公式等同于损失曲线",
        "visualTask": "直接画三条 η(t) 曲线并标出阶段边界",
        "evidencePolicy": "derived",
    }
    candidate["blocks"] = [
        {"id": "c1", "type": "chart", "role": "visualization", "intent": "画 η(t)", "size": "l"}
    ]
    fake = FakeClient(
        by_purpose={
            "quality:plan": json.dumps(
                {"revisions": [{"sceneId": "p1", "reason": "损失不是调度公式的直接输出", "scene": candidate}]},
                ensure_ascii=False,
            )
        }
    )
    doc = _doc()
    warnings = await refine_plan(fake, doc, topic="梯度下降", allowed_types={"chart"})
    assert warnings == []
    assert doc["scenes"][0]["brief"]["visualTask"].startswith("直接画三条 η(t)")


async def test_refine_plan_rejects_final_content_inside_placeholder() -> None:
    candidate = _doc()["scenes"][0]
    candidate["blocks"][0]["series"] = [{"name": "伪数据", "values": [1, 0]}]
    fake = FakeClient(
        by_purpose={
            "quality:plan": json.dumps(
                {"revisions": [{"sceneId": "p1", "reason": "修订", "scene": candidate}]}, ensure_ascii=False
            )
        }
    )
    doc = _doc()
    warnings = await refine_plan(fake, doc, topic="梯度下降", allowed_types={"chart"})
    assert any("最终内容字段" in warning for warning in warnings)
    assert "series" not in doc["scenes"][0]["blocks"][0]


def test_contour_visual_task_requires_real_geometry_engine() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"]["visualTask"] = "二维损失曲面等高线与参数轨迹"
    scene["blocks"] = [
        {"id": "g1", "type": "graph", "role": "visualization", "intent": "画曲面", "size": "l"}
    ]
    problem = validate_plan_revision(scene, scene, [scene], {"graph", "sim"})
    assert problem and "engine=widget" in problem

    scene["blocks"] = [
        {
            "id": "g1",
            "type": "sim",
            "engine": "widget",
            "role": "visualization",
            "intent": "画真实二维曲面与轨迹",
            "size": "xl",
        }
    ]
    assert validate_plan_revision(scene, scene, [scene], {"graph", "sim"}) == ""


def test_synthetic_optimizer_loss_ranking_is_rejected() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"].update(
        {
            "visualTask": "对比 SGD、AdaGrad、RMSProp、Adam 的损失下降曲线",
            "evidencePolicy": "synthetic",
        }
    )
    scene["blocks"] = [
        {"id": "c1", "type": "chart", "role": "visualization", "intent": "比较收敛速度", "size": "l"}
    ]
    problem = validate_plan_revision(scene, scene, [scene], {"chart"})
    assert problem and "固定排名" in problem


def test_learning_evidence_requires_executable_capability() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"].update(
        {
            "objective": "学生能实现并运行一次更新算法",
            "learningAction": "implement",
            "requiredEvidence": "运行代码并看到测试结果",
        }
    )
    scene["blocks"] = [
        {"id": "c1", "type": "code", "role": "practice", "intent": "展示参考代码", "size": "l"}
    ]
    problem = validate_plan_revision(scene, scene, [scene], {"code", "runnable"})
    assert problem and "runnable" in problem

    scene["blocks"][0]["type"] = "runnable"
    assert validate_plan_revision(scene, scene, [scene], {"code", "runnable"}) == ""


def test_complex_widget_page_rejects_four_block_overload() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"]["visualTask"] = "二维鞍点曲面与轨迹"
    scene["blocks"] = [
        {"id": "w", "type": "sim", "engine": "widget", "role": "visualization", "intent": "二维曲面", "size": "l"},
        {"id": "f", "type": "formula", "role": "evidence", "intent": "公式", "size": "m"},
        {"id": "c", "type": "callout", "role": "support", "intent": "曲率", "size": "s"},
        {"id": "q", "type": "quiz", "role": "practice", "intent": "检验", "size": "m"},
    ]
    problem = validate_plan_revision(
        scene,
        scene,
        [scene],
        {"sim", "formula", "callout", "quiz"},
    )
    assert problem and ("视觉重量" in problem or "最多再配一个" in problem)


async def test_refine_plan_deterministically_prunes_overloaded_widget_page() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"]["visualTask"] = "二维鞍点曲面与轨迹"
    scene["blocks"] = [
        {"id": "w", "type": "sim", "engine": "widget", "role": "visualization", "intent": "二维曲面", "size": "l"},
        {"id": "f", "type": "formula", "role": "evidence", "intent": "公式", "size": "m"},
        {"id": "c", "type": "callout", "role": "support", "intent": "曲率", "size": "s"},
        {"id": "q", "type": "quiz", "role": "practice", "intent": "检验", "size": "m"},
    ]
    doc = {"scenes": [scene]}
    fake = FakeClient(by_purpose={"quality:plan": '{"revisions":[]}'})
    warnings = await refine_plan(
        fake,
        doc,
        topic="鞍点",
        allowed_types={"sim", "formula", "callout", "quiz"},
    )
    assert [block["id"] for block in scene["blocks"]] == ["w", "f"]
    assert any("规划容量兜底" in warning for warning in warnings)


async def test_refine_plan_promotes_geometry_sim_to_widget_when_model_omits_engine() -> None:
    scene = _doc()["scenes"][0]
    candidate = json.loads(json.dumps(scene, ensure_ascii=False))
    candidate["brief"]["visualTask"] = "在二维等高线上展示两条优化轨迹"
    candidate["blocks"] = [
        {
            "id": "s1",
            "type": "sim",
            "role": "visualization",
            "intent": "同时画 SGD 与动量轨迹",
            "size": "l",
        }
    ]
    fake = FakeClient(
        by_purpose={
            "quality:plan": json.dumps(
                {"revisions": [{"sceneId": "p1", "reason": "需要二维几何", "scene": candidate}]},
                ensure_ascii=False,
            )
        }
    )
    doc = {"scenes": [scene]}
    warnings = await refine_plan(fake, doc, topic="动量", allowed_types={"sim"})
    assert warnings == []
    assert doc["scenes"][0]["blocks"][0]["engine"] == "widget"


async def test_refine_plan_routes_unresolved_contour_chart_to_widget() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"]["visualTask"] = "在二维损失等高线上展示参数轨迹"
    scene["blocks"] = [
        {"id": "c1", "type": "chart", "role": "visualization", "intent": "画等高线", "size": "l"}
    ]
    doc = {"scenes": [scene]}
    warnings = await refine_plan(
        FakeClient(by_purpose={"quality:plan": '{"revisions":[]}'}),
        doc,
        topic="优化",
        allowed_types={"chart", "sim"},
    )
    block = scene["blocks"][0]
    assert block["type"] == "sim" and block["engine"] == "widget"
    assert any("规划几何兜底" in warning for warning in warnings)


async def test_refine_plan_falls_back_from_synthetic_optimizer_ranking_to_mechanisms() -> None:
    scene = _doc()["scenes"][0]
    scene["brief"].update(
        {
            "visualTask": "比较 SGD、AdaGrad、RMSProp、Adam 的合成收敛路径",
            "evidencePolicy": "synthetic",
        }
    )
    scene["blocks"] = [
        {"id": "c1", "type": "chart", "role": "visualization", "intent": "排出速度名次", "size": "l"}
    ]
    doc = {"scenes": [scene]}
    warnings = await refine_plan(
        FakeClient(by_purpose={"quality:plan": '{"revisions":[]}'}),
        doc,
        topic="优化器",
        allowed_types={"chart", "table"},
    )
    assert scene["blocks"][0]["type"] == "table"
    assert len(scene["blocks"]) == 1 and scene["blocks"][0]["size"] == "xl"
    assert "不编码普遍性能排名" in scene["brief"]["visualTask"]
    assert any("规划证据兜底" in warning for warning in warnings)


def test_quiz_objective_cannot_claim_multiple_chapter_topics() -> None:
    scene = _doc()["scenes"][0]
    scene["kind"] = "quiz"
    scene["brief"]["objective"] = "学生能判断梯度方向、学习率影响与调度策略"
    scene["blocks"] = [
        {"id": "q1", "type": "quiz", "role": "practice", "intent": "一道题", "size": "m"}
    ]
    problem = validate_plan_revision(scene, scene, [scene], {"quiz"})
    assert problem and "一个判定链" in problem


async def test_refine_plan_deterministically_narrows_broad_quiz_scope() -> None:
    scene = _doc()["scenes"][0]
    scene["kind"] = "quiz"
    scene["brief"].update(
        {
            "objective": "学生能判断梯度方向、学习率影响与调度策略",
            "keyClaim": "覆盖整章",
        }
    )
    scene["blocks"] = [
        {"id": "q1", "type": "quiz", "role": "practice", "intent": "综合测验", "size": "m"}
    ]
    doc = {"scenes": [scene]}
    warnings = await refine_plan(
        FakeClient(by_purpose={"quality:plan": '{"revisions":[]}'}),
        doc,
        topic="梯度下降",
        allowed_types={"quiz"},
    )
    assert scene["brief"]["objective"] == "学生能判断学习率过大时迭代会震荡或发散"
    assert any("规划测评兜底" in warning for warning in warnings)


async def test_replan_page_normalizes_legacy_brief_role_size_and_colliding_ids() -> None:
    current = _doc()["scenes"][0]
    current["brief"]["visualTask"] = "二维损失曲面等高线与轨迹"
    response = {
        "scene": {
            "id": "p1",
            "kind": "content",
            "headline": "真实二维轨迹",
            "brief": "旧格式把 brief 写成了字符串",
            "objective": "学生能读取轨迹",
            "keyClaim": "轨迹由梯度更新决定",
            "notes": "重做视觉。",
            "blocks": [
                {
                    "id": "used-elsewhere",
                    "type": "sim",
                    "engine": "widget",
                    "role": "interactive-demonstration",
                    "intent": "画二维等高线与真实更新轨迹",
                    "size": "lg",
                }
            ],
        }
    }
    other = {"id": "p2", "kind": "content", "blocks": [{"id": "used-elsewhere", "type": "list"}]}
    fake = FakeClient(by_purpose={"quality:replan": json.dumps(response, ensure_ascii=False)})
    candidate, err = await replan_page(
        fake,
        current_scene=current,
        brief=current["brief"],
        issues=["原 graph 不能表达坐标"],
        topic="梯度下降",
        audience="",
        material="",
        allowed_types={"sim", "list"},
        type_descriptions={"sim": "交互模拟", "list": "列表"},
        all_scenes=[current, other],
    )
    assert err is None and candidate is not None
    assert candidate["brief"]["objective"] == "学生能读取轨迹"
    assert candidate["blocks"][0]["role"] == "visualization"
    assert candidate["blocks"][0]["size"] == "l"
    assert candidate["blocks"][0]["id"] != "used-elsewhere"
