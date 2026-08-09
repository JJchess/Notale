"""[1] research / [2] contract / [3] build_page / [4] verify / [5] assemble 的离线单测。"""

import json

import pytest

import notale.agents.research as research_module
from notale.core.models import (
    Branch,
    Chapter,
    CourseBrief,
    Globals,
    Outline,
    PageArtifact,
    PageSpec,
    PageType,
    PedagogyNote,
    PrepRecord,
    PrepRecordOrigin,
)
from notale.utils.llm import FakeClient
from oh_fake import ScriptedClient, no_network, text_msg, tool_call_msg
from notale.web.deck import assemble_deck, consistency_report, write_deck_package
from notale.agents.builder import BuilderWorker, build_page, compile_context
from notale.core.stages.contract import ContractRejected, contract
from notale.core.stages.intake import intake
from notale.agents.research import research
from notale.core.stages.page_check import make_fallback_page, page_delivery_failures
from notale.tools.retriever import FakeRetriever
from notale.core.workflow import _prioritized_page_ids
from notale.utils.config import ResearchBranchConfig

BRIEF = CourseBrief(topic="排序", audience="大二", durationMin=10, rawQuery="10 分钟排序")
PEDAGOGY = [
    PedagogyNote(id="r1-ped-1", type="sequence", content="先建立概念，再进行应用。")
]
VISUAL_GLOBALS = {
    "styleTokens": {
        "bg": "#0b0e14",
        "surface": "#141923",
        "ink": "#f3f5f7",
        "muted": "#9ba6b5",
        "accent": "#69a8ff",
        "accent-2": "#f0b429",
        "line": "rgba(243, 245, 247, 0.16)",
        "font": '"Noto Sans SC", system-ui, sans-serif',
        "mono": '"SFMono-Regular", Consolas, monospace',
    },
    "artDirection": "以清晰的数据状态和克制的对比建立统一技术叙事",
    "visualMotif": "用同一条状态轨道表现算法推进与不变量",
}


def _complete_contract_payload(payload):
    payload = json.loads(json.dumps(payload, ensure_ascii=False))
    payload.setdefault("throughline", "从可观察的状态变化建立算法选择依据")
    globals_ = dict(VISUAL_GLOBALS)
    globals_.update(payload.get("globals") or {})
    globals_["styleTokens"] = dict(VISUAL_GLOBALS["styleTokens"])
    globals_.pop("componentAPI", None)
    if not globals_.get("artDirection"):
        globals_["artDirection"] = VISUAL_GLOBALS["artDirection"]
    if not globals_.get("visualMotif"):
        globals_["visualMotif"] = VISUAL_GLOBALS["visualMotif"]
    payload["globals"] = globals_
    pages = payload.get("pages", [])
    for index, page in enumerate(pages, 1):
        page.setdefault("narrativeRole", f"推进第 {index} 个论证节点")
        page.setdefault("continuity", [])
    for chapter_index, chapter in enumerate(payload.get("chapters", []), 1):
        chapter.setdefault("narrativeGoal", f"推进第 {chapter_index} 阶段理解")
        if chapter_index == 1 or not pages:
            continue
        lo = int(chapter["pageRange"][0])
        source = pages[lo - 1]
        source["continuity"] = source.get("continuity") or [{
            "pageId": pages[0]["pageId"],
            "relation": "returns-to",
            "cue": "回扣开篇建立的判断框架",
        }]
    return payload


async def test_intake_preserves_explicit_page_count_without_treating_it_as_minutes(tmp_path):
    (tmp_path / "input").mkdir()
    (tmp_path / "input/query.txt").write_text("30页数据结构--sorting算法")
    llm = FakeClient(by_purpose={
        "intake": json.dumps({
            "topic": "sorting", "audience": "大一", "durationMin": 30,
            "intensity": "standard", "language": "zh",
        })
    })
    brief = await intake(
        llm, "30页数据结构--sorting算法", run_dir=tmp_path
    )
    assert brief.requestedPageCount == 30
    assert brief.durationMin == 45  # query 没有时长，不得把 30 页误当 30 分钟


def _research_payload(records, pedagogy=None, notes=None):
    return json.dumps(
        {"notes": notes or [], "records": records, "pedagogy": pedagogy or []},
        ensure_ascii=False,
    )


def _research_client(payload: str, fetch_url: str = "https://ref/sort") -> ScriptedClient:
    """研究 agent 脚本：走 skill/fetch/submit，task 由 Harness 自动维护。"""
    return ScriptedClient([
        tool_call_msg("skill_read", {"name": "research-evidence"}),
        tool_call_msg("fetch_web", {"url": fetch_url, "query": "排序"}),
        tool_call_msg("submit_research", {"payload": json.loads(payload)}),
        text_msg("submitted"),
    ])


