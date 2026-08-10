"""[1] Research fan-out —— 配置驱动的多 agent 并联，提取即绑定出处。

每个启用的 research.branches 配置项创建一个独立 worker；专能、skills 与安全工具均由
配置装配，下游统一消费 notes / records / pedagogy。
机制要点（PREP §2.1，OpenHarness 迁移后更彻底）：
- 每路是一个 ManagedAgent(RESEARCH) 实例（独立上下文），按该路权限调用研究工具；
- 每次抓取 harness 侧自动落 FetchRecord（FetchWebTool.records，模型摸不到）；
- 引文 {url, quotedSpan} 必须对应该 agent 真实抓过的记录，harness 做字面子串校验，
  通过才绑进 evidence——模型没有"贴出处"这个动作，没抓过的 url 在结构上无法变成出处；
- 校验失败/抓取失败的记录**丢弃**并记事件（宁可没有这条资料，不留假出处）；
- 同一知识点只存一份：recordId 去重，先到先存。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable

from notale.agents.managed import ManagedAgent
from notale.tools.fetch_web import FetchWebTool, SearchWebTool
from notale.roles.profiles import RESEARCH
from notale.core.models import (
    Branch,
    CourseBrief,
    PedagogyNote,
    PrepRecord,
    PrepRecordOrigin,
    ReferenceSource,
    ResearchNote,
)
from notale.core.evidence import EvidenceBindingError, FetchRecord, bind_evidence
from pydantic import BaseModel, Field
from notale.tools.retriever import Retriever
from notale.core.observability import ExperimentLogger
from notale.utils.config import ResearchBranchConfig, get_config

_CONFIG = get_config()
_RESEARCH_CONFIG = _CONFIG.research
_RUNTIME_CONFIG = _CONFIG.runtime
_SAFE_SPECIAL_TOOLS = frozenset({"web_search", "fetch_web"})
_COMMON_ALLOWED_TOOLS = [
    name
    for name in RESEARCH.allowed_tools
    if name not in _SAFE_SPECIAL_TOOLS and name != "submit_research"
]

_PROMPT = """本 worker 的研究专能是：
{focus}

{skill_instruction}再用 artifact_read 读取 course-brief.json，必要时读取完整
input/material.txt。围绕本专能为这门课查备课资料：

课题：{topic}｜受众：{audience}｜时长：{durationMin} 分钟｜先验：{priorKnowledge}
{material}

本 worker 可用的专能工具：{tools}。
{network_instructions}

最多提交 {notes_max} 条 notes、{records_max} 条 records、{pedagogy_max} 条 pedagogy；保持内容紧凑。不要先把 JSON 作为自然语言
打印一遍，直接调用 submit_research。提交对象为：
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
      "quote": {{"url": "来源页", "quotedSpan": "该页原文片段（逐字）"}}  // 有已抓取原文时给，否则省略
    }}
  ],
  "pedagogy": [{{"id": "ped-1", "type": "sequence|mechanism|misconception", "content": "教法笔记"}}]
}}

{evidence_discipline}
通过 submit_research 工具提交上述结构；Harness 自动维护 task ledger，自然语言终稿不算提交。"""


class _AgentResult(BaseModel):
    notes: list[dict] = Field(
        default_factory=list, max_length=_RESEARCH_CONFIG.max_notes_per_branch
    )
    records: list[dict] = Field(
        default_factory=list, max_length=_RESEARCH_CONFIG.max_records_per_branch
    )
    pedagogy: list[dict] = Field(
        default_factory=list, max_length=_RESEARCH_CONFIG.max_pedagogy_per_branch
    )


@dataclass
class ResearchOutput:
    prep_records: list[PrepRecord] = field(default_factory=list)
    pedagogy_notes: list[PedagogyNote] = field(default_factory=list)
    research_notes: list[ResearchNote] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)  # 交 orchestrator 落事件日志（单写者）


# client_factory(agent 方向名) → SupportsStreamingMessages；None 时 ManagedAgent 按画像构造真 client。
ClientFactory = Callable[[str], object]


def _role_for(branch: ResearchBranchConfig):
    """Clone the shared Research governance with this specialization's capabilities."""

    unknown = sorted(set(branch.tools) - _SAFE_SPECIAL_TOOLS)
    if unknown:  # Config typing rejects this; keep the runtime boundary fail-closed too.
        raise ValueError(f"research branch {branch.id} requests unsafe tools: {unknown}")
    unknown_skills = sorted(
        set(branch.skills) - set(RESEARCH.skill_policy.assignable)
    )
    if unknown_skills:
        raise ValueError(
            f"research branch {branch.id} requests unauthorized skills: {unknown_skills}"
        )
    return replace(
        RESEARCH,
        allowed_tools=[*_COMMON_ALLOWED_TOOLS, *branch.tools, "submit_research"],
    )


