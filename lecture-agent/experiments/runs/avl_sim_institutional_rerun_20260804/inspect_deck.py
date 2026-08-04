import json
from pathlib import Path


deck = json.loads((Path(__file__).parent / "deck.lecture.json").read_text(encoding="utf-8"))
pages = deck.get("pages") or deck.get("scenes") or deck.get("content", {}).get("pages") or deck.get("lecture", {}).get("pages")
if pages is None:
    print(deck.keys())
    raise SystemExit(1)
for index, page in enumerate(pages, start=1):
    blocks = ", ".join(f"{block.get('type')}:{block.get('id')}" for block in page.get("blocks", []))
    print(f"{index:02d} | {page.get('title') or page.get('headline')} | {blocks}")
    for block in page.get("blocks", []):
        if block.get("type") in {"quiz", "chart", "formula", "compare", "list", "callout", "diagram", "runnable", "code"}:
            compact = json.dumps(block, ensure_ascii=False)
            print("   ", compact[:1000])
