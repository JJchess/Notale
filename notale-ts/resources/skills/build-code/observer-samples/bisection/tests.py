"""独立校验二分法：函数值、根的精度、区间宽度、迭代次数的量级。"""


def run_tests(namespace):
    ns = namespace
    results = []

    f = ns["f"]

    fv = [f(1.0), f(2.0)]
    results.append({
        "name": "f 在 [1, 2] 两端异号，保证区间内有根",
        "passed": bool(fv[0] < 0 < fv[1]),
        "expected": "f(1) < 0 < f(2)",
        "observed": "f(1) = %.2f, f(2) = %.2f" % (fv[0], fv[1]),
        "message": "介值定理的前提条件",
    })

    step = ns["bisect_step"](1.0, 2.0, f(1.0), f(2.0))
    a, b = step[0], step[1]
    m = step[4]
    # f(1.5) = -0.125 与 f(1) 同号，根在右半，新区间应为 [1.5, 2]，
    # 其中点 m = 1.5，宽度恰为原区间的一半。
    results.append({
        "name": "一步二分把区间减半，中点为 1.5 且落在新区间内",
        "passed": bool(abs((b - a) - 0.5) < 1e-12 and abs(m - 1.5) < 1e-12 and a <= m <= b),
        "expected": "新区间宽 0.5，中点 m = 1.5",
        "observed": "新区间 [%.2f, %.2f]，宽 %.4f，m = %.2f" % (a, b, b - a, m),
        "message": "每次二分区间长度减半",
    })

    tol = 1e-6
    out = ns["bisect"](1.0, 2.0, tol=tol)
    root = float(out["root"])
    a, b = (float(x) for x in out["interval"])

    # 独立参照：真根由 f 在极小邻域内变号定位，不用被测函数本身当参照。
    lo, hi = root - 1e-3, root + 1e-3
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    truth = 0.5 * (lo + hi)

    err = abs(root - truth)
    results.append({
        "name": "返回的根与独立参照真根的距离在容差内",
        "passed": bool(err < 2 * tol),
        "expected": "< %.0e" % (2 * tol),
        "observed": "|root - 真根| = %.2e" % err,
        "message": "参照真根由测试内部另算",
    })

    results.append({
        "name": "返回区间宽度不超过 tol",
        "passed": bool(0 < float(out["width"]) <= tol),
        "expected": "0 < 宽度 ≤ 1e-6",
        "observed": "宽度 %.2e" % float(out["width"]),
        "message": "区间宽度给出根的误差上界",
    })

    # 次数由精度推出：宽度从 1 减到 tol 约需 ceil(log2(1/tol)) 次。
    import math
    expect_n = math.ceil(math.log2(1.0 / tol))
    steps = int(out["steps"])
    results.append({
        "name": "迭代次数与理论值 ceil(log2(1/tol)) 一致",
        "passed": bool(abs(steps - expect_n) <= 1),
        "expected": "%d 次左右" % expect_n,
        "observed": "%d 次" % steps,
        "message": "区间每步减半，次数由精度决定",
    })

    try:
        ns["bisect"](2.0, 3.0, tol=1e-3)
        ok = False
    except ValueError:
        ok = True
    results.append({
        "name": "两端同号时给出错误提示而不是假根",
        "passed": ok,
        "expected": "抛出 ValueError",
        "observed": "抛出 ValueError" if ok else "未报错",
        "message": "f(2) 与 f(3) 同号，区间内未必有根",
    })

    return results
