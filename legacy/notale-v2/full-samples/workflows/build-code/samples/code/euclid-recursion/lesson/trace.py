def _stack(frame):
    frames = []
    current = frame
    while current is not None:
        if current.f_code.co_name == "gcd" and current.f_code.co_filename.endswith("euclid.py"):
            a = current.f_locals.get("a")
            b = current.f_locals.get("b")
            if isinstance(a, int) and isinstance(b, int):
                frames.append((a, b))
        current = current.f_back
    frames.reverse()
    return frames


def _records(values):
    return [
        {
            "id": f"call-{depth}",
            "depth": depth,
            "a": a,
            "b": b,
            "quotient": a // b if b else None,
            "remainder": a % b if b else 0,
        }
        for depth, (a, b) in enumerate(values)
    ]


def _full_sequence(a, b):
    values = []
    while isinstance(a, int) and isinstance(b, int):
        values.append((a, b))
        if b == 0:
            break
        a, b = b, a % b
    return values


def _step(values, previous_state, event="line", complete=False, result=None):
    frames = _records(values)
    previous_ids = {row.get("id") for row in (previous_state or {}).get("frames", [])}
    additions = [row for row in frames if row["id"] not in previous_ids]
    current = frames[-1] if frames else None

    if complete:
        annotation = f"余数降到 0；最后一个非零除数 {result} 就是最大公约数。"
    elif current and current["b"] == 0:
        annotation = f"到达基例 gcd({current['a']}, 0)，开始把 {current['a']} 返回给上层。"
    elif event == "return" and current:
        annotation = f"当前递归帧求值完成，结果将沿调用栈向上返回。"
    elif current:
        annotation = f"{current['a']} = {current['quotient']} × {current['b']} + {current['remainder']}，下一层只保留除数与余数。"
    else:
        annotation = "每一层把问题缩成 gcd(b, a mod b)。"

    return {
        "kind": "call-stack",
        "state": {
            "frames": frames,
            "phase": "complete" if complete else event,
            "result": result,
            "complete": complete,
        },
        "focus": [{"id": current["id"], "role": "current"}] if current else [],
        "changes": [{"id": row["id"], "role": "call"} for row in additions],
        "metrics": {
            "递归深度": len(frames),
            "当前余数": current["remainder"] if current else 0,
            "结果": result if result is not None else "—",
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    values = _stack(frame)
    if not values:
        return None
    return _step(values, previous_state, event=event)


def finalize(namespace, previous_state):
    values = _full_sequence(namespace.get("initial_a"), namespace.get("initial_b"))
    return _step(values, previous_state, complete=True, result=namespace.get("result"))
