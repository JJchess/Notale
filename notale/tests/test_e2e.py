"""端到端：FakeClient + ScriptedClient（research 段）+ FakeRetriever 全程离线跑通内循环 + 断点续跑。"""

import json

import pytest

import notale.core.workflow as workflow_module
from notale.core.models import PageStatus
from oh_fake import FakeClient
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
        "throughline": "从排序需求出发，用 partition 建立复杂度与递归判断",
        "chapters": [
            {
                "title": "排序基础", "pageRange": [1, 3],
                "rationale": "先直觉后形式", "pedagogyNoteIds": ["r1-ped-1"],
                "narrativeGoal": "建立排序与 partition 的基本判断框架",
            },
            {
                "title": "排序实践", "pageRange": [4, 5],
                "rationale": "从机制进入应用", "pedagogyNoteIds": ["r1-ped-1"],
                "narrativeGoal": "把 partition 框架迁移到边界与递归",
            },
        ],
        "globals": {
            "terminology": {"排序": "sort"},
            "notation": {"n": "元素个数"},
            "styleTokens": {
                "bg": "#08130f", "surface": "#10231b", "ink": "#eefbf5",
                "muted": "#9ab8aa", "accent": "#1a7f5a", "accent-2": "#e0a229",
                "line": "rgba(238, 251, 245, 0.18)",
                "font": '"Noto Sans SC", system-ui, sans-serif',
                "mono": '"SFMono-Regular", Consolas, monospace',
            },
            "artDirection": "克制编辑风",
            "visualMotif": "以贯穿页面的分区轴表示状态边界",
        },
        "supplementalPrepRecords": [{
            "recordId": "planner-recursion-structure",
            "branch": ["constructible"],
            "referenceSource": "declared-spec",
            "content": {"claim": "快速排序对子区间递归应用相同的 partition 规约"},
            "invariants": ["递归子区间严格缩小"],
            "validRange": "partition 每次都将基准放入最终位置",
        }],
        "pages": [
            {"pageId": "p1", "pageType": "section-break", "centralMessage": "为什么要排序", "learningAction": "识别排序问题", "boundPrepRecords": ["quicksort-avg"], "narrativeRole": "提出全书要解决的选择问题", "continuity": [{"pageId": "p5", "relation": "sets-up", "cue": "预告递归会复用同一规约"}]},
            {"pageId": "p2", "pageType": "worked-example", "centralMessage": "快排 partition 演示", "learningAction": "追踪 partition", "boundPrepRecords": ["quicksort-algo"], "narrativeRole": "建立后续页面复用的机制", "continuity": [{"pageId": "p1", "relation": "builds-on", "cue": "把排序需求落实为机制"}]},
            {"pageId": "p3", "pageType": "quiz-check", "centralMessage": "复杂度小测", "learningAction": "判断复杂度", "boundPrepRecords": ["quicksort-avg"], "narrativeRole": "检查基本判断框架", "continuity": [{"pageId": "p1", "relation": "returns-to", "cue": "回扣开篇的算法选择问题"}]},
            {"pageId": "p4", "pageType": "worked-example", "centralMessage": "划分边界", "learningAction": "解释划分边界", "boundPrepRecords": ["quicksort-avg"], "narrativeRole": "把机制推进到边界条件", "continuity": [{"pageId": "p2", "relation": "builds-on", "cue": "复用 partition 机制"}]},
            {"pageId": "p5", "pageType": "worked-example", "centralMessage": "递归结构", "learningAction": "展开递归结构", "boundPrepRecords": ["planner-recursion-structure"], "narrativeRole": "综合机制与边界形成递归结构", "continuity": [{"pageId": "p1", "relation": "returns-to", "cue": "兑现开篇关于复用规约的铺垫"}]},
        ],
    },
    ensure_ascii=False,
)

