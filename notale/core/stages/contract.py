"""[2] Curriculum Contract —— ★单线程锁定：全局隐含决策只决定一次 + 人在环确认。

大纲照着教法笔记生成，页面照着备课资料生成；大纲上任何结构性决定说不出依据 = 临场偏好
（rationale 必须回指 pedagogy-note）。
时长→页数由 duration 模型（确定性）定，模型只在预算内排布；时间预算由 harness 按页型
权重缩放分配，不信模型自报。
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from notale.core.models import (
    Chapter,
    CourseBrief,
    Globals,
    Outline,
    PageSpec,
    PageType,
    PedagogyNote,
    PrepRecord,
)
from notale.core.duration import chapter_count, page_count, time_budget_sec
from notale.utils.llm import LLMClient
from notale.utils.parsing import extract_json

# 人在环确认：返回 (是否批准, 修改意见)。走错方向返工成本最高的点，值得一次确认。
ConfirmHook = Callable[[Outline, Globals, list[PageSpec]], Awaitable[tuple[bool, str]]]


class ContractRejected(RuntimeError):
    """人在环未批准契约；编排必须停止，不能带着未确认契约继续。"""


async def auto_confirm(outline: Outline, globals_: Globals, specs: list[PageSpec]) -> tuple[bool, str]:
    return True, ""


@dataclass
class ContractOutput:
    outline: Outline
    globals: Globals
    page_specs: list[PageSpec]
    events: list[dict] = field(default_factory=list)


_PROMPT = """你是课程规划师（planner）。基于备课资料和教法笔记，为这门课锁定课程契约。

课题：{topic}｜受众：{audience}｜时长：{durationMin} 分钟｜强度：{intensity}
语言：{language}｜交互要求：{interactivityAsk}

硬约束：
- 整本讲义必须恰好 {n_pages} 页、{n_chapters} 章（时长模型解出，不许改）；
- 每页恰好一个中心信息；每页 pageType 只能是：{page_types}；
- 每页 boundPrepRecords 只能从下列资料 id 里选（页面上的东西在资料里找不到出处 = 编的）；
- 每章 rationale 必须回指一条教法笔记 id（结构性决定说不出依据 = 临场偏好）。

备课资料 id 与摘要：
{prep_summary}

教法笔记：
{pedagogy_summary}

输出 JSON：
{{
  "chapters": [{{"title": "章名", "pageRange": [起页, 止页], "rationale": "回指教法笔记 id"}}],
  "globals": {{
    "terminology": {{"术语": "定义"}},
    "notation": {{"符号": "含义"}},
    "styleTokens": {{"primary": "#hex", "font": "…"}},
    "componentAPI": ["批准使用的组件"],
    "artDirection": "视觉风格方向"
  }},
  "pages": [
    {{
      "pageId": "p1",
      "pageType": "页型",
      "centralMessage": "唯一中心信息",
      "learningAction": "学习动作",
      "visualSubject": "视觉主体",
      "boundPrepRecords": ["recordId"]
    }}
  ]
}}
只输出 JSON。"""


async def contract(
    llm: LLMClient,
    brief: CourseBrief,
    prep_records: list[PrepRecord],
    pedagogy_notes: list[PedagogyNote],
    confirm: ConfirmHook = auto_confirm,
) -> ContractOutput:
    lo, hi = page_count(brief.durationMin)
    n_pages = (lo + hi) // 2
    n_chapters = chapter_count(brief.durationMin)

    prep_summary = "\n".join(
        f"- {r.recordId}: {str(r.content)[:120]}" for r in prep_records
    ) or "（空——没有资料也要排大纲，页面上不许出现资料外的断言）"
    pedagogy_summary = "\n".join(f"- {p.id} [{p.type}]: {p.content[:120]}" for p in pedagogy_notes) or "（空）"

    out = await llm.complete(
        [
            {
                "role": "user",
                "content": _PROMPT.format(
                    topic=brief.topic,
                    audience=brief.audience,
                    durationMin=brief.durationMin,
                    intensity=brief.intensity.value,
                    language=brief.language,
                    interactivityAsk=brief.interactivityAsk,
                    n_pages=n_pages,
                    n_chapters=n_chapters,
                    page_types="|".join(t.value for t in PageType),
                    prep_summary=prep_summary,
                    pedagogy_summary=pedagogy_summary,
                ),
            }
        ],
        purpose="contract",
    )
    data = extract_json(out)
    events: list[dict] = []

    # --- harness 校验与确定性修补 ---
    valid_ids = {r.recordId for r in prep_records}
    raw_pages = data.get("pages", [])[:n_pages]
    specs: list[PageSpec] = []
    for i, p in enumerate(raw_pages):
        bound = [b for b in p.get("boundPrepRecords", []) if b in valid_ids]
        dropped = set(p.get("boundPrepRecords", [])) - set(bound)
        if dropped:
            events.append(
                {"kind": "spec-binding-dropped", "pageId": p.get("pageId"), "dropped": sorted(dropped)}
            )
        specs.append(
            PageSpec(
                pageId=str(p.get("pageId", f"p{i+1}")),
                pageType=PageType(p.get("pageType", PageType.WORKED_EXAMPLE)),
                centralMessage=str(p.get("centralMessage", "")),
                learningAction=str(p.get("learningAction", "")),
                visualSubject=str(p.get("visualSubject", "")),
                boundPrepRecords=bound,
            )
        )

    # 时间预算：页型权重 × 缩放，使总预算 ≈ 总时长（确定性，不信模型自报）
    total_sec = brief.durationMin * 60
    base = sum(time_budget_sec(s.pageType) for s in specs) or 1
    scale = total_sec / base
    for s in specs:
        s.timeBudgetSec = time_budget_sec(s.pageType, scale)

    chapters = [
        Chapter(
            title=str(c.get("title", f"第{i+1}章")),
            pageRange=(int(c.get("pageRange", [1, 1])[0]), int(c.get("pageRange", [1, 1])[1])),
            rationale=str(c.get("rationale", "")),
        )
        for i, c in enumerate(data.get("chapters", []))
    ]
    outline = Outline(chapters=chapters, durationBudget={"totalMin": brief.durationMin})
    globals_ = Globals.model_validate(data.get("globals") or {})

    approved, notes = await confirm(outline, globals_, specs)
    if not approved:
        raise ContractRejected(notes or "课程契约未获批准")

    import datetime

    outline.confirmedAt = datetime.datetime.now(datetime.timezone.utc).isoformat()
    outline.revisionNotes = notes
    events.append({"kind": "contract-confirmed", "notes": notes})

    return ContractOutput(outline=outline, globals=globals_, page_specs=specs, events=events)
