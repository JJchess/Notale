"""[1] Research fan-out —— 多 agent 并联（宽→窄检索），提取即绑定出处。

四路 agent：教学序列 / 例题与反例 / 常见误解 / 素材·史料·数据。
机制要点（PREP §2.1，OpenHarness 迁移后更彻底）：
- 每路是一个 AgentBase(RESEARCH) 实例（独立上下文），模型自己调 fetch_web 工具抓 url；
- 每次抓取 harness 侧自动落 FetchRecord（FetchWebTool.records，模型摸不到）；
- 引文 {url, quotedSpan} 必须对应该 agent 真实抓过的记录，harness 做字面子串校验，
  通过才绑进 evidence——模型没有"贴出处"这个动作，没抓过的 url 在结构上无法变成出处；
- 校验失败/抓取失败的记录**丢弃**并记事件（宁可没有这条资料，不留假出处）；
- 同一知识点只存一份：recordId 去重，先到先存。
"""

from __future__ import annotations

import asyncio
import dataclasses
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from notale.agents.runtime import AgentBase
from notale.tools.fetch_web import FetchWebTool
from notale.roles.profiles import RESEARCH
from notale.core.models import Branch, CourseBrief, PedagogyNote, PrepRecord, ReferenceSource, ResearchNote
from notale.core.evidence import EvidenceBindingError, FetchRecord, bind_evidence
from pydantic import BaseModel, Field
from notale.tools.retriever import Retriever
from notale.utils.parsing import extract_json

AGENTS = ["教学序列", "例题与反例", "常见误解", "素材史料数据"]

_PROMPT = """你是备课研究员，负责「{agent}」方向。为这门课查备课资料：

课题：{topic}｜受众：{audience}｜时长：{durationMin} 分钟｜先验：{priorKnowledge}
{material}

需要引用网络事实时，先用 fetch_web 工具抓取来源页，再从抓回原文里引用。

输出一个 JSON 对象：
{{
  "notes": [{{"id": "note-1", "rawContent": "研究笔记原文"}}],
  "records": [
    {{
      "recordId": "知识点唯一 id（英文短横线命名）",
      "branch": ["constructible"|"checkable"|"neither"]（可多选：①有机械构造器 ②可独立核对 ③皆无），
      "referenceSource": "closed-form|independent-impl|declared-spec|domain-law|invariance|none 之一",
      "content": {{内容本体，结构随类型自定}},
      "invariants": ["运行时必须一直成立的自检条件"],
      "validRange": "有效参数区间与失效边界",
      "knownInaccuracies": ["主动声明的已知不准确处"],
      "quote": {{"url": "来源页", "quotedSpan": "该页原文片段（逐字）"}}  // 仅 checkable 事实类必须给
    }}
  ],
  "pedagogy": [{{"id": "ped-1", "type": "sequence|mechanism|misconception", "content": "教法笔记"}}]
}}

纪律：凡 quote 给的 url 必须是你本轮用 fetch_web 工具真实抓取过的页面，quotedSpan 必须是抓回原文的
逐字片段——harness 会对照工具抓取记录做字面子串校验，对不上或没抓过该 url 整条记录作废。
不确定出处的事实不要编 quote，如实留空（会被标注"未核实"）。
只输出 JSON。"""


class _AgentResult(BaseModel):
    notes: list[dict] = Field(default_factory=list)
    records: list[dict] = Field(default_factory=list)
    pedagogy: list[dict] = Field(default_factory=list)


@dataclass
class ResearchOutput:
    prep_records: list[PrepRecord] = field(default_factory=list)
    pedagogy_notes: list[PedagogyNote] = field(default_factory=list)
    research_notes: list[ResearchNote] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)  # 交 orchestrator 落事件日志（单写者）


# client_factory(agent 方向名) → SupportsStreamingMessages；None 时 AgentBase 按画像构造真 client。
ClientFactory = Callable[[str], object]


