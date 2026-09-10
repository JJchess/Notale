"""Retired transcript analysis; recover with the recorded baseline if needed."""

from collections import defaultdict
from typing import Iterable
from core.trace import TraceRow
from .wire import Usage

def usage_of(rows: Iterable[TraceRow]) -> Usage:
    """一组同 requestId 的行,取真实 usage。

    坑:只有最后一行的 usage 是完整的,前面几行(thinking / text)带占位值。
    这里取 output_tokens 最大的那一行,而不是第一行、也不是字面上的最后一行
    —— 行序在并发写入下不保证。
    """
    best, out = Usage(), -1
    for r in rows:
        u = (r.message or {}).get("usage") or {}
        if (u.get("output_tokens") or 0) > out:
            out = u.get("output_tokens") or 0
            best = Usage(**{k: v for k, v in u.items() if k in Usage.model_fields})
    return best


def responses(rows: Iterable[TraceRow]) -> dict[str, list[TraceRow]]:
    """按 requestId 分组 = 按「一次 API 响应」分组。

    坑:按行数判断并行度会得出「其实是串行的」这种错误结论 —— 一次响应本来
    就会落成三四行。并行度要看的是有多少个不同的 requestId 在时间上重叠。
    """
    g: dict[str, list[TraceRow]] = defaultdict(list)
    for r in rows:
        if r.requestId:
            g[r.requestId].append(r)
    return dict(g)


def span(parent_rows: list[TraceRow], child_rows: list[TraceRow]) -> tuple[str, str]:
    """一个 subagent 真正的起止时刻。

    两个坑叠在一起:
    1. 父 agent 那条 tool_result 的 timestamp 是**派发**时刻,不是完成时刻。
       用它算时长会得到一片 0:00。完成时间只能从子 agent 自己的行(isSidechain)取。
    2. 同一条消息里的多个 Agent 调用是**边流式输出边派发**的,不是同时起跑。
       实测 14 个 brief 的派发时刻拉开了 6:24。所以派发和起跑必须分两个时刻记。
    """
    dispatched = min(r.timestamp for r in parent_rows)
    finished = max(r.timestamp for r in child_rows if r.isSidechain)
    return dispatched, finished
