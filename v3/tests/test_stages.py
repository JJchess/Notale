"""[1] research / [2] contract / [3] build_page / [4] verify / [5] assemble 的离线单测。"""

import json

import pytest

from artifacts import Branch, CourseBrief, Globals, Outline, Chapter, PageArtifact, PageSpec, PageType, PrepRecord, VerifyStatus
from llm import FakeClient
from oh_fake import ScriptedClient, no_network, text_msg, tool_call_msg
from stages.assemble import assemble_deck, consistency_report, write_deck_package
from stages.build_page import build_page, compile_context
from stages.contract import ContractRejected, contract
from stages.research import research
from stages.verify import verify_page, make_fallback_page
from tools.retriever import FakeRetriever

BRIEF = CourseBrief(topic="排序", audience="大二", durationMin=10, rawQuery="10 分钟排序")


def _research_payload(records, pedagogy=None, notes=None):
    return json.dumps(
        {"notes": notes or [], "records": records, "pedagogy": pedagogy or []},
        ensure_ascii=False,
    )


def _research_client(payload: str, fetch_url: str = "https://ref/sort") -> ScriptedClient:
    """研究 agent 脚本：先真实抓 fetch_url（出处绑定的前提），再给 JSON 终稿。"""
    return ScriptedClient([
        tool_call_msg("fetch_web", {"url": fetch_url}),
        text_msg(payload),
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
        }]),
        "常见误解": _research_payload([]),
        "素材史料数据": _research_payload([]),
    }
    with no_network():
        out = await research(
            BRIEF, retriever,
            client_factory=lambda agent: _research_client(payloads[agent]),
            workspace=tmp_path,
        )

    ids = [r.recordId for r in out.prep_records]
    assert ids == ["quicksort-avg", "no-source"]  # 伪造作废、未抓取作废、重复去重
    bound = out.prep_records[0]
    assert bound.evidence and bound.evidence.url == "https://ref/sort"  # harness 绑定，非模型填
    assert "无出处：未核实" in out.prep_records[1].knownInaccuracies
    assert out.pedagogy_notes[0].consumer == "planner"
    kinds = [e["kind"] for e in out.events]
    assert "record-dropped" in kinds and "record-deduped" in kinds
    reasons = " ".join(str(e.get("reason", "")) for e in out.events)
    assert "未真实抓取" in reasons  # .records 里查不到该 url = 作废
    assert retriever.calls == ["https://ref/sort"] * 4  # 四路 agent 各自真实抓过一次


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
        out = await research(BRIEF, retriever, client_factory=factory, workspace=tmp_path)
    assert any(e["kind"] == "agent-failed" and e["agent"] == "常见误解" for e in out.events)
    assert [r.recordId for r in out.prep_records] == ["r1"]  # 三路去重后保留一条


async def test_contract_validates_bindings_and_budgets():
    prep = [
        PrepRecord(recordId="r1", branch=[Branch.CONSTRUCTIBLE], content={"x": 1}),
        PrepRecord(recordId="r2", branch=[Branch.NEITHER]),
    ]
    payload = json.dumps(
        {
            "chapters": [{"title": "基础", "pageRange": [1, 3], "rationale": "ped-1"}],
            "globals": {"terminology": {"排序": "sort"}, "notation": {}, "styleTokens": {}, "componentAPI": [], "artDirection": ""},
            "pages": [
                {"pageId": "p1", "pageType": "section-break", "centralMessage": "开场", "boundPrepRecords": ["r1", "ghost"]},
                {"pageId": "p2", "pageType": "worked-example", "centralMessage": "快排示例", "boundPrepRecords": ["r1"]},
                {"pageId": "p3", "pageType": "quiz-check", "centralMessage": "小测", "boundPrepRecords": []},
            ],
        },
        ensure_ascii=False,
    )
    llm = FakeClient(by_purpose={"contract": payload})
    out = await contract(llm, BRIEF, prep, [])

    assert out.page_specs[0].boundPrepRecords == ["r1"]  # ghost 被丢
    assert out.events[0]["kind"] == "spec-binding-dropped"
    total = sum(s.timeBudgetSec for s in out.page_specs)
    assert abs(total - BRIEF.durationMin * 60) < len(out.page_specs)  # 缩放后 ≈ 总时长
    assert out.outline.confirmedAt  # auto_confirm 批准


