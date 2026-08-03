"""讲者备注必须依据最终页面内容，而不是只看 block 类型脑补。"""

from __future__ import annotations

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.generation.notes import enrich_notes


async def test_notes_prompt_contains_actual_formula_data_and_page_brief() -> None:
    doc = {
        "title": "梯度下降",
        "scenes": [
            {
                "id": "p1",
                "kind": "content",
                "headline": "一步更新",
                "notes": "占位。",
                "blocks": [
                    {
                        "id": "f1",
                        "type": "formula",
                        "latex": r"w_{t+1}=(1-2\eta)w_t",
                        "caption": "二次函数在第二维的精确递推。",
                    },
                    {
                        "id": "c1",
                        "type": "chart",
                        "chartType": "line",
                        "categories": ["0", "1", "2"],
                        "series": [{"name": "w_2", "values": [1, 0.8, 0.64]}],
                    },
                ],
            }
        ],
    }
    fake = FakeClient(by_purpose={"notes": '{"note":"依据递推解释几何衰减，而非常数步长。"}'})
    await enrich_notes(
        fake,
        doc,
        page_briefs={
            "p1": {
                "objective": "学生能计算两步迭代",
                "keyClaim": "更新量随状态衰减",
                "misconception": "每一步移动固定距离",
                "visualTask": "比较连续两步的缩放",
                "evidencePolicy": "derived",
            }
        },
    )

    prompt = fake.calls[0][1][1]["content"]
    assert "w_{t+1}=(1-2\\\\eta)w_t" in prompt  # JSON 字符串中的反斜杠会再次转义
    assert '"values": [1, 0.8, 0.64]' in prompt
    assert "每一步移动固定距离" in prompt
    assert "formula,chart" not in prompt
    assert "几何衰减" in doc["scenes"][0]["notes"]
