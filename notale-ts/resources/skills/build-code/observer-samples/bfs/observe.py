"""在 bfs 开始、每次真实出队、每次完整入队和返回时取快照；不重新执行搜索。"""
_graph, _start, _last = None, None, None


def snapshot(stage, dist, parent, queue, order, newly=None):
    nodes = list(dict.fromkeys([*_graph, *(v for vs in _graph.values() for v in vs), _start]))
    order = list(order)
    done = stage == "done"
    return {"stage": stage, "nodes": nodes,
            "edges": [[u, v] for u, vs in _graph.items() for v in vs],
            "start": _start, "dist": dict(dist), "parent": dict(parent),
            "queue": list(queue), "order": order,
            "processed": order if done else order[:-1],
            "current": None if done or not order else order[-1],
            "newly": newly, "path": [], "target": None}


def observe(context):
    global _graph, _start, _last
    local = context.locals  # 只读映射，使用 .get()；并不是 dict 实例。
    if context.function == "bfs" and context.event == "call":
        _graph, _start = dict(local["graph"]), local["start"]
        # 起点入队、距离为 0 是 BFS 的定义，不是计算结果。
        _last = snapshot("initial", {_start: 0}, {_start: None}, [_start], [])
        return _last
    if context.event != "return" or _last is None:
        return None
    if context.function == "dequeue":
        _last = snapshot("dequeue", _last["dist"], _last["parent"], local["queue"], local["order"])
        return _last
    if context.function == "discover":
        _last = snapshot("discover", local["dist"], local["parent"], local["queue"], _last["order"],
                         newly=local["neighbor"])
        return _last
    if context.function == "bfs":
        result = context.return_value
        _last = snapshot("done", result["dist"], result["parent"], [], result["order"])
        return _last
    if context.function == "shortest_path":
        return {**_last, "stage": "path", "path": list(context.return_value),
                "target": local["target"]}
    return None
