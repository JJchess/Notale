"""Isolated authenticated search probes; no production config or Planner changes."""
import argparse
import asyncio
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

BASE = "https://generativelanguage.googleapis.com/v1beta"
QUERIES = {
    "ensemble": "Leo Breiman portrait photograph Berkeley random forests",
    "neural": "Frank Rosenblatt perceptron portrait photograph Cornell",
    "photosynthesis": "chloroplast transmission electron micrograph thylakoid stroma",
    "photosynthesis-public": "chloroplast electron micrograph Wikimedia Commons",
}


def request(mode, query):
    prompt = ("Search the web now for this educational image need: " + query
              + ". Identify up to two source webpages containing a relevant real photograph or "
              "micrograph, not a generated image. Return the page title, source webpage URL, "
              "and direct image URL only if actually available from the retrieved source. "
              "Do not invent an image URL. If no suitable source was retrieved say so. Be concise.")
    if mode == "interactions":
        return BASE + "/interactions", {
            "model": "gemini-3.8-flash", "input": prompt,
            "tools": [{"type": "google_search"}],
        }
    if mode.startswith("native"):
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"maxOutputTokens": 4096},
        }
        if mode.startswith("native-mixed"):
            body["contents"][0]["parts"][0]["text"] += (
                " After actually searching, submit the sources using ReportSources, not a text answer.")
            body["tools"].append({"functionDeclarations": [{
                "name": "ReportSources", "description": "Submit the sources found by search.",
                "parameters": {"type": "OBJECT", "properties": {
                    "sources": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                        "page_url": {"type": "STRING"}, "image_url": {"type": "STRING"}},
                        "required": ["page_url"]}}}, "required": ["sources"]},
            }]})
        if mode == "native-mixed-circulated":
            body["toolConfig"] = {"includeServerSideToolInvocations": True}
        return BASE + "/models/gemini-3.8-flash:generateContent", body
    # Explicit capability probe: not a documented Chat Completions contract.
    return BASE + "/openai/chat/completions", {
        "model": "gemini-3.8-flash", "messages": [{"role": "user", "content": prompt}],
        "reasoning_effort": "low", "max_tokens": 4096,
        "tools": [{"type": "google_search"}],
    }


async def probe(mode, case, out, key):
    url, body = request(mode, QUERIES[case])
    headers = ({"Authorization": f"Bearer {key}"} if mode == "chat"
               else {"x-goog-api-key": key})
    started = time.monotonic()
    record = {"mode": mode, "case": case, "url": url, "request": body}
    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
            response = await client.post(url, headers=headers, json=body)
        record["http_status"] = response.status_code
        try:
            record["response"] = response.json()
        except ValueError:
            record["response_text"] = response.text[:3000]
    except httpx.HTTPError as exc:
        record["error"] = f"{type(exc).__name__}: {exc}"
    record["seconds"] = round(time.monotonic() - started, 2)
    (out / f"{case}-{mode}.json").write_text(redact(json.dumps(record, ensure_ascii=False, indent=2)))
    data = record.get("response", {})
    summary = {k: record[k] for k in ("mode", "case", "http_status", "seconds", "error") if k in record}
    summary["response_keys"] = list(data) if isinstance(data, dict) else []
    if "error" in data:
        summary["api_error"] = data["error"]
    if mode.startswith("native"):
        summary["grounding"] = [{k: v for k, v in c.get("groundingMetadata", {}).items()
                                 if k in ("webSearchQueries", "groundingChunks")}
                                for c in data.get("candidates", [])]
        summary["text"] = [p.get("text", "") for c in data.get("candidates", [])
                           for p in c.get("content", {}).get("parts", []) if not p.get("thought")]
        summary["function_calls"] = [p["functionCall"] for c in data.get("candidates", [])
                                     for p in c.get("content", {}).get("parts", []) if "functionCall" in p]
    if mode == "interactions":
        summary["step_types"] = [s.get("type") for s in data.get("steps", [])]
    print(redact(json.dumps(summary, ensure_ascii=False)), flush=True)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", nargs="+", choices=("chat", "native", "native-mixed", "native-mixed-circulated", "interactions"), required=True)
    ap.add_argument("--cases", nargs="+", choices=QUERIES, default=["ensemble"])
    ap.add_argument("--label", required=True)
    args = ap.parse_args()
    if Path(args.label).name != args.label or args.label in (".", ".."):
        ap.error("label must be a directory name")
    llm.config()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        ap.error("GEMINI_API_KEY missing; no request made")
    out = Path(__file__).resolve().parent / args.label
    out.mkdir(exist_ok=False)
    await asyncio.gather(*(probe(mode, case, out, key) for mode in args.modes for case in args.cases))


if __name__ == "__main__":
    asyncio.run(main())
