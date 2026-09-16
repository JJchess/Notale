"""用 2–3–1 网络演示 XOR 的两次训练迭代，不代表已经学会 XOR。"""

import numpy as np

# 每行一个样本；XOR 无法用单条直线分开，需要隐藏层。
X = np.array([[0.0, 0.0],
              [0.0, 1.0],
              [1.0, 0.0],
              [1.0, 1.0]])
Y = np.array([[0.0], [1.0], [1.0], [0.0]])

N_INPUT, N_HIDDEN, N_OUTPUT = 2, 3, 1
LEARNING_RATE = 0.8
STEPS = 2
PARAM_NAMES = ("W1", "b1", "W2", "b2")


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def init_params(seed=7):
    rng = np.random.default_rng(seed)
    return {
        "W1": rng.normal(0.0, 1.0, (N_INPUT, N_HIDDEN)),
        "b1": np.zeros(N_HIDDEN),
        "W2": rng.normal(0.0, 1.0, (N_HIDDEN, N_OUTPUT)),
        "b2": np.zeros(N_OUTPUT),
    }


def forward(X, params):
    z1 = X @ params["W1"] + params["b1"]
    a1 = sigmoid(z1)
    z2 = a1 @ params["W2"] + params["b2"]
    a2 = sigmoid(z2)
    return {"z1": z1, "a1": a1, "z2": z2, "a2": a2}


def binary_cross_entropy(a2, Y, eps=1e-12):
    # 避免概率接近 0 或 1 时出现 log(0)。
    a = np.clip(a2, eps, 1.0 - eps)
    sample_loss = -(Y * np.log(a) + (1.0 - Y) * np.log(1.0 - a))
    return {"loss": float(sample_loss.mean()), "sample_loss": sample_loss, "a2": a2}


def backward(X, Y, cache, params):
    a1, a2 = cache["a1"], cache["a2"]
    # 平均损失的梯度要除以样本数；交叉熵与 Sigmoid 的导数已合并。
    dz2 = (a2 - Y) / len(X)
    dW2 = a1.T @ dz2
    db2 = dz2.sum(axis=0)
    da1 = dz2 @ params["W2"].T
    dz1 = da1 * a1 * (1.0 - a1)  # 隐藏层仍需乘 Sigmoid 导数。
    dW1 = X.T @ dz1
    db1 = dz1.sum(axis=0)
    return {
        "dW1": dW1, "db1": db1, "dW2": dW2, "db2": db2,
        "dz1": dz1, "da1": da1, "dz2": dz2,
    }


def update_one(name, params, grads, lr):
    # 单个参数的一步梯度下降：θ ← θ − lr · ∂L/∂θ。
    return params[name] - lr * grads["d" + name]


def update_params(params, grads, lr):
    return {name: update_one(name, params, grads, lr) for name in PARAM_NAMES}


def train_loop(params, X, Y, lr, steps):
    history = []
    for _ in range(steps):
        cache = forward(X, params)
        report = binary_cross_entropy(cache["a2"], Y)
        grads = backward(X, Y, cache, params)
        params = update_params(params, grads, lr)
        history.append(report["loss"])  # 记录本轮更新前的损失。
    return {"params": params, "losses": history}


trained = train_loop(init_params(), X, Y, LEARNING_RATE, STEPS)
params = trained["params"]
