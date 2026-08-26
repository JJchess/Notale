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
                         arguments='{"skill":"build-motion"}', call_id="call_wrong")
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


if __name__ == "__main__":
    unittest.main()