async def test_research_binds_evidence_and_drops_forgery(tmp_path):
    page_text = "快速排序的平均时间复杂度是 O(n log n)，最坏 O(n^2)。"
    retriever = FakeRetriever({"https://ref/sort": page_text})
    records = [
        {  # 真引文（对应模型真实抓过的 url）→ 绑定成功
            "recordId": "quicksort-avg",
            "branch": ["checkable"],
            "referenceSource": "none",
            "content": {"claim": "快排平均 O(n log n)"},
            "quote": {"url": "https://ref/sort", "quotedSpan": "平均时间复杂度是 O(n log n)"},
        },
        {  # 伪造引文（不是字面子串）→ 整条作废
            "recordId": "fake-claim",
            "branch": ["checkable"],
            "content": {"claim": "快排是稳定的"},
            "quote": {"url": "https://ref/sort", "quotedSpan": "快排是稳定排序"},
        },
        {  # 引用了模型没抓过的 url（工具记录里查不到）→ 整条作废
            "recordId": "never-fetched",
            "branch": ["checkable"],
            "content": {"claim": "另一个断言"},
            "quote": {"url": "https://ref/other", "quotedSpan": "随便一段"},
        },
        {  # 无出处事实 → 保留但标未核实
            "recordId": "no-source",
            "branch": ["checkable"],
            "content": {"claim": "某断言"},
        },
    ]
    payloads = {
        "教学序列": _research_payload(records, pedagogy=[{"id": "ped-1", "type": "sequence", "content": "先简单后复杂"}]),
        "例题与反例": _research_payload([{  # 重复 recordId → 去重
            "recordId": "quicksort-avg", "branch": ["checkable"], "content": {"claim": "重复"}
        }], pedagogy=[{"id": "ped-1", "type": "mechanism", "content": "逐步演示"}]),
        "常见误解": _research_payload([], pedagogy=[
            {"id": "ped-1", "type": "misconception", "content": "先预测再纠正"}
        ]),
        "素材史料数据": _research_payload([], pedagogy=[
            {"id": "ped-1", "type": "sequence", "content": "最后综合"}
        ]),
    }
    with no_network():
        out = await research(
            FakeClient(), BRIEF, retriever,
            client_factory=lambda agent: _research_client(payloads[agent]),
            workspace=tmp_path,
        )

    ids = [r.recordId for r in out.prep_records]
    assert ids == ["quicksort-avg", "no-source"]  # 伪造作废、未抓取作废、重复去重
    bound = out.prep_records[0]
    assert bound.evidence and bound.evidence.url == "https://ref/sort"  # harness 绑定，非模型填
    assert bound.origin == PrepRecordOrigin.RESEARCH
    assert "无出处：未核实" in out.prep_records[1].knownInaccuracies
    assert out.pedagogy_notes[0].consumer == "planner"
    assert [note.id for note in out.pedagogy_notes] == [
        "r1-ped-1", "r2-ped-1", "r3-ped-1", "r4-ped-1"
    ]
    kinds = [e["kind"] for e in out.events]
    assert "record-dropped" in kinds and "record-deduped" in kinds
    reasons = " ".join(str(e.get("reason", "")) for e in out.events)
    assert "未真实抓取" in reasons  # .records 里查不到该 url = 作废
    assert retriever.calls == ["https://ref/sort"]  # run 级 URL cache 去掉四路重复网络抓取


class _BoomClient:
    """第一次调用就炸——模拟单路 agent 的 API/解析失败。"""

    async def stream_message(self, request):
        del request
        raise RuntimeError("API 炸了")
        yield  # pragma: no cover - 让本方法成为 async generator


async def test_research_single_agent_failure_isolated(tmp_path):
    """一路 agent 炸只丢那一路（记 agent-failed 事件），其余三路照常——不拖垮整个 research。"""
    retriever = FakeRetriever({"https://ref/sort": "快速排序的平均时间复杂度是 O(n log n)。"})
    records = [{"recordId": "r1", "branch": ["constructible"], "content": {"x": 1}}]

    def factory(agent):
        if agent == "常见误解":
            return _BoomClient()
        return _research_client(_research_payload(records))

    with no_network():
        out = await research(
            FakeClient(), BRIEF, retriever, client_factory=factory, workspace=tmp_path
        )
    assert any(e["kind"] == "agent-failed" and e["agent"] == "常见误解" for e in out.events)
    assert [r.recordId for r in out.prep_records] == ["r1"]  # 三路去重后保留一条


