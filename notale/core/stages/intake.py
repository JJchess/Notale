"""[0] Intake & Clarify —— 单线程。把用户一句话变成结构化课程简报（course-brief）。

时长 → 页数预算的起点；rawQuery 留痕可追溯。
"""

from __future__ import annotations

from notale.core.models import CourseBrief
from notale.utils.llm import LLMClient
from notale.utils.parsing import extract_json

_PROMPT = """你是课程需求分析员。把用户的讲义请求整理成结构化课程简报 JSON。

字段：
- topic: 课题（字符串）
- audience: 受众，年级/背景（字符串；用户没说就合理推断并注明"推断"）
- priorKnowledge: 先验知识假设（字符串）
- durationMin: 课堂时长，分钟（整数；没说给 45）
- intensity: 强度档位，只能是 "skim" / "standard" / "deep"
- language: 语言代码（中文请求 = "zh"）
- interactivityAsk: 对交互性的显式要求（没说就空串）

只输出 JSON 对象，不要任何其他文字。

用户请求：{query}
{material}"""


async def intake(
    llm: LLMClient, query: str, uploaded_material: str | None = None
) -> CourseBrief:
    material = f"\n上传材料（节选）：\n{uploaded_material[:4000]}" if uploaded_material else ""
    out = await llm.complete(
        [{"role": "user", "content": _PROMPT.format(query=query, material=material)}],
        purpose="intake",
    )
    data = extract_json(out)
    data["rawQuery"] = query  # 原始输入由 harness 落，不信模型转述
    return CourseBrief.model_validate(data)