_GOOD_PAGE = json.dumps(
    {
        "designSpec": {"layout": "split"},
        "html": "<section data-notale-page><h2>快排</h2><p>平均时间复杂度 O(n log n)</p></section>",
        "boundReferences": ["quicksort-avg"],
        "speakerNotes": "先问学生：图书馆怎么找书",
    },
    ensure_ascii=False,
)

_PLANNER_GROUNDED_PAGE = json.dumps(
    {
        "designSpec": {"layout": "split"},
        "html": "<section data-notale-page><h2>递归结构</h2><p>对子区间重复 partition 规约</p></section>",
        "boundReferences": ["planner-recursion-structure"],
        "speakerNotes": "追踪子区间如何严格缩小",
    },
    ensure_ascii=False,
)

# p2 永远带真正的占位符 → Builder 内部检查反复失败后降级
_DIRTY_PAGE = json.dumps(
    {"designSpec": {}, "html": "<section data-notale-page><p>partition TODO</p></section>", "boundReferences": ["quicksort-algo"]},
    ensure_ascii=False,
)


def _client(**overrides):
    purposes = {
        "intake": json.dumps({"topic": "排序", "audience": "大二", "durationMin": 10, "rawQuery": "q"}),
        "contract": _CONTRACT,
        "build:p1": _GOOD_PAGE,
        "build:p2": _DIRTY_PAGE,
        "build:p3": _GOOD_PAGE,
        "build:p4": _GOOD_PAGE,
        "build:p5": _PLANNER_GROUNDED_PAGE,
    }
    purposes.update(overrides)
    return FakeClient(by_purpose=purposes)


def _research_factory(log: list[str] | None = None):
    """research 段的 OpenHarness fake：每路 agent 先真实抓 https://ref/sort，再给 _RESEARCH 终稿。"""
    def factory(agent: str) -> ScriptedClient:
        if log is not None:
            log.append(agent)
        return ScriptedClient([
            tool_call_msg("skill_read", {"name": "research-evidence"}),
            tool_call_msg("fetch_web", {"url": "https://ref/sort", "query": "排序"}),
            tool_call_msg("submit_research", {"payload": json.loads(_RESEARCH)}),
            text_msg("submitted"),
        ])
    return factory