async def test_research_fanout_uses_enabled_configured_specializations(monkeypatch, tmp_path):
    branches = [
        ResearchBranchConfig(
            id="case-library",
            focus="真实案例库",
            skills=["research-evidence"],
            tools=["web_search", "fetch_web"],
        ),
        ResearchBranchConfig(
            id="disabled-history", enabled=False, focus="历史脉络", skills=[], tools=[]
        ),
        ResearchBranchConfig(
            id="proof-path", focus="证明路径", skills=[], tools=[]
        ),
    ]
    monkeypatch.setattr(research_module._RESEARCH_CONFIG, "branches", branches)
    calls = []

    def factory(focus):
        calls.append(focus)
        payload = {
            "notes": [],
            "records": [],
            "pedagogy": [
                {"id": "ped-1", "type": "mechanism", "content": focus}
            ],
        }
        return ScriptedClient([
            tool_call_msg("submit_research", {"payload": payload}),
            text_msg("submitted"),
        ])

    with no_network():
        out = await research_module.research(
            FakeClient(), BRIEF, FakeRetriever({}),
            client_factory=factory, workspace=tmp_path,
        )

    assert calls == ["真实案例库", "证明路径"]
    assert [note.id for note in out.pedagogy_notes] == [
        "case-library-ped-1", "proof-path-ped-1"
    ]
    assert (tmp_path / "agents/research/case-library/task.json").is_file()
    assert (tmp_path / "agents/research/proof-path/task.json").is_file()
    assert not (tmp_path / "agents/research/disabled-history").exists()
    case_state = json.loads(
        (tmp_path / "agents/research/case-library/tool-state.json").read_text()
    )
    proof_state = json.loads(
        (tmp_path / "agents/research/proof-path/tool-state.json").read_text()
    )
    assert case_state["assignedSkills"] == ["research-evidence"]
    assert {"web_search", "fetch_web"} <= set(case_state["allowedTools"])
    assert "web_search" not in proof_state["allowedTools"]


async def test_research_allows_zero_enabled_branches(monkeypatch, tmp_path):
    monkeypatch.setattr(research_module._RESEARCH_CONFIG, "branches", [])

    out = await research_module.research(
        FakeClient(), BRIEF, FakeRetriever({}), workspace=tmp_path
    )

    assert out.prep_records == []
    assert out.pedagogy_notes == []
    assert out.research_notes == []


async def test_contract_validates_bindings_and_budgets(tmp_path):
    prep = [
        PrepRecord(recordId="r1", branch=[Branch.CONSTRUCTIBLE], content={"x": 1}),
        PrepRecord(recordId="r2", branch=[Branch.NEITHER]),
    ]
    payload = json.dumps(
        _complete_contract_payload({
            "chapters": [
                {"title": "基础", "pageRange": [1, 3], "rationale": "先建立概念", "pedagogyNoteIds": ["r1-ped-1"]},
                {"title": "进阶", "pageRange": [4, 5], "rationale": "再进行应用", "pedagogyNoteIds": ["r1-ped-1"]},
            ],
            "globals": {"terminology": {"排序": "sort"}, "notation": {}, "styleTokens": {}, "componentAPI": [], "artDirection": ""},
            "supplementalPrepRecords": [{
                "recordId": "planner-quiz-check",
                "branch": ["neither"],
                "content": {"claim": "形成性测验检查当前理解"},
                "knownInaccuracies": ["没有外部 evidence"],
            }],
            "pages": [
                {"pageId": "p1", "pageType": "section-break", "centralMessage": "开场", "learningAction": "识别课程问题", "boundPrepRecords": ["r1"]},
                {"pageId": "p2", "pageType": "worked-example", "centralMessage": "快排示例", "learningAction": "追踪划分", "boundPrepRecords": ["r1"]},
                {"pageId": "p3", "pageType": "quiz-check", "centralMessage": "小测", "learningAction": "判断结论", "boundPrepRecords": ["planner-quiz-check"]},
                {"pageId": "p4", "pageType": "worked-example", "centralMessage": "划分", "learningAction": "解释不变量", "boundPrepRecords": ["r1"]},
                {"pageId": "p5", "pageType": "worked-example", "centralMessage": "递归", "learningAction": "展开递归", "boundPrepRecords": ["r2"]},
            ],
        }),
        ensure_ascii=False,
    )
    llm = FakeClient(by_purpose={"contract": payload})
    out = await contract(llm, BRIEF, prep, PEDAGOGY, run_dir=tmp_path)

    assert out.page_specs[0].boundPrepRecords == ["r1"]
    assert out.outline.chapters[0].pedagogyNoteIds == ["r1-ped-1"]
    generated = out.supplemental_prep_records[0]
    assert generated.recordId == "planner-quiz-check"
    assert generated.origin == PrepRecordOrigin.PLANNER_GENERATED
    assert generated.evidence is None and generated.provenanceLink == "planner:main"
    prompt = llm.calls[0][1][-1]["content"]
    assert "先验：（未声明）" in prompt
    total = sum(s.timeBudgetSec for s in out.page_specs)
    assert abs(total - BRIEF.durationMin * 60) < len(out.page_specs)  # 缩放后 ≈ 总时长
    assert out.outline.confirmedAt  # auto_confirm 批准


