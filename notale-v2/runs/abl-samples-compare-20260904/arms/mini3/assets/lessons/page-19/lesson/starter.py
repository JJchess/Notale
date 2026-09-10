# 梯度提升实操：训练集与验证集均方误差（MSE）跟踪
# 观察迭代轮数（n_estimators）和学习率（learning_rate）对欠拟合与过拟合的影响

# 训练集含有局部随机测量噪声（点 3 与点 8 带有异常扰动）
x_train = [-2.8, -2.1, -1.5, -0.9, -0.3, 0.2, 0.7, 1.4, 2.0, 2.7]
y_train = [-0.35, -0.92, -0.50, -0.72, -0.25, 0.28, 0.95, 0.55, 0.88, 0.32]

# 验证集来自干净真实正弦信号 y = sin(x)
x_val = [-2.5, -1.8, -1.1, -0.5, 0.0, 0.5, 1.1, 1.7, 2.4]
y_val = [-0.60, -0.97, -0.89, -0.48, 0.00, 0.48, 0.89, 0.99, 0.68]


class DecisionStump:
    """单特征最优单切分桩（深度为 1 的回归树）"""
    def __init__(self):
        self.split = 0.0
        self.left_val = 0.0
        self.right_val = 0.0

    def fit(self, x, r):
        best_loss = float("inf")
        # 遍历候选切分点
        for i in range(len(x) - 1):
            s = (x[i] + x[i + 1]) / 2.0
            left_r = [r[k] for k in range(len(x)) if x[k] <= s]
            right_r = [r[k] for k in range(len(x)) if x[k] > s]
            if not left_r or not right_r:
                continue
            c_left = sum(left_r) / len(left_r)
            c_right = sum(right_r) / len(right_r)
            loss = sum((v - c_left) ** 2 for v in left_r) + sum((v - c_right) ** 2 for v in right_r)
            if loss < best_loss:
                best_loss = loss
                self.split = s
                self.left_val = c_left
                self.right_val = c_right
        return self

    def predict_one(self, xi):
        return self.left_val if xi <= self.split else self.right_val


def calc_mse(y_true, y_pred):
    return round(sum((t - p) ** 2 for t, p in zip(y_true, y_pred)) / len(y_true), 4)


def run_gradient_boosting(n_estimators=25, lr=0.5):
    # 初始常量预测：训练目标均值
    f0 = sum(y_train) / len(y_train)
    pred_train = [f0] * len(x_train)
    pred_val = [f0] * len(x_val)

    trees = []
    train_errors = [calc_mse(y_train, pred_train)]
    val_errors = [calc_mse(y_val, pred_val)]

    for t in range(1, n_estimators + 1):
        # 1. 计算当前负梯度（对于 MSE 损失即真实残差 r_i = y_i - f(x_i)）
        residuals = [y - p for y, p in zip(y_train, pred_train)]

        # 2. 拟合一棵回归决策桩
        stump = DecisionStump().fit(x_train, residuals)
        trees.append(stump)

        # 3. 沿负梯度方向小步累加更新模型预测：f_t = f_{t-1} + lr * h_t(x)
        pred_train = [p + lr * stump.predict_one(x) for p, x in zip(pred_train, x_train)]
        pred_val = [p + lr * stump.predict_one(x) for p, x in zip(pred_val, x_val)]

        train_mse = calc_mse(y_train, pred_train)
        val_mse = calc_mse(y_val, pred_val)

        train_errors.append(train_mse)
        val_errors.append(val_mse)

    return train_errors, val_errors, trees


train_errors, val_errors, trees = run_gradient_boosting(n_estimators=25, lr=0.5)
best_round = val_errors.index(min(val_errors))
min_val_error = min(val_errors)
final_val_error = val_errors[-1]