@pytest.mark.parametrize(
    ("disable_mode", "reason"),
    [
        ("switch", "disabled-by-config"),
        ("zero-agents", "no-enabled-branches"),
    ],
)
async def test_research_stage_can_be_disabled_without_launching_agents(
    monkeypatch, tmp_path, disable_mode, reason
):
    if disable_mode == "switch":
        monkeypatch.setattr(workflow_module._CONFIG.research, "enabled", False)
    else:
        monkeypatch.setattr(workflow_module._CONFIG.research, "enabled", True)
        monkeypatch.setattr(workflow_module._CONFIG.research, "branches", [])

    async def forbidden_research(*args, **kwargs):
        raise AssertionError("Research must not launch when its agent count is zero")

    class ReachedPlanner(RuntimeError):
        pass

    async def stop_at_planner(*args, **kwargs):
        assert args[2] == []
        assert args[3] == []
        raise ReachedPlanner

    monkeypatch.setattr(workflow_module, "research", forbidden_research)
    monkeypatch.setattr(workflow_module, "contract", stop_at_planner)

    with pytest.raises(ReachedPlanner), no_network():
        await workflow_module.generate(
            _client(), FakeRetriever({}), "10 分钟排序课", out_root=tmp_path
        )

    run = next(tmp_path.iterdir())
    for name in ("prep-records.json", "pedagogy-notes.json", "research-notes.json"):
        assert json.loads((run / name).read_text()) == []
    events = [json.loads(line) for line in (run / "events.jsonl").read_text().splitlines()]
    assert any(
        event["kind"] == "stage-skipped"
        and event["stage"] == "research"
        and event["reason"] == reason
        and event["agents"] == 0
        for event in events
    )
    sessions = [
        json.loads(line) for line in (run / "logs/sessions.jsonl").read_text().splitlines()
    ]
    session_start = next(record for record in sessions if record["kind"] == "session-start")
    assert session_start["config"]["effectivePolicy"]["research"]["agentCount"] == 0
    research_end = next(
        record
        for record in sessions
        if record["kind"] == "stage-end" and record["stage"] == "research"
    )
    assert research_end["status"] == "skipped" and research_end["reason"] == reason
    assert not (run / "agents/research").exists()


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
        "outline.json", "globals.json", "page-specs.json", "planner-prep-records.json",
        "manifest.json", "events.jsonl",
        "assembled-deck.json", "consistency-report.json",
        "quality-report.json", "profile-snapshot.json", "asset-manifest.json",
        "media-budget.json", "deck.html",
    ):
        assert (run / name).exists(), name
    for name in (
        "logs/sessions.jsonl", "logs/llm-calls.jsonl", "logs/agent-traces.jsonl",
        "logs/runtime.log", "logs/summary.json",
    ):
        assert (run / name).exists(), name

    summary = json.loads((run / "logs/summary.json").read_text())
    assert summary["status"] == "completed" and summary["auditComplete"] is True
    assert result.usage["total_tokens"] == summary["metrics"]["totalTokens"]
    assert result.usage["calls"] == summary["metrics"]["calls"]
    assert summary["metrics"]["agents"]["builder:p1"]["contextPeakTokens"] > 0
    assert "toolErrors" in summary["metrics"] and "roles" in summary["metrics"]
    assert summary["metrics"]["toolErrorKinds"]["external"] == 0
    assert summary["metrics"]["toolErrorKinds"]["protocol"] == 0
    assert summary["metrics"]["toolErrorKinds"]["validation"] > 0
    session_start = json.loads((run / "logs/sessions.jsonl").read_text().splitlines()[0])
    assert len(session_start["config"]["configSha256"]) == 64
    assert session_start["config"]["effectivePolicy"]["modelCapabilities"][
        "max_output_tokens"
    ] == 128000
    assert session_start["config"]["effectivePolicy"]["governance"][
        "emergency_limits"
    ]["worker_max_turns"] == 128
    builder_profile = session_start["config"]["agentRoles"]["builder"]
    assert builder_profile["systemProfiles"][0]["name"] == "lecture-authoring"
    assert "正式讲义" in builder_profile["systemPrompt"]
    call_records = [
        json.loads(line) for line in (run / "logs/llm-calls.jsonl").read_text().splitlines()
        if '"kind": "openharness-turn"' in line
    ]
    assert call_records and all("messages" not in record for record in call_records)
    traces = [json.loads(line) for line in (run / "logs/agent-traces.jsonl").read_text().splitlines()]
    assert any(r["kind"] == "tool-start" and r["tool"] == "fetch_web" for r in traces)
    assert any(r["kind"] == "assistant-turn" and r["message"] for r in traces)
    assert any(
        r["kind"] == "skills-assigned"
        and any(
            profile.get("name") == "lecture-authoring"
            for profile in r.get("systemProfiles", [])
        )
        for r in traces
    )
    assert any(
        r["kind"] == "skills-assigned"
        and r.get("agent") == "planner:main"
        and r.get("skillEntrypoints") == {"frontend-slides": "planner-contract"}
        for r in traces
    )
    planner_records = json.loads((run / "planner-prep-records.json").read_text())
    assert len(planner_records) == 1
    assert planner_records[0]["recordId"] == "planner-recursion-structure"
    assert planner_records[0]["origin"] == "planner-generated"
    assert planner_records[0]["evidence"] is None
    p5_context = json.loads((run / "page-contexts/p5.json").read_text())
    assert set(p5_context) == {"page", "narrative", "visualContract", "sources", "skills"}
    assert [record["id"] for record in p5_context["sources"]] == [
        "planner-recursion-structure"
    ]
    assert "evidence" not in p5_context["sources"][0]
    for name in (
        "runtime/reveal/reveal.js", "runtime/reveal/reveal.css", "runtime/reveal/plugin/notes.js",
        "runtime/reveal/plugin/notes.html",
        "runtime/deck-shell.css", "runtime/deck-shell.js", "runtime/global.css", "slides/p1.html", "slides/p2.html", "slides/p3.html",
        "slides/p4.html", "slides/p5.html",
    ):
        assert (run / name).exists(), name

    # WIP 门禁 + 降级路径：成功提交为 completed，Builder 卡死则降级安全页。
    assert sorted(result.completed) == ["p1", "p3", "p4", "p5"]
    assert result.degraded == ["p2"]
    deck_html = (run / "deck.html").read_text()
    assert 'class="reveal"' in deck_html
    assert 'src="slides/p2.html"' in deck_html
    assert "降级安全页" in (run / "slides/p2.html").read_text()

    # check_page 的失败留在同一 Builder 会话；没有第二套 verifier/ledger/自动经验产物。
    assert not (run / "verification").exists()
    assert not (run / "ledger").exists()
    assert not (run / "library-delta.json").exists()
    events = [json.loads(line) for line in (run / "events.jsonl").read_text().splitlines()]
    failure = next(
        event for event in events
        if event["kind"] == "builder-failed" and event["pageId"] == "p2"
    )
    assert "ManagedAgentStalled" in failure["reason"] and "check_page" in failure["reason"]

    # quality-report 只陈述交付状态，不声称未运行的语义验证。
    qr = json.loads((run / "quality-report.json").read_text())
    assert sorted(qr["completedPages"]) == ["p1", "p3", "p4", "p5"]
    assert qr["degradedPages"] == ["p2"]
    assert "unimplementedLayers" not in qr

    # 页状态机终态
    m = Manifest.load(run)
    assert m.todo_pages() == []
    assert m.data.pages["p2"].status == PageStatus.DEGRADED