def _network_instructions(branch: ResearchBranchConfig) -> tuple[str, str]:
    tools = set(branch.tools)
    if {"web_search", "fetch_web"} <= tools:
        return (
            "需要引用网络事实时，先用 web_search 发现真实 URL，再用 fetch_web(url, query) "
            "抓取来源页相关片段，最后从抓回原文里引用。不得凭记忆猜 URL。每个分支最多搜索 "
            f"{_RESEARCH_CONFIG.web_search_max_requests_per_branch} 次、尝试抓取 "
            f"{_RESEARCH_CONFIG.fetch_max_requests_per_branch} 次（失败也计数）；额度耗尽后整理已有证据并提交。",
            "纪律：凡 quote 给的 url 必须是你本轮用 fetch_web 真实抓取过的页面，quotedSpan "
            "必须是抓回原文的逐字片段。Harness 会做字面子串校验，对不上或没抓过该 URL，"
            "整条记录作废。不确定出处的事实不要编 quote，如实留空。",
        )
    if "fetch_web" in tools:
        return (
            "只可抓取课程材料中已经明确给出的真实 URL，不得凭记忆猜 URL；最多尝试抓取 "
            f"{_RESEARCH_CONFIG.fetch_max_requests_per_branch} 次（失败也计数）。",
            "凡 quote 给出的 url 必须由本 worker 用 fetch_web 真实抓取，quotedSpan 必须逐字"
            "来自抓回原文；否则整条记录作废。",
        )
    if "web_search" in tools:
        return (
            "web_search 只能用于发现候选来源；本 worker 没有 fetch_web，不能把搜索摘要作为"
            "引文，也不要提交 quote。最多搜索 "
            f"{_RESEARCH_CONFIG.web_search_max_requests_per_branch} 次。",
            "本 worker 无法绑定网络原文证据；所有 quote 必须留空，无法核实的事实应主动声明。",
        )
    return (
        "本 worker 未分配联网工具，只能依据课程简报、上传材料和已分配 skills 研究；不要猜测"
        "或伪造网络来源。",
        "本 worker 不得提交 quote；无法核实的事实应主动声明。",
    )


