def _path(previous, target):
    path = []
    seen = set()
    while target is not None and target not in seen:
        seen.add(target)
        path.append(target)
        target = previous.get(target)
    return list(reversed(path))


def run_tests(namespace):
    expected = {"A": 0, "B": 3, "C": 2, "D": 8, "E": 10, "F": 13}
    distances = namespace.get("distances")
    previous = namespace.get("previous")
    solver = namespace.get("dijkstra")

    transfer_graph = {
        "S": {"T": 2},
        "T": {"S": 2, "U": 1},
        "U": {"T": 1},
        "X": {},
    }
    transfer_distances = None
    transfer_error = ""
    if callable(solver):
        try:
            transfer_distances, _ = solver(transfer_graph, "S")
        except Exception as exc:
            transfer_error = f"{type(exc).__name__}: {exc}"
    else:
        transfer_error = "没有找到 dijkstra(graph, start) 函数。"

    transfer_ok = (
        not transfer_error
        and transfer_distances == {"S": 0, "T": 2, "U": 3, "X": float("inf")}
    )
    return [
        {
            "name": "得到所有最短距离",
            "passed": distances == expected,
            "message": "每个结果都应等于从 A 出发的最小路径权重。",
            "expected": expected,
            "observed": distances,
        },
        {
            "name": "前驱可以还原最短路径",
            "passed": isinstance(previous, dict)
            and _path(previous, "F") == ["A", "C", "B", "D", "E", "F"],
            "message": "到 F 的前驱链应构成权重为 13 的路径。",
            "expected": ["A", "C", "B", "D", "E", "F"],
            "observed": _path(previous, "F") if isinstance(previous, dict) else previous,
        },
        {
            "name": "不可达节点保持无穷远",
            "passed": transfer_ok,
            "message": transfer_error or "新图中的 X 不可达，其距离应保持为无穷大。",
            "expected": {"S": 0, "T": 2, "U": 3, "X": "inf"},
            "observed": transfer_distances,
        },
    ]
