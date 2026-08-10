"""[2] Curriculum Contract —— ★单线程锁定：全局隐含决策只决定一次 + 人在环确认。

大纲优先根据教法笔记生成，页面优先根据备课资料生成；禁用 Research 时，Planner
必须把事实基础写成 planner-generated 记录，并在 rationale 中自证结构理由。
时长→页数由 duration 模型（确定性）定，模型只在预算内排布；时间预算由 harness 按页型
权重缩放分配，不信模型自报。
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel, Field

from notale.agents.managed import ManagedAgent
from notale.core.models import (
    BuilderPlan,
    Chapter,
    ContinuityLink,
    CourseBrief,
    Globals,
    Outline,
    NarrativeRelation,
    PageSpec,
    PageType,
    PedagogyNote,
    PrepRecord,
    PrepRecordOrigin,
)
from notale.core.duration import chapter_count, page_count, time_budget_sec
from notale.core.observability import ExperimentLogger
from notale.roles.profiles import BUILDER, PLANNER
from notale.utils.config import SKILLS_PATH, get_config
from notale.utils.skill_catalog import load_skill_catalog

_CONFIG = get_config()
_DURATION_CONFIG = _CONFIG.duration_model
_SKILL_CATALOG = load_skill_catalog(BUILDER, SKILLS_PATH)
_PAST_RELATIONS = {
    NarrativeRelation.BUILDS_ON,
    NarrativeRelation.CONTRASTS_WITH,
    NarrativeRelation.RETURNS_TO,
    NarrativeRelation.SYNTHESIZES,
}

# 人在环确认：返回 (是否批准, 修改意见)。走错方向返工成本最高的点，值得一次确认。
ConfirmHook = Callable[
    [Outline, Globals, list[PageSpec], BuilderPlan], Awaitable[tuple[bool, str]]
]


class ContractRejected(RuntimeError):
    """人在环未批准契约；编排必须停止，不能带着未确认契约继续。"""


async def auto_confirm(
    outline: Outline,
    globals_: Globals,
    specs: list[PageSpec],
    builder_plan: BuilderPlan,
) -> tuple[bool, str]:
    return True, ""


@dataclass
class ContractOutput:
    outline: Outline
    globals: Globals
    page_specs: list[PageSpec]
    builder_plan: BuilderPlan
    supplemental_prep_records: list[PrepRecord] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)


_PROMPT = """用 artifact_read / artifact_search 读取 course-brief.json、prep-records.json 和
pedagogy-notes.json 的完整内容，为本次运行提交课程契约。

课题：{topic}｜受众：{audience}｜先验：{priorKnowledge}
时长：{durationMin} 分钟｜强度：{intensity}
语言：{language}｜交互要求：{interactivityAsk}

本次确定性约束：恰好 {n_pages} 页、{n_chapters} 章；pageType 只能是 {page_types}。
{pedagogy_constraint}

可选 Builder skill catalog：
{skill_catalog}

已有 Research record IDs：{prep_ids}
可引用 PedagogyNote IDs：{pedagogy_ids}