async def test_contract_rejects_forged_planner_evidence_then_accepts_clean_record(tmp_path):
    prep = [PrepRecord(recordId="r1", branch=[Branch.NEITHER], content={"claim": "research"})]
    base_payload = _complete_contract_payload({
        "chapters": [
            {"title": "基础", "pageRange": [1, 3], "rationale": "先基础", "pedagogyNoteIds": ["r1-ped-1"]},
            {"title": "应用", "pageRange": [4, 5], "rationale": "后应用", "pedagogyNoteIds": ["r1-ped-1"]},
        ],
        "globals": {},
        "supplementalPrepRecords": [{
            "recordId": "planner-clean-claim",
            "branch": ["neither"],
            "content": {"claim": "planner 补充命题"},
        }],
        "pages": [
            {
                "pageId": f"p{i}", "pageType": "worked-example",
                "centralMessage": f"命题 {i}", "learningAction": f"解释命题 {i}",
                "boundPrepRecords": ["planner-clean-claim"],
            }
            for i in range(1, 6)
        ],
    })
    forged_payload = json.loads(json.dumps(base_payload))
    forged_payload["supplementalPrepRecords"][0]["evidence"] = {
        "url": "https://fake.invalid",
        "quotedSpan": "伪造引文",
        "fetchedAt": "2026-08-09T00:00:00Z",
    }
    (tmp_path / "course-brief.json").write_text(BRIEF.model_dump_json())
    (tmp_path / "prep-records.json").write_text(json.dumps([prep[0].model_dump(mode="json")]))
    (tmp_path / "pedagogy-notes.json").write_text(
        json.dumps([PEDAGOGY[0].model_dump(mode="json")])
    )
    client = ScriptedClient([
        tool_call_msg("skill_read", {"name": "curriculum-planning"}),
        tool_call_msg(
            "skill_read",
            {"name": "frontend-slides", "entrypoint": "planner-contract"},
        ),
        tool_call_msg("artifact_read", {"path": "course-brief.json"}),
        tool_call_msg("artifact_read", {"path": "prep-records.json"}),
        tool_call_msg("artifact_read", {"path": "pedagogy-notes.json"}),
        tool_call_msg("submit_contract", {"payload": forged_payload}),
        tool_call_msg("submit_contract", {"payload": base_payload}),
    ])

    out = await contract(client, BRIEF, prep, PEDAGOGY, run_dir=tmp_path)

    assert out.supplemental_prep_records[0].origin == PrepRecordOrigin.PLANNER_GENERATED
    session = (tmp_path / "agents/planner/main/session.json").read_text()
    assert "cannot provide evidence" in session


async def test_contract_rejects_misdirected_continuity_then_accepts_repair(tmp_path):
    prep = PrepRecord(recordId="r1", branch=[Branch.NEITHER], content={"claim": "排序"})
    valid = _complete_contract_payload({
        "chapters": [
            {"title": "基础", "pageRange": [1, 3], "rationale": "先基础", "pedagogyNoteIds": ["r1-ped-1"]},
            {"title": "应用", "pageRange": [4, 5], "rationale": "后应用", "pedagogyNoteIds": ["r1-ped-1"]},
        ],
        "globals": {},
        "pages": [
            {
                "pageId": f"p{i}", "pageType": "worked-example",
                "centralMessage": f"命题 {i}", "learningAction": f"解释命题 {i}",
                "boundPrepRecords": ["r1"],
            }
            for i in range(1, 6)
        ],
    })
    invalid = json.loads(json.dumps(valid))
    invalid["pages"][3]["continuity"] = [{
        "pageId": "p5", "relation": "returns-to", "cue": "错误地指向后页",
    }]
    invalid_visual = json.loads(json.dumps(valid))
    invalid_visual["globals"]["styleTokens"].pop("mono")
    client = ScriptedClient([
        tool_call_msg("skill_read", {"name": "curriculum-planning"}),
        tool_call_msg(
            "skill_read", {"name": "frontend-slides", "entrypoint": "planner-contract"}
        ),
        tool_call_msg("submit_contract", {"payload": invalid_visual}),
        tool_call_msg("submit_contract", {"payload": invalid}),
        tool_call_msg("submit_contract", {"payload": valid}),
    ])
    out = await contract(client, BRIEF, [prep], PEDAGOGY, run_dir=tmp_path)
    assert out.page_specs[3].continuity[0].pageId == "p1"
    session = (tmp_path / "agents/planner/main/session.json").read_text()
    assert "styleTokens must contain exactly" in session
    assert "must target an earlier page" in session


