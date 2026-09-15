"""在真实出队、完整入队和返回时取快照；不重新执行搜索。"""
_last = None


def snapshot(local, stage, newly=None):
    graph = local["graph"]
    nodes = list(dict.fromkeys([*graph, *(v for vs in graph.values() for v in vs), local["start"]]))
    order = list(local["order"])
    done = stage == "done"
    return {"stage": stage, "nodes": nodes,
            "edges": [[u, v] for u, vs in graph.items() for v in vs],
            "start": local["start"], "dist": dict(local["dist"]),
            "parent": dict(local["parent"]), "queue": list(local["queue"]),
            "order": order, "processed": order if done else order[:-1],
            "current": None if done or not order else order[-1],
            "newly": newly, "path": [], "target": None}


def observe(context):
    global _last
    local = context.locals  # 只读映射，使用 .get()；并不是 dict 实例。
    if context.function == "bfs":
        if "order" not in local:
            _last = None
            return None
        if context.event == "return":
            state = snapshot(local, "done")
        elif context.event == "line":
            if _last is None:
                state = snapshot(local, "initial")
            elif len(local["order"]) > len(_last["order"]):
                state = snapshot(local, "dequeue")
            else:
                added = set(local["dist"]) - set(_last["dist"])
                if len(added) != 1:
                    return None
                node = next(iter(added))
                # 等前驱和队列同步完成，不能读取半次入队。
                if node not in local["parent"] or node not in local["queue"]:
                    return None
                state = snapshot(local, "discover", node)
        else:
            return None
        _last = state
        return state
    if context.function == "shortest_path" and context.event == "return" and _last:
        path = context.return_value
        return {**_last, "stage": "path", "path": list(path),
                "target": local["target"]}
    return None
