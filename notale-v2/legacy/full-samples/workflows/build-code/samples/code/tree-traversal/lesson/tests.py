def _is_bst(node, low=float("-inf"), high=float("inf")):
    if node is None:
        return True
    return (
        low < node.value < high
        and _is_bst(node.left, low, node.value)
        and _is_bst(node.right, node.value, high)
    )


def run_tests(namespace):
    observed = namespace.get("result")
    root = namespace.get("root")
    expected = [1, 2, 3, 4, 5, 6, 7]
    return [
        {
            "name": "中序结果严格递增",
            "passed": observed == expected,
            "message": "BST 的中序遍历应按键值升序访问。",
            "expected": expected,
            "observed": observed,
        },
        {
            "name": "遍历没有改变树结构",
            "passed": _is_bst(root),
            "message": "只读取节点，不应改写左右子树。",
        },
        {
            "name": "每个节点恰好访问一次",
            "passed": len(observed or []) == len(set(observed or [])) == 7,
            "message": "重复进入递归帧不能重复写入结果。",
        },
    ]