async def _run_agent(
    brief: CourseBrief,
    agent: str,
    material: str,
    retriever: Retriever,
    client_factory: ClientFactory | None,
    workspace: Path,
) -> tuple[str, _AgentResult, list[FetchRecord]]:
    fetch_tool = FetchWebTool(retriever)  # 每路独立实例：抓取记录只进这路的 .records
    profile = dataclasses.replace(RESEARCH, tools=[fetch_tool])
    client = client_factory(agent) if client_factory else None
    base = AgentBase(profile, client=client, workspace=workspace)
    result = await base.run(
        _PROMPT.format(
            agent=agent,
            topic=brief.topic,
            audience=brief.audience,
            durationMin=brief.durationMin,
            priorKnowledge=brief.priorKnowledge,
            material=material,
        )
    )
    return agent, _AgentResult.model_validate(extract_json(result.text)), fetch_tool.records


async def research(
    brief: CourseBrief,
    retriever: Retriever,
    uploaded_material: str | None = None,
    *,
    client_factory: ClientFactory | None = None,
    workspace: Path | None = None,
) -> ResearchOutput:
    material = f"\n上传材料（节选）：\n{uploaded_material[:4000]}" if uploaded_material else ""
    ws = workspace or Path.cwd()
    gathered = await asyncio.gather(
        *[_run_agent(brief, a, material, retriever, client_factory, ws) for a in AGENTS],
        return_exceptions=True,  # 一路失败只丢那一路（记事件如实标注），不拖垮整个 research
    )

    output = ResearchOutput()
    results: list[tuple[str, _AgentResult, list[FetchRecord]]] = []
    for agent, res in zip(AGENTS, gathered):
        if isinstance(res, BaseException):
            output.events.append(
                {"kind": "agent-failed", "agent": agent, "reason": f"{type(res).__name__}: {res}"[:300]}
            )
            continue
        results.append(res)
    seen_ids: set[str] = set()

    for agent, res, fetch_records in results:
        fetched = {r.url: r for r in fetch_records}  # 这路 agent 真实抓过的 url（harness 侧事实）
        for n in res.notes:
            output.research_notes.append(
                ResearchNote(
                    id=str(n.get("id", f"note-{len(output.research_notes)+1}")),
                    sourceAgent=agent,
                    rawContent=str(n.get("rawContent", "")),
                )
            )
        for p in res.pedagogy:
            output.pedagogy_notes.append(
                PedagogyNote(
                    id=str(p.get("id", f"ped-{len(output.pedagogy_notes)+1}")),
                    type=p.get("type", "mechanism"),
                    content=str(p.get("content", "")),
                )
            )
        for r in res.records:
            rid = str(r.get("recordId", ""))
            if not rid:
                output.events.append({"kind": "record-dropped", "reason": "缺 recordId", "agent": agent})
                continue
            if rid in seen_ids:
                output.events.append({"kind": "record-deduped", "recordId": rid, "agent": agent})
                continue  # 同一知识点只存一份
            seen_ids.add(rid)

            evidence = None
            quote = r.get("quote") or {}
            if quote.get("url") and quote.get("quotedSpan"):
                url = str(quote["url"])
                fetch = fetched.get(url)
                if fetch is None:
                    output.events.append(
                        {
                            "kind": "record-dropped",
                            "recordId": rid,
                            "reason": f"出处校验失败：模型未真实抓取 {url}（工具记录中不存在）",
                        }
                    )
                    continue  # 没抓过的 url 在结构上不能变成出处，fail-closed
                try:
                    evidence = bind_evidence(fetch, str(quote["quotedSpan"]))
                except EvidenceBindingError as e:
                    output.events.append(
                        {"kind": "record-dropped", "recordId": rid, "reason": f"出处校验失败：{e}"}
                    )
                    continue  # 伪造/张冠李戴 → 整条作废，fail-closed

            record = PrepRecord(
                recordId=rid,
                branch=[Branch(b) for b in r.get("branch", [Branch.NEITHER])],
                referenceSource=ReferenceSource(r.get("referenceSource", "none")),
                content=r.get("content") or {},
                invariants=[str(x) for x in r.get("invariants", [])],
                validRange=str(r.get("validRange", "")),
                knownInaccuracies=[str(x) for x in r.get("knownInaccuracies", [])],
                evidence=evidence,
            )
            if Branch.CHECKABLE in record.branch and record.evidence is None:
                record.knownInaccuracies.append("无出处：未核实")  # 如实标注，不冒充已核实
            output.prep_records.append(record)

    return output
