import asyncio
import gzip
import json
import os
import subprocess
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import aiohttp
from aiohttp import web
import zstandard

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture.common import scrub
from capture.collect import collect
from capture.proxy import Writer, create_app
from measure.trace import analyze
from measure.trace import wire_summary
from measure.price import estimate
from run import binary, bwrap_binary, environment, jail_command


def native(typ, payload, n=0):
    return {"timestamp": f"2026-09-07T10:00:{n:02d}Z", "type": typ, "payload": payload}


def put_session(home, sid, parent=None, usage_id=None):
    path = home / "sessions" / (sid + ".jsonl")
    path.parent.mkdir(parents=True, exist_ok=True)
    source = {"subagent": {"thread_spawn": {"parent_thread_id": parent}}} if parent else "cli"
    usage = {"input_tokens": 100, "cached_input_tokens": 80, "output_tokens": 20,
             "reasoning_output_tokens": 10, "cache_write_input_tokens": 0, "total_tokens": 120}
    data = [native("session_meta", {"id": sid, "source": source, "cli_version": "0.153.4"}),
            native("turn_context", {"model": "gpt-6-astra", "effort": "high", "turn_id": "turn-1"}),
            native("response_item", {"type": "function_call", "name": "exec_command", "arguments": '{"cmd":"echo hi"}', "call_id": "call-1"}, 1),
            native("event_msg", {"type": "item_completed", "item": {"type": "CommandExecution", "id": "call-1"}}, 1),
            native("response_item", {"type": "function_call_output", "call_id": "call-1", "output": "hi"}, 2),
            native("token_usage_record", {"response_id": usage_id or "resp-" + sid, "usage": usage}, 3),
            native("token_usage_record", {"response_id": usage_id or "resp-" + sid, "usage": usage}, 4),
            native("event_msg", {"type": "token_count", "info": {"total_token_usage": usage}}, 4),
            native("response_item", {"type": "reasoning", "summary": [{"type": "summary_text", "text": "visible summary"}], "encrypted_content": "opaque"}, 4)]
    path.write_text("".join(json.dumps(r) + "\n" for r in data))
    return path