async def test_contract_rejects_ambiguous_pedagogy_ids_before_planning(tmp_path):
    duplicate_notes = [
        PedagogyNote(id="ped-1", type="sequence", content="先 A"),
        PedagogyNote(id="ped-1", type="mechanism", content="再 B"),
    ]
    with pytest.raises(ValueError, match="duplicate IDs"):
        await contract(FakeClient(), BRIEF, [], duplicate_notes, run_dir=tmp_path)


async def test_contract_honors_explicit_thirty_page_budget(tmp_path):
    brief = CourseBrief(
        topic="sorting", audience="大一", durationMin=45,
        requestedPageCount=30, rawQuery="30页数据结构--sorting算法",
    )
    payload = _complete_contract_payload({
        "chapters": [
            {
                "title": f"c{i}",
                "pageRange": [(i - 1) * 5 + 1, i * 5],
                "rationale": "按依赖顺序推进",
                "pedagogyNoteIds": ["r1-ped-1"],
            }
            for i in range(1, 7)
        ],
        "globals": {},
        "supplementalPrepRecords": [{
            "recordId": "planner-sorting-basics",
            "branch": ["constructible"],
            "referenceSource": "declared-spec",
            "content": {"claim": "排序教材基础内容", "derivation": "由标准算法规约构造"},
            "invariants": ["输出非降序"],
            "validRange": "有限可比较序列",
        }],
        "pages": [
            {
                "pageId": f"p{i}",
                "pageType": "worked-example",
                "centralMessage": f"m{i}",
                "learningAction": f"解释 m{i}",
                "boundPrepRecords": ["planner-sorting-basics"],
            }
            for i in range(1, 31)
        ],
    })
    llm = FakeClient(by_purpose={"contract": json.dumps(payload)})
    out = await contract(llm, brief, [], PEDAGOGY, run_dir=tmp_path)
    assert len(out.page_specs) == 30 and len(out.outline.chapters) == 6
    assert abs(sum(page.timeBudgetSec for page in out.page_specs) - 45 * 60) < 30


async def test_contract_rejection_stops_pipeline(tmp_path):
    async def reject(outline, globals_, specs):
        return False, "第二章需要调整"

    payload = json.dumps(
        _complete_contract_payload({
            "chapters": [
                {"title": "a", "pageRange": [1, 3], "rationale": "先基础", "pedagogyNoteIds": ["r1-ped-1"]},
                {"title": "b", "pageRange": [4, 5], "rationale": "后应用", "pedagogyNoteIds": ["r1-ped-1"]},
            ],
            "globals": {},
            "supplementalPrepRecords": [{
                "recordId": "planner-contract-rejection",
                "branch": ["neither"],
                "content": {"claim": "用于确认回调测试"},
            }],
            "pages": [
                {
                    "pageId": f"p{i}",
                    "pageType": "worked-example",
                    "centralMessage": "x",
                    "learningAction": "解释 x",
                    "boundPrepRecords": ["planner-contract-rejection"],
                }
                for i in range(1, 6)
            ],
        })
    )
    llm = FakeClient(by_purpose={"contract": payload})
    with pytest.raises(ContractRejected, match="第二章需要调整"):
        await contract(llm, BRIEF, [], PEDAGOGY, reject, run_dir=tmp_path)


def _page(html: str, refs=None) -> PageArtifact:
    if "data-notale-page" not in html:
        html = f"<section data-notale-page>{html}</section>"
    return PageArtifact(pageId="p1", html=html, boundReferences=refs or [])


