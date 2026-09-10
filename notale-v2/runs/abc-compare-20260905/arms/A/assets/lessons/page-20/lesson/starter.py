# 一维含噪非线性数据（正弦波叠加高斯噪声）
# 目标：通过一维树桩（决策树桩）逐步拟合残差
import math

# 8 个观测样本 (x, y)
dataset = [
    (1.0, 1.20),
    (2.0, 2.10),
    (3.0, 1.85),
    (4.0, 0.40),
    (5.0, -0.90),
    (6.0, -1.80),
    (7.0, -0.70),
    (8.0, 0.85),
]

# 核心超参数
learning_rate = 0.5   # 尝试调整：0.2 (保守收敛), 0.5 (适中), 1.0 (易过拟合)
n_rounds = 6          # 迭代轮数：随着轮数增加，训练残差下降


def fit_best_stump(data, residuals):
    """寻找单个最佳划分点 split_x，使左右两段均值的平方残差最小"""
    best_loss = float("inf")
    best_split = data[0][0]
    best_left = 0.0
    best_right = 0.0

    n = len(data)
    for i in range(n - 1):
        split = (data[i][0] + data[i + 1][0]) / 2.0
        left_r = [residuals[j] for j in range(n) if data[j][0] <= split]
        right_r = [residuals[j] for j in range(n) if data[j][0] > split]

        c_left = sum(left_r) / len(left_r) if left_r else 0.0
        c_right = sum(right_r) / len(right_r) if right_r else 0.0

        loss = sum((residuals[j] - (c_left if data[j][0] <= split else c_right)) ** 2 for j in range(n))
        if loss < best_loss:
            best_loss = loss
            best_split = split
            best_left = c_left
            best_right = c_right

    return best_split, best_left, best_right


# 初始化强学习器预测值为 y 的均值
y_vals = [pt[1] for pt in dataset]
f_0 = sum(y_vals) / len(y_vals)
predictions = [f_0] * len(dataset)
trees = []

for round_num in range(1, n_rounds + 1):
    # 1. 计算当前残差 r_i = y_i - f(x_i)
    residuals = [dataset[i][1] - predictions[i] for i in range(len(dataset))]

    # 2. 拟合决策树桩
    split, left_val, right_val = fit_best_stump(dataset, residuals)
    trees.append((split, left_val, right_val))

    # 3. 按步长缩减更新总预测 F_m(x) = F_{m-1}(x) + eta * h_m(x)
    for i in range(len(dataset)):
        x_val = dataset[i][0]
        update = left_val if x_val <= split else right_val
        predictions[i] += learning_rate * update


# 计算最终均方误差 MSE
mse = sum((dataset[i][1] - predictions[i]) ** 2 for i in range(len(dataset))) / len(dataset)
print(f"迭代轮数: {n_rounds}, 学习率: {learning_rate:.2f}, 最终 MSE: {mse:.4f}")
