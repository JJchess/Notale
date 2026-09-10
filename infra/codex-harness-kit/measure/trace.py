#!/usr/bin/env python3
"""Codex evidence tables. Original payloads and names stay in the archive."""
import argparse
import collections
import difflib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture.common import rows, write_json
from capture.collect import parent_id
from measure.capabilities import tool_declarations, summarize as summarize_capabilities

CALLS = {"function_call", "custom_tool_call", "local_shell_call"}
OUTPUTS = {"function_call_output", "custom_tool_call_output", "local_shell_call_output"}
TOKENS = ("input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
          "reasoning_output_tokens", "total_tokens")


def seconds(timestamp):
    try:
        return datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError, AttributeError):
        return None


def text_content(items):
    if isinstance(items, str):
        return items
    if not isinstance(items, list):
        return ""
    return "\n".join(x.get("text", "") for x in items if isinstance(x, dict))


def field_paths(value, prefix=""):
    if isinstance(value, dict):
        for k, v in value.items():
            path = f"{prefix}.{k}" if prefix else k
            yield path
            yield from field_paths(v, path)
    elif isinstance(value, list):
        for v in value:
            yield from field_paths(v, prefix + "[]")


def analyze_session(path, base):
    sid, meta, model, effort, turn_id = None, {}, None, None, None
    calls, outputs, usage, reasoning, timings, messages = [], {}, {}, [], [], []
    warnings, contexts, lifecycle, compactions = [], [], [], []
    fields = collections.Counter()
    fallback_total = None
    encrypted = 0
    timestamps = []
    seen_calls = set()
    open_turns = set()
    for line, row, error in rows(path):
        ref = {"file": str(path.relative_to(base)), "line": line}
        if error:
            warnings.append({**ref, "error": "malformed JSONL: " + error})
            continue
        fields.update(set(field_paths(row)))
        timestamp = row.get("timestamp")
        if seconds(timestamp) is not None:
            timestamps.append(seconds(timestamp))
        kind, p = row.get("type"), row.get("payload", {})
        if not isinstance(p, dict):
            warnings.append({**ref, "error": "payload is not an object"})
            continue
        typ = p.get("type")
        if kind == "session_meta":
            meta = p
            sid = p.get("id") or p.get("session_id")
        elif kind == "turn_context":
            model, effort, turn_id = p.get("model"), p.get("effort"), p.get("turn_id")
            contexts.append({"model": model, "effort": effort, "turn_id": turn_id, **ref})
        elif kind == "token_usage_record":
            rid = p.get("response_id")
            if not rid:
                warnings.append({**ref, "error": "token_usage_record missing response_id; excluded from per-response sum"})
                continue
            entry = {"response_id": rid, "model": model, "effort": effort,
                     "thread_id": p.get("thread_id", sid), "turn_id": p.get("turn_id", turn_id),
                     "usage": p.get("usage"), "timestamp": timestamp, **ref}
            if rid in usage and usage[rid]["usage"] != entry["usage"]:
                warnings.append({**ref, "error": "conflicting usage for " + rid + "; latest record retained"})
            usage[rid] = entry
        elif kind == "response_item":
            if typ in CALLS:
                cid = p.get("call_id") or p.get("id")
                if not cid:
                    cid = f"missing:{line}"
                    warnings.append({**ref, "error": "tool call has no native ID"})
                if cid in seen_calls:
                    warnings.append({**ref, "error": "repeated call_id (possible fork/replay): " + cid})
                    continue
                seen_calls.add(cid)
                calls.append({"session_id": sid, "turn_id": turn_id, "model": model,
                    "effort": effort, "call_id": cid, "name": p.get("name", typ),
                    "arguments": p.get("arguments", p.get("input", p.get("action"))),
                    "timestamp": timestamp, **ref})
            elif typ in OUTPUTS:
                outputs[p.get("call_id") or p.get("id")] = {"timestamp": timestamp, "output": p.get("output"), **ref}
            elif typ == "reasoning":
                summary = text_content(p.get("summary"))
                visible = text_content(p.get("content"))
                encrypted += bool(p.get("encrypted_content"))
                if summary or visible:
                    reasoning.append({"timestamp": timestamp, "summary": summary,
                                      "visible_content": visible, **ref})
            elif typ == "message":
                messages.append({"timestamp": timestamp, "role": p.get("role"),
                    "phase": p.get("phase"), "text": text_content(p.get("content")), **ref})
        elif kind == "compacted":
            compactions.append({"timestamp": timestamp, **ref})
        elif kind == "event_msg":
            if typ == "token_count" and isinstance(p.get("info"), dict):
                total = p["info"].get("total_token_usage")
                if total is not None:
                    fallback_total = total  # cumulative snapshot, never sum every event
            elif typ in ("task_started", "task_complete", "task_completed", "turn_aborted", "error"):
                lifecycle.append({"type": typ, "turn_id": p.get("turn_id"), "timestamp": timestamp, **ref})
                tid = p.get("turn_id") or turn_id or "unknown"
                if typ == "task_started":
                    open_turns.add(tid)
                elif typ in ("task_complete", "task_completed", "turn_aborted"):
                    open_turns.discard(tid)
                if typ == "turn_aborted":
                    warnings.append({**ref, "error": "turn aborted", "turn_id": tid})
            elif typ == "context_compacted":
                compactions.append({"timestamp": timestamp, **ref})
            elif typ == "item_completed":
                item = p.get("item", {})
                timings.append({"type": item.get("type"), "id": item.get("id"),
                    "started_at_ms": p.get("started_at_ms"), "completed_at_ms": p.get("completed_at_ms"), **ref})
    for call in calls:
        output = outputs.get(call["call_id"])
        call["result"] = output
        a, b = seconds(call["timestamp"]), seconds(output["timestamp"]) if output else None
        call["observed_result_delay_s"] = b - a if a is not None and b is not None and b >= a else None
    incomplete = [c["call_id"] for c in calls if c["result"] is None]
    if incomplete:
        warnings.append({"error": "tool results missing (interrupted/live/forked capture)", "call_ids": incomplete})
    if open_turns:
        warnings.append({"error": "turns without completion (live/interrupted capture)", "turn_ids": sorted(open_turns)})
    if usage:
        total = {k: sum(u["usage"][k] for u in usage.values())
                 if all(isinstance(u["usage"], dict) and isinstance(u["usage"].get(k), (int, float))
                        for u in usage.values()) else None for k in TOKENS}
        usage_source = "token_usage_record deduplicated by response_id"
    else:
        total = fallback_total
        usage_source = "last cumulative token_count (no request attribution)" if total else "unavailable"
    if not sid:
        warnings.append({"error": "session_meta missing"})
    return {"session_id": sid, "parent_session_id": parent_id(meta), "forked_from_id": meta.get("forked_from_id"),
        "source": meta.get("source"), "cli_version": meta.get("cli_version"), "contexts": contexts,
        "first_timestamp_s": min(timestamps) if timestamps else None,
        "last_timestamp_s": max(timestamps) if timestamps else None,
        "observed_span_s": max(timestamps) - min(timestamps) if timestamps else None,
        "tools": dict(collections.Counter(c["name"] for c in calls)), "calls": calls,
        "usage_records": list(usage.values()), "usage": total, "usage_source": usage_source,
        "reasoning": reasoning, "encrypted_reasoning_items": encrypted, "messages": messages,
        "item_timings": timings, "lifecycle": lifecycle, "compactions": compactions,
        "warnings": warnings, "fields": dict(fields)}