async def test_preflight_failure_is_bounded_without_regenerating_payload(tmp_path):
    client = _client()
    with no_network():
        await generate(
            client, FakeRetriever({"https://ref/sort": _PAGE_TEXT}), "q",
            out_root=tmp_path, research_client_factory=_research_factory(),
        )
    p2_calls = [msgs for purpose, msgs in client.calls if purpose == "build:p2"]
    assert len(p2_calls) == 1  # 同一持久会话内检查，Harness 不做裸重生成
    run = next(tmp_path.iterdir())
    task = json.loads((run / "agents/builder/p2/task.json").read_text())
    assert task["status"] == "stalled" and task["totalTurns"] == 7
    checkpoint = json.loads((run / "agents/builder/p2/session.json").read_text())
    assert checkpoint["stalledReason"].startswith("same tool failure repeated")


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
    failed_sessions = [
        json.loads(line) for line in (run_dir / "logs/sessions.jsonl").read_text().splitlines()
    ]
    assert failed_sessions[-1]["status"] == "failed"

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
    assert sorted(result.completed) == ["p1", "p3", "p4", "p5"] and result.degraded == ["p2"]
    sessions = [json.loads(line) for line in (run_dir / "logs/sessions.jsonl").read_text().splitlines()]
    assert len({r["sessionId"] for r in sessions}) == 2

    # 第三次：contract 与页面均已完成，仍须从独立 artifact 恢复 planner records。
    client3 = _client()
    with no_network():
        resumed = await generate(
            client3, retriever, "q", out_root=tmp_path, resume_dir=run_dir,
            research_client_factory=_research_factory(log=research_calls),
        )
    assert "contract" not in [purpose for purpose, _ in client3.calls]
    assert sorted(resumed.completed) == ["p1", "p3", "p4", "p5"]

    (run_dir / "planner-prep-records.json").unlink()
    with pytest.raises(ValueError, match="cannot resume safely"), no_network():
        await generate(
            _client(), retriever, "q", out_root=tmp_path, resume_dir=run_dir,
            research_client_factory=_research_factory(),
        )
