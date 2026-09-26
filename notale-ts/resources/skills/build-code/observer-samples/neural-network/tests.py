"""独立验证前向、交叉熵、数值梯度、参数更新和训练损失。"""
import numpy as np


def _loss(ns, params, X, Y):
    return ns["binary_cross_entropy"](ns["forward"](X, params)["a2"], Y)["loss"]


def _numeric_grad(ns, params, X, Y, name, eps=1e-6):
    """仅扰动测试副本，每次中心差分后恢复该元素。"""
    probe = {key: value.copy() for key, value in params.items()}
    target = probe[name]
    grad = np.empty_like(target)
    for index in np.ndindex(target.shape):
        original = target[index]
        target[index] = original + eps
        plus = _loss(ns, probe, X, Y)
        target[index] = original - eps
        minus = _loss(ns, probe, X, Y)
        target[index] = original
        grad[index] = (plus - minus) / (2 * eps)
    return grad


def run_tests(ns):
    X, Y = ns["X"], ns["Y"]
    params = ns["init_params"](7)
    names = tuple(params)
    rows = []

    def close(name, pairs, tolerance=1e-12):
        # 先检查形状，禁止 NumPy 广播把错误维度掩盖成数值一致。
        pairs = [(np.asarray(a), np.asarray(b)) for a, b in pairs]
        shapes = all(a.shape == b.shape for a, b in pairs)
        error = max(float(np.max(np.abs(a - b))) for a, b in pairs) if shapes else None
        rows.append({"name": name, "passed": bool(shapes and error < tolerance),
                     "expected": f"形状一致，最大偏差 < {tolerance:g}",
                     "observed": f"最大偏差 {error:.2e}" if shapes else "形状不一致"})

    def decreases(name, before, after):
        rows.append({"name": name + "（当前样本与学习率下）", "passed": bool(after < before),
                     "expected": "后一次损失更小", "observed": f"{before:.4f} → {after:.4f}"})

    cache = ns["forward"](X, params)
    z1 = X @ params["W1"] + params["b1"]
    a1 = 1 / (1 + np.exp(-z1))
    z2 = a1 @ params["W2"] + params["b2"]
    a2 = 1 / (1 + np.exp(-z2))
    close("前向传播：两层线性组合与 Sigmoid", [
        (cache[key], value) for key, value in (("z1", z1), ("a1", a1), ("z2", z2), ("a2", a2))])

    report = ns["binary_cross_entropy"](np.full((2, 1), .5), np.array([[0.], [1.]]))
    close("交叉熵：预测 0.5 时损失为 ln2", [
        (report["loss"], np.log(2)), (report["sample_loss"], np.full((2, 1), np.log(2)))])

    grads = ns["backward"](X, Y, cache, params)
    close("输出层误差：(a2 - Y) / 样本数", [(grads["dz2"], (cache["a2"] - Y) / len(X))])
    close("四组参数梯度与中心差分一致", [
        (grads["d" + name], _numeric_grad(ns, params, X, Y, name)) for name in names], 1e-6)

    lr = ns["LEARNING_RATE"]
    snapshot = {name: params[name].copy() for name in names}
    updated = ns["update_params"](params, grads, lr)
    unchanged = all(np.array_equal(params[name], snapshot[name]) for name in names)
    rows.append({"name": "更新不修改原参数", "passed": unchanged,
                 "expected": "原参数形状与数值完全不变",
                 "observed": "保持不变" if unchanged else "原参数被修改"})
    close("参数更新：θ - η·梯度", [
        (updated[name], snapshot[name] - lr * grads["d" + name]) for name in names])
    decreases("一次更新后损失下降", _loss(ns, snapshot, X, Y), _loss(ns, updated, X, Y))
    losses = ns["train_loop"](snapshot, X, Y, lr, 2)["losses"]
    decreases("连续两轮损失下降", losses[0], losses[1])
    return rows
