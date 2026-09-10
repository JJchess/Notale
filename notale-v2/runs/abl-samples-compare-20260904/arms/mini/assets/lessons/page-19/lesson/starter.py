learning_rate = 0.25
n_estimators = 12

# 训练集与验证集目标值 (1D 回归，含噪声)
train_y = [1.2, 2.1, 3.8, 4.2, 5.9, 6.1, 7.8, 8.4]
val_y = [1.5, 2.0, 3.5, 4.6, 5.6, 6.5, 7.5, 8.9]

# 每轮弱回归树桩针对样本各分区的拟合更新量
train_delta = [
    [1.8, 1.8, 3.8, 3.8, 6.0, 6.0, 8.0, 8.0],
    [-0.5, 0.4, 0.0, 0.5, -0.2, 0.2, -0.2, 0.5],
    [0.1, -0.2, 0.3, -0.2, 0.1, -0.1, 0.2, -0.1],
    [-0.2, 0.3, -0.1, 0.2, -0.1, 0.2, -0.1, 0.3],
    [0.3, -0.2, 0.2, -0.3, 0.3, -0.2, 0.2, -0.2],
    [-0.3, 0.4, -0.2, 0.3, -0.2, 0.3, -0.2, 0.3],
    [0.4, -0.3, 0.3, -0.4, 0.4, -0.3, 0.3, -0.3],
    [-0.4, 0.5, -0.3, 0.4, -0.3, 0.4, -0.3, 0.4],
    [0.5, -0.4, 0.4, -0.5, 0.5, -0.4, 0.4, -0.4],
    [-0.5, 0.6, -0.4, 0.5, -0.4, 0.5, -0.4, 0.5],
    [0.6, -0.5, 0.5, -0.6, 0.6, -0.5, 0.5, -0.5],
    [-0.6, 0.7, -0.5, 0.6, -0.5, 0.6, -0.5, 0.6],
]

val_delta = [
    [1.8, 1.8, 3.8, 3.8, 6.0, 6.0, 8.0, 8.0],
    [-0.5, 0.4, 0.0, 0.5, -0.2, 0.2, -0.2, 0.5],
    [0.0, -0.1, 0.1, -0.1, 0.1, -0.1, 0.1, 0.0],
    [-0.1, 0.1, 0.0, 0.1, 0.0, 0.1, 0.0, 0.1],
    [0.2, -0.1, 0.1, -0.2, 0.2, -0.1, 0.1, -0.1],
    [-0.2, 0.3, -0.1, 0.2, -0.1, 0.2, -0.1, 0.2],
    [0.3, -0.2, 0.2, -0.3, 0.3, -0.2, 0.2, -0.2],
    [-0.3, 0.4, -0.2, 0.3, -0.2, 0.3, -0.2, 0.3],
    [0.4, -0.3, 0.3, -0.4, 0.4, -0.3, 0.3, -0.3],
    [-0.4, 0.5, -0.3, 0.4, -0.3, 0.4, -0.3, 0.4],
    [0.5, -0.4, 0.4, -0.5, 0.5, -0.4, 0.4, -0.5],
    [-0.5, 0.6, -0.4, 0.5, -0.4, 0.5, -0.4, 0.5],
]


def mean_squared_error(actual, predicted):
    total = sum((y - p) ** 2 for y, p in zip(actual, predicted))
    return round(total / len(actual), 4)


def fit_gradient_boosting(n_rounds, lr):
    n_train = len(train_y)
    n_val = len(val_y)
    pred_train = [0.0] * n_train
    pred_val = [0.0] * n_val
    history = []

    for round_idx in range(n_rounds):
        # 第 0 轮用初始常数均值/基准预测，后续轮次乘学习率累加
        weight = 1.0 if round_idx == 0 else lr
        cur_train_update = train_delta[round_idx]
        cur_val_update = val_delta[round_idx]

        for i in range(n_train):
            pred_train[i] += weight * cur_train_update[i]
        for j in range(n_val):
            pred_val[j] += weight * cur_val_update[j]

        train_loss = mean_squared_error(train_y, pred_train)
        val_loss = mean_squared_error(val_y, pred_val)

        history.append({
            "round": round_idx + 1,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "gap": round(val_loss - train_loss, 4),
        })

    return history


records = fit_gradient_boosting(n_estimators, learning_rate)
final_train_loss = records[-1]["train_loss"]
final_val_loss = records[-1]["val_loss"]
