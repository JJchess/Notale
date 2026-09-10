# 随机森林代码实操：袋外评估与特征重要性诊断
import math

# 8个样本的信贷评估数据: [年龄分段, 负债率, 历史逾期], 标签: 0=低风险, 1=高风险
# 观察点：历史逾期(f2)为关键判别特征，负债率(f1)为次要特征，年龄(f0)近似噪声
dataset = [
    ([0, 0.2, 0], 0),
    ([1, 0.3, 0], 0),
    ([2, 0.7, 1], 1),
    ([0, 0.8, 1], 1),
    ([1, 0.2, 0], 0),
    ([2, 0.4, 0], 0),
    ([0, 0.9, 1], 1),
    ([1, 0.6, 1], 1),
]

# 固定两棵树的 Bootstrap 采样索引(有放回抽样 8 次)
# 树 0 抽取样本: [0, 1, 1, 4, 4, 5, 7, 7]，袋外样本 OOB: {2, 3, 6}
# 树 1 抽取样本: [1, 2, 2, 3, 3, 6, 6, 7]，袋外样本 OOB: {0, 4, 5}
tree_samples = [
    [0, 1, 1, 4, 4, 5, 7, 7],
    [1, 2, 2, 3, 3, 6, 6, 7]
]

class SimpleStump:
    """单特征决策树桩"""
    def __init__(self, feature_idx, threshold, left_label, right_label):
        self.feature_idx = feature_idx
        self.threshold = threshold
        self.left_label = left_label
        self.right_label = right_label

    def predict_one(self, x):
        if x[self.feature_idx] <= self.threshold:
            return self.left_label
        return self.right_label

# 树 0 选用特征 2 (历史逾期 <= 0.5 -> 0, 否则 1)
# 树 1 选用特征 1 (负债率 <= 0.5 -> 0, 否则 1)
forest = [
    SimpleStump(feature_idx=2, threshold=0.5, left_label=0, right_label=1),
    SimpleStump(feature_idx=1, threshold=0.5, left_label=0, right_label=1),
]

# 1. 袋外评估 (OOB Evaluation)
oob_correct = 0
oob_total = 0
all_indices = set(range(len(dataset)))

for t_idx, stump in enumerate(forest):
    sample_indices = set(tree_samples[t_idx])
    oob_indices = sorted(list(all_indices - sample_indices))
    for i in oob_indices:
        x, y = dataset[i]
        pred = stump.predict_one(x)
        if pred == y:
            oob_correct += 1
        oob_total += 1

oob_accuracy = oob_correct / oob_total if oob_total > 0 else 0.0

# 2. 置换特征重要性 (Permutation Feature Importance)
# 计算基准整体准确率
base_correct = 0
for x, y in dataset:
    votes = [stump.predict_one(x) for stump in forest]
    pred = 1 if (sum(votes) / len(votes)) >= 0.5 else 0
    if pred == y:
        base_correct += 1
base_acc = base_correct / len(dataset)

# 逐一打乱某个特征，观察森林整体准确率下降幅度
feature_importances = []
num_features = 3

for f in range(num_features):
    # 将特征 f 循环位移打乱
    shuffled_correct = 0
    for i in range(len(dataset)):
        orig_x, y = dataset[i]
        shuffled_x = list(orig_x)
        shuffled_x[f] = dataset[(i + 3) % len(dataset)][0][f]
        votes = [stump.predict_one(shuffled_x) for stump in forest]
        pred = 1 if (sum(votes) / len(votes)) >= 0.5 else 0
        if pred == y:
            shuffled_correct += 1
    shuffled_acc = shuffled_correct / len(dataset)
    drop = max(0.0, base_acc - shuffled_acc)
    feature_importances.append(round(drop, 3))

print(f"OOB 准确率: {oob_accuracy:.2f}")
print(f"各特征重要性(准确率下降): {feature_importances}")
