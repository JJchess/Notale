#!/usr/bin/env python3
"""Builder agent-loop regression tests."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core import builder, llm, wire  # noqa: E402


class FakeCall(SimpleNamespace):
    def model_dump(self):
        return {"type": "function_call", "name": self.name,
                "arguments": self.arguments, "call_id": self.call_id}


def done_response(text="done"):
    message = SimpleNamespace(
        type="message",
        content=[SimpleNamespace(type="output_text", text=text)],
    )
    return SimpleNamespace(output=[message], usage=None, id="req_done")


class BuilderStopTests(unittest.TestCase):
    def test_no_tool_use_stops_even_when_assigned_skill_was_not_loaded(self) -> None:
        response = done_response()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pages = root / "pages"
            pages.mkdir()
            page = builder.Page(
                "page-01",
                "Build page-01.html",
                required=("gsap-core",),
            )
            with patch.object(builder, "respond", return_value=response) as respond:
                result = builder.build_one(
                    page,
                    pages,
                    root / "trace.jsonl",
                    root / "skills",
                    "test instructions",
                    "medium",
                )

        self.assertTrue(result.ok)
        self.assertEqual(result.calls, 1)
        self.assertEqual(result.why, "done")
        self.assertEqual(result.termination, "no_tool_use")
        self.assertEqual(result.steps, [])
        self.assertFalse(hasattr(result, "nagged"))
        respond.assert_called_once()


class BuilderRoutingTests(unittest.TestCase):
    def test_new_brief_routes_exactly_one_workflow(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wf = root / "workflows" / "build-page"
            wf.mkdir(parents=True)
            (wf / "SKILL.md").write_text("---\ndescription: compose\n---\n", encoding="utf-8")
            legacy = root / "legacy"
            legacy.mkdir()
            page = builder.page_from_brief(
                {"description": "Build page-01",
                 "prompt": "x\n\n## 主工作流\n  - build-page\n"},
                root / "workflows", legacy)

        self.assertEqual(page.skill_mode, "workflow")
        self.assertEqual(page.primary_workflow, "build-page")
        self.assertEqual(page.required, ("build-page",))

    def test_legacy_brief_keeps_multiple_skills(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            legacy = root / "legacy"
            for name in ("one", "two"):
                d = legacy / name
                d.mkdir(parents=True)
                (d / "SKILL.md").write_text("---\ndescription: x\n---\n", encoding="utf-8")
            workflows = root / "workflows"
            workflows.mkdir()
            page = builder.page_from_brief(
                {"description": "Build page-02",
                 "prompt": "## 必用skill\n  - one\n  - two\n"},
                workflows, legacy)

        self.assertEqual(page.skill_mode, "legacy")
        self.assertEqual(page.required, ("one", "two"))

    def test_workflow_mode_rejects_other_skill_without_restarting(self) -> None:
        wrong = FakeCall(type="function_call", name="Skill",
                         arguments='{"skill":"build-chart"}', call_id="call_wrong")
        first = SimpleNamespace(output=[wrong], usage=None, id="req_wrong")

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pages = root / "pages"
            pages.mkdir()
            wf = root / "workflows" / "build-page"
            wf.mkdir(parents=True)
            (wf / "SKILL.md").write_text("---\ndescription: compose\n---\n", encoding="utf-8")
            page = builder.Page("page-01", "Build", ("build-page",),
                                primary_workflow="build-page", skill_mode="workflow")
            with patch.object(builder, "respond", side_effect=[first, done_response()]), \
                    patch.object(builder.tools, "run") as run:
                result = builder.build_one(page, pages, root / "trace.jsonl",
                                           root / "workflows", "instructions", "medium")

        self.assertTrue(result.ok)
        self.assertEqual(result.termination, "no_tool_use")
        self.assertEqual(result.loaded_skills, [])
        self.assertEqual(result.steps, ["Skill"])
        run.assert_not_called()

    def test_workflow_usage_is_recorded_without_becoming_a_gate(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pages = root / "pages"
            pages.mkdir()
            wf = root / "workflows" / "build-page"
            (wf / "references").mkdir(parents=True)
            (wf / "scripts").mkdir()
            (wf / "SKILL.md").write_text("---\ndescription: compose\n---\n", encoding="utf-8")
            ref = wf / "references" / "layout.md"
            ref.write_text("x", encoding="utf-8")
            script = wf / "scripts" / "audit.py"
            script.write_text("print('ok')", encoding="utf-8")

            calls = [
                FakeCall(type="function_call", name="Skill",
                         arguments='{"skill":"build-page"}', call_id="c1"),
                FakeCall(type="function_call", name="Read",
                         arguments=json.dumps({"file_path": str(ref)}),
                         call_id="c2"),
                FakeCall(type="function_call", name="Bash",
                         arguments=json.dumps({"command": "python " + str(script)}),
                         call_id="c3"),
            ]
            responses = [SimpleNamespace(output=[call], usage=None, id=f"req_{i}")
                         for i, call in enumerate(calls)] + [done_response()]
            page = builder.Page("page-01", "Build", ("build-page",),
                                primary_workflow="build-page", skill_mode="workflow")
            with patch.object(builder, "respond", side_effect=responses), \
                    patch.object(builder.tools, "run", return_value="ok"):
                result = builder.build_one(page, pages, root / "trace.jsonl",
                                           root / "workflows", "instructions", "medium")

        self.assertEqual(result.loaded_skills, ["build-page"])
        self.assertEqual(result.reference_reads, ["references/layout.md"])
        self.assertEqual(result.workflow_script_runs, ["audit.py"])
        self.assertEqual(result.termination, "no_tool_use")


class CacheAccountingTests(unittest.TestCase):
    """缓存这一层的账。全仓在 2026-08-26 之前一个 cached 数都没有,
    所以「前缀缓存生不生效」只能靠离线探针 —— 这几条把它钉住。"""

    def _img_hist(self, n: int) -> list:
        h = [{"role": "user", "content": "开始"}]
        for i in range(n):
            h.append({"role": "user", "content": [
                {"type": "input_image", "image_url": f"data:image/png;base64,x{i}"}]})
        return h

    def test_no_eviction_below_context_soft(self) -> None:
        """没超线时历史必须**逐字节不变** —— 动一下前缀缓存就断。"""
        hist = self._img_hist(8)
        before = copy.deepcopy(hist)
        n = builder.evict_images(hist, builder.CONTEXT_SOFT)
        self.assertEqual(n, 0)
        self.assertEqual(hist, before)

    def test_eviction_above_context_soft_keeps_last_two(self) -> None:
        hist = self._img_hist(8)
        n = builder.evict_images(hist, builder.CONTEXT_SOFT + 1)
        self.assertEqual(n, 6)
        left = [m for m in hist if builder._is_image_msg(m)]
        self.assertEqual(len(left), builder.KEEP_IMAGES)

    def test_usage_of_tells_unreported_apart_from_zero(self) -> None:
        """`None`(这条路由不报) 和 `0`(报了但没命中) 必须分得开。"""
        none_usage = SimpleNamespace(input_tokens=10, output_tokens=1)
        self.assertIsNone(llm.usage_of(SimpleNamespace(usage=none_usage))[2])

        zero = SimpleNamespace(input_tokens=10, output_tokens=1,
                               input_tokens_details=SimpleNamespace(cached_tokens=0))
        self.assertEqual(llm.usage_of(SimpleNamespace(usage=zero))[2], 0)

        hit = SimpleNamespace(input_tokens=10, output_tokens=1,
                              input_tokens_details=SimpleNamespace(cached_tokens=7))
        self.assertEqual(llm.usage_of(SimpleNamespace(usage=hit)), (10, 1, 7))

        # builder 的假响应一直用 usage=None,不能让新读取炸掉
        self.assertEqual(llm.usage_of(SimpleNamespace(usage=None)), (0, 0, None))

    def test_usage_of_reads_chat_and_anthropic_field_names(self) -> None:
        chat = SimpleNamespace(prompt_tokens=9, completion_tokens=2,
                               prompt_tokens_details=SimpleNamespace(cached_tokens=5))
        self.assertEqual(llm.usage_of(SimpleNamespace(usage=chat)), (9, 2, 5))
        anth = SimpleNamespace(input_tokens=9, output_tokens=2,
                               cache_read_input_tokens=4)
        self.assertEqual(llm.usage_of(SimpleNamespace(usage=anth))[2], 4)

    def test_persisted_cache_key_survives_trace_readback(self) -> None:
        """trace.usage_of() 只认 wire.Usage 声明过的字段,写错名字会被静默丢掉。"""
        self.assertIn("cache_read_input_tokens", wire.Usage.model_fields)


class WriteOnceAndEffortTests(unittest.TestCase):
    """整页只许写一次;构图与修复用不同推理档。"""

    def _call(self, name, **args):
        return FakeCall(type="function_call", name=name,
                        arguments=json.dumps(args), call_id=f"c{name}")

    def _run(self, calls, effort="low", compose="medium"):
        """跑 build_one,返回 (page, 每步用的 effort, 每步 tools.run 收到的工具名)."""
        efforts, ran = [], []
        self.surfaces = []
        responses = [SimpleNamespace(output=[c], usage=None, id=f"r{i}")
                     for i, c in enumerate(calls)]
        responses.append(done_response())

        def fake_respond(instr, hist, spec, eff, tag="-"):
            efforts.append(eff)
            self.surfaces.append({s["name"] for s in spec})
            return responses.pop(0)

        def fake_run(name, args, cwd, root):
            ran.append(name)
            return "ok"

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "page-01.html").write_text("<html></html>", encoding="utf-8")
            page = builder.Page("page-01", "Build", ("build-page",),
                                primary_workflow="build-page", skill_mode="workflow")
            with patch.object(builder, "respond", fake_respond), \
                    patch.object(builder.tools, "run", fake_run):
                builder.build_one(page, root, root / "trace.jsonl", root,
                                  "instructions", effort, compose)
        return page, efforts, ran

    def test_second_whole_page_write_is_refused(self) -> None:
        page, _, ran = self._run([
            self._call("Write", file_path="/x/page-01.html", content="a"),
            self._call("Write", file_path="/x/page-01.html", content="b"),
        ])
        # 第一次真的执行了,第二次没有走到 tools.run
        self.assertEqual(ran, ["Write"])
        self.assertTrue(page.wrote)
        # 但它仍然记进步数 —— 事后要查得到「它试过重写」
        self.assertEqual(page.steps.count("Write"), 2)

    def test_patch_still_allowed_after_write(self) -> None:
        _, _, ran = self._run([
            self._call("Write", file_path="/x/page-01.html", content="a"),
            self._call("Patch", page="page-01.html", edits=[{"old": "x", "new": "y"}]),
            self._call("Edit", file_path="/x/page-01.html", old_string="x", new_string="y"),
        ])
        self.assertEqual(ran, ["Write", "Patch", "Edit"])

    def test_effort_drops_to_repair_tier_after_the_write(self) -> None:
        _, efforts, _ = self._run([
            self._call("Read", file_path="/x/CONTRACT.md"),
            self._call("Write", file_path="/x/page-01.html", content="a"),
            self._call("Patch", page="page-01.html", edits=[{"old": "x", "new": "y"}]),
        ], effort="low", compose="medium")
        # 第 1、2 步在 Write 之前 → 构图档;第 3 步及以后 → 修复档
        self.assertEqual(efforts[:2], ["medium", "medium"])
        self.assertTrue(all(e == "low" for e in efforts[2:]), efforts)

    def test_patch_and_edit_are_absent_before_the_first_write(self) -> None:
        """先 Write 不能只靠 IDENTITY 劝 —— 实测 Sonnet 会用 Edit 整页写入绕过去。"""
        _, _, ran = self._run([
            self._call("Read", file_path="/x/CONTRACT.md"),
            self._call("Edit", file_path="/x/page-01.html",
                       old_string="a", new_string="b"),
            self._call("Write", file_path="/x/page-01.html", content="a"),
        ])
        self.assertIn("Write", self.surfaces[0])
        for s in self.surfaces[:2]:                 # Write 之前
            self.assertNotIn("Patch", s)
            self.assertNotIn("Edit", s)
        # Read 照常执行;硬喊的那次 Edit 被兜底拦下,没有走到 tools.run
        self.assertEqual(ran, ["Read", "Write"])

    def test_write_leaves_the_tool_surface_after_first_use(self) -> None:
        """正路是**摘掉工具**,不是等它生成完整页再拒 —— 后者白烧一次输出。"""
        self._run([
            self._call("Read", file_path="/x/CONTRACT.md"),
            self._call("Write", file_path="/x/page-01.html", content="a"),
            self._call("Patch", page="page-01.html", edits=[{"old": "x", "new": "y"}]),
        ])
        self.assertIn("Write", self.surfaces[0])
        self.assertIn("Write", self.surfaces[1])          # 这一步才发生 Write
        for s in self.surfaces[2:]:
            self.assertNotIn("Write", s)                  # 之后不再出现在工具面里
            self.assertIn("Patch", s)                     # 改页的路换成这两个
            self.assertIn("Edit", s)

    def test_compose_effort_defaults_to_single_tier(self) -> None:
        _, efforts, _ = self._run([
            self._call("Write", file_path="/x/page-01.html", content="a"),
        ], effort="low", compose="")
        self.assertTrue(all(e == "low" for e in efforts), efforts)


class MessagesWireTests(unittest.TestCase):
    """messages wire 的两条:参数别静默丢,异常别绕过退避阶梯。"""

    def setUp(self) -> None:
        # override 写的是模块级 _OVERRIDE,不还原会污染同进程的后续测试。
        self._saved = dict(llm._OVERRIDE)

    def tearDown(self) -> None:
        llm._OVERRIDE.clear()
        llm._OVERRIDE.update(self._saved)
        llm.config.cache_clear()
        llm.client.cache_clear()

    def _body(self, effort=None):
        b = {"model": "M", "instructions": "SYS", "max_output_tokens": 128_000,
             "input": [{"role": "user", "content": "a"}]}
        if effort:
            b["reasoning"] = {"effort": effort}
        return b

    def test_effort_is_translated_not_dropped(self) -> None:
        """--effort 在这条 wire 上曾经静默无效。别再退回去。"""
        self.assertIsNone(llm.to_messages(self._body("low")).get("thinking"))
        for eff, budget in (("medium", 4096), ("high", 16384)):
            th = llm.to_messages(self._body(eff)).get("thinking")
            self.assertEqual(th, {"type": "enabled", "budget_tokens": budget})

    def test_system_and_rolling_breakpoints_both_present(self) -> None:
        """只打 system 断点实测只有 8.7% 命中,滚动断点才到 100%。两个都要在。"""
        m = llm.to_messages(self._body())
        self.assertEqual(m["system"][0]["cache_control"], {"type": "ephemeral"})
        self.assertEqual(m["messages"][-1]["content"][-1]["cache_control"],
                         {"type": "ephemeral"})

    def test_http_errors_become_sdk_types_so_the_ladder_retries(self) -> None:
        """urllib 的异常不翻译的话,这条 wire 一次重试都没有。"""
        import io
        import urllib.error
        from openai import (APIConnectionError, BadRequestError,
                            InternalServerError, RateLimitError)

        def raiser(code):
            def _open(req, timeout=None):
                raise urllib.error.HTTPError(req.full_url, code, "boom", {},
                                             io.BytesIO(b"{}"))
            return _open

        llm.override(name="AWS-Claude-Sonnet-5", wire_api="messages")
        for code, want in ((500, InternalServerError), (429, RateLimitError),
                           (400, BadRequestError)):
            with patch("urllib.request.urlopen", raiser(code)):
                with self.assertRaises(want):
                    llm._post_messages(self._body())
        with patch("urllib.request.urlopen",
                   lambda r, timeout=None: (_ for _ in ()).throw(
                       urllib.error.URLError("down"))):
            with self.assertRaises(APIConnectionError):
                llm._post_messages(self._body())


if __name__ == "__main__":
    unittest.main()
