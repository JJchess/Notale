"""端到端：FakeClient + ScriptedClient（research 段）+ FakeRetriever 全程离线跑通内循环 + 断点续跑。"""

import json

import pytest

from notale.core.models import PageStatus
from notale.utils.llm import FakeClient
from notale.core.state import Manifest
from oh_fake import ScriptedClient, no_network, text_msg, tool_call_msg
from notale.core.workflow import generate
from notale.tools.retriever import FakeRetriever

_PAGE_TEXT = "快速排序的平均时间复杂度是 O(n log n)。"

_RESEARCH = json.dumps(
    {
        "notes": [{"id": "n1", "rawContent": "标准讲法：先插入后快排"}],
        "records": [
            {
                "recordId": "quicksort-avg",
                "branch": ["checkable"],
                "content": {"claim": "快排平均 O(n log n)"},
                "quote": {"url": "https://ref/sort", "quotedSpan": "平均时间复杂度是 O(n log n)"},
            },
            {
                "recordId": "quicksort-algo",
                "branch": ["constructible"],
                "referenceSource": "independent-impl",
                "content": {"algorithm": "partition + 递归"},
                "invariants": ["输出有序且是输入的置换"],
            },
        ],
        "pedagogy": [{"id": "ped-1", "type": "sequence", "content": "先直觉后形式"}],
    },
    ensure_ascii=False,
)

_CONTRACT = json.dumps(
    {
        "chapters": [{"title": "排序", "pageRange": [1, 3], "rationale": "ped-1"}],
        "globals": {
            "terminology": {"排序": "sort"},
            "notation": {"n": "元素个数"},
            "styleTokens": {"primary": "#1a7f5a"},
            "componentAPI": ["sort-viz"],
            "artDirection": "克制编辑风",
        },
        "pages": [
            {"pageId": "p1", "pageType": "section-break", "centralMessage": "为什么要排序", "boundPrepRecords": ["quicksort-avg"]},
            {"pageId": "p2", "pageType": "worked-example", "centralMessage": "快排 partition 演示", "boundPrepRecords": ["quicksort-algo"]},
            {"pageId": "p3", "pageType": "quiz-check", "centralMessage": "复杂度小测", "boundPrepRecords": ["quicksort-avg"]},
        ],
    },
    ensure_ascii=False,
)

_GOOD_PAGE = json.dumps(
    {
        "designSpec": {"layout": "split"},
        "html": "<section><h2>快排</h2><p>平均时间复杂度 O(n log n)</p></section>",
        "interactionParams": {},
        "boundReferences": ["quicksort-avg"],
        "speakerNotes": "先问学生：图书馆怎么找书",
    },
    ensure_ascii=False,
)

# p2 永远带 AI 味红旗 → 返工 MAX_ATTEMPTS 次后降级
_DIRTY_PAGE = json.dumps(
    {"designSpec": {}, "html": "<p>综上所述，partition 很重要</p>", "boundReferences": ["quicksort-algo"]},
    ensure_ascii=False,
)


def _client(**overrides):
    purposes = {
        "intake": json.dumps({"topic": "排序", "audience": "大二", "durationMin": 10, "rawQuery": "q"}),
        "contract": _CONTRACT,
        "build:p1": _GOOD_PAGE,
        "build:p2": _DIRTY_PAGE,
        "build:p3": _GOOD_PAGE,
    }
    purposes.update(overrides)
    return FakeClient(by_purpose=purposes)


def _research_factory(log: list[str] | None = None):
    """research 段的 OpenHarness fake：每路 agent 先真实抓 https://ref/sort，再给 _RESEARCH 终稿。"""
    def factory(agent: str) -> ScriptedClient:
        if log is not None:
            log.append(agent)
        return ScriptedClient([
            tool_call_msg("fetch_web", {"url": "https://ref/sort"}),
            text_msg(_RESEARCH),
        ])
    return factory


