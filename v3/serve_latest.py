"""Serve v3 artifacts and keep ``/`` pointed at the newest completed deck."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit


ROOT = Path(__file__).resolve().parent


def newest_deck(root: Path = ROOT) -> Path | None:
    """Return the most recently written run deck, ignoring incomplete runs."""
    decks = (path for path in (root / "runs").glob("*/deck.html") if path.is_file())
    return max(decks, key=lambda path: path.stat().st_mtime_ns, default=None)


def deck_url(deck: Path, root: Path = ROOT) -> str:
    relative = deck.resolve().relative_to(root.resolve())
    return "/" + "/".join(quote(part) for part in relative.parts)


class LatestDeckHandler(SimpleHTTPRequestHandler):
    """Static file handler with a dynamic latest-deck entry point."""

    server_version = "NotalePreview/1.0"

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if urlsplit(self.path).path in {"/", "/latest", "/latest/"}:
            self._serve_latest(head_only=False)
            return
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802 - stdlib handler API
        if urlsplit(self.path).path in {"/", "/latest", "/latest/"}:
            self._serve_latest(head_only=True)
            return
        super().do_HEAD()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _serve_latest(self, *, head_only: bool) -> None:
        root = Path(self.directory)
        deck = newest_deck(root)
        if deck is not None:
            self.send_response(302)
            self.send_header("Location", deck_url(deck, root))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        body = (
            "<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=3>"
            "<title>Notale preview</title><style>body{font:18px system-ui;"
            "max-width:48rem;margin:12vh auto;padding:2rem}</style>"
            "<h1>还没有可预览的讲义</h1><p>完成一次 v3 pipeline run 后，"
            "此页面会自动跳转到最新的 deck.html。</p>"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve the newest v3 Reveal.js deck")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=3001, type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    handler = partial(LatestDeckHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    latest = newest_deck()
    print(f"Notale preview: http://localhost:{args.port}/", flush=True)
    print(f"Latest deck: {latest or 'waiting for first completed run'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
