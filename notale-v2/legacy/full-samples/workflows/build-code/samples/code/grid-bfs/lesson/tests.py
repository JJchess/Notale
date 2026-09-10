from collections import deque


def _shortest_length(grid, start, goal):
    queue = deque([(start, 0)])
    seen = {start}
    while queue:
        (row, column), distance = queue.popleft()
        if (row, column) == goal:
            return distance
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            candidate = (row + dr, column + dc)
            r, c = candidate
            if grid[r][c] != "#" and candidate not in seen:
                seen.add(candidate)
                queue.append((candidate, distance + 1))
    return None


def run_tests(namespace):
    grid = namespace.get("grid", [])
    start = namespace.get("start")
    goal = namespace.get("goal")
    path = namespace.get("result", [])
    connected = all(
        abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1
        for a, b in zip(path, path[1:])
    )
    open_cells = all(grid[row][column] != "#" for row, column in path) if path else False
    shortest = _shortest_length(grid, start, goal)
    return [
        {
            "name": "路径连接起点与终点",
            "passed": bool(path) and path[0] == start and path[-1] == goal,
            "message": "结果路径必须从 S 开始并在 G 结束。",
            "expected": [start, "…", goal],
            "observed": path,
        },
        {
            "name": "每一步只走到相邻开放格",
            "passed": connected and open_cells,
            "message": "路径不能穿墙，也不能跨越格子。",
        },
        {
            "name": "BFS 给出最短步数",
            "passed": shortest is not None and len(path) - 1 == shortest,
            "message": "第一次抵达目标时的层数就是无权图最短距离。",
            "expected": shortest,
            "observed": len(path) - 1 if path else None,
        },
    ]
