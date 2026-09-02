#!/usr/bin/env python3
"""Persistent local preview server for this candidate."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import sys


OUTPUT = Path(__file__).resolve().parent
ROOT = OUTPUT / "pages"
LOG = OUTPUT / "server.log"
PID = OUTPUT / "server.pid"
HOST = "0.0.0.0"
PORT = 43208


def main() -> None:
    stream = LOG.open("w", encoding="utf-8", buffering=1)
    sys.stdout = stream
    sys.stderr = stream
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((HOST, PORT), handler)
    PID.write_text(f"{os.getpid()}\n", encoding="utf-8")
    print(f"Serving {ROOT} on {HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        stream.close()


if __name__ == "__main__":
    main()
