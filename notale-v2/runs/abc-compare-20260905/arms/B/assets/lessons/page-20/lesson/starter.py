# Boosting 回归：学习率 (learning_rate) 与弱学习器轮数 (n_estimators)
# 弱学习器采用简单的决策树桩 (decision stump) 逐轮拟合残差
X = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
# 真实函数带有一处轻微噪声 (x=5 时有向上跳变，容易被过度拟合)
y_train = [1.5, 2.1, 2.9, 4.2, 7.8, 6.1, 7.0, 7.9]
y_val   = [1.4, 2.3, 3.1, 4.0, 5.2, 6.0, 6.9, 8.1]

# 探究参数组合：
# 尝试修改 learning_rate (例如 0.1, 0.4, 1.0) 和 n_estimators (例如 5, 12, 20)
learning_rate = 0.4
n_estimators = 12


def fit_stump(residuals, x_vals):
    """寻找使平方误差最小的单切分点树桩"""
    best_loss = float("inf")
    best_split = x_vals[0]
    best_left = 0.0
    best_right = 0.0

    for i in range(len(x_vals) - 1):
        split = (x_vals[i] + x_vals[i + 1]) / 2.0
        left_vals = [r for x, r in zip(x_vals, residuals) if x <= split]
        right_vals = [r for x, r in zip(x_vals, residuals) if x > split]

        c_left = sum(left_vals) / len(left_vals)
        c_right = sum(right_vals) / len(right_vals)

        loss = sum((r - c_left) ** 2 for r in left_vals) + sum((r - c_right) ** 2 for r in right_vals)
        if loss < best_loss:
            best_loss = loss
            best_split = split
            best_left = c_left
            best_right = c_right

    return best_split, best_left, best_right


def predict_stump(split, c_left, c_right, x_vals):
    return [c_left if x <= split else c_right for x in x_vals]


def boost(x_vals, y_vals, y_test, lr, n_rounds):
    base_pred = sum(y_vals) / len(y_vals)
    train_preds = [base_pred] * len(y_vals)
    val_preds = [base_pred] * len(y_test)

    train_errors = []
    val_errors = []
    models = []

    for round_idx in range(1, n_rounds + 1):
        # 1. 计算当前负梯度（平方损失下即为残差）
        residuals = [y - p for y, p in zip(y_vals, train_preds)]

        # 2. 弱学习器拟合残差
        split, c_left, c_right = fit_stump(residuals, x_vals)
        models.append((split, c_left, c_right))

        # 3. 步长缩减更新总预测：F_m(x) = F_{m-1}(x) + lr * h_m(x)
        stump_train = predict_stump(split, c_left, c_right, x_vals)
        stump_val = predict_stump(split, c_left, c_right, x_vals)

        train_preds = [p + lr * h for p, h in zip(train_preds, stump_train)]
        val_preds = [p + lr * h for p, h in zip(val_preds, stump_val)]

        # 4. 记录训练集与验证集均方误差 (MSE)
        train_mse = sum((y - p) ** 2 for y, p in zip(y_vals, train_preds)) / len(y_vals)
        val_mse = sum((y - p) ** 2 for y, p in zip(y_test, val_preds)) / len(y_test)
        train_errors.append(train_mse)
        val_errors.append(val_mse)

    return train_preds, train_errors, val_errors, models


final_preds, train_history, val_history, stumps = boost(
    X, y_train, y_val, learning_rate, n_estimators
)
