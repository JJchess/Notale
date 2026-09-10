from collections import Counter


def _preserves_items(observed, expected):
    try:
        return Counter(observed) == Counter(expected)
    except (TypeError, ValueError):
        return False


def run_tests(namespace):
    original = namespace.get("original")
    numbers = namespace.get("numbers")
    result = namespace.get("result")
    original = list(original) if isinstance(original, list) else []
    expected = sorted(original)

    sorter = next(
        (
            namespace.get(name)
            for name in ("bubble_sort", "selection_sort", "insertion_sort")
            if callable(namespace.get(name))
        ),
        None,
    )
    transfer_input = [3, -1, 3, 0, 2, -1]
    transfer_values = transfer_input.copy()
    transfer_result = None
    transfer_error = "没有找到可调用的排序函数。"
    if sorter is not None:
        try:
            transfer_result = sorter(transfer_values)
            transfer_error = ""
        except Exception as exc:  # 测试应报告学习者错误，而不是中断工作台。
            transfer_error = f"{type(exc).__name__}: {exc}"

    transfer_expected = sorted(transfer_input)
    transfer_passed = (
        not transfer_error
        and transfer_values == transfer_expected
        and transfer_result is transfer_values
    )

    return [
        {
            "name": "示例结果按升序排列",
            "passed": isinstance(numbers, list) and numbers == expected,
            "message": "运行当前编辑器源码后，numbers 应与 Python 的升序结果一致。",
            "expected": expected,
            "observed": numbers,
        },
        {
            "name": "没有丢失或新增元素",
            "passed": isinstance(numbers, list) and _preserves_items(numbers, original),
            "message": "排序只能改变元素位置，不能改变它们的多重集合。",
            "expected": dict(Counter(original)),
            "observed": dict(Counter(numbers)) if isinstance(numbers, list) else numbers,
        },
        {
            "name": "result 指向排序后的列表",
            "passed": isinstance(numbers, list) and result is numbers,
            "message": "排序函数应返回它实际修改的列表。",
            "expected": "result is numbers",
            "observed": "result is numbers" if result is numbers else result,
        },
        {
            "name": "可迁移到重复值与负数",
            "passed": transfer_passed,
            "message": transfer_error or "同一函数应原地排序新输入，并保留重复值。",
            "expected": transfer_expected,
            "observed": transfer_values,
        },
    ]