def wire_summary(run):
    wire = run / "wire"
    result = {"http_calls": 0, "websocket_connections": 0, "response_requests": 0,
              "completed_response_ids": [], "issues": [], "request_fields": collections.Counter()}
    completed = set()
    declared = set()
    for path in sorted((wire / "calls").glob("*.json")):
        call = json.loads(path.read_text())
        result["http_calls"] += 1
        request = call.get("request")
        if isinstance(request, dict):
            result["request_fields"].update(set(field_paths(request)))
            declared.update(tool_declarations(request))
        is_response = call.get("path", "").split("?")[0].endswith("/responses")
        result["response_requests"] += bool(is_response)
        if call.get("state") != "complete" or call.get("capture_truncated") or call.get("request_decode_error") or call.get("response_decode_error"):
            result["issues"].append(str(path.relative_to(run)) + ": incomplete/undecodable capture")
        for event in call.get("events", []):
            response = event.get("response", {})
            if event.get("type") == "response.completed" and response.get("id"):
                completed.add(response["id"])
        if is_response and isinstance(call.get("response"), dict):
            response = call["response"]
            if response.get("status") == "completed" and response.get("id"):
                completed.add(response["id"])
    for path in sorted((wire / "ws").glob("*.jsonl")):
        result["websocket_connections"] += 1
        ended = False
        pending = 0
        for line, row, error in rows(path):
            if error:
                result["issues"].append(f"{path.name}:{line}: malformed")
                continue
            typ = row.get("type")
            ended |= typ == "connection.ended"
            if typ in ("connection.error", "binary.unparsed"):
                result["issues"].append(f"{path.name}:{line}: {typ}")
            payload = row.get("payload", {})
            if typ == "message" and isinstance(payload, dict):
                if row.get("direction") == "client":
                    result["request_fields"].update(set(field_paths(payload)))
                    declared.update(tool_declarations(payload))
                    result["response_requests"] += payload.get("type") == "response.create"
                    if payload.get("type") == "response.create" and payload.get("generate") is not False:
                        pending += 1
                elif payload.get("type") == "response.completed":
                    pending = max(0, pending - 1)
                    rid = payload.get("response", {}).get("id")
                    if rid:
                        completed.add(rid)
                elif payload.get("type") in ("response.failed", "response.incomplete"):
                    pending = max(0, pending - 1)
                elif payload.get("type") == "error":
                    result["issues"].append(f"{path.name}:{line}: Responses error event")
        if not ended:
            result["issues"].append(path.name + ": connection did not close in capture")
        if pending:
            result["issues"].append(f"{path.name}: {pending} response.create without terminal event")
    status = wire / "capture-status.json"
    if status.exists():
        result["issues"].extend(json.loads(status.read_text()).get("errors", []))
    elif wire.exists():
        result["issues"].append("capture-status.json missing: proxy not cleanly closed")
    result["completed_response_ids"] = sorted(completed)
    result["request_fields"] = dict(result["request_fields"])
    result["capabilities"] = summarize_capabilities(declared)
    return result


