POSITIONS = {
    "4": (400, 82),
    "2": (230, 214),
    "6": (570, 214),
    "1": (130, 360),
    "3": (330, 360),
    "5": (470, 360),
    "7": (670, 360),
}


def _stack(frame):
    values = []
    current = frame
    while current is not None:
        if current.f_code.co_name == "inorder" and current.f_code.co_filename.endswith("inorder.py"):
            node = current.f_locals.get("node")
            if node is not None and hasattr(node, "value"):
                values.append(str(node.value))
        current = current.f_back
    values.reverse()
    return values


def _tree(root, visited):
    nodes = []
    edges = []

    def walk(node):
        if node is None:
            return
        node_id = str(node.value)
        x, y = POSITIONS.get(node_id, (400, 240))
        nodes.append({
            "id": node_id,
            "label": node.value,
            "status": "visited" if node.value in visited else "pending",
            "x": x,
            "y": y,
        })
        for child, side in ((node.left, "left"), (node.right, "right")):
            if child is None:
                continue
            child_id = str(child.value)
            edges.append({
                "id": f"{node_id}--{child_id}",
                "source": node_id,
                "target": child_id,
                "side": side,
            })
            walk(child)

    walk(root)
    return nodes, edges


def _step(root, visited, stack, previous_state, complete=False):
    nodes, edges = _tree(root, visited)
    previous = list((previous_state or {}).get("visited", []))
    additions = [value for value in visited if value not in previous]
    focus = []
    if stack:
        focus.append({"id": stack[-1], "role": "current"})
    focus.extend({"id": str(value), "role": "visit"} for value in additions)
    if complete:
        annotation = "遍历完成；输出顺序正好是 BST 的升序键值。"
    elif additions:
        annotation = f"左子树已经返回，将节点 {additions[-1]} 写入访问序列。"
    elif stack:
        annotation = f"递归帧停在节点 {stack[-1]}，继续遵循左—根—右。"
    else:
        annotation = "从根节点开始，先沿左边下降。"
    return {
        "kind": "tree",
        "state": {
            "nodes": nodes,
            "edges": edges,
            "visited": list(visited),
            "stack": list(stack),
            "complete": complete,
        },
        "focus": focus,
        "changes": [{"id": str(value), "role": "visit"} for value in additions],
        "metrics": {"已访问": len(visited), "递归深度": len(stack)},
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    root = frame.f_globals.get("root")
    visited = frame.f_globals.get("visited")
    if root is None or not isinstance(visited, list):
        return None
    return _step(root, list(visited), _stack(frame), previous_state)


def finalize(namespace, previous_state):
    root = namespace.get("root")
    visited = list(namespace.get("visited", []))
    return _step(root, visited, [], previous_state, complete=True)
