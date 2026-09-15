"""以内置排序作独立参照，并用带身份的相等值检查稳定性。"""
def run_tests(namespace):
    sort = namespace["insertion_sort"]
    rows = []
    for label, source in [("当前输入", namespace["NUMBERS"]), ("空数组", []),
                          ("单元素", [1]), ("重复值", [3, 1, 3, 1]),
                          ("负数与零", [0, -3, 2, -3]), ("逆序", [4, 3, 2, 1])]:
        values = list(source)
        result = sort(values)
        rows.append({"name": label, "passed": result == sorted(source) and result is values,
                     "expected": sorted(source), "observed": result})

    class Item:
        def __init__(self, value, identity):
            self.value, self.identity = value, identity
        def __gt__(self, other):
            return self.value > other.value

    source = [Item(v, i) for i, v in enumerate([3, 1, 3, 1])]
    expected = [x.identity for x in sorted(source, key=lambda x: x.value)]
    observed = [x.identity for x in sort(source)]
    rows.append({"name": "相等元素原始顺序不变", "passed": observed == expected,
                 "expected": expected, "observed": observed})
    return rows
