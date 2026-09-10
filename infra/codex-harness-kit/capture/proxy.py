#!/usr/bin/env python3
"""Loopback reverse proxy: HTTP/SSE + Responses WebSocket, with asynchronous capture.

No retries, model rewrites, TLS interception, or forced SSE fallback. Headers needed
for Codex session affinity pass through. A capture failure marks the run unusable
without breaking the agent's network stream.
"""
import argparse
import asyncio
import gzip
import json
import os
import queue
import sys
import threading
import uuid
import zlib
from pathlib import Path
from urllib.parse import urlsplit

import aiohttp
from aiohttp import web
import zstandard

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture.common import now, scrub, secrets_from_auth, write_json

HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
       "te", "trailer", "transfer-encoding", "upgrade", "host"}
LIMIT = 128 * 1024 * 1024
CLIENT = web.AppKey("client", aiohttp.ClientSession)


def headers(source, websocket=False):
    blocked = HOP | {s.strip().lower() for s in source.get("Connection", "").split(",")}
    if websocket:
        blocked |= {k.lower() for k in source if k.lower().startswith("sec-websocket-")}
    return [(k, v) for k, v in source.items() if k.lower() not in blocked]


def decode_body(raw, encoding=""):
    if encoding == "gzip":
        raw = gzip.decompress(raw)
    elif encoding == "deflate":
        raw = zlib.decompress(raw)
    elif encoding == "zstd":
        raw = zstandard.ZstdDecompressor().stream_reader(raw).read(LIMIT + 1)
    elif encoding and encoding != "identity":
        raise ValueError("unsupported content encoding: " + encoding)
    if len(raw) > LIMIT:
        raise ValueError("decoded capture exceeds limit")
    text = raw.decode("utf-8")
    try:
        return json.loads(text)
    except ValueError:
        return text


def sse_events(text):
    events = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        data = "\n".join(x[5:].lstrip(" ") for x in block.splitlines() if x.startswith("data:"))
        if data and data != "[DONE]":
            try:
                events.append(json.loads(data))
            except ValueError:
                events.append({"unparsed_data": data})
    return events


class Writer:
    def __init__(self, out, secrets=()):
        self.out = Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        self.secrets = secrets
        self.q = queue.Queue(maxsize=512)
        self.errors = []
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def record(self, name, value, append=False):
        try:
            self.q.put_nowait((name, value, append))
        except queue.Full:
            self.fail("capture queue full: dropped record")

    def fail(self, error):
        if len(self.errors) < 20:
            self.errors.append(str(error))
            print("CAPTURE ERROR: " + str(error), file=sys.stderr, flush=True)

    def _run(self):
        while True:
            job = self.q.get()
            try:
                if job is None:
                    return
                name, value, append = job
                path = self.out / name
                if append:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with path.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(scrub(value, self.secrets), ensure_ascii=False) + "\n")
                    path.chmod(0o600)
                else:
                    write_json(path, value, self.secrets)
            except Exception as e:
                self.fail(e)
            finally:
                self.q.task_done()

    def close(self):
        self.q.put(None)
        self.thread.join()
        write_json(self.out / "capture-status.json", {"closed_at": now(), "errors": self.errors})