def analyze(run):
    run = Path(run)
    sessions = [analyze_session(p, run) for p in sorted((run / "sessions").glob("*.jsonl"))]
    warnings = [w for s in sessions for w in s["warnings"]]
    if not sessions:
        warnings.append({"error": "no archived native sessions"})
    wire = wire_summary(run)
    manifest = json.loads((run / "manifest.json").read_text()) if (run / "manifest.json").exists() else {}
    expected = manifest.get("model")
    for s in sessions:
        if expected and any(c["model"] != expected for c in s["contexts"]):
            warnings.append({"error": "observed model differs from requested", "session_id": s["session_id"]})
        if s["forked_from_id"]:
            warnings.append({"error": "forked history: inherited tokens/actions must not be treated as a fresh run", "session_id": s["session_id"]})
    all_usage = {u["response_id"]: u for s in sessions for u in s["usage_records"]}
    missing_wire = sorted(set(all_usage) - set(wire["completed_response_ids"]))
    if all_usage and len(all_usage) != sum(len(s["usage_records"]) for s in sessions):
        warnings.append({"error": "response IDs shared across sessions; aggregate deduplicated"})
    # Exact request sum is possible only when every lane has native per-response usage.
    total = None
    if sessions and all(s["usage_records"] for s in sessions):
        total = {k: sum(u["usage"][k] for u in all_usage.values())
                 if all(isinstance(u["usage"], dict) and isinstance(u["usage"].get(k), (int, float))
                        for u in all_usage.values()) else None for k in TOKENS}
    ids = {s["session_id"] for s in sessions}
    missing_parents = [s["parent_session_id"] for s in sessions if s["parent_session_id"] and s["parent_session_id"] not in ids]
    if missing_parents:
        warnings.append({"error": "missing parent sessions", "ids": missing_parents})
    changes = None
    if (run / "initial-files.json").exists() and (run / "final-files.json").exists():
        before = json.loads((run / "initial-files.json").read_text())
        after = json.loads((run / "final-files.json").read_text())
        changes = {"created": sorted(set(after) - set(before)), "deleted": sorted(set(before) - set(after)),
                   "modified": sorted(k for k in before.keys() & after.keys() if before[k] != after[k])}
    report = {"schema_version": 1, "sessions": sessions, "usage": total,
        "unique_usage_response_count": len(all_usage), "cost_usd": None,
        "cost_note": "unpriced; ChatGPT subscription usage is not an API invoice",
        "wire": wire, "missing_wire_response_ids": missing_wire, "warnings": warnings,
        "net_file_changes": changes,
        "limits": ["reasoning summaries/visible content only; encrypted content is not full thinking",
                   "observed result delays are not API inference latency; no inferred request parallelism",
                   "functions.exec bodies stay verbatim; embedded calls are not guessed from regex",
                   "rollouts do not reconstruct exact API requests or server-side compaction state"]}
    write_json(run / "summary.json", report)
    write_json(run / "capabilities.json", wire["capabilities"])
    with (run / "actions.jsonl").open("w") as out:
        for s in sessions:
            for c in s["calls"]:
                out.write(json.dumps(c, ensure_ascii=False) + "\n")
    fields = collections.Counter()
    for s in sessions:
        fields.update(s["fields"])
    write_json(run / "fields.json", {"native": dict(fields), "request": wire["request_fields"]})
    reasoning = ["# Codex 可见推理与摘要\n\n不是隐藏思考全文；不解密 encrypted_content。\n"]
    for s in sessions:
        for r in s["reasoning"]:
            reasoning.append(f"\n## {s['session_id']} · {r['timestamp']}\n\n来源 `{r['file']}:{r['line']}`\n\n{r['summary']}\n{r['visible_content']}\n")
    (run / "reasoning.md").write_text("".join(reasoning))
    (run / "trajectory.md").write_text(render(report))
    return report