async def _run_agent(
    llm,
    brief: CourseBrief,
    branch: ResearchBranchConfig,
    retriever: Retriever,
    client_factory: ClientFactory | None,
    workspace: Path,
    logger: ExperimentLogger | None,
) -> tuple[str, str, _AgentResult, list[FetchRecord]]:
    worker_id = branch.id
    worker_dir = workspace / "agents" / "research" / worker_id
    fetch_tool = None
    extra_tools = []
    for tool_name in branch.tools:
        if tool_name == "web_search":
            extra_tools.append(
                SearchWebTool(
                    state_path=worker_dir / "tool-state.json",
                    max_requests=_RESEARCH_CONFIG.web_search_max_requests_per_branch,
                )
            )
        elif tool_name == "fetch_web":
            fetch_tool = FetchWebTool(
                retriever,
                state_path=worker_dir / "tool-state.json",
                cache_dir=workspace / "cache" / "fetch-web",
                max_chars=_RESEARCH_CONFIG.fetch_excerpt_chars,
                max_requests=_RESEARCH_CONFIG.fetch_max_requests_per_branch,
            )
            extra_tools.append(fetch_tool)
    client = client_factory(branch.focus) if client_factory else llm
    network_instructions, evidence_discipline = _network_instructions(branch)
    if logger:
        from notale.core.observability import now
        logger.append("agent-traces.jsonl", {
            "ts": now(),
            "kind": "research-branch-configured",
            "agent": f"research:{branch.id}",
            "focus": branch.focus,
            "skills": list(branch.skills),
            "tools": list(branch.tools),
        })
    managed = ManagedAgent(
        run_dir=workspace,
        stage="research",
        worker_id=worker_id,
        role=_role_for(branch),
        objective=f"研究备课专能：{branch.focus}。",
        acceptance_criteria=[
            "若提交引文，只能来自本 worker 的 fetch_web 记录。",
            "结果包含 notes、records、pedagogy 三个列表。",
            "结构化结果通过 submit_research 提交。",
        ],
        steps=[
            ("inspect-sources", "读取课程简报、完整材料与 skill。"),
            ("collect-evidence", "按本 worker 的专能和工具权限完成研究。"),
            ("submit-research", "提交本分支的结构化研究产物。"),
        ],
        submit_tool="submit_research",
        submit_validator=_AgentResult.model_validate,
        llm=client,
        logger=logger,
        extra_tools=extra_tools,
        purpose=f"research:{branch.id}",
        assigned_skills=list(branch.skills),
    )
    submission = await managed.run_task(
        _PROMPT.format(
            focus=branch.focus,
            skill_instruction=(
                "先用 skill_read 把已分配的可选 skills 读到 EOF："
                + "、".join(branch.skills)
                + "。"
                if branch.skills else "本 worker 没有分配可选 skill。"
            ),
            tools="、".join(branch.tools) or "无专用工具",
            network_instructions=network_instructions,
            evidence_discipline=evidence_discipline,
            topic=brief.topic,
            audience=brief.audience,
            durationMin=brief.durationMin,
            priorKnowledge=brief.priorKnowledge,
            notes_max=_RESEARCH_CONFIG.max_notes_per_branch,
            records_max=_RESEARCH_CONFIG.max_records_per_branch,
            pedagogy_max=_RESEARCH_CONFIG.max_pedagogy_per_branch,
            material=(
                "存在上传材料：完整读取 input/material.txt。"
                if (workspace / "input/material.txt").is_file()
                else "本次没有上传材料，不要读取 input/material.txt。"
            ),
        )
    )
    return (
        worker_id,
        branch.focus,
        _AgentResult.model_validate(submission),
        fetch_tool.records if fetch_tool is not None else [],
    )


async def research(
    llm,
    brief: CourseBrief,
    retriever: Retriever,
    uploaded_material: str | None = None,
    *,
    client_factory: ClientFactory | None = None,
    workspace: Path | None = None,
    logger: ExperimentLogger | None = None,
) -> ResearchOutput:
    del uploaded_material
    ws = workspace or Path.cwd()
    active_branches = [branch for branch in _RESEARCH_CONFIG.branches if branch.enabled]
    gathered = await asyncio.gather(
        *[
            _run_agent(llm, brief, branch, retriever, client_factory, ws, logger)
            for branch in active_branches
        ],
        return_exceptions=True,  # 一路失败只丢那一路（记事件如实标注），不拖垮整个 research
    )

    output = ResearchOutput()
    results: list[tuple[str, str, _AgentResult, list[FetchRecord]]] = []
    for branch, res in zip(active_branches, gathered):
        if isinstance(res, BaseException):
            from notale.core.observability import RunEmergencyLimitExceeded
            if isinstance(res, RunEmergencyLimitExceeded):
                raise res
            if logger:
                import traceback
                from notale.core.observability import now
                logger.metrics["errors"] += 1
                logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "agent-error", "agent": f"research:{branch.id}",
                    "focus": branch.focus,
                    "error": {"type": type(res).__name__, "message": str(res),
                              "traceback": "".join(traceback.format_exception(res))},
                })
            output.events.append(
                {
                    "kind": "agent-failed",
                    "agent": branch.focus,
                    "workerId": branch.id,
                    "reason": f"{type(res).__name__}: {res}"[
                        : _RUNTIME_CONFIG.agent_failure_reason_max_chars
                    ],
                }
            )
            continue
        results.append(res)
    seen_ids: set[str] = set()

    for worker_id, agent, res, fetch_records in results:
        fetched = {r.url: r for r in fetch_records}  # 这路 agent 真实抓过的 url（harness 侧事实）
        for note_index, n in enumerate(res.notes, 1):
            output.research_notes.append(
                ResearchNote(
                    id=f"{worker_id}-note-{note_index}",
                    sourceAgent=agent,
                    rawContent=str(n.get("rawContent", "")),
                )
            )
        for pedagogy_index, p in enumerate(res.pedagogy, 1):
            output.pedagogy_notes.append(
                PedagogyNote(
                    id=f"{worker_id}-ped-{pedagogy_index}",
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
                origin=PrepRecordOrigin.RESEARCH,
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
