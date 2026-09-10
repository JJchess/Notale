# 随机森林代码实操：从单棵决策树过渡到袋外评估与特征重要性诊断
#
# 任务：
# 1. 完成 build_tree(X, y, max_features=None, random_state=42)
# 2. 完成 RandomForest 的 fit(X, y) 中的 Bootstrap 采样与袋外(OOB)样本记录
# 3. 计算袋外准确率 (oob_score)
# 4. 计算基于不纯度减少的特征重要性 (feature_importances_)

import math
import random

# 数据集：8 个二维样本 [特征0, 特征1]，二分类 (0 或 1)
# 特征0: 核心特征（信息增益大）；特征1: 弱相关/噪声特征
dataset_X = [
    [1.2, 2.1],
    [1.5, 3.4],
    [1.8, 1.9],
    [2.4, 4.1],
    [3.1, 2.2],
    [3.5, 3.8],
    [4.0, 1.7],
    [4.2, 3.9],
]
dataset_y = [0, 0, 0, 0, 1, 1, 1, 1]


def gini_impurity(labels):
    """计算二分类基尼不纯度 Gini = 1 - sum(p_i^2)"""
    if not labels:
        return 0.0
    p1 = sum(labels) / len(labels)
    p0 = 1.0 - p1
    return 1.0 - (p0 * p0 + p1 * p1)


class SimpleStump:
    """简单决策树桩：只选一个最优特征和阈值做单次切分"""
    def __init__(self, feature_idx=0, threshold=0.0, left_val=0, right_val=1, gain=0.0):
        self.feature_idx = feature_idx
        self.threshold = threshold
        self.left_val = left_val
        self.right_val = right_val
        self.gain = gain  # 该切分带来的不纯度减少总量: N * Gini_parent - (N_left * Gini_L + N_right * Gini_R)

    def predict_one(self, x):
        return self.left_val if x[self.feature_idx] <= self.threshold else self.right_val


def fit_stump(X, y, feature_subset):
    """在指定的候选特征集合上寻找最大基尼增益的切分"""
    n_samples = len(y)
    base_gini = gini_impurity(y)
    best_gain = -1.0
    best_feat = feature_subset[0]
    best_thresh = X[0][best_feat]
    best_left_val = 0
    best_right_val = 1

    for feat in feature_subset:
        # 取该特征的所有可能阈值（中点）
        values = sorted(set(X[i][feat] for i in range(n_samples)))
        thresholds = [(values[i] + values[i + 1]) / 2.0 for i in range(len(values) - 1)]
        if not thresholds:
            thresholds = values

        for th in thresholds:
            left_y = [y[i] for i in range(n_samples) if X[i][feat] <= th]
            right_y = [y[i] for i in range(n_samples) if X[i][feat] > th]
            if not left_y or not right_y:
                continue

            g_left = gini_impurity(left_y)
            g_right = gini_impurity(right_y)
            # 加权基尼不纯度
            weighted_gini = (len(left_y) * g_left + len(right_y) * g_right) / n_samples
            gain = base_gini - weighted_gini

            if gain > best_gain:
                best_gain = gain
                best_feat = feat
                best_thresh = th
                best_left_val = 1 if sum(left_y) > len(left_y) / 2 else 0
                best_right_val = 1 if sum(right_y) > len(right_y) / 2 else 0

    return SimpleStump(best_feat, best_thresh, best_left_val, best_right_val, max(0.0, best_gain))


class MiniRandomForest:
    def __init__(self, n_estimators=5, max_features=1, seed=42):
        self.n_estimators = n_estimators
        self.max_features = max_features
        self.seed = seed
        self.trees = []
        self.oob_indices_per_tree = []  # 每棵树的袋外样本索引集合
        self.oob_score_ = 0.0
        self.feature_importances_ = [0.0, 0.0]

    def fit(self, X, y):
        rng = random.Random(self.seed)
        n_samples = len(X)
        n_features = len(X[0])
        all_indices = set(range(n_samples))

        self.trees = []
        self.oob_indices_per_tree = []
        feat_gains = [0.0] * n_features

        # 1. 构建每棵决策树桩
        for tree_idx in range(self.n_estimators):
            # Bootstrap 有放回采样
            bootstrap_idx = [rng.randint(0, n_samples - 1) for _ in range(n_samples)]
            oob_idx = list(all_indices - set(bootstrap_idx))
            self.oob_indices_per_tree.append(oob_idx)

            # 特征子采样：随机挑选 max_features 个候选特征
            feat_candidates = rng.sample(range(n_features), self.max_features)

            boot_X = [X[i] for i in bootstrap_idx]
            boot_y = [y[i] for i in bootstrap_idx]

            tree = fit_stump(boot_X, boot_y, feat_candidates)
            self.trees.append(tree)

            # 累计特征不纯度减少
            feat_gains[tree.feature_idx] += tree.gain

        # 归一化特征重要性
        total_gain = sum(feat_gains)
        if total_gain > 0:
            self.feature_importances_ = [round(g / total_gain, 4) for g in feat_gains]
        else:
            self.feature_importances_ = [0.5, 0.5]

        # 2. 袋外评估 (OOB Score)
        correct_oob = 0
        evaluated_samples = 0

        for i in range(n_samples):
            # 找到把样本 i 当作袋外样本的所有树
            votes = []
            for t_idx, tree in enumerate(self.trees):
                if i in self.oob_indices_per_tree[t_idx]:
                    votes.append(tree.predict_one(X[i]))

            if votes:
                evaluated_samples += 1
                pred_label = 1 if (sum(votes) / len(votes)) >= 0.5 else 0
                if pred_label == y[i]:
                    correct_oob += 1

        self.oob_score_ = round(correct_oob / evaluated_samples, 4) if evaluated_samples > 0 else 0.0
        return self


# 运行并诊断
rf = MiniRandomForest(n_estimators=5, max_features=1, seed=42)
rf.fit(dataset_X, dataset_y)

print(f"树棵数: {rf.n_estimators}")
print(f"袋外评估准确率 (OOB Score): {rf.oob_score_}")
print(f"特征重要性 [特征0, 特征1]: {rf.feature_importances_}")
