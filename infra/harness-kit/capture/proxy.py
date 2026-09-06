#!/usr/bin/env python3
"""Logging reverse proxy for the Anthropic API.

Every /v1/messages call is written to <outdir>/NNNN-*.json with the exact request
body (system prompt, tool schemas, full message history) and the exact response
(assembled back from the SSE stream). Start it here, then launch Claude Code with
ANTHROPIC_BASE_URL pointing at it.

    python3 proxy.py --out ./llm_calls/run-01
    ANTHROPIC_BASE_URL=http://127.0.0.1:8788 claude ...
"""

import argparse
import hashlib
import http.client
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REDACT = re.compile(r"authorization|api-key|cookie", re.I)
HOP = {"host", "content-length", "accept-encoding", "connection", "transfer-encoding"}

_lock = threading.Lock()
_seq = 0


def next_seq():
    global _seq
    with _lock:
        _seq += 1
        return _seq


def resume_seq(outdir: Path):
    """从已有文件接着编号。

    proxy 中途重启(比如打了补丁)时,序号如果从 0001 重来,会把上半场的记录
    直接覆盖掉,而且是静默的。
    """
    global _seq
    ns = [int(m.group(1)) for p in outdir.glob("*.json")
          if (m := re.match(r"(\d{4})-", p.name))]
    _seq = max(ns, default=0)
    if _seq:
        print(f"接着 {_seq:04d} 往下编号(目录里已有 {len(ns)} 个文件)")


