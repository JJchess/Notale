#!/usr/bin/env python3
"""预览用的静态服务。默认端口 4175。

    python3 demos/lawn-path/serve.py [端口]

和 `python3 -m http.server` 的唯一区别：每个响应都带 `Cache-Control: no-store`。
不带这一条时 http.server 只发 Last-Modified，浏览器会按启发式规则自己决定缓存多久、
连 304 都不去问，于是改完文件刷新看到的还是旧版 —— 表现为「样式对不上、版式全乱」，
很容易被当成代码 bug 去查。
"""

import functools
import http.server
import sys
from pathlib import Path


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4175
    handler = functools.partial(NoStore, directory=str(Path(__file__).parent))
    # 必须是 ThreadingHTTPServer：单线程的 TCPServer 会被浏览器的预连接
    # （建了连接但迟迟不发请求）堵死整个 accept 循环，表现为服务「挂了」。
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print(f"http://127.0.0.1:{port}/")
        httpd.serve_forever()
