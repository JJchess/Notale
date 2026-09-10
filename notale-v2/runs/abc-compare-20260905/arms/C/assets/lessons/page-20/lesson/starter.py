# 简单 1D 数据集：含微弱噪声的目标曲线
train_x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
train_y = [1.2, 1.9, 3.2, 3.8, 5.1, 5.8, 4.5, 3.1]
test_x  = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]
test_y  = [1.5, 2.6, 3.6, 4.6, 5.6, 5.3, 3.7]

learning_rate = 0.3
n_estimators = 6


def fit_stump(x_vals, residuals):
    """单特征最优单分割决策桩（寻找使平方残差和最小的切分点）"""
    best_loss = float("inf")
    best_split = x_vals[0]
    best_left, best_right = 0.0, 0.0
    for i in range(len(x_vals) - 1):
        split = (x_vals[i] + x_vals[i + 1]) / 2.0
        left_res = [r for x, r in zip(x_vals, residuals) if x <= split]
        right_res = [r for x, r in zip(x_vals, residuals) if x > split]
        if not left_res or not right_res:
            continue
        c_left = sum(left_res) / len(left_res)
        c_right = sum(right_res) / len(right_res)
        loss = sum((r - c_left) ** 2 for r in left_res) + sum((r - c_right) ** 2 for r in right_res)
        if loss < best_loss:
            best_loss = loss
            best_split = split
            best_left = c_left
            best_right = c_right
    return best_split, best_left, best_right


def predict_stump(split, c_left, c_right, x):
    return c_left if x <= split else c_right


def boost_regression(lr, n_rounds):
    # 初始常量预测：训练集均值
    f0 = sum(train_y) / len(train_y)
    train_pred = [f0] * len(train_x)
    test_pred = [f0] * len(test_x)

    models = []
    round_history = []

    for m in range(n_rounds):
        # 计算当前负梯度（残差）
        residuals = [y - p for y, p in zip(train_y, train_pred)]
        split, c_left, c_right = fit_stump(train_x, residuals)
        models.append((split, c_left, c_right))

        # 步长 shrinkage 更新累加预测
        for i in range(len(train_x)):
            train_pred[i] += lr * predict_stump(split, c_left, c_right, train_x[i])
        for i in range(len(test_x)):
            test_pred[i] += lr * predict_stump(split, c_left, c_right, test_x[i])

        train_mse = sum((y - p) ** 2 for y, p in zip(train_y, train_pred)) / len(train_y)
        test_mse = sum((y - p) ** 2 for y, p in zip(test_y, test_pred)) / len(test_y)
        round_history.append((m + 1, train_mse, test_mse))

    return train_pred, test_pred, round_history


final_train, final_test, history = boost_regression(learning_rate, n_estimators)
