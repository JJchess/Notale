"""用二分法求 x^3 - x - 2 = 0 在 [1, 2] 内的根。

二分法的依据是介值定理：连续函数在区间两端异号，区间内必有根。
每一步取中点，保留异号的一半，区间长度每步减半，
所以达到精度 tol 大约需要 log2(初始区间宽度/tol) 次二分。
"""


def f(x):
    # 找根的目标函数；f(1) = -2，f(2) = 4，两端异号。
    return x ** 3 - x - 2.0


def bisect_step(a, b, fa, fb):
    # 一次区间减半：先算中点和它的函数值，再决定保留哪一半。
    # 返回新区间端点及函数值；m 保留本次实际求值的中点。
    m = 0.5 * (a + b)
    fm = f(m)
    if fa * fm <= 0.0:   # 根落在左半 [a, m]
        return a, m, fa, fm, m
    return m, b, fm, fb, m  # 根落在右半 [m, b]


def bisect(a, b, tol=1e-6, max_iter=100):
    # 主循环：反复调用 bisect_step，直到区间窄于 tol。
    # 停止条件看新区间的整体宽度：宽度 < tol 就保证任何一点
    # （包括中点 m）到真根的距离不超过 tol。
    fa, fb = f(a), f(b)
    if fa * fb > 0.0:
        raise ValueError("f(a) 与 f(b) 必须异号，二分法才能保证有根")
    m = 0.5 * (a + b)
    k = 0
    for k in range(1, max_iter + 1):
        a, b, fa, fb, m = bisect_step(a, b, fa, fb)
        if b - a < tol:
            break
    return {"root": m, "residual": f(m), "interval": (a, b), "width": b - a, "steps": k}


result = bisect(1.0, 2.0, tol=1e-6)
print("近似根:", result["root"])
print("区间:", result["interval"], "宽度:", result["width"])
print("二分次数:", result["steps"], "，残差:", result["residual"])