async def test_build_page_uses_lazy_assigned_skills_and_task_state(tmp_path):
    prep = PrepRecord(recordId="r1", branch=[Branch.NEITHER], content={"claim": "快排"})
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="快排",
        learningAction="解释划分", boundPrepRecords=["r1"],
    )
    context = compile_context(spec, Globals(), [spec], {"r1": prep})
    llm = FakeClient(by_purpose={
        "build:p1": json.dumps(
            {
                "html": "<section data-notale-page><p>x</p></section>",
                "boundReferences": ["r1"],
            },
            ensure_ascii=False,
        )
    })
    (tmp_path / "page-contexts").mkdir()
    (tmp_path / "page-contexts/p1.json").write_text(context.model_dump_json())
    worker = BuilderWorker(llm=llm, run_dir=tmp_path, context=context)
    with no_network():
        await build_page(worker)
    prompt = llm.calls[0][1][-1]["content"]
    assert "context_read" in prompt
    assert "## skill:" not in prompt  # skill 按需通过工具加载，不再全量塞 prompt
    task = json.loads((tmp_path / "agents/builder/p1/task.json").read_text())
    assert task["status"] == "completed" and task["totalTurns"] == 6
    tool_state = json.loads((tmp_path / "agents/builder/p1/tool-state.json").read_text())
    assert tool_state["systemProfiles"][0]["name"] == "lecture-authoring"
    assert len(tool_state["systemProfiles"][0]["sha256"]) == 64
    assert context.skill_names == ["page-builder-core", "frontend-slides"]
    assert context.skill_entrypoints == {"frontend-slides": "notale-page"}
    assert tool_state["loadedSkills"] == ["page-builder-core", "frontend-slides"]
    assert tool_state["loadedSkillEntrypoints"] == {
        "page-builder-core": "default",
        "frontend-slides": "notale-page",
    }


def test_builder_page_design_slot_can_be_unplugged_with_one_flag(monkeypatch):
    import notale.agents.builder as builder_module

    page_design = builder_module._CONFIG.agents.builder_page_design.model_copy(
        update={"enabled": False}
    )
    agents = builder_module._CONFIG.agents.model_copy(
        update={"builder_page_design": page_design}
    )
    disabled = builder_module._CONFIG.model_copy(update={"agents": agents})
    monkeypatch.setattr(builder_module, "_CONFIG", disabled)
    spec = PageSpec(
        pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="partition"
    )

    context = builder_module.compile_context(spec, Globals(), [spec], {})

    assert context.skill_names == ["page-builder-core"]
    assert context.skill_entrypoints == {}


@pytest.mark.parametrize(
    ("page_type", "type_skill"),
    [
        (PageType.SIM_EXPLORABLE, "create-sim"),
        (PageType.CODE_RUNNABLE, "create-code-runtime"),
    ],
)
def test_page_design_precedes_page_type_skill(page_type, type_skill):
    spec = PageSpec(pageId="p1", pageType=page_type, centralMessage="partition")

    context = compile_context(spec, Globals(), [spec], {})

    assert context.skill_names == [
        "page-builder-core",
        "frontend-slides",
        type_skill,
    ]
    assert context.skill_entrypoints == {"frontend-slides": "notale-page"}


def test_context_is_a_thin_page_projection_without_cumulative_history():
    prep = PrepRecord(
        recordId="r1",
        branch=[Branch.CONSTRUCTIBLE],
        content={"claim": "快速排序对 n 个元素执行 partition"},
        invariants=["partition 后基准位于最终位置"],
        validRange="n >= 1",
        knownInaccuracies=["未规定 pivot 策略"],
        nonPhysicalVisualMappings=["柱高只表示相对键值"],
        provenanceLink="research:r1",
    )
    spec = PageSpec(
        pageId="target",
        pageType=PageType.WORKED_EXAMPLE,
        centralMessage="快速排序对 n 个元素执行 partition",
        learningAction="追踪 partition",
        boundPrepRecords=["r1"],
        narrativeRole="把机制连接到后续复杂度分析",
    )
    globals_ = Globals(
        terminology={"快速排序": "quicksort", "归并排序": "mergesort"},
        notation={"n": "元素个数", "k": "值域大小"},
        styleTokens={"primary": "#2563eb", "font": "system-ui"},
        artDirection="克制的数据编辑风",
        visualMotif="用一条分区轴贯穿状态变化",
    )
    outline = Outline(
        throughline="从状态变化建立算法判断",
        chapters=[Chapter(
            title="机制", pageRange=(1, 80), narrativeGoal="理解 partition",
        )],
    )
    short = compile_context(spec, globals_, [spec], {"r1": prep}, outline=outline)
    prefix = [
        PageSpec(
            pageId=f"p{i}", pageType=PageType.WORKED_EXAMPLE,
            centralMessage=("此前命题" * 30) + str(i),
        )
        for i in range(1, 80)
    ]
    late = compile_context(spec, globals_, [*prefix, spec], {"r1": prep}, outline=outline)

    payload = short.model_dump(mode="json")
    assert set(payload) == {"page", "narrative", "visualContract", "sources", "skills"}
    assert not ({"pageSpec", "globals", "neighborSummary", "coveredConcepts"} & set(payload))
    assert payload["page"]["terminology"] == {"快速排序": "quicksort"}
    assert payload["page"]["notation"] == {"n": "元素个数"}
    assert payload["sources"][0]["guardrails"]["limitations"] == ["未规定 pivot 策略"]
    assert "provenanceLink" not in payload["sources"][0]
    assert short.visualContract.tokens["accent"] == "#2563eb"
    assert len(late.model_dump_json()) == len(short.model_dump_json())


