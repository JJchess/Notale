from notale_trace import changed_indices


def _indices(frame, size):
    active = []
    for name in ("i", "j"):
        value = frame.f_locals.get(name)
        if isinstance(value, int) and 0 <= value < size:
            active.append({"role": name, "label": name, "index": value})
    return active


def _sorted_prefix(values):
    length = 1 if values else 0
    while length < len(values) and values[length - 1] <= values[length]:
        length += 1
    return length


def capture(frame, event, previous_state):
    values = frame.f_globals.get("numbers")
    if not isinstance(values, list):
        return None

    items = list(values)
    previous_items = previous_state.get("items", []) if isinstance(previous_state, dict) else []
    changes = [
        {"role": "write", "index": index}
        for index in changed_indices(previous_items, items)
    ]
    return {
        "kind": "sequence",
        "state": {"label": "numbers", "items": items},
        "focus": _indices(frame, len(items)),
        "changes": changes,
        "metrics": {"规模": len(items), "有序前缀": _sorted_prefix(items)},
        "annotation": "检查当前行执行后的数组、活动下标与写入位置。",
    }


def finalize(namespace, previous_state):
    values = list(namespace.get("numbers", []))
    previous_items = previous_state.get("items", []) if isinstance(previous_state, dict) else []
    return {
        "kind": "sequence",
        "state": {"label": "numbers", "items": values},
        "focus": [],
        "changes": [
            {"role": "write", "index": index}
            for index in changed_indices(previous_items, values)
        ],
        "metrics": {"规模": len(values), "有序前缀": _sorted_prefix(values)},
        "annotation": "程序结束；用测试确认顺序和元素是否都正确。",
    }
