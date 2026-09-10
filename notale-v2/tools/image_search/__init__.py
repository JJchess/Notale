"""One grounded Gemini request, then ordinary public HTTP image retrieval."""
from __future__ import annotations

SCHEMA = {"type": "function", "name": "ImageSearch",
     "description": "搜索并下载图片候选，返回来源、可用路径、图片及实际错误；查看后按内容需要选用。",
     "parameters": {"type": "object", "properties": {
         "query": {"anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}, "minItems": 1}],
                   "description": "要找的图片及用途，说明主体与图片类型；多个需求用数组一次提交"},
         "count": {"type": "integer", "minimum": 1, "description": "每个需求的候选数，默认 3"}},
         "required": ["query"], "additionalProperties": False}}

from html.parser import HTMLParser
import http.client
import json
import os
from pathlib import Path
import time
from urllib.parse import unquote, urljoin, urlsplit

import httpx

from ..shared import media
from core.redact import redact

MODEL = "gemini-3.8-flash"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def queries_of(query) -> list[str]:
    queries = [query] if isinstance(query, str) else query
    if not isinstance(queries, list) or not queries or any(
            not isinstance(q, str) or not q.strip() for q in queries):
        raise ValueError("query 必须是非空字符串或非空字符串数组")
    return queries


def request_body(queries: list[str], count: int) -> dict:
    schema = {"type": "object", "properties": {"queries": {
        "type": "array", "items": {"type": "object", "properties": {
            "query_index": {"type": "integer"},
            "results": {"type": "array", "items": {"type": "object", "properties": {
                "title": {"type": "string"}, "page_url": {"type": "string"},
                "image_url": {"type": "string"}}, "required": ["title", "page_url"]}}},
            "required": ["query_index", "results"]}}}, "required": ["queries"]}
    prompt = (
        "Search the web now for each image need below. Return up to " + str(count)
        + " existing image candidates per need, matching the requested subject, image type, "
        "and teaching purpose. Prefer image detail pages and original sources. A page about the "
        "topic is not enough: identify a specific image serving the stated purpose, not a generic "
        "article cover. Return its source page and an actually found direct image_url "
        "for a PNG/JPEG/WebP/GIF image. Wikimedia Commons File: detail pages may omit "
        "image_url: this tool resolves their main image. An ordinary article or PDF page URL "
        "alone is not a downloadable image candidate. Never invent URLs. Preserve every "
        "query_index, with empty results if neither form is found for the need. "
        "Do not generate images.\n" + json.dumps([
            {"query_index": i, "query": q} for i, q in enumerate(queries)], ensure_ascii=False))
    return {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "tools": [{"google_search": {}}],
            "toolConfig": {"includeServerSideToolInvocations": True},
            "generationConfig": {"thinkingConfig": {"thinkingLevel": "low"},
                                 "responseMimeType": "application/json",
                                 "responseJsonSchema": schema}}


class PageImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth, self.image = 0, None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div":
            if self.depth or (attrs.get("id") == "file" and
                              "fullImageLink" in attrs.get("class", "").split()):
                self.depth += 1
        elif tag == "img" and self.depth and self.image is None:
            self.image = attrs.get("src")

    def handle_endtag(self, tag):
        if tag == "div" and self.depth:
            self.depth -= 1