def test_old_planning_artifacts_compile_into_the_new_context_shape():
    spec = PageSpec.model_validate({
        "pageId": "p1", "pageType": "worked-example",
        "centralMessage": "旧命题", "boundPrepRecords": [],
    })
    globals_ = Globals.model_validate({
        "styleTokens": {"primary": "#123456", "secondary": "#abcdef"},
        "componentAPI": ["legacy-widget"],
        "artDirection": "旧视觉方向",
    })
    outline = Outline.model_validate({
        "chapters": [{"title": "旧章", "pageRange": [1, 1]}],
    })
    context = compile_context(spec, globals_, [spec], {}, outline=outline)
    assert context.page.claim == "旧命题"
    assert context.visualContract.tokens["accent"] == "#123456"
    assert context.visualContract.tokens["accent-2"] == "#abcdef"
    assert context.narrative.pageRole.startswith("推进本页命题")


def test_page_delivery_checks_catch_dirty_pages():
    ok = page_delivery_failures(
        _page("<section><p>快速排序演示</p></section>", ["r1"]), {"r1"}
    )
    assert ok == []

    dirty = page_delivery_failures(
        _page("<p>综上所述，排序不是工具而是思维 TODO</p>", ["ghost"]), {"r1"}
    )
    joined = "；".join(dirty)
    assert "占位文本" in joined and "不存在的资料" in joined
    assert "AI 味红旗" not in joined  # 文风由 system profile 管理，不维护短语黑名单

    stylistic = page_delivery_failures(
        _page("<p>综上所述，排序不是工具而是思维</p>"), set()
    )
    assert stylistic == []

    leaked = page_delivery_failures(_page("<p>结果：undefined</p>"), set())
    assert any("undefined" in failure for failure in leaked)

    remote = page_delivery_failures(
        _page('<link rel="stylesheet" href="https://cdn.example/theme.css"><p>内容</p>'),
        set(),
    )
    assert any("远程运行时依赖" in failure for failure in remote)

    unvendored = page_delivery_failures(
        _page("<p>动画</p><script>anime.timeline({duration: 300})</script>"),
        set(),
    )
    assert any("未随 deck 提供的第三方全局" in failure for failure in unvendored)

    redefined = page_delivery_failures(
        _page("<style>:root{--notale-bg:#fff}</style><p>内容</p>"), set()
    )
    assert any("不得重新定义" in failure for failure in redefined)

    duplicate_roots = page_delivery_failures(
        PageArtifact(
            pageId="p1",
            html="<section data-notale-page>甲</section><section data-notale-page>乙</section>",
        ),
        set(),
    )
    assert any("只能有一个" in failure for failure in duplicate_roots)


def test_fallback_page_is_safe_and_marked():
    spec = PageSpec(pageId="p9", pageType=PageType.SIM_EXPLORABLE, centralMessage="单摆周期", boundPrepRecords=["r1"])
    store = {"r1": PrepRecord(recordId="r1", branch=[Branch.CONSTRUCTIBLE], content={"eq": "T=2π√(L/g)"})}
    page = make_fallback_page(spec, store, "返工超限")
    assert page.status.value == "degraded"
    assert "降级安全页" in page.html and "人审" in page.html