class ArchiveTests(unittest.TestCase):
    def test_graph_dedup_and_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            put_session(root / "home", "root")
            put_session(root / "home", "child", "root")
            put_session(root / "home", "other")
            index = collect(root / "home", root / "out", "root")
            self.assertEqual(len(index["sessions"]), 2)
            report = analyze(root / "out")
            self.assertEqual(report["usage"]["input_tokens"], 200)
            self.assertEqual(report["unique_usage_response_count"], 2)
            self.assertEqual(sum(len(s["calls"]) for s in report["sessions"]), 2)
            self.assertIsNone(report["cost_usd"])
            self.assertTrue(all(s["calls"][0]["observed_result_delay_s"] == 1 for s in report["sessions"]))
            self.assertIn("payload.call_id", report["sessions"][0]["fields"])
            with self.assertRaises(ValueError):
                collect(root / "home", root / "out", "root")

    def test_malformed_and_missing_result_are_visible(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = put_session(root / "home", "one")
            data = [line for line in path.read_text().splitlines() if 'function_call_output' not in line]
            path.write_text("\n".join(data) + '\n{"partial":')
            collect(root / "home", root / "out", "one")
            report = analyze(root / "out")
            self.assertGreaterEqual(len(report["warnings"]), 2)
            self.assertIsNone(report["sessions"][0]["calls"][0]["result"])

    def test_old_cumulative_usage_is_never_summed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = put_session(root / "home", "old")
            path.write_text("\n".join(l for l in path.read_text().splitlines() if "token_usage_record" not in l) + "\n")
            collect(root / "home", root / "out", "old")
            report = analyze(root / "out")
            self.assertIsNone(report["usage"])
            self.assertEqual(report["sessions"][0]["usage"]["input_tokens"], 100)

    def test_redaction_preserves_usage(self):
        secret = "some_custom_credential_value"
        value = {"Authorization": "Bearer abc", "access_token": secret,
                 "usage": {"input_tokens": 99}, "nested": ["cmd=" + secret]}
        clean = scrub(value, [secret])
        self.assertNotIn(secret, json.dumps(clean))
        self.assertEqual(clean["usage"]["input_tokens"], 99)

    def test_price_subsets_and_unknown_models(self):
        summary = {"sessions": [{"session_id": "s", "usage_records": [{"response_id": "r", "model": "fixture",
            "usage": {"input_tokens": 100, "cached_input_tokens": 80, "output_tokens": 20, "reasoning_output_tokens": 10}}]}]}
        rates = {"models": {"fixture": {"default": {"input_per_million": 10,
                         "cached_input_per_million": 1, "output_per_million": 30}}}}
        self.assertAlmostEqual(estimate(summary, rates, "default")["total_usd"], 0.00088)
        self.assertIsNone(estimate(summary, rates, "priority")["total_usd"])

    def test_unfinished_turn_and_ws_request_are_not_complete(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = put_session(root / "home", "root")
            with path.open("a") as f:
                f.write(json.dumps(native("event_msg", {"type": "task_started", "turn_id": "unfinished"}, 5)) + "\n")
            collect(root / "home", root / "out", "root")
            report = analyze(root / "out")
            self.assertTrue(any("without completion" in w["error"] for w in report["warnings"]))
            ws = root / "out/wire/ws"
            ws.mkdir(parents=True)
            (ws / "connection.jsonl").write_text('\n'.join(json.dumps(r) for r in [
                {"type": "message", "direction": "client", "payload": {"type": "response.create"}},
                {"type": "connection.ended"}]) + '\n')
            self.assertTrue(any("without terminal" in s for s in wire_summary(root / "out")["issues"]))


class ProxyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.requests = []
        self.release = asyncio.Event()
        self.native_mode = False
        app = web.Application(handler_args={"auto_decompress": False})
        app.router.add_route("*", "/{path:.*}", self.upstream)
        self.server = web.AppRunner(app, access_log=None)
        await self.server.setup()
        site = web.TCPSite(self.server, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        self.writer = Writer(self.root / "wire", ["custom-secret-value"])
        self.proxy = web.AppRunner(create_app(f"http://127.0.0.1:{port}", self.writer), access_log=None)
        await self.proxy.setup()
        site = web.TCPSite(self.proxy, "127.0.0.1", 0)
        await site.start()
        self.url = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
        self.client = aiohttp.ClientSession()

    async def asyncTearDown(self):
        self.release.set()
        await self.client.close()
        await self.proxy.cleanup()
        await self.server.cleanup()
        self.temp.cleanup()

    async def flush(self):
        await asyncio.to_thread(self.writer.q.join)

    async def upstream(self, request):
        if request.headers.get("Upgrade", "").lower() == "websocket":
            self.requests.append(("WS", dict(request.headers)))
            ws = web.WebSocketResponse()
            ws.headers["x-codex-turn-state"] = "affinity-fixture"
            await ws.prepare(request)
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    value = json.loads(msg.data)
                    if self.native_mode:
                        for event in self.native_events():
                            await ws.send_json(event)
                        continue
                    await ws.send_json({"type": "response.created", "response": {"id": value["id"]}})
                    await ws.send_json({"type": "response.completed", "response": {"id": value["id"], "usage": {"input_tokens": 12}}})
            return ws
        raw = await request.read()
        if request.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        elif request.headers.get("Content-Encoding") == "zstd":
            raw = zstandard.ZstdDecompressor().decompress(raw)
        self.requests.append((request.path, raw, dict(request.headers)))
        if request.path == "/retry":
            return web.json_response({"error": "rate_limit"}, status=429, headers={"Retry-After": "7"})
        response = web.StreamResponse(headers={"Content-Type": "text/event-stream", "x-request-id": "req-fixture"})
        await response.prepare(request)
        if self.native_mode:
            for event in self.native_events():
                await response.write(("data: " + json.dumps(event) + "\n\n").encode())
            await response.write_eof()
            return response
        await response.write(b'data: {"type":"response.created","response":{"id":"resp-test"}}\n\n')
        if request.path == "/slow":
            await self.release.wait()
        if request.path == "/broken":
            request.transport.close()
            return response
        if request.path != "/truncated":
            await response.write(b'data: {"type":"response.completed","response":{"id":"resp-test","usage":{"input_tokens":12}}}\n\n')
        await response.write_eof()
        return response

    async def test_sse_streaming_not_buffered(self):
        async with self.client.post(self.url + "/slow", json={"model": "gpt-6-astra"}) as response:
            first = await asyncio.wait_for(response.content.readline(), timeout=1)
            self.assertIn(b"response.created", first)
            self.assertFalse(self.release.is_set())
            self.release.set()
            await response.read()
        await self.flush()
        call = json.loads(next((self.root / "wire/calls").glob("*.json")).read_text())
        self.assertEqual(call["state"], "complete")
        self.assertEqual(call["terminal_event"], "response.completed")

    async def test_error_status_and_truncated_capture(self):
        async with self.client.post(self.url + "/retry") as response:
            self.assertEqual(response.status, 429)
            self.assertEqual(response.headers["Retry-After"], "7")
            await response.read()
        async with self.client.post(self.url + "/truncated") as response:
            await response.read()
        await self.flush()
        calls = [json.loads(p.read_text()) for p in (self.root / "wire/calls").glob("*.json")]
        self.assertEqual(len(self.requests), 2)  # proxy never retries
        self.assertTrue(next(c for c in calls if c["path"] == "/truncated")["capture_truncated"])

    async def test_broken_transport_does_not_fake_clean_eof(self):
        with self.assertRaises(aiohttp.ClientPayloadError):
            async with self.client.post(self.url + "/broken") as response:
                await response.read()
        await self.flush()
        call = json.loads(next((self.root / "wire/calls").glob("*.json")).read_text())
        self.assertEqual(call["state"], "transport_error")

    async def test_compressed_requests_and_redaction(self):
        for encoding, compress in (("gzip", gzip.compress), ("zstd", zstandard.ZstdCompressor().compress)):
            raw = json.dumps({"model": "gpt-6-astra", "input": "custom-secret-value"}).encode()
            async with self.client.post(self.url + "/responses", data=compress(raw),
                    headers={"Content-Encoding": encoding, "Authorization": "Bearer custom-secret-value"}) as response:
                self.assertEqual(response.status, 200)
                await response.read()
            self.assertEqual(self.requests[-1][1], raw)
        await self.flush()
        for path in (self.root / "wire/calls").glob("*.json"):
            call = json.loads(path.read_text())
            self.assertEqual(call["request"]["model"], "gpt-6-astra")
            self.assertNotIn("custom-secret-value", path.read_text())

    async def test_websocket_multiple_responses_and_headers(self):
        async with self.client.ws_connect(self.url + "/responses",
                headers={"x-codex-turn-state": "client-affinity"}) as ws:
            self.assertEqual(ws._response.headers["x-codex-turn-state"], "affinity-fixture")
            for rid in ("resp-ws-1", "resp-ws-2"):
                await ws.send_json({"type": "response.create", "id": rid, "model": "gpt-6-astra"})
                await ws.receive_json()
                event = await ws.receive_json()
                self.assertEqual(event["response"]["id"], rid)
        await asyncio.sleep(0.05)
        await self.flush()
        path = next((self.root / "wire/ws").glob("*.jsonl"))
        rows = [json.loads(l) for l in path.read_text().splitlines()]
        self.assertEqual(sum(r["type"] == "message" for r in rows), 6)
        self.assertEqual(self.requests[0][1]["x-codex-turn-state"], "client-affinity")

    async def test_concurrent_calls_have_unique_records(self):
        async def request():
            async with self.client.post(self.url + "/responses", json={"model": "gpt-6-astra"}) as r:
                await r.read()
        await asyncio.gather(*(request() for _ in range(6)))
        await self.flush()
        self.assertEqual(len(list((self.root / "wire/calls").glob("*.json"))), 6)

    async def test_capture_disk_failure_does_not_break_stream(self):
        with patch("capture.proxy.write_json", side_effect=OSError("disk full fixture")):
            async with self.client.post(self.url + "/responses") as r:
                self.assertIn(b"response.completed", await r.read())
            await self.flush()
        self.assertTrue(self.writer.errors)

    @staticmethod
    def native_events():
        message = {"id": "msg_fixture", "type": "message", "status": "completed", "role": "assistant",
                   "content": [{"type": "output_text", "text": "KIT_FIXTURE_OK", "annotations": []}]}
        response = {"id": "resp_native_fixture", "object": "response", "status": "completed",
                    "model": "gpt-6-astra", "output": [message],
                    "usage": {"input_tokens": 100, "input_tokens_details": {"cached_tokens": 80},
                              "output_tokens": 5, "output_tokens_details": {"reasoning_tokens": 0}, "total_tokens": 105}}
        return [{"type": "response.created", "response": {**response, "status": "in_progress", "output": []}},
                {"type": "response.output_item.added", "output_index": 0, "item": {**message, "status": "in_progress", "content": []}},
                {"type": "response.content_part.added", "item_id": message["id"], "output_index": 0, "content_index": 0,
                 "part": {"type": "output_text", "text": "", "annotations": []}},
                {"type": "response.output_text.delta", "item_id": message["id"], "output_index": 0, "content_index": 0, "delta": "KIT_FIXTURE_OK"},
                {"type": "response.output_text.done", "item_id": message["id"], "output_index": 0, "content_index": 0, "text": "KIT_FIXTURE_OK"},
                {"type": "response.output_item.done", "output_index": 0, "item": message},
                {"type": "response.completed", "response": response}]

    @unittest.skipUnless(os.environ.get("CODEX_KIT_TEST_JAIL"), "opt in to real CLI against a local mock")
    async def test_real_codex_cli_in_jail_with_mock_response(self):
        self.native_mode = True
        home, work = self.root / "home", self.root / "work"
        codex_home = home / ".codex"
        codex_home.mkdir(parents=True)
        work.mkdir()
        (codex_home / "auth.json").write_text(json.dumps({"OPENAI_API_KEY": "sk-fixture-" + "a" * 30}))
        (codex_home / "config.toml").write_text('model = "gpt-6-astra"\ncheck_for_update_on_startup = false\n')
        real = Path.home().resolve()
        catalog = real / ".codex/models_cache.json"
        if catalog.exists():
            shutil.copyfile(catalog, codex_home / catalog.name)
        subprocess.run(["git", "init", "--quiet", str(work)], check=True)
        codex = binary("codex")
        runtimes = [p for p in (real / ".npm-global", real / "miniforge3") if p.exists()]
        cmd = jail_command(bwrap_binary(codex), real, home, work, runtimes, [],
            [codex, "exec", "--json", "--strict-config", "-m", "gpt-6-astra", "-s", "read-only",
             "-c", 'openai_base_url=' + json.dumps(self.url), "Reply with KIT_FIXTURE_OK"])
        child = await asyncio.create_subprocess_exec(*cmd, env=environment(real), cwd="/",
                  stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, stderr = await asyncio.wait_for(child.communicate(), 30)
        except asyncio.TimeoutError:
            child.kill()
            stdout, stderr = await child.communicate()
            self.fail("CLI timeout: " + stderr.decode()[-3000:])
        self.assertEqual(child.returncode, 0, stderr.decode()[-5000:])
        self.assertIn(b"KIT_FIXTURE_OK", stdout)
        collect(codex_home, self.root / "export")
        report = analyze(self.root / "export")
        self.assertEqual(report["sessions"][0]["contexts"][0]["model"], "gpt-6-astra")
        self.assertEqual(report["usage"]["input_tokens"], 100)

    @unittest.skipUnless(os.environ.get("CODEX_KIT_TEST_JAIL"), "opt in to complete runner with a local mock")
    async def test_full_runner_archive_and_quality_gate(self):
        self.native_mode = True
        task = self.root / "task.md"
        task.write_text("Reply with KIT_FIXTURE_OK")
        exp = self.root / "smoke.toml"
        exp.write_text(f'task = {json.dumps(str(task))}\nwork_base = {json.dumps(str(self.root / "workbase"))}\n')
        auth = self.root / "auth.json"
        auth.write_text(json.dumps({"OPENAI_API_KEY": "sk-fixture-" + "a" * 30}))
        catalog = Path.home() / ".codex/models_cache.json"
        if catalog.exists():
            shutil.copyfile(catalog, self.root / catalog.name)
        kit = Path(__file__).resolve().parents[1]
        command = [sys.executable, str(kit / "run.py"), "smoke", "--exec", "--exp", str(exp),
                   "--auth-file", str(auth), "--runs", str(self.root / "runs"), "--upstream", self.url]
        child = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, stderr = await asyncio.wait_for(child.communicate(), 40)
        except asyncio.TimeoutError:
            child.kill()
            stdout, stderr = await child.communicate()
            self.fail("runner timeout: " + stderr.decode()[-3000:])
        self.assertEqual(child.returncode, 0, stdout.decode() + stderr.decode())
        out = self.root / "runs/smoke"
        manifest = json.loads((out / "manifest.json").read_text())
        self.assertTrue(manifest["quality"]["schema_evidence_ready"], manifest)
        self.assertFalse((out / ".private-home/.codex/auth.json").exists())
        self.assertTrue(auth.exists())
        self.assertTrue((out / "trajectory.md").exists())


class JailTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("CODEX_KIT_TEST_JAIL"), "opt in to Linux namespace integration")
    def test_fresh_view_hides_research_home(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home, work = root / "home", root / "work"
            (home / ".codex").mkdir(parents=True)
            work.mkdir()
            (home / ".codex/sentinel").write_text("isolated")
            real = Path.home().resolve()
            command = jail_command(bwrap_binary(binary("codex")), real, home, work, [], [],
                ["/bin/sh", "-c", 'test -f "$CODEX_HOME/sentinel" && test ! -e "$HOME/.claude" && test ! -e "$HOME/ws2" && test ! -e /tmp/codex-kit-stage && touch ./write-ok'])
            result = subprocess.run(command, env=environment(real), cwd="/", capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((work / "write-ok").is_file())


if __name__ == "__main__":
    unittest.main()
