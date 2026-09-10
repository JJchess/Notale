# 梯度提升回归实操：观察迭代轮数与学习率对训练和验证误差的影响
# 任务目标：
# 1. 尝试修改 n_estimators (树的棵数，如 5, 20, 45)
# 2. 尝试修改 learning_rate (学习率，如 0.05, 0.25, 0.8)
# 3. 观察右侧实时更新的训练集/验证集 MSE 学习曲线，找出验证误差最低的最佳轮数！

n_estimators = 25      # 迭代轮数
learning_rate = 0.2    # 学习率

# 快速生成训练数据与验证数据
train_x = [-2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5]
train_y = [-0.6, -0.9, -0.8, -0.5, -0.1, 0.1, 0.5, 0.8, 0.9, 0.6, 0.1]

val_x = [-2.2, -1.7, -1.2, -0.7, -0.2, 0.3, 0.8, 1.3, 1.8, 2.3]
val_y = [-0.75, -0.88, -0.65, -0.3, 0.0, 0.35, 0.72, 0.88, 0.75, 0.32]

# 预设候选切分点，常数时间拟合树桩
splits = [-1.8, -1.0, -0.2, 0.6, 1.4, 2.0]

class Stump:
    def __init__(self, split, left, right):
        self.split = split
        self.left = left
        self.right = right
    def predict(self, x):
        return self.left if x < self.split else self.right

def fit_best_stump(residuals):
    best_loss = 1e9
    best_split, best_l, best_r = 0.0, 0.0, 0.0
    for s in splits:
        l_res = [residuals[i] for i in range(len(train_x)) if train_x[i] < s]
        r_res = [residuals[i] for i in range(len(train_x)) if train_x[i] >= s]
        if not l_res or not r_res:
            continue
        l_mean = sum(l_res) / len(l_res)
        r_mean = sum(r_res) / len(r_res)
        loss = sum((v - l_mean)**2 for v in l_res) + sum((v - r_mean)**2 for v in r_res)
        if loss < best_loss:
            best_loss = loss
            best_split, best_l, best_r = s, l_mean, r_mean
    return Stump(best_split, best_l, best_r)

# 梯度提升主循环
base_val = sum(train_y) / len(train_y)
train_preds = [base_val] * len(train_x)
val_preds = [base_val] * len(val_x)

history = []

for r in range(1, n_estimators + 1):
    res = [train_y[i] - train_preds[i] for i in range(len(train_x))]
    stump = fit_best_stump(res)
    
    for i in range(len(train_x)):
        train_preds[i] += learning_rate * stump.predict(train_x[i])
    for i in range(len(val_x)):
        val_preds[i] += learning_rate * stump.predict(val_x[i])
        
    t_mse = sum((train_y[i] - train_preds[i])**2 for i in range(len(train_x))) / len(train_x)
    v_mse = sum((val_y[i] - val_preds[i])**2 for i in range(len(val_x))) / len(val_x)
    history.append({"round": r, "train_mse": round(t_mse, 4), "val_mse": round(v_mse, 4)})

best = min(history, key=lambda h: h["val_mse"])
print(f"训练完成：共 {n_estimators} 轮迭代。")
print(f"最佳验证集表现位于第 {best['round']} 轮，Val MSE = {best['val_mse']}")