def create_app(upstream, writer):
    url = urlsplit(upstream)
    if url.scheme not in ("http", "https") or not url.netloc or url.query or url.fragment or url.username:
        raise ValueError("upstream must be an HTTP(S) base URL without credentials/query")
    app = web.Application(client_max_size=LIMIT, handler_args={"auto_decompress": False})

    async def lifecycle(app):
        async with aiohttp.ClientSession(auto_decompress=False, trust_env=True,
                timeout=aiohttp.ClientTimeout(total=None, sock_connect=30, sock_read=None),
                skip_auto_headers={"User-Agent", "Accept-Encoding", "Content-Type"}) as client:
            app[CLIENT] = client
            yield
        await asyncio.to_thread(writer.close)

    app.cleanup_ctx.append(lifecycle)

    async def relay(request):
        if request.path == "/_kit/health":
            return web.json_response({"ok": not writer.errors})
        target = upstream.rstrip("/") + request.raw_path
        capture_id = uuid.uuid4().hex
        if request.headers.get("Upgrade", "").lower() == "websocket":
            return await websocket(request, target, capture_id)
        record = {"capture_id": capture_id, "transport": "http", "started_at": now(),
                  "method": request.method, "path": request.raw_path,
                  "request_headers": dict(request.headers), "state": "in_progress"}
        response = None
        received = bytearray()
        try:
            raw = await request.read()
            try:
                record["request"] = decode_body(raw, request.headers.get("Content-Encoding", ""))
            except Exception as e:
                record["request_decode_error"] = str(e)
            writer.record(f"calls/{capture_id}.json", dict(record))
            async with app[CLIENT].request(request.method, target, data=raw,
                    headers=headers(request.headers), allow_redirects=False) as remote:
                record.update(status=remote.status, response_headers=dict(remote.headers))
                response = web.StreamResponse(status=remote.status, headers=headers(remote.headers))
                await response.prepare(request)
                async for chunk in remote.content.iter_any():
                    await response.write(chunk)  # relay first; never wait for capture disk IO
                    if "first_byte_at" not in record:
                        record["first_byte_at"] = now()
                    if len(received) + len(chunk) <= LIMIT:
                        received.extend(chunk)
                    else:
                        record["capture_truncated"] = True
                await response.write_eof()
                record["state"] = "complete"
        except Exception as e:
            record.update(state="transport_error", error=type(e).__name__ + ": " + str(e))
            if response is None or not response.prepared:
                response = web.json_response({"error": "capture upstream connection failed"},
                                             status=502, headers={"Retry-After": "2"})
            elif request.transport:
                request.transport.close()  # don't convert a partial upstream body into clean EOF
        finally:
            record["ended_at"] = now()
            try:
                encoding = next((v for k, v in record.get("response_headers", {}).items()
                                 if k.lower() == "content-encoding"), "")
                body = decode_body(bytes(received), encoding)
                record["response"] = body
                content_type = next((v for k, v in record.get("response_headers", {}).items()
                                     if k.lower() == "content-type"), "")
                if "text/event-stream" in content_type and isinstance(body, str):
                    record["events"] = sse_events(body)
                    terminals = [e for e in record["events"] if e.get("type") in
                                 ("response.completed", "response.failed", "response.incomplete")]
                    record["terminal_event"] = terminals[-1].get("type") if terminals else None
                    if not terminals:
                        record["capture_truncated"] = True
            except Exception as e:
                record["response_decode_error"] = str(e)
            writer.record(f"calls/{capture_id}.json", record)
        return response

    async def websocket(request, target, capture_id):
        name = f"ws/{capture_id}.jsonl"
        def log(kind, **data):
            writer.record(name, {"timestamp": now(), "type": kind, "connection_id": capture_id, **data}, True)
        log("connection.started", path=request.raw_path, request_headers=dict(request.headers))
        ws = None
        try:
            protocols = tuple(p.strip() for p in request.headers.get("Sec-WebSocket-Protocol", "").split(",") if p.strip())
            async with app[CLIENT].ws_connect(target, headers=headers(request.headers, True),
                    protocols=protocols, autoclose=False, autoping=False, max_msg_size=0,
                    compress=15 if "permessage-deflate" in request.headers.get("Sec-WebSocket-Extensions", "") else 0) as remote:
                ws = web.WebSocketResponse(autoclose=False, autoping=False, max_msg_size=0,
                                           protocols=(remote.protocol,) if remote.protocol else ())
                # Affinity/session headers may be needed by later requests.
                for k, v in headers(remote._response.headers, True):
                    if k.lower() not in ("content-length", "content-type"):
                        ws.headers[k] = v
                await ws.prepare(request)
                log("connection.opened", response_headers=dict(remote._response.headers))

                async def pump(source, destination, direction):
                    while True:
                        message = await source.receive()
                        if message.type == aiohttp.WSMsgType.TEXT:
                            await destination.send_str(message.data)
                            try:
                                payload = json.loads(message.data)
                            except ValueError:
                                payload = message.data
                            log("message", direction=direction, payload=payload)
                        elif message.type == aiohttp.WSMsgType.BINARY:
                            await destination.send_bytes(message.data)
                            log("binary.unparsed", direction=direction, bytes=len(message.data))
                        elif message.type == aiohttp.WSMsgType.PING:
                            await destination.ping(message.data)
                        elif message.type == aiohttp.WSMsgType.PONG:
                            await destination.pong(message.data)
                        elif message.type == aiohttp.WSMsgType.CLOSE:
                            log("close", direction=direction, code=message.data)
                            await destination.close(code=message.data or 1000, message=(message.extra or "").encode())
                            return
                        elif message.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                            if message.type == aiohttp.WSMsgType.ERROR:
                                log("connection.error", error=str(source.exception()))
                            return
                tasks = [asyncio.create_task(pump(ws, remote, "client")),
                         asyncio.create_task(pump(remote, ws, "server"))]
                try:
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for task in tasks:
                        if not task.done():
                            task.cancel()
                    result = await asyncio.gather(*tasks, return_exceptions=True)
                    for error in result:
                        if isinstance(error, Exception):
                            log("connection.error", error=str(error))
                    await ws.close()
        except aiohttp.WSServerHandshakeError as e:
            log("connection.error", error=str(e), status=e.status)
            return web.Response(status=e.status, headers={"Retry-After": "2"})
        except Exception as e:
            log("connection.error", error=type(e).__name__ + ": " + str(e))
            if ws is None or not ws.prepared:
                return web.Response(status=502, headers={"Retry-After": "2"})
            await ws.close(code=1011)
        finally:
            log("connection.ended")
        return ws

    app.router.add_route("*", "/{path:.*}", relay)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--ready", type=Path, required=True)
    parser.add_argument("--auth-file", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    writer = Writer(args.out, secrets_from_auth(args.auth_file))
    app = create_app(args.upstream, writer)
    async def serve():
        import signal
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, stop.set)
        runner = web.AppRunner(app, access_log=None, shutdown_timeout=5)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", args.port)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        write_json(args.ready, {"url": f"http://127.0.0.1:{port}", "pid": os.getpid()})
        try:
            await stop.wait()
        finally:
            await runner.cleanup()
    asyncio.run(serve())


if __name__ == "__main__":
    main()
