"""用逐轮边松弛核对 BFS 距离，不用另一份 BFS 自证。"""


def distances(graph, start):
    nodes = set(graph) | {v for vs in graph.values() for v in vs} | {start}
    result = {start: 0}
    for _ in range(len(nodes) - 1):
        previous = dict(result)
        for u, vs in graph.items():
            if u in previous:
                for v in vs:
                    result[v] = min(result.get(v, len(nodes)), previous[u] + 1)
    return result


def run_tests(namespace):
    bfs, path = namespace["bfs"], namespace["shortest_path"]
    graph, start = namespace["GRAPH"], namespace["START"]
    result = bfs(graph, start)
    dist, parent, order = result["dist"], result["parent"], result["order"]
    rows = []

    def check(name, passed):
        rows.append({"name": name, "passed": bool(passed)})

    check("距离与独立边松弛参照一致", dist == distances(graph, start))
    check("节点不重复出队，且覆盖全部可达节点", len(order) == len(set(order)) and set(order) == set(dist))
    check("出队顺序的距离不递减", all(dist[a] <= dist[b] for a, b in zip(order, order[1:])))
    check("前驱是实际边，且距离相差一", parent[start] is None and all(
        u in graph.get(parent[u], []) and dist[u] == dist[parent[u]] + 1 for u in dist if u != start))
    check("每条重建路径的长度与最短距离一致", all(
        (p := path(parent, u)) and p[0] == start and p[-1] == u and len(p) - 1 == dist[u]
        and all(b in graph.get(a, []) for a, b in zip(p, p[1:])) for u in dist))
    fixture = {"x": ["y"], "y": ["x", "z"], "z": [], "isolated": []}
    check("环、孤立节点和不同起点", all(bfs(fixture, s)["dist"] == distances(fixture, s) for s in fixture))
    check("不可达目标返回空路径", path(bfs(fixture, "x")["parent"], "isolated") == [])
    check("只有起点的图", bfs({}, "only")["dist"] == {"only": 0})
    return rows
