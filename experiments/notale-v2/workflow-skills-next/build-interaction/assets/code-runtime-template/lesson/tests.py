def run_tests(namespace):
    original = [38, 17, 43, 3, 29, 51, 9, 26]
    observed = namespace.get("result")
    return [
        {
            "name": "结果按升序排列",
            "passed": observed == sorted(original),
            "message": "相邻元素应满足前一个不大于后一个。",
            "expected": sorted(original),
            "observed": observed,
        },
        {
            "name": "没有丢失或新增元素",
            "passed": sorted(observed or []) == sorted(original),
            "message": "排序只能改变位置，不能改变多重集合。",
            "expected": sorted(original),
            "observed": sorted(observed or []),
        },
    ]
