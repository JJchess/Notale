"""Verify one native tool-history round trip using the already recorded search."""
import json
import os
from pathlib import Path
import sys
import time

import httpx

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
sys.path.insert(0, str(ROOT))
from core import llm
from core.redact import redact

llm.config()
source = Path(__file__).resolve().parent / "mixed-b/ensemble-native-mixed-circulated.json"
dest = source.with_name("ensemble-replay.json")
if dest.exists():
    raise SystemExit("Replay evidence already exists; no request made")
original = json.loads(source.read_text())
body = original["request"]
content = original["response"]["candidates"][0]["content"]
calls = [p["functionCall"] for p in content["parts"] if "functionCall" in p]
assert calls, "no custom function call to replay"
body["contents"] += [content, {"role": "user", "parts": [{"functionResponse": {
    "name": call["name"], "id": call["id"],
    "response": {"recorded": True, "note": "Protocol probe accepted the source list; this is not image download verification. Acknowledge briefly; no more search needed."},
}} for call in calls]}]
started = time.monotonic()
response = httpx.post(original["url"], headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                      json=body, timeout=120, follow_redirects=False)
record = {"url": original["url"], "request": body, "http_status": response.status_code,
          "seconds": round(time.monotonic() - started, 2), "response": response.json()}
with dest.open("x") as file:
    file.write(redact(json.dumps(record, ensure_ascii=False, indent=2)))
print(redact(json.dumps({"http_status": response.status_code, "seconds": record["seconds"],
    "parts": [p for c in record["response"].get("candidates", [])
              for part in c.get("content", {}).get("parts", []) if "text" in part and not part.get("thought")
              for p in [{"text": part["text"]}]],
    "error": record["response"].get("error")}, ensure_ascii=False)))
