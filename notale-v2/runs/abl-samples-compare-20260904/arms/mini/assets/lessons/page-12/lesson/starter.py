import random

# 固定随机种子确保结果可复现
random.seed(42)

# 12 个样本，3 个特征：x0(信号), x1(主导特征), x2(纯噪声)，二分类目标 y
# 真实规律：当 x1 > 3 时主要为类别 1，x0 辅助，x2 为无关干扰
X = [
    [1.2, 4.5, 9.1], [0.8, 4.1, 1.2], [2.1, 5.0, 4.4], [1.5, 3.8, 8.0],
    [0.5, 1.2, 3.3], [1.1, 1.9, 7.5], [0.2, 2.1, 2.0], [0.9, 0.8, 6.2],
    [1.8, 3.9, 5.5], [0.4, 1.5, 9.9], [1.9, 4.8, 1.1], [0.6, 2.3, 4.0]
]
y = [1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0]
feature_names = ["x0_信号", "x1_主导", "x2_噪声"]

class DecisionStump:
    """简单的单层决策树（决策桩）"""
    def __init__(self, feat_idx, threshold, pred_left, pred_right):
        self.feat_idx = feat_idx
        self.threshold = threshold
        self.pred_left = pred_left
        self.pred_right = pred_right

    def predict(self, sample):
        return self.pred_right if sample[self.feat_idx] >= self.threshold else self.pred_left

def train_best_stump(sub_X, sub_y, candidate_features):
    """在选定的特征子集里寻找最优分割桩"""
    best_acc = -1
    best_stump = None
    for f in candidate_features:
        values = sorted(list(set(row[f] for row in sub_X)))
        thresholds = [(values[i] + values[i+1]) / 2 for i in range(len(values)-1)] or [values[0]]
        for th in thresholds:
            for left_pred in (0, 1):
                right_pred = 1 - left_pred
                correct = sum(1 for i, row in enumerate(sub_X) 
                              if (right_pred if row[f] >= th else left_pred) == sub_y[i])
                acc = correct / len(sub_y)
                if acc > best_acc:
                    best_acc = acc
                    best_stump = DecisionStump(f, th, left_pred, right_pred)
    return best_stump

# 训练随机森林：5 棵树，Bootstrap 采样 + 特征子采样（每次选 2 个特征）
trees = []
tree_records = []
N = len(X)

for t in range(5):
    # 1. Bootstrap 采样：有放回抽取 N 个索引
    boot_indices = [random.randint(0, N - 1) for _ in range(N)]
    oob_indices = [i for i in range(N) if i not in set(boot_indices)]
    
    # 2. 随机选取子特征（从 3 个特征中选 2 个）
    feat_subset = sorted(random.sample(range(3), 2))
    
    # 3. 训练决策桩
    boot_X = [X[i] for i in boot_indices]
    boot_y = [y[i] for i in boot_indices]
    stump = train_best_stump(boot_X, boot_y, feat_subset)
    trees.append(stump)
    
    tree_records.append({
        "tree_id": t,
        "in_bag": boot_indices,
        "oob": oob_indices,
        "split_feat": stump.feat_idx,
        "threshold": round(stump.threshold, 2)
    })

# 4. 计算袋外 (OOB) 评估准确率
oob_predictions = {}
for i in range(N):
    votes = []
    for t, rec in enumerate(tree_records):
        if i in rec["oob"]:
            votes.append(trees[t].predict(X[i]))
    if votes:
        pred_label = 1 if votes.count(1) >= votes.count(0) else 0
        oob_predictions[i] = pred_label

oob_evaluated = list(oob_predictions.keys())
oob_correct = sum(1 for i in oob_evaluated if oob_predictions[i] == y[i])
oob_accuracy = round(oob_correct / len(oob_evaluated), 4) if oob_evaluated else 0.0

# 5. 置换重要性诊断 (Permutation Feature Importance)
# 打乱某个特征的值后，计算 OOB 准确率的降幅
feature_importances = {}
for f_idx, f_name in enumerate(feature_names):
    shuffled_X = [list(row) for row in X]
    shuffled_vals = [row[f_idx] for row in X]
    random.shuffle(shuffled_vals)
    for i in range(N):
        shuffled_X[i][f_idx] = shuffled_vals[i]
    
    shuf_correct = 0
    for i in oob_evaluated:
        votes = []
        for t, rec in enumerate(tree_records):
            if i in rec["oob"]:
                votes.append(trees[t].predict(shuffled_X[i]))
        pred_label = 1 if votes.count(1) >= votes.count(0) else 0
        if pred_label == y[i]:
            shuf_correct += 1
    shuf_acc = shuf_correct / len(oob_evaluated)
    importance = max(0.0, round(oob_accuracy - shuf_acc, 4))
    feature_importances[f_name] = importance

print(f"随机森林训练完成，OOB 准确率: {oob_accuracy * 100:.1f}%")
for f_name, imp in feature_importances.items():
    print(f"特征 [{f_name}] 置换重要性得分: {imp:.4f}")