def sse_to_message(raw: str) -> dict:
    """Rebuild the final assistant message from a streamed response."""
    msg, blocks = {}, []
    for line in raw.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except ValueError:
            continue
        t = ev.get("type")
        if t == "message_start":
            msg = ev.get("message", {}) or {}
        elif t == "content_block_start":
            blocks.append(ev.get("content_block", {}) or {})
        elif t == "content_block_delta" and blocks:
            d, b = ev.get("delta", {}) or {}, blocks[-1]
            if "text" in d:
                b["text"] = b.get("text", "") + d["text"]
            if "thinking" in d:
                b["thinking"] = b.get("thinking", "") + d["thinking"]
            if "partial_json" in d:
                b["_partial_json"] = b.get("_partial_json", "") + d["partial_json"]
        elif t == "message_delta":
            msg.setdefault("usage", {}).update((ev.get("usage") or {}))
            msg.update({k: v for k, v in (ev.get("delta") or {}).items()})
    for b in blocks:
        if "_partial_json" in b:
            # 先取出再解析。流被截断时 JSON 会不完整,那时也不能让异常逃出去 ——
            # handler 一崩,客户端就收到破损响应并重试,等于我们自己把被测对象拖慢了。
            partial = b.pop("_partial_json") or "{}"
            try:
                b["input"] = json.loads(partial)
            except Exception:
                b["input"] = {"_unparsed": partial}
    msg["content"] = blocks
    return msg


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    outdir: Path
    upstream: str
    _headers_sent = False

    def log_message(self, fmt, *args):
        pass

    def _relay(self, method: str):
        """外壳:保证任何情况下客户端都能收到一个像样的 HTTP 响应。

        以前这里没有保护。上游抖一下、或者客户端自己走开,异常就冒到 socketserver,
        它把连接一关了事 —— 客户端收到的是「socket 断了但没有状态码」,判成 API error;
        又因为没有 retry-after 可读,退避算成 0,于是原地猛刷。
        观测工具把被测对象打挂了,这是最不能接受的一类 bug。
        """
        self._headers_sent = False
        try:
            self._relay_inner(method)
        except (BrokenPipeError, ConnectionResetError):
            # 客户端自己走了(Ctrl-C、Esc、切换会话)。不是故障,没什么可回的。
            self.close_connection = True
        except Exception as e:
            print(f"[relay failed] {self.path} {type(e).__name__}: {e}", flush=True)
            self._fail(502, f"logging proxy: {type(e).__name__}: {e}")

    def _fail(self, status: int, msg: str):
        """回一个带 retry-after 的正经错误。

        retry-after 是这里的关键:没有它,客户端算出的退避是 0,会立刻重来。
        """
        if self._headers_sent:
            self.close_connection = True  # body 写到一半,只能闭嘴
            return
        payload = json.dumps(
            {"type": "error", "error": {"type": "api_error", "message": msg}}
        ).encode("utf-8")
        try:
            self.send_response_only(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.send_header("retry-after", "2")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(payload)
            self.wfile.flush()
        except Exception:
            pass
        self.close_connection = True

    def _connect(self, attempts: int = 3):
        """只重试**建连**。

        conn.request() 一旦发出去,上游就可能已经在计费和生成了;那之后失败再重发
        等于凭空多一次调用。所以重试的边界严格卡在 connect() 之前。
        """
        last = None
        for i in range(attempts):
            conn = http.client.HTTPSConnection(self.upstream, timeout=900)
            try:
                conn.connect()
                return conn
            except OSError as e:
                last = e
                conn.close()
                print(f"[connect retry {i + 1}/{attempts}] {type(e).__name__}: {e}",
                      flush=True)
                time.sleep(0.5 * (i + 1))
        raise last

    def _relay_inner(self, method: str):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)) or None
        fwd = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        fwd["accept-encoding"] = "identity"

        conn = self._connect()
        conn.request(method, self.path, body=body, headers=fwd)
        resp = conn.getresponse()

        self.send_response_only(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in HOP:
                self.send_header(k, v)
        self.send_header("Connection", "close")
        self.end_headers()
        self._headers_sent = True
        self.close_connection = True

        chunks = []
        while True:
            # 必须是 read1 不能是 read。
            # read(n) 会阻塞到攒满 n 字节或整个流结束才返回 —— 实测慢速流上
            # read(8192) 第一次返回要 6.08s,read1(8192) 是 0.00s。
            # 扩展思考期间模型只发极小的 ping,攒满 8KB 要很久,这段时间客户端
            # 一个字节都收不到,直接判超时。它等的不是模型,是我的缓冲区。
            chunk = resp.read1(8192)
            if not chunk:
                break
            chunks.append(chunk)
            try:
                self.wfile.write(chunk)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                break
        conn.close()

        if "/v1/messages" in self.path:
            # 记录只是观测,绝不能影响被测对象:任何解析问题都吞掉并留痕,
            # 不让异常冒到 handler 层导致连接被断、触发客户端重试。
            try:
                self._record(method, body, resp.status, b"".join(chunks))
            except Exception as e:
                print(f"[record failed] {type(e).__name__}: {e}", flush=True)

    def _record(self, method, body, status, raw_bytes):
        raw = raw_bytes.decode("utf-8", "replace")
        try:
            req = json.loads(body or b"{}")
        except ValueError:
            req = {"_unparsed": (body or b"").decode("utf-8", "replace")}
        truncated = False
        if raw.lstrip().startswith("event:") or "data:" in raw[:200]:
            resp_obj, streamed = sse_to_message(raw), True
            # 流没跑完就断了。以前这种也照样记成 status 200,usage 停在
            # message_start 的占位值上(见过 out=3 的 Write),看起来像成功 ——
            # 采集里最危险的一类记录:它把故障伪装成正常样本。
            truncated = "message_stop" not in raw and "message_delta" not in raw
        else:
            streamed = False
            try:
                resp_obj = json.loads(raw or "{}")
            except ValueError:
                resp_obj = {"_unparsed": raw}

        # 主 agent / subagent 的区分:session_id 和 metadata 两者完全相同,分不开;
        # 可靠标记是 system prompt 首块 billing header 里的 cc_is_subagent=true。
        # 同一批并行 subagent 之间再按 system prompt 全文哈希分组(每个 subagent
        # 的 system 各不相同,能稳定区分是哪一个)。
        sysb = req.get("system") or []
        systext = ("".join(b.get("text", "") for b in sysb)
                   if isinstance(sysb, list) else (sysb or ""))
        is_sub = "cc_is_subagent=true" in systext
        lane = "sub" if is_sub else "main"
        lane_id = hashlib.sha256(systext.encode("utf-8")).hexdigest()[:8]

        n = next_seq()
        out = self.outdir / f"{n:04d}-{lane}-{lane_id}.json"
        out.write_text(
            json.dumps(
                {
                    "seq": n,
                    "lane": lane,
                    "lane_id": lane_id,
                    "method": method,
                    "path": self.path,
                    "status": status,
                    "streamed": streamed,
                    "truncated": truncated,
                    "request_headers": {
                        k: ("<redacted>" if REDACT.search(k) else v)
                        for k, v in self.headers.items()
                    },
                    "request": req,
                    "response": resp_obj,
                    "raw_response": raw,   # 流式响应也留原始 SSE,重组万一丢东西还能回查
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        u = resp_obj.get("usage") or {}
        tools = [
            b.get("name")
            for b in (resp_obj.get("content") or [])
            if isinstance(b, dict) and b.get("type") == "tool_use"
        ]
        print(
            ("[TRUNCATED] " if truncated else "")
            + f"[{n:04d}] {lane:<4} {lane_id} {req.get('model', '?')} msgs={len(req.get('messages') or [])} "
            f"in={u.get('input_tokens', '?')} cache_r={u.get('cache_read_input_tokens', 0)} "
            f"out={u.get('output_tokens', '?')} tool_use={','.join(filter(None, tools)) or '-'}",
            flush=True,
        )

    def do_POST(self):
        self._relay("POST")

    def do_GET(self):
        self._relay("GET")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--out", default="./llm_calls")
    ap.add_argument("--upstream", default="api.anthropic.com")
    a = ap.parse_args()

    outdir = Path(a.out).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    Handler.outdir, Handler.upstream = outdir, a.upstream
    resume_seq(outdir)
    print(f"logging {a.upstream} -> {outdir}")
    print(f"ANTHROPIC_BASE_URL=http://127.0.0.1:{a.port}")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