def _commons_file(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.hostname == "commons.wikimedia.org" and unquote(parsed.path).startswith("/wiki/File:")


def page_images(url: str, deadline: float) -> tuple[str, list[str]]:
    """Locate the Commons file's main raster image, never unrelated page images."""
    for _ in range(6):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("来源页读取超时")
        conn, parsed = media._public_connection(url, min(30, remaining))
        try:
            conn.request("GET", (parsed.path or "/") + ("?" + parsed.query if parsed.query else ""),
                         headers={"User-Agent": "Notale-image-search/1.0"})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location:
                    raise ValueError("来源页重定向缺少 Location")
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise OSError(f"来源页 HTTP {response.status}: {response.reason}")
            if not _commons_file(url):
                raise ValueError("来源不是 Commons 文件详情页")
            if "html" not in (response.getheader("Content-Type") or "").lower():
                raise ValueError("来源页不是 HTML")
            # Bound parser memory, not the number of searches or assets in a deck.
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError("来源页超过 HTML 解析器的安全大小")
            parser = PageImages()
            parser.feed(raw.decode("utf-8", errors="replace"))
            return url, [urljoin(url, parser.image)] if parser.image else []
        finally:
            conn.close()
    raise ValueError("来源页重定向过多")


def download_candidate(item: dict, out: Path, index: int, deadline: float) -> dict:
    row = {"source": "gemini-google-search", "title": item.get("title", ""),
           "page_url": item.get("page_url", ""), "download_attempts": []}
    seen = set()

    def attempt(url):
        if not isinstance(url, str) or not url or url in seen:
            return False
        seen.add(url)
        evidence = {"url": url}
        row["download_attempts"].append(evidence)
        try:
            path, w, h = media._download_image(url, out, index, deadline)
            row.update(url=url, file=path.name, w=w, h=h)
            return True
        except (OSError, ValueError, http.client.HTTPException) as exc:
            evidence["error"] = media._error("download", exc)["message"]
            return False

    if not isinstance(row["page_url"], str) or not row["page_url"]:
        row["error"] = "候选缺少来源页地址"
        return row
    if not _commons_file(row["page_url"]):
        if attempt(item.get("image_url")):
            row["extracted_from"] = "search_response"
        else:
            row["error"] = (row["download_attempts"][-1]["error"] if row["download_attempts"]
                            else "候选未提供图片直链")
        return row
    try:
        final_url, urls = page_images(row["page_url"], deadline)
        row["resolved_page_url"] = final_url
        for url in urls:
            if attempt(url):
                row["extracted_from"] = "source_html"
                return row
        row["error"] = "Commons 主图缺失或无法下载"
    except (OSError, ValueError, http.client.HTTPException) as exc:
        row["error"] = media._error("source_page", exc)["message"]
    return row


def search(query, count: int, out: Path) -> tuple[list[dict], list[dict]]:
    queries = queries_of(query)
    # Reuse environment loading only, not the Planner's model/history/transport.
    from core.llm import config
    config()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("未配置 GEMINI_API_KEY；此检索未执行，改搜索词不能修复配置")
    body = request_body(queries, count)
    started = time.monotonic()
    journal = {"model": MODEL, "endpoint": ENDPOINT, "request": body}
    rows, errors = [], []
    batch = isinstance(query, list)

    def error(exc, index=None):
        entry = media._error("gemini-google-search", exc)
        if batch and index is not None:
            entry["query_index"] = index
        errors.append(entry)

    try:
        response = httpx.post(ENDPOINT, headers={"x-goog-api-key": key}, json=body,
                              timeout=120, follow_redirects=False)
        journal["http_status"] = response.status_code
        try:
            journal["response"] = response.json()
        except ValueError:
            response.raise_for_status()
            raise ValueError("Gemini 成功响应不是 JSON") from None
        response.raise_for_status()
        journal["request_seconds"] = round(time.monotonic() - started, 3)
        data = journal["response"]
        candidates = data.get("candidates", []) if isinstance(data, dict) else []
        if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
            raise ValueError("Gemini 未返回候选响应，不是正常零结果")
        candidate = candidates[0]
        if candidate.get("finishReason") != "STOP":
            raise ValueError(f"Gemini 响应未完整结束：{candidate.get('finishReason')}")
        model_content = candidate.get("content")
        parts = model_content.get("parts") if isinstance(model_content, dict) else None
        if not isinstance(parts, list) or any(not isinstance(p, dict) for p in parts):
            raise ValueError("Gemini 响应缺少有效 content.parts")
        calls = [p.get("toolCall") for p in parts]
        has_search = any(isinstance(c, dict) and c.get("toolType") == "GOOGLE_SEARCH_WEB" for c in calls)
        grounding = candidate.get("groundingMetadata")
        if not has_search and not (isinstance(grounding, dict) and grounding.get("webSearchQueries")):
            raise ValueError("Gemini 未返回 Google 搜索执行记录，不能确认这些候选来自实际搜索")
        texts = [p.get("text", "") for p in parts if not p.get("thought")]
        if any(not isinstance(t, str) for t in texts):
            raise ValueError("Gemini 返回了非字符串 text")
        content = "".join(texts)
        payload = json.loads(content)
        groups = payload.get("queries") if isinstance(payload, dict) else None
        if not isinstance(groups, list):
            raise ValueError("Gemini 响应缺少 queries 数组，不是正常零结果")
        by_index = {}
        for group in groups:
            idx = group.get("query_index") if isinstance(group, dict) else None
            if type(idx) is not int or not 0 <= idx < len(queries) or idx in by_index:
                error(ValueError("Gemini 返回无效或重复的 query_index"))
                continue
            by_index[idx] = group
        deadline = time.monotonic() + 300
        for idx in range(len(queries)):
            group = by_index.get(idx)
            if group is None or not isinstance(group.get("results"), list):
                error(ValueError("Gemini 漏交此需求的 results，不是正常零结果"), idx)
                continue
            seen = set()
            accepted = 0
            for item in group["results"]:
                if accepted >= count:
                    break
                if not isinstance(item, dict) or any(not isinstance(item.get(k), str)
                                                     for k in ("title", "page_url")):
                    error(ValueError("Gemini 图片候选格式错误"), idx)
                    continue
                identity = (item["page_url"], item.get("image_url") or "")
                if not isinstance(identity[1], str):
                    error(ValueError("Gemini image_url 不是字符串"), idx)
                    continue
                if identity in seen:
                    continue
                seen.add(identity)
                accepted += 1
                row = download_candidate(item, out, len(rows), deadline)
                if batch:
                    row["query_index"] = idx
                rows.append(row)
    except (OSError, ValueError, httpx.HTTPError) as exc:
        error(exc)
    finally:
        journal["seconds"] = round(time.monotonic() - started, 3)
        journal["errors"] = errors
        (out / "provider.json").write_text(redact(json.dumps(journal, ensure_ascii=False, indent=2)))
    return rows, errors