def render(report):
    lines = ["# Codex 轨迹测量\n", f"会话 {len(report['sessions'])}；可归属用量的 response {report['unique_usage_response_count']}。",
             f"\nToken（缓存输入是 input 的子集，reasoning 是 output 的子集）：`{json.dumps(report['usage'])}`",
             "\n金额：未计价。缺失数据保留为 unknown，不当作零。\n"]
    for s in report["sessions"]:
        lines += [f"## {s['session_id']}\n", f"父会话：{s['parent_session_id']}；模型/effort：{[(c['model'],c['effort']) for c in s['contexts']]}",
                  f"\n工具步数 {len(s['calls'])}；观测跨度 {s['observed_span_s']} 秒；用量来源：{s['usage_source']}。",
                  "\n动作序列：\n\n" + " → ".join(c["name"] for c in s["calls"]) + "\n",
                  f"\n工具分布：`{json.dumps(s['tools'], ensure_ascii=False)}`\n"]
    lines += ["## 证据完整性\n", f"HTTP {report['wire']['http_calls']}；WS {report['wire']['websocket_connections']}；缺请求层完成证据的 response {len(report['missing_wire_response_ids'])}。",
              f"\n文件净变化（不是编辑次数）：`{json.dumps(report['net_file_changes'], ensure_ascii=False)}`\n",
              "\n" + json.dumps(report["warnings"] + report["wire"]["issues"], ensure_ascii=False, indent=2),
              "\n" + "\n".join("- " + s for s in report["limits"]) + "\n"]
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("run", type=Path)
    p.add_argument("--compare", type=Path)
    args = p.parse_args()
    report = analyze(args.run)
    if args.compare:
        other = analyze(args.compare)
        def main_sequence(r):
            return [c["name"] for s in r["sessions"] if not s["parent_session_id"] for c in s["calls"]]
        print("\n".join(difflib.unified_diff(main_sequence(report), main_sequence(other),
                          fromfile=str(args.run), tofile=str(args.compare), lineterm="")))
    else:
        print(render(report))


if __name__ == "__main__":
    main()
