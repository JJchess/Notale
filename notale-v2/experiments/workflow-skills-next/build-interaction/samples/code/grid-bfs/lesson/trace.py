def _coord(value):
    if isinstance(value, tuple) and len(value) == 2:
        return [value[0], value[1]]
    return None


def _cell_id(value):
    return f"{value[0]}-{value[1]}"


def _path_to(node, parent):
    if node not in parent:
        return []
    path = []
    cursor = node
    while cursor is not None and len(path) <= len(parent):
        path.append(cursor)
        cursor = parent.get(cursor)
    path.reverse()
    return path


def _distances(parent):
    values = {}
    for node in parent:
        path = _path_to(node, parent)
        values[_cell_id(node)] = max(0, len(path) - 1)
    return values


def _step(grid, start, goal, queue, visited, parent, current, candidate, path, previous_state, complete=False):
    previous_ids = {
        f"{row}-{column}"
        for row, column in (previous_state or {}).get("visited", [])
    }
    additions = [node for node in sorted(visited) if _cell_id(node) not in previous_ids]
    focus = []
    if current is not None:
        focus.append({"id": _cell_id(current), "role": "current"})
    if candidate is not None:
        focus.append({"id": _cell_id(candidate), "role": "candidate"})
    focus.extend({"id": _cell_id(node), "role": "frontier"} for node in queue)

    visible_path = list(path or _path_to(current, parent))
    if complete and visible_path:
        annotation = f"目标首次出队；沿 parent 回溯得到 {len(visible_path) - 1} 步最短路。"
    elif additions:
        annotation = f"首次发现格点 {additions[-1]}，记录前驱并压入队尾。"
    elif current is not None:
        annotation = f"展开 {current}；队列中的格点属于当前或下一距离层。"
    else:
        annotation = "从 S 开始，让波前按距离逐层扩散。"

    return {
        "kind": "grid",
        "state": {
            "grid": list(grid),
            "start": _coord(start),
            "goal": _coord(goal),
            "visited": [_coord(node) for node in sorted(visited)],
            "queue": [_coord(node) for node in queue],
            "current": _coord(current),
            "candidate": _coord(candidate),
            "distances": _distances(parent),
            "path": [_coord(node) for node in visible_path],
            "complete": complete,
        },
        "focus": focus,
        "changes": [{"id": _cell_id(node), "role": "discover"} for node in additions],
        "metrics": {
            "已发现": len(visited),
            "队列长度": len(queue),
            "当前距离": max(0, len(_path_to(current, parent)) - 1) if current is not None else 0,
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    values = frame.f_globals
    grid = values.get("grid")
    queue = values.get("queue")
    visited = values.get("visited")
    parent = values.get("parent")
    if not isinstance(grid, list) or queue is None or not isinstance(visited, set) or not isinstance(parent, dict):
        return None
    return _step(
        grid,
        values.get("start"),
        values.get("goal"),
        list(queue),
        set(visited),
        dict(parent),
        values.get("current"),
        values.get("candidate"),
        values.get("path", []),
        previous_state,
    )


def finalize(namespace, previous_state):
    return _step(
        namespace.get("grid", []),
        namespace.get("start"),
        namespace.get("goal"),
        list(namespace.get("queue", [])),
        set(namespace.get("visited", set())),
        dict(namespace.get("parent", {})),
        namespace.get("current"),
        namespace.get("candidate"),
        namespace.get("path", []),
        previous_state,
        complete=True,
    )
