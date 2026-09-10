from notale_trace import changed_indices


def _algorithm(frame):
    filename = frame.f_code.co_filename.rsplit("/", 1)[-1]
    if filename.startswith("bubble_"):
        return "bubble"
    if filename.startswith("selection_"):
        return "selection"
    if filename.startswith("insertion_"):
        return "insertion"
    return "sorting"


def _sorted_prefix(values):
    length = 1 if values else 0
    while length < len(values) and values[length - 1] <= values[length]:
        length += 1
    return length


def _adjacent_inversions(values):
    return sum(left > right for left, right in zip(values, values[1:]))


def _focus(frame, algorithm, size):
    local = frame.f_locals
    active = []
    used = set()

    def add(index, role, label):
        if isinstance(index, int) and 0 <= index < size and index not in used:
            active.append({"role": role, "label": label, "index": index})
            used.add(index)

    if algorithm == "bubble":
        j = local.get("j")
        add(j, "compare-left", "j")
        add(j + 1 if isinstance(j, int) else None, "compare-right", "j+1")
        add(local.get("end"), "boundary", "end")
    elif algorithm == "selection":
        add(local.get("i"), "target", "i")
        add(local.get("min_idx"), "candidate", "min")
        add(local.get("j"), "scan", "j")
    elif algorithm == "insertion":
        j = local.get("j")
        add(local.get("i"), "key", "i")
        add(j, "compare", "j")
        add(j + 1 if isinstance(j, int) else None, "slot", "j+1")
    return active


def _metrics(algorithm, local, values, finished=False):
    size = len(values)
    metrics = {
        "规模": size,
        "相邻逆序": _adjacent_inversions(values),
    }
    if algorithm == "bubble":
        end = local.get("end", size - 1)
        metrics["固定后缀"] = size if finished else max(0, size - 1 - end)
    elif algorithm == "selection":
        i = local.get("i", 0)
        metrics["固定前缀"] = size if finished else max(0, min(size, i))
    elif algorithm == "insertion":
        metrics["有序前缀"] = size if finished else _sorted_prefix(values)
    return metrics


def _ranges(algorithm, local, values, finished=False):
    size = len(values)
    if not size:
        return []
    if finished:
        return [{"from": 0, "to": size - 1, "role": "proof", "label": "排序完成"}]
    if algorithm == "bubble":
        end = local.get("end")
        if isinstance(end, int) and end + 1 < size:
            return [{"from": end + 1, "to": size - 1, "role": "fixed", "label": "固定后缀"}]
    elif algorithm == "selection":
        index = local.get("i")
        if isinstance(index, int) and index > 0:
            return [{"from": 0, "to": min(size - 1, index - 1), "role": "fixed", "label": "固定前缀"}]
    elif algorithm == "insertion":
        length = _sorted_prefix(values)
        if length > 0:
            return [{"from": 0, "to": length - 1, "role": "sorted", "label": "有序前缀"}]
    return []


def _annotation(algorithm, focus, changes):
    if changes:
        positions = "、".join(str(change["index"]) for change in changes)
        return f"数组写入发生在下标 {positions}；柱高来自当前代码的真实状态。"
    if algorithm == "bubble" and focus:
        return "检查相邻元素；需要时交换，当前轮末端之外已经固定。"
    if algorithm == "selection" and focus:
        return "扫描未排序区间，并维护这一轮找到的最小值位置。"
    if algorithm == "insertion" and focus:
        return "比较 key 与有序前缀；较大元素会向右移动。"
    return "执行当前源码行，并记录 numbers 的状态。"


def _changes(previous_items, items):
    if not previous_items or len(previous_items) != len(items):
        return []
    return [
        {"role": "write", "index": index}
        for index in changed_indices(previous_items, items)
    ]


def capture(frame, event, previous_state):
    values = frame.f_globals.get("numbers")
    if not isinstance(values, list):
        return None

    items = list(values)
    previous_items = previous_state.get("items", []) if isinstance(previous_state, dict) else []
    changes = _changes(previous_items, items)
    algorithm = _algorithm(frame)
    focus = _focus(frame, algorithm, len(items))
    return {
        "kind": "sequence",
        "state": {
            "label": "numbers",
            "items": items,
            "ranges": _ranges(algorithm, frame.f_locals, items),
        },
        "focus": focus,
        "changes": changes,
        "metrics": _metrics(algorithm, frame.f_locals, items),
        "annotation": _annotation(algorithm, focus, changes),
    }


def finalize(namespace, previous_state):
    values = list(namespace.get("numbers", []))
    previous_items = previous_state.get("items", []) if isinstance(previous_state, dict) else []
    changes = _changes(previous_items, values)
    entry = str(namespace.get("__file__", ""))
    if "bubble" in entry:
        algorithm = "bubble"
    elif "selection" in entry:
        algorithm = "selection"
    elif "insertion" in entry:
        algorithm = "insertion"
    else:
        algorithm = "sorting"
    return {
        "kind": "sequence",
        "state": {
            "label": "numbers",
            "items": values,
            "ranges": _ranges(algorithm, {}, values, finished=True),
        },
        "focus": [],
        "changes": changes,
        "metrics": _metrics(algorithm, {}, values, finished=True),
        "annotation": "执行结束；测试将继续检查顺序、元素保留性与迁移输入。",
    }