async def test_contract_rejection_stops_pipeline():
    async def reject(outline, globals_, specs):
        return False, "第二章需要调整"

    payload = json.dumps(
        {
            "chapters": [],
            "globals": {},
            "pages": [{"pageId": "p1", "pageType": "worked-example", "centralMessage": "x"}],
        }
    )
    llm = FakeClient(by_purpose={"contract": payload})
    with pytest.raises(ContractRejected, match="第二章需要调整"):
        await contract(llm, BRIEF, [], [], reject)


def _page(html: str, refs=None) -> PageArtifact:    return PageArtifact(pageId="p1", html=html, boundReferences=refs or [])


async def test_build_page_prompt_includes_builder_skill_block():
    """builder 仍是单次调用，但 prompt 追加 BUILDER 画像渲染的 skill 块（清单+全文）。"""
    spec = PageSpec(pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="快排")
    context = compile_context(spec, Globals(), [spec], {})
    llm = FakeClient(by_purpose={"build:p1": json.dumps({"html": "<p>x</p>"}, ensure_ascii=False)})
    with no_network():
        await build_page(llm, context)
    prompt = llm.calls[0][1][-1]["content"]
    assert "## skill: create-sim" in prompt  # skill 正文注入标记
    assert "## skill: frontend-slides" in prompt


def test_verify_l0_catches_dirty_pages():
    spec = PageSpec(pageId="p1", pageType=PageType.WORKED_EXAMPLE, centralMessage="x")
    store = {"r1": PrepRecord(recordId="r1", branch=[Branch.NEITHER])}

    ok = verify_page(_page("<section><p>快速排序演示</p></section>", ["r1"]), spec, Globals(), store)
    assert ok.status == VerifyStatus.VERIFIED
    assert [l.layer for l in ok.layers if not l.implemented] == ["L1", "L2", "L3", "L4", "L5", "L6"]

    dirty = verify_page(_page("<p>综上所述，排序不是工具而是思维 TODO</p>", ["ghost"]), spec, Globals(), store)
    assert dirty.status == VerifyStatus.RETURNED_FOR_REPAIR
    joined = "；".join(dirty.newFailure)
    assert "AI 味红旗" in joined and "占位文本" in joined and "不存在的资料" in joined

    leaked = verify_page(_page("<p>结果：undefined</p>"), spec, Globals(), store)
    assert any("undefined" in f for f in leaked.newFailure)

    remote = verify_page(
        _page('<link rel="stylesheet" href="https://cdn.example/theme.css"><p>内容</p>'),
        spec,
        Globals(),
        store,
    )
    assert any("远程运行时依赖" in f for f in remote.newFailure)

    unvendored = verify_page(
        _page("<p>动画</p><script>anime.timeline({duration: 300})</script>"),
        spec,
        Globals(),
        store,
    )
    assert any("未随 deck 提供的第三方全局" in f for f in unvendored.newFailure)


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

    deck, html = write_deck_package(tmp_path, pages, specs, "隔离测试")

    assert deck.format == "reveal-html-native"
    assert (tmp_path / "deck.html").read_text() == html
    assert (tmp_path / "runtime/reveal/reveal.js").is_file()
    assert (tmp_path / "runtime/reveal/reveal.css").is_file()
    assert (tmp_path / "runtime/reveal/plugin/notes.js").is_file()
    assert (tmp_path / "runtime/reveal/plugin/notes.html").is_file()
    assert "background:red" in (tmp_path / "slides/p1.html").read_text()
    assert "background:blue" in (tmp_path / "slides/p2.html").read_text()
    assert "notale:navigate" in (tmp_path / "slides/p1.html").read_text()
    assert "提问后停顿" in html
