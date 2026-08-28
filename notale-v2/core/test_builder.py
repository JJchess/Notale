#!/usr/bin/env python3
"""Builder agent-loop regression tests."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import ast
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
    def test_no_tool_use_stops_even_when_no_workflow_was_loaded(self) -> None:
        response = done_response()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pages = root / "pages"
            pages.mkdir()
            page = builder.Page("page-01", "Build page-01.html")
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
    """指派没了 —— workflow 由建页 agent 自选。这里守的是**观测项还活着**。

    `test_new_brief_routes_exactly_one_workflow` / `test_legacy_brief_keeps_multiple_skills`
    / `test_workflow_mode_rejects_other_skill_without_restarting` 三个 2026-08-28 删除:
    它们断言的是 harness 按 `## 主工作流` 路由并硬拦别的 workflow,而那套机制整条没了。
    """

    def test_brief_becomes_just_id_and_prose(self) -> None:
        page = builder.page_from_brief(
            {"description": "Build page-07", "prompt": "一段散文。"})
        self.assertEqual(page.pid, "page-07")
        self.assertEqual(page.prompt, "一段散文。")

    def test_any_workflow_can_be_loaded_and_is_recorded(self) -> None:
        """自选是允许的,但**必须留痕** —— `loaded_skills` 是新的观测项。

        指派时代的读数是「指派 N 项、实际读到 N 项」;现在没有分母了,
        改看各页自己挑了什么、以及有没有页面一份都不读。
        """
        page = builder.Page("page-01", "Build")
        for name in ("build-chart", "build-interaction"):
            page.loaded_skills.append(name)
        self.assertEqual(page.loaded_skills, ["build-chart", "build-interaction"])


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
            page = builder.Page("page-01", "Build")
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
        """--effort 在这条 wire 上曾经静默无效。别再退回去。

        2026-08-28 起网关换了接口:medium/high 要用 adaptive + output_config.effort,
        原来的 {"type":"enabled","budget_tokens":N} 会 400。low 仍旧显式 disabled ——
        不传等于放任模型默认开思考,那正是 PLAN.md 卡死 400 秒的原因。
        """
        self.assertEqual(llm.to_messages(self._body("low"))["thinking"],
                         {"type": "disabled"})
        for eff in ("medium", "high"):
            m = llm.to_messages(self._body(eff))
            self.assertEqual(m["thinking"], {"type": "adaptive"})
            self.assertEqual(m["output_config"], {"effort": eff})

    def test_enabled_with_budget_tokens_is_never_sent(self) -> None:
        """**这条形状现在是 400。** 逐个探针实测(AWS-Claude-Sonnet-5,裸 /v1/messages):

            不传 thinking                    → 200,首块就是 thinking(默认开着)
            {"type":"disabled"}              → 200,只有 text
            {"type":"enabled",budget_tokens} → 400 「not supported for this model」
            {"type":"adaptive"}              → 200
            {"type":"adaptive"} + output_config.effort → 200(low/medium/high 都收)

        400 还会被误判成网关抖动、按退避梯子重试八次,看起来像网络问题。
        """
        for eff in ("low", "medium", "high"):
            m = llm.to_messages(self._body(eff))
            self.assertNotEqual(m["thinking"].get("type"), "enabled")
            self.assertNotIn("budget_tokens", m["thinking"])

    def test_max_tokens_is_left_alone(self) -> None:
        """没有 token 预算了,就不该再动 max_tokens —— 动了就会撞 128,000 的硬上限。

        2026-08-27 那轮 Sonnet 正是 128000+4096=132096 撞上
        「max_tokens: 132096 > 128000, which is the maximum allowed number of
        output tokens for ***.claude-sonnet-5」,而 medium 恰好是构图档,
        症状是「首次 Write 一开 medium 就整页崩」。
        """
        base = self._body()["max_output_tokens"]
        for eff in (None, "low", "medium", "high"):
            self.assertEqual(llm.to_messages(self._body(eff))["max_tokens"], base)

    def test_low_effort_disables_thinking_explicitly(self) -> None:
        """**不传 thinking ≠ 关闭。** 这个模型在这条路由上默认就开着 extended thinking:
        流里第一个 content_block 类型就是 `thinking`,然后几十个 ping、零个 delta。
        PLAN.md 那步光思考超 4 分钟,非流式要等思考全结束才返回 —— 表现为卡死。
        实测同一请求:不关 400s 无返回;关掉 71s 出 4,765 字符。
        """
        m = llm.to_messages(self._body("low"))
        self.assertEqual(m["thinking"], {"type": "disabled"})
        m2 = llm.to_messages(self._body())          # 完全不给 effort 也要关
        self.assertEqual(m2["thinking"], {"type": "disabled"})

    def test_planner_string_input_becomes_one_user_message(self) -> None:
        """planner 的 to_responses 无图时返回**纯字符串** —— 逐字符遍历会让 messages 变空。"""
        m = llm.to_messages({"model": "M", "instructions": "S",
                             "max_output_tokens": 64, "input": "规划一套讲义"})
        self.assertEqual(len(m["messages"]), 1)
        self.assertEqual(m["messages"][0]["role"], "user")
        self.assertEqual(m["messages"][0]["content"][0]["text"], "规划一套讲义")

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


class ArgparseSurfaceTests(unittest.TestCase):
    """`main()` 读的每个 `n.<attr>`,都必须真有一个 `add_argument` 定义它。

    **这条是踩出来的,一天之内同一形状踩了三次。** 按注释边界去切一段代码删除时,
    很容易把紧挨着的下一个定义一起带走 —— 已经这样丢过 `skills.FONT_FLOOR`、
    `skills.direction_block` 和 `--no-preload-docs`。前两个当场就 ImportError,
    第三个不会:argparse 少一个选项不报错,`n.preload_docs` 要等 main() 跑到那一行
    才 AttributeError,**而那时 planner 已经跑完、builder 刚起**,白丢一轮。

    静态查:解析源码,把 `add_argument` 的 dest 和 `n.X` 的读取对起来。
    """

    @staticmethod
    def _surface(mod) -> tuple[set, set]:
        src = Path(mod.__file__).read_text(encoding="utf-8")
        tree = ast.parse(src)
        fn = next(f for f in ast.walk(tree)
                  if isinstance(f, ast.FunctionDef) and f.name == "main")
        defined, read = set(), set()
        for node in ast.walk(fn):
            if (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "add_argument"):
                dest = next((k.value.value for k in node.keywords if k.arg == "dest"), None)
                if dest:
                    defined.add(dest)
                elif node.args:
                    defined.add(node.args[-1].value.lstrip("-").replace("-", "_"))
            if (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
                    and node.value.id == "n" and isinstance(node.ctx, ast.Load)):
                read.add(node.attr)
        return defined, read

    def test_builder_reads_only_flags_it_defines(self) -> None:
        defined, read = self._surface(builder)
        self.assertEqual(read - defined, set(),
                         f"main() 读了未定义的参数:{sorted(read - defined)}")

    def test_planner_reads_only_flags_it_defines(self) -> None:
        from core import planner
        defined, read = self._surface(planner)
        self.assertEqual(read - defined, set(),
                         f"main() 读了未定义的参数:{sorted(read - defined)}")


if __name__ == "__main__":
    unittest.main()