输出 JSON：
{{
  "throughline": "整本讲义的一句话主线",
  "chapters": [{{
    "title": "章名",
    "pageRange": [起页, 止页],
    "rationale": "本章内容排序的依据",
    "pedagogyNoteIds": {pedagogy_example},
    "narrativeGoal": "本章怎样推进主线"
  }}],
  "globals": {{
    "terminology": {{"术语": "定义"}},
    "notation": {{"符号": "含义"}}
  }},
  "supplementalPrepRecords": [
    {{
      "recordId": "planner-standard-claim",
      "branch": ["constructible"],
      "referenceSource": "declared-spec",
      "content": {{"claim": "标准教材命题", "derivation": "必要时给出推导"}},
      "invariants": ["始终成立的条件"],
      "validRange": "适用范围",
      "knownInaccuracies": ["已知限制"]
    }}
  ],
  "pages": [
    {{
      "pageId": "p1",
      "pageType": "页型",
      "centralMessage": "唯一中心信息",
      "learningAction": "认知动作",
      "boundPrepRecords": ["recordId"],
      "narrativeRole": "本页怎样推进主线",
      "continuity": [
        {{"pageId": "p1", "relation": "returns-to", "cue": "回收的具体概念"}}
      ]
    }}
  ],
  "builderPlan": {{
    "schemaVersion": 2,
    "sharedSkills": [
      {{
        "name": "可选 catalog 中的全书表达 skill",
        "profile": "该 skill 自有 profile",
        "instruction": "简短的主题化视觉方向与贯穿母题"
      }}
    ],
    "pageSkills": {{
      "p7": [{{"name": "create-sim", "instruction": ""}}]
    }}
  }}
}}
通过 submit_contract 工具提交。"""


class _ContractCandidate(BaseModel):
    throughline: str = ""
    chapters: list[dict] = Field(default_factory=list)
    globals: dict = Field(default_factory=dict)
    supplementalPrepRecords: list[dict] = Field(default_factory=list)
    pages: list[dict] = Field(default_factory=list)
    builderPlan: dict = Field(default_factory=dict)


async def contract(
    llm,
    brief: CourseBrief,
    prep_records: list[PrepRecord],
    pedagogy_notes: list[PedagogyNote],
    confirm: ConfirmHook = auto_confirm,
    *,
    run_dir: Path,
    logger: ExperimentLogger | None = None,
) -> ContractOutput:
    if brief.requestedPageCount is not None:
        n_pages = brief.requestedPageCount
        n_chapters = min(
            n_pages,
            max(
                _DURATION_CONFIG.chapter_count_minimum,
                min(
                    _DURATION_CONFIG.chapter_count_maximum,
                    round(n_pages / _DURATION_CONFIG.pages_per_chapter),
                ),
            ),
        )
    else:
        lo, hi = page_count(brief.durationMin)
        n_pages = (lo + hi) // 2
        n_chapters = chapter_count(brief.durationMin)

    research_ids = [record.recordId for record in prep_records]
    if len(research_ids) != len(set(research_ids)):
        raise ValueError("research prep records contain duplicate recordId values")
    pedagogy_ids = [note.id for note in pedagogy_notes]
    if len(pedagogy_ids) != len(set(pedagogy_ids)):
        raise ValueError("pedagogy notes contain duplicate IDs")
    valid_pedagogy_ids = set(pedagogy_ids)

    def generated_records(raw_records: list[dict]) -> list[PrepRecord]:
        records: list[PrepRecord] = []
        seen = set(research_ids)
        for raw in raw_records:
            payload = dict(raw)
            record_id = str(payload.get("recordId", "")).strip()
            if re.fullmatch(r"planner-[a-z0-9]+(?:-[a-z0-9]+)*", record_id) is None:
                raise ValueError(
                    "planner-generated prep record must use a lowercase planner-* ID: "
                    f"{record_id!r}"
                )
            if record_id in seen:
                raise ValueError(f"duplicate prep record ID: {record_id}")
            if payload.get("evidence") not in (None, {}):
                raise ValueError(
                    f"planner-generated prep record cannot provide evidence: {record_id}"
                )
            if not payload.get("content"):
                raise ValueError(f"planner-generated prep record has empty content: {record_id}")
            payload.update({
                "recordId": record_id,
                "origin": PrepRecordOrigin.PLANNER_GENERATED.value,
                "evidence": None,
                "provenanceLink": "planner:main",
            })
            record = PrepRecord.model_validate(payload)
            if not record.branch:
                raise ValueError(f"planner-generated prep record has no branch: {record_id}")
            records.append(record)
            seen.add(record_id)
        return records

    def validate_candidate(payload: dict) -> _ContractCandidate:
        candidate = _ContractCandidate.model_validate(payload)
        if len(candidate.pages) != n_pages:
            raise ValueError(f"contract must contain exactly {n_pages} pages")
        if len(candidate.chapters) != n_chapters:
            raise ValueError(f"contract must contain exactly {n_chapters} chapters")
        if not candidate.throughline.strip():
            raise ValueError("contract must contain a deck throughline")

        raw_globals = candidate.globals
        unknown_global_fields = sorted(
            set(raw_globals) - {"terminology", "notation"}
        )
        if unknown_global_fields:
            raise ValueError(
                "course globals may only contain terminology and notation: "
                + ", ".join(unknown_global_fields)
            )
        Globals.model_validate(raw_globals)

        supplements = generated_records(candidate.supplementalPrepRecords)
        valid_ids = set(research_ids) | {record.recordId for record in supplements}
        page_ids: set[str] = set()
        page_positions: dict[str, int] = {}
        used_ids: set[str] = set()
        for index, page in enumerate(candidate.pages, 1):
            page_id = str(page.get("pageId", f"p{index}")).strip()
            if not page_id or page_id in page_ids:
                raise ValueError(f"contract contains invalid or duplicate pageId: {page_id!r}")
            page_ids.add(page_id)
            page_positions[page_id] = index
            if not str(page.get("centralMessage", "")).strip():
                raise ValueError(f"page {page_id} must have a centralMessage")
            if not str(page.get("learningAction", "")).strip():
                raise ValueError(f"page {page_id} must have a learningAction")
            if not str(page.get("narrativeRole", "")).strip():
                raise ValueError(f"page {page_id} must have a narrativeRole")
            PageType(page.get("pageType", PageType.WORKED_EXAMPLE))
            bound = [str(record_id).strip() for record_id in page.get("boundPrepRecords", [])]
            if not bound or any(not record_id for record_id in bound):
                raise ValueError(f"page {page_id} must bind at least one prep record")
            if len(bound) != len(set(bound)):
                raise ValueError(f"page {page_id} binds duplicate prep records")
            used_ids.update(bound)

        builder_plan = _SKILL_CATALOG.normalize_plan(
            BuilderPlan.model_validate(candidate.builderPlan), page_ids
        )
        candidate = candidate.model_copy(
            update={"builderPlan": builder_plan.model_dump(mode="json")}
        )

        links_by_source: dict[str, list[ContinuityLink]] = {}
        for index, page in enumerate(candidate.pages, 1):
            source_id = str(page.get("pageId", f"p{index}")).strip()
            raw_links = page.get("continuity", [])
            if not isinstance(raw_links, list) or len(raw_links) > 3:
                raise ValueError(f"page {source_id} continuity must contain at most 3 links")
            links = [ContinuityLink.model_validate(link) for link in raw_links]
            link_keys = [(link.pageId, link.relation) for link in links]
            if len(link_keys) != len(set(link_keys)):
                raise ValueError(f"page {source_id} contains duplicate continuity links")
            for link in links:
                if link.pageId not in page_positions:
                    raise ValueError(
                        f"page {source_id} continuity targets unknown page: {link.pageId}"
                    )
                if link.pageId == source_id:
                    raise ValueError(f"page {source_id} continuity cannot target itself")
                if not link.cue.strip():
                    raise ValueError(f"page {source_id} continuity cue must not be blank")
                target_position = page_positions[link.pageId]
                if link.relation == NarrativeRelation.SETS_UP:
                    if target_position <= index:
                        raise ValueError(
                            f"page {source_id} sets-up must target a later page"
                        )
                elif link.relation in _PAST_RELATIONS and target_position >= index:
                    raise ValueError(
                        f"page {source_id} {link.relation.value} must target an earlier page"
                    )
            links_by_source[source_id] = links

        unknown = sorted({
            str(record_id)
            for page in candidate.pages
            for record_id in page.get("boundPrepRecords", [])
            if str(record_id) not in valid_ids
        })
        if unknown:
            raise ValueError(f"contract binds unknown prep records: {unknown}")
        unused_supplements = sorted(
            {record.recordId for record in supplements} - used_ids
        )
        if unused_supplements:
            raise ValueError(
                f"planner-generated prep records are not used by any page: {unused_supplements}"
            )
        chapter_ranges: list[tuple[int, int]] = []
        for index, chapter in enumerate(candidate.chapters, 1):
            refs = [str(note_id).strip() for note_id in chapter.get("pedagogyNoteIds", [])]
            if valid_pedagogy_ids and not refs:
                raise ValueError(f"chapter {index} must cite at least one pedagogy note")
            if not valid_pedagogy_ids and refs:
                raise ValueError(
                    f"chapter {index} cannot cite pedagogy notes when none are available"
                )
            if len(refs) != len(set(refs)):
                raise ValueError(f"chapter {index} cites duplicate pedagogy notes")
            unknown_refs = sorted(set(refs) - valid_pedagogy_ids)
            if unknown_refs:
                raise ValueError(
                    f"chapter {index} cites unknown pedagogy notes: {unknown_refs}"
                )
            if not str(chapter.get("rationale", "")).strip():
                raise ValueError(f"chapter {index} must explain its pedagogy rationale")
            if not str(chapter.get("narrativeGoal", "")).strip():
                raise ValueError(f"chapter {index} must have a narrativeGoal")
            raw_range = chapter.get("pageRange", [])
            if not isinstance(raw_range, (list, tuple)) or len(raw_range) != 2:
                raise ValueError(f"chapter {index} must have a two-item pageRange")
            lo, hi = int(raw_range[0]), int(raw_range[1])
            if lo < 1 or hi > n_pages or lo > hi:
                raise ValueError(f"chapter {index} has invalid pageRange: {[lo, hi]}")
            chapter_ranges.append((lo, hi))

        coverage = [position for lo, hi in chapter_ranges for position in range(lo, hi + 1)]
        if coverage != list(range(1, n_pages + 1)):
            raise ValueError("chapter pageRange values must partition the ordered pages exactly")
        for chapter_index, (lo, hi) in enumerate(chapter_ranges[1:], 2):
            has_cross_chapter_link = False
            for source_position in range(lo, hi + 1):
                source_id = str(candidate.pages[source_position - 1].get("pageId", ""))
                for link in links_by_source.get(source_id, []):
                    target_position = page_positions[link.pageId]
                    if target_position < lo and (
                        n_pages < 3 or abs(source_position - target_position) > 1
                    ):
                        has_cross_chapter_link = True
                        break
                if has_cross_chapter_link:
                    break
            if not has_cross_chapter_link:
                raise ValueError(
                    f"chapter {chapter_index} must contain a non-adjacent link to an earlier chapter"
                )
        return candidate.model_copy(update={
            "supplementalPrepRecords": [
                record.model_dump(mode="json") for record in supplements
            ]
        })

    agent = ManagedAgent(
        run_dir=run_dir,
        stage="planner",
        worker_id="main",
        role=PLANNER,
        objective="在确定性预算内锁定学习序列、证据路由与全局课程契约。",
        acceptance_criteria=[
            f"恰好 {n_pages} 页、{n_chapters} 章。",
            "每页都有一个知识命题、一个认知行动和完整的资料绑定。",
            "Research 与 planner-generated 记录可追踪，补充记录不伪造 evidence。",
            (
                "每章引用存在且唯一的 pedagogy-note ID。"
                if pedagogy_ids
                else "无 Research 教法笔记时，每章 pedagogyNoteIds 为空且 rationale 自洽。"
            ),
            "全书主线、章节目标和选择性跨页关系形成完整叙事。",
            "课程 globals 与 Builder skill control plane 严格分离。",
        ],
        steps=[
            ("inspect-sources", "读取完整简报、备课资料和教法笔记。"),
            ("lock-contract", "锁定课程契约与独立 Builder skill plan。"),
            ("submit-contract", "提交结构化课程契约。"),
        ],
        submit_tool="submit_contract",
        submit_validator=validate_candidate,
        llm=llm,
        logger=logger,
        purpose="contract",
    )
    candidate = await agent.run_task(_PROMPT.format(
        topic=brief.topic,
        audience=brief.audience,
        priorKnowledge=brief.priorKnowledge or "（未声明）",
        durationMin=brief.durationMin,
        intensity=brief.intensity.value,
        language=brief.language,
        interactivityAsk=brief.interactivityAsk,
        n_pages=n_pages,
        n_chapters=n_chapters,
        page_types="|".join(t.value for t in PageType),
        prep_ids="、".join(research_ids) or "（无）",
        pedagogy_ids="、".join(pedagogy_ids) or "（无）",
        pedagogy_constraint=(
            "每章 pedagogyNoteIds 必须引用真实教法笔记，"
            "rationale 解释采用理由；"
            if pedagogy_ids
            else "本次没有 Research 教法笔记：每章 pedagogyNoteIds 必须为 []，"
            "rationale 直接根据受众、先验、目标与时长说明排序理由；"
        ),
        pedagogy_example='["r1-ped-1"]' if pedagogy_ids else "[]",
        skill_catalog=_SKILL_CATALOG.planner_menu(),
    ))
    data = _ContractCandidate.model_validate(candidate).model_dump(mode="json")
    events: list[dict] = []
    supplemental_records = [
        PrepRecord.model_validate(record)
        for record in data.get("supplementalPrepRecords", [])
    ]

    # --- harness 校验与确定性修补 ---
    raw_pages = data.get("pages", [])[:n_pages]
    specs: list[PageSpec] = []
    for i, p in enumerate(raw_pages):
        bound = [str(b) for b in p.get("boundPrepRecords", [])]
        specs.append(
            PageSpec(
                pageId=str(p.get("pageId", f"p{i+1}")),
                pageType=PageType(p.get("pageType", PageType.WORKED_EXAMPLE)),
                centralMessage=str(p.get("centralMessage", "")),
                learningAction=str(p.get("learningAction", "")),
                boundPrepRecords=bound,
                narrativeRole=str(p.get("narrativeRole", "")),
                continuity=[
                    ContinuityLink.model_validate(link)
                    for link in p.get("continuity", [])
                ],
            )
        )

    # 时间预算：页型权重 × 缩放，使总预算 ≈ 总时长（确定性，不信模型自报）
    total_sec = brief.durationMin * _DURATION_CONFIG.seconds_per_minute
    base = sum(time_budget_sec(s.pageType) for s in specs) or 1
    scale = total_sec / base
    for s in specs:
        s.timeBudgetSec = time_budget_sec(s.pageType, scale)

    chapters = [
        Chapter(
            title=str(c.get("title", f"第{i+1}章")),
            pageRange=(int(c.get("pageRange", [1, 1])[0]), int(c.get("pageRange", [1, 1])[1])),
            rationale=str(c.get("rationale", "")),
            pedagogyNoteIds=[str(note_id) for note_id in c.get("pedagogyNoteIds", [])],
            narrativeGoal=str(c.get("narrativeGoal", "")),
        )
        for i, c in enumerate(data.get("chapters", []))
    ]
    outline = Outline(
        chapters=chapters,
        throughline=str(data.get("throughline", "")),
        durationBudget={"totalMin": brief.durationMin},
    )
    globals_ = Globals.model_validate(data.get("globals") or {})
    builder_plan = BuilderPlan.model_validate(data.get("builderPlan") or {})

    approved, notes = await confirm(outline, globals_, specs, builder_plan)
    if not approved:
        raise ContractRejected(notes or "课程契约未获批准")

    import datetime

    outline.confirmedAt = datetime.datetime.now(datetime.timezone.utc).isoformat()
    outline.revisionNotes = notes
    events.append({"kind": "contract-confirmed", "notes": notes})
    events.append({
        "kind": "builder-plan-selected",
        "builderPlan": builder_plan.model_dump(mode="json"),
        "skillCatalogSha256": _SKILL_CATALOG.sha256,
    })

    return ContractOutput(
        outline=outline,
        globals=globals_,
        page_specs=specs,
        builder_plan=builder_plan,
        supplemental_prep_records=supplemental_records,
        events=events,
    )
