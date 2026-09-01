def run_tests(namespace):
    gcd = namespace.get("gcd")
    result = namespace.get("result")
    callable_gcd = callable(gcd)
    return [
        {
            "name": "1071 与 462 的最大公约数为 21",
            "passed": result == 21,
            "message": "余数序列应为 147、21、0。",
            "expected": 21,
            "observed": result,
        },
        {
            "name": "零参数触发递归基例",
            "passed": callable_gcd and gcd(9, 0) == 9,
            "message": "当 b 为 0 时应直接返回 a。",
        },
        {
            "name": "交换输入不改变最大公约数",
            "passed": callable_gcd and gcd(48, 18) == gcd(18, 48) == 6,
            "message": "算法依赖整除关系，而不是参数书写顺序。",
        },
    ]
