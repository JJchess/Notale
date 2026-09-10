"""Read-only public source verification; no model calls, no inferred image URLs."""
import argparse
import concurrent.futures
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
sys.path.insert(0, str(ROOT))
from tools.shared.media import _public_connection
from core.redact import redact


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and attrs.get("src"):
            self.images.append({k: attrs[k] for k in ("src", "alt", "width", "height", "srcset") if k in attrs})
        if tag == "meta" and attrs.get("property") == "og:image":
            self.images.append({"src": attrs.get("content", ""), "kind": "og:image"})


def get(url):
    chain = []
    for _ in range(8):
        conn, parts = _public_connection(url, 25)
        try:
            conn.request("GET", (parts.path or "/") + ("?" + parts.query if parts.query else ""),
                         headers={"User-Agent": "Notale-source-verification/1.0"})
            res = conn.getresponse()
            chain.append({"url": url, "http_status": res.status})
            if res.status in (301, 302, 303, 307, 308) and res.getheader("Location"):
                url = urljoin(url, res.getheader("Location"))
                continue
            # Inspection fixture limit, not a production/planning gate.
            raw = res.read(2_000_001)
            return url, chain, res.getheader("Content-Type", ""), raw
        finally:
            conn.close()
    raise ValueError("too many source redirects")


def audit_one(item):
    url, kind = item
    row = {"url": url, "kind": kind}
    try:
        final, chain, mime, raw = get(url)
        row.update(final_url=final, chain=chain, content_type=mime, bytes_read=len(raw))
        if "html" in mime and chain[-1]["http_status"] == 200:
            parser = Images()
            html = raw.decode("utf-8", errors="replace")
            parser.feed(html)
            row["images"] = [{**img, "src": urljoin(final, img["src"])} for img in parser.images]
            title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
            row["title"] = title.group(1).strip() if title else ""
    except Exception as exc:
        row["error"] = f"{type(exc).__name__}: {exc}"
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("record", type=Path)
    args = ap.parse_args()
    data = json.loads(args.record.read_text())["response"]
    candidates = data.get("candidates", [])
    text = "\n".join(p.get("text", "") for c in candidates for p in c.get("content", {}).get("parts", []))
    targets = {url.rstrip(".,)*`"): "model_text" for url in re.findall(r'https?://[^\s<>]+', text)}
    for c in candidates:
        for chunk in c.get("groundingMetadata", {}).get("groundingChunks", []):
            uri = chunk.get("web", {}).get("uri")
            if uri:
                targets[uri] = "grounding_citation"
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(audit_one, targets.items()))
    dest = args.record.with_name(args.record.stem + "-sources.json")
    dest.write_text(redact(json.dumps(rows, ensure_ascii=False, indent=2)))
    for row in rows:
        print(json.dumps({k: row[k] for k in ("kind", "final_url", "chain", "error", "title", "images") if k in row}, ensure_ascii=False))


if __name__ == "__main__":
    main()