async def test_full_run_offline(tmp_path):
    with no_network():
        result = await generate(
            _client(),
            FakeRetriever({"https://ref/sort": _PAGE_TEXT}),
            "10 分钟排序课",
            out_root=tmp_path,
            research_client_factory=_research_factory(),
        )
    run = result.run_dir

    # 产物齐全
    for name in (
        "course-brief.json", "prep-records.json", "pedagogy-notes.json", "research-notes.json",
        "outline.json", "globals.json", "page-specs.json", "manifest.json", "events.jsonl",
        "assembled-deck.json", "consistency-report.json", "library-delta.json",
        "quality-report.json", "deck.html",
    ):
        assert (run / name).exists(), name
    for name in (
        "runtime/reveal/reveal.js", "runtime/reveal/reveal.css", "runtime/reveal/plugin/notes.js",
        "runtime/reveal/plugin/notes.html",
        "runtime/deck-shell.css", "runtime/deck-shell.js", "slides/p1.html", "slides/p2.html", "slides/p3.html",
    ):
        assert (run / name).exists(), name

    # WIP 门禁 + 降级路径：p1/p3 verified，p2 返工超限 → 降级安全页 + 人审标记
    assert sorted(result.verified) == ["p1", "p3"]
    assert result.degraded == ["p2"]
    deck_html = (run / "deck.html").read_text()
    assert 'class="reveal"' in deck_html
    assert 'src="slides/p2.html"' in deck_html
    assert "降级安全页" in (run / "slides/p2.html").read_text()

    # 反例台账只增不减
    ledger = json.loads((run / "ledger/p2.json").read_text())
    assert ledger["attemptCount"] == 3
    assert len(ledger["entries"]) == 3

    # quality-report 如实标注
    qr = json.loads((run / "quality-report.json").read_text())
    assert qr["unimplementedLayers"] == ["L1", "L2", "L3", "L4", "L5", "L6"]
    assert qr["canaryLeakageSummary"] is None

    # 页状态机终态
    m = Manifest.load(run)
    assert m.todo_pages() == []
    assert m.data.pages["p2"].status == PageStatus.DEGRADED


async def test_repair_loop_feeds_counterexamples(tmp_path):
    client = _client()
    with no_network():
        await generate(
            client, FakeRetriever({"https://ref/sort": _PAGE_TEXT}), "q",
            out_root=tmp_path, research_client_factory=_research_factory(),
        )
    p2_calls = [msgs for purpose, msgs in client.calls if purpose == "build:p2"]
    assert len(p2_calls) == 3  # MAX_ATTEMPTS
    # 第 2、3 次生成带着全部历史反例（反例制导，不是裸重试）
    assert "历史反例" not in p2_calls[0][-1]["content"]
    assert "历史反例" in p2_calls[1][-1]["content"]
    assert p2_calls[1][-1]["content"].count("AI 味红旗") >= 1
    assert p2_calls[2][-1]["content"].count("AI 味红旗") >= 2  # 反例累积


async def test_resume_skips_finished_stages_and_pages(tmp_path):
    retriever = FakeRetriever({"https://ref/sort": _PAGE_TEXT})

    # 第一次：contract 阶段爆炸 → intake/research 已落盘
    class Boom(FakeClient):
        async def complete(self, messages, *, json_mode=True, purpose="chat"):
            if purpose == "contract":
                raise RuntimeError("模拟中断")
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    client1 = _client()
    client1.__class__ = Boom  # 保留罐装，换行为
    with pytest.raises(RuntimeError, match="模拟中断"), no_network():
        await generate(
            client1, retriever, "q", out_root=tmp_path,
            research_client_factory=_research_factory(),
        )
    run_dir = next(tmp_path.iterdir())
    assert (run_dir / "prep-records.json").exists()
    assert not (run_dir / "page-specs.json").exists()

    # 第二次：断点续跑——intake/research 不再调用，从 contract 接着走
    research_calls: list[str] = []
    client2 = _client()
    with no_network():
        result = await generate(
            client2, retriever, "q", out_root=tmp_path, resume_dir=run_dir,
            research_client_factory=_research_factory(log=research_calls),
        )
    purposes = [p for p, _ in client2.calls]
    assert "intake" not in purposes
    assert research_calls == []  # research 阶段整体跳过（已落盘）
    assert "contract" in purposes
    assert sorted(result.verified) == ["p1", "p3"] and result.degraded == ["p2"]