def test_assemble_and_consistency():
    specs = [
        PageSpec(pageId="p1", pageType=PageType.SECTION_BREAK, centralMessage="开场", timeBudgetSec=30),
        PageSpec(pageId="p2", pageType=PageType.WORKED_EXAMPLE, centralMessage="快排", timeBudgetSec=120),
    ]
    pages = [
        PageArtifact(pageId="p1", html="<p>开场白</p>"),
        PageArtifact(pageId="p2", html="<p>快排</p>"),
    ]
    globals_ = Globals(terminology={"排序": "sort"})
    outline = Outline(chapters=[Chapter(title="基础", pageRange=(1, 2)), Chapter(title="空洞章", pageRange=(3, 4))])

    deck, deck_html = assemble_deck(pages, specs, "排序课")
    assert deck.totalDurationEstimate == 150
    assert 'class="reveal"' in deck_html and 'class="slides"' in deck_html
    assert 'src="slides/p2.html"' in deck_html
    assert 'sandbox="allow-scripts"' in deck_html
    assert 'class="ppt-bar"' in deck_html
    assert 'data-deck-action="prev"' in deck_html
    assert 'data-deck-action="next"' in deck_html
    assert 'data-deck-action="overview"' in deck_html
    assert 'data-deck-overview-grid' in deck_html
    assert 'data-deck-overview-scroll' in deck_html
    assert 'data-deck-action="close-overview"' in deck_html

    rep = consistency_report(pages, specs, globals_, outline)
    assert rep.duplicateContentFlags == []
    assert rep.planCoverage == ["空洞章"]  # 覆盖缺口被抓
    assert rep.difficultyProgression is None  # 未实现如实 None

    dup_pages = [
        PageArtifact(pageId="p1", html="<p>快速排序的平均复杂度是O(nlogn)这是一个非常重要的概念</p>"),
        PageArtifact(pageId="p2", html="<p>快速排序的平均复杂度是O(nlogn)这是一个非常重要的概念</p>"),
    ]
    rep2 = consistency_report(dup_pages, specs, globals_, outline)
    assert rep2.duplicateContentFlags == ["p1≈p2"]


def test_write_deck_package_is_offline_and_isolates_pages(tmp_path):
    specs = [
        PageSpec(pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="第一步"),
        PageSpec(pageId="p2", pageType=PageType.QUIZ_CHECK, centralMessage="检查理解"),
    ]
    pages = [
        PageArtifact(pageId="p1", html="<style>body{background:red}</style><div id='same'>甲</div>"),
        PageArtifact(pageId="p2", html="<style>body{background:blue}</style><div id='same'>乙</div>", speakerNotes="提问后停顿"),
    ]

    globals_ = Globals(styleTokens={"primary": "#ff5500", "bad": "red; display:none"})
    deck, html = write_deck_package(tmp_path, pages, specs, "隔离测试", globals_=globals_)

    assert deck.format == "reveal-html-native"
    assert (tmp_path / "deck.html").read_text() == html
    assert (tmp_path / "runtime/reveal/reveal.js").is_file()
    assert (tmp_path / "runtime/reveal/reveal.css").is_file()
    assert (tmp_path / "runtime/reveal/plugin/notes.js").is_file()
    assert (tmp_path / "runtime/reveal/plugin/notes.html").is_file()
    assert (tmp_path / "runtime/global.css").is_file()
    shell_css = (tmp_path / "runtime/deck-shell.css").read_text()
    shell_js = (tmp_path / "runtime/deck-shell.js").read_text()
    assert ".deck-overview-grid" in shell_css and "overflow-y: auto" in shell_css
    assert "buildOverviewGrid" in shell_js and "Reveal.toggleOverview" not in shell_js
    global_css = (tmp_path / "runtime/global.css").read_text()
    assert "--notale-accent: #ff5500" in global_css
    assert "display:none" not in global_css
    assert "[data-notale-page]" in global_css
    assert "background-color: var(--notale-bg) !important" in global_css
    assert "background:red" in (tmp_path / "slides/p1.html").read_text()
    assert "background:blue" in (tmp_path / "slides/p2.html").read_text()
    assert "notale:navigate" in (tmp_path / "slides/p1.html").read_text()
    assert "../runtime/global.css" in (tmp_path / "slides/p1.html").read_text()
    assert "提问后停顿" in html


def test_complex_pages_are_scheduled_first_without_changing_output_ids():
    specs = [
        PageSpec(pageId="p1", pageType=PageType.SECTION_BREAK, centralMessage="section"),
        PageSpec(pageId="p2", pageType=PageType.CODE_RUNNABLE, centralMessage="code"),
        PageSpec(pageId="p3", pageType=PageType.SIM_EXPLORABLE, centralMessage="sim"),
        PageSpec(pageId="p4", pageType=PageType.WORKED_EXAMPLE, centralMessage="worked"),
    ]
    assert _prioritized_page_ids(["p1", "p2", "p3", "p4"], specs) == [
        "p3", "p2", "p4", "p1"
    ]
