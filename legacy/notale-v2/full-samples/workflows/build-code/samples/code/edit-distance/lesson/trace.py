def _copy_table(value):
    if not isinstance(value, list):
        return []
    return [list(row) if isinstance(row, list) else [] for row in value]


def _changed_cells(previous, current):
    changes = []
    for row, values in enumerate(current):
        for column, value in enumerate(values):
            old = previous[row][column] if row < len(previous) and column < len(previous[row]) else None
            if value != old:
                changes.append({"id": f"{row}-{column}", "role": "write"})
    return changes


def _step(source, target, table, active, cost, previous_state, complete=False):
    previous_table = _copy_table((previous_state or {}).get("table", []))
    row = active[0] if active else None
    column = active[1] if active else None
    dependencies = []
    if isinstance(row, int) and isinstance(column, int) and row > 0 and column > 0:
        dependencies = [[row - 1, column - 1], [row - 1, column], [row, column - 1]]
    focus = [
        {"id": f"{dependency[0]}-{dependency[1]}", "role": role}
        for dependency, role in zip(dependencies, ("diagonal", "delete", "insert"))
    ]
    if active:
        focus.append({"id": f"{row}-{column}", "role": "current"})

    if complete:
        operation = "完成"
        annotation = f"右下角汇总所有前缀问题；最少需要 {table[-1][-1]} 次编辑。"
    elif not active or row == 0 or column == 0:
        operation = "边界初始化"
        annotation = "空前缀只能通过连续插入或删除得到。"
    elif cost == 0:
        operation = "字符相同 · 沿对角线"
        annotation = f"{source[row - 1]} 与 {target[column - 1]} 相同，对角值无需增加代价。"
    else:
        operation = "取插入 / 删除 / 替换的最小值"
        annotation = f"{source[row - 1]} 与 {target[column - 1]} 不同，比较三个前缀子问题。"

    computed = sum(value is not None for values in table for value in values)
    return {
        "kind": "table",
        "state": {
            "source": source,
            "target": target,
            "table": table,
            "active": list(active) if active else None,
            "dependencies": dependencies,
            "operation": operation,
            "complete": complete,
        },
        "focus": focus,
        "changes": _changed_cells(previous_table, table),
        "metrics": {
            "已求单元": computed,
            "总单元": (len(source) + 1) * (len(target) + 1),
            "当前值": table[row][column] if active and table[row][column] is not None else "—",
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    if frame.f_code.co_name != "edit_distance" or not frame.f_code.co_filename.endswith("edit_distance.py"):
        return None
    values = frame.f_locals
    table = _copy_table(values.get("dp"))
    if not table:
        return None
    source = values.get("source", "")
    target = values.get("target", "")
    i = values.get("i")
    j = values.get("j")
    active = [i, j] if isinstance(i, int) and isinstance(j, int) and i < len(table) and j < len(table[i]) else None
    return _step(source, target, table, active, values.get("cost"), previous_state)


def finalize(namespace, previous_state):
    source = namespace.get("source", "")
    target = namespace.get("target", "")
    table = _copy_table(namespace.get("matrix"))
    active = [len(source), len(target)] if table else None
    return _step(source, target, table, active, None, previous_state, complete=True)
