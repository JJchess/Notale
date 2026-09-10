POSITIONS = {
    "A": (80, 230), "B": (240, 82), "C": (240, 370),
    "D": (440, 120), "E": (440, 342), "F": (620, 230),
}


def _edge_id(source, target):
    return "--".join(sorted((str(source), str(target))))


def _edges(graph):
    edges = []
    seen = set()
    for source, neighbors in graph.items():
        for target, weight in neighbors.items():
            edge_id = _edge_id(source, target)
            if edge_id in seen:
                continue
            seen.add(edge_id)
            edges.append({
                "id": edge_id,
                "source": str(source),
                "target": str(target),
                "weight": weight,
            })
    return edges


def _distance_label(value):
    return "∞" if value == float("inf") else str(value)


def _queue_items(queue, visited):
    best = {}
    for item in queue:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        distance, node = item[0], item[1]
        if node in visited:
            continue
        if node not in best or distance < best[node]:
            best[node] = distance
    return [
        {"node": str(node), "distance": distance}
        for node, distance in sorted(best.items(), key=lambda item: (item[1], str(item[0])))
    ]


def _state(graph, distances, previous, visited, queue):
    queued = {item["node"] for item in _queue_items(queue, visited)}
    nodes = []
    for node in graph:
        node_id = str(node)
        label = _distance_label(distances.get(node, float("inf")))
        if node in visited:
            status = "settled"
        elif node_id in queued:
            status = "frontier"
        else:
            status = "unseen"
        item = {
            "id": node_id,
            "label": node_id,
            "distance": label,
            "parent": str(previous[node]) if previous.get(node) is not None else None,
            "status": status,
        }
        if node_id in POSITIONS:
            item["x"], item["y"] = POSITIONS[node_id]
        nodes.append(item)
    return {
        "nodes": nodes,
        "edges": _edges(graph),
        "queue": _queue_items(queue, visited),
        "relax": None,
        "complete": False,
    }


def _distance_map(state):
    return {
        node["id"]: node.get("distance")
        for node in (state or {}).get("nodes", [])
    }


def _changed_nodes(previous_state, state):
    previous = _distance_map(previous_state)
    if not previous:
        return []
    return [
        {"id": node["id"], "role": "distance"}
        for node in state["nodes"]
        if previous.get(node["id"]) != node.get("distance")
    ]


def _relaxation(graph, current, neighbor, current_distance, candidate, state, previous_state, changes):
    if current not in graph or neighbor not in graph:
        return None
    weight = graph[current].get(neighbor)
    if not all(isinstance(value, (int, float)) for value in (weight, current_distance, candidate)):
        return None
    if candidate != current_distance + weight:
        return None

    node_id = str(neighbor)
    previous_distances = _distance_map(previous_state)
    current_distances = _distance_map(state)
    changed = any(item.get("id") == node_id for item in changes)
    known = previous_distances.get(node_id) if changed else current_distances.get(node_id)
    return {
        "from": str(current),
        "to": node_id,
        "base": current_distance,
        "weight": weight,
        "candidate": candidate,
        "known": known if known is not None else "∞",
        "accepted": True if changed else None,
    }


def _step(
    graph,
    distances,
    previous,
    visited,
    queue,
    current,
    neighbor,
    current_distance,
    candidate,
    previous_state,
):
    state = _state(graph, distances, previous, visited, queue)
    changes = _changed_nodes(previous_state, state)
    state["relax"] = _relaxation(
        graph,
        current,
        neighbor,
        current_distance,
        candidate,
        state,
        previous_state,
        changes,
    )

    focus = []
    if current in graph:
        focus.append({"id": str(current), "role": "current"})
    elif state["queue"]:
        focus.append({"id": state["queue"][0]["node"], "role": "frontier"})
    if neighbor in graph:
        focus.append({"id": str(neighbor), "role": "neighbor"})
        focus.append({"id": _edge_id(current, neighbor), "role": "edge"})

    if changes:
        names = "、".join(change["id"] for change in changes)
        annotation = f"写入节点 {names} 的暂定距离，并把新候选加入优先队列。"
    elif state["relax"]:
        data = state["relax"]
        annotation = f"比较候选距离 {data['candidate']} 与节点 {data['to']} 的当前距离。"
    elif current in graph:
        annotation = f"取出节点 {current}；随后逐条检查相邻边。"
    else:
        annotation = "起点 A 的距离为 0，优先队列先处理 A。"

    metrics = {"已确定": len(visited), "待处理节点": len(state["queue"])}
    if state["relax"]:
        metrics["候选距离"] = state["relax"]["candidate"]
    return {
        "kind": "network",
        "state": state,
        "focus": focus,
        "changes": changes,
        "metrics": metrics,
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    graph = frame.f_globals.get("graph")
    if not isinstance(graph, dict):
        return None
    local = frame.f_locals
    queue = local.get("queue")
    if not isinstance(queue, list):
        return None

    distances = local.get("distances", frame.f_globals.get("distances", {}))
    previous = local.get("previous", frame.f_globals.get("previous", {}))
    visited = local.get("visited", set())
    return _step(
        graph,
        distances if isinstance(distances, dict) else {},
        previous if isinstance(previous, dict) else {},
        visited if isinstance(visited, set) else set(),
        queue,
        local.get("node"),
        local.get("neighbor"),
        local.get("current_distance"),
        local.get("candidate"),
        previous_state,
    )


def finalize(namespace, previous_state):
    graph = namespace.get("graph", {})
    distances = namespace.get("distances", {})
    previous = namespace.get("previous", {})
    visited = {node for node, distance in distances.items() if distance < float("inf")}
    step = _step(
        graph,
        distances,
        previous,
        visited,
        [],
        None,
        None,
        None,
        None,
        previous_state,
    )
    step["state"]["complete"] = True
    step["focus"] = [
        {"id": _edge_id(parent, node), "role": "shortest-tree"}
        for node, parent in previous.items()
        if parent is not None
    ]
    step["annotation"] = "所有可达节点已经确定；高亮边给出从 A 出发的最短路径树。"
    return step
