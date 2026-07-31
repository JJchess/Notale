#!/usr/bin/env python3
# 本地静态服务器：确保 .mjs / .wasm 以正确 MIME 返回（Pyodide 以 ES module 方式加载 pyodide.asm.mjs）
import http.server, os

PORT = 8778
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".css": "text/css",
    }
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    # ThreadingHTTPServer: 浏览器会并发保持多条 keep-alive 连接（Pyodide 同时拉多个资源），
    # 单线程服务器会死锁 —— 必须多线程。
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving demo/ at http://127.0.0.1:{PORT}")
        httpd.serve_forever()
