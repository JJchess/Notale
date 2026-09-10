# 随机森林极简实现：训练单树、Bootstrap、OOB 评估与置换重要性
import random

# 数据集：8 个样本，3 个特征 [f0, f1, f2]，二分类标签 y ∈ {0, 1}
# f0 与标签正相关；f1 为辅助特征；f2 纯随机噪声
dataset = [
    ([2.0, 1.1, 8.4], 0),
    ([2.5, 1.4, 1.2], 0),
    ([3.1, 0.9, 5.5], 0),
    ([3.8, 1.8, 3.1], 0),
    ([5.2, 3.1, 9.0], 1),
    ([5.8, 2.7, 2.3], 1),
    ([6.4, 3.5, 7.8], 1),
    ([7.1, 4.0, 4.6], 1),
]

random.seed(42)


class SimpleStump:
    """单层决策树（决策桩）"""
    def __init__(self, feature_idx, threshold, left_val, right_val):
        self.feature_idx = feature_idx
        self.threshold = threshold
        self.left_val = left_val
        self.right_val = right_val

    def predict(self, x):
        return self.left_val if x[self.feature_idx] <= self.threshold else self.right_val


def fit_stump(samples, candidate_features):
    """在指定的候选特征子集上寻找最佳划分阈值"""
    best_loss = float("inf")
    best_stump = None

    for feat in candidate_features:
        values = sorted(set(x[feat] for x, y in samples))
        for i in range(len(values) - 1):
            thresh = (values[i] + values[i + 1]) / 2.0
            left_y = [y for x, y in samples if x[feat] <= thresh]
            right_y = [y for x, y in samples if x[feat] > thresh]
            if not left_y or not right_y:
                continue

            pred_l = 1 if sum(left_y) >= len(left_y) / 2 else 0
            pred_r = 1 if sum(right_y) >= len(right_y) / 2 else 0
            err = sum(1 for y in left_y if y != pred_l) + sum(1 for y in right_y if y != pred_r)

            if err < best_loss:
                best_loss = err
                best_stump = SimpleStump(feat, thresh, pred_l, pred_r)

    return best_stump


def build_forest(data, n_trees=5, max_features=2):
    """构建随机森林，记录每棵树的 OOB 样本与模型"""
    n = len(data)
    forest = []
    all_features = [0, 1, 2]

    for t in range(n_trees):
        # 1. Bootstrap 采样样本下标
        indices = [random.randrange(n) for _ in range(n)]
        in_bag_set = set(indices)
        oob_indices = [i for i in range(n) if i not in in_bag_set]

        # 2. 特征子采样：随机选取 max_features 个候选特征
        cand_feats = sorted(random.sample(all_features, max_features))

        # 3. 拟合基学习器
        sampled_data = [data[i] for i in indices]
        tree = fit_stump(sampled_data, cand_feats)

        forest.append({
            "tree_id": t,
            "tree": tree,
            "in_bag": indices,
            "oob": oob_indices,
            "features": cand_feats,
            "split_feature": tree.feature_idx,
            "threshold": tree.threshold,
        })

    return forest


def evaluate_oob(forest, data):
    """计算森林的袋外 (OOB) 准确率"""
    n = len(data)
    oob_preds = [[] for _ in range(n)]

    for model in forest:
        tree = model["tree"]
        for idx in model["oob"]:
            x, _ = data[idx]
            oob_preds[idx].append(tree.predict(x))

    correct = 0
    evaluated = 0
    for i in range(n):
        votes = oob_preds[i]
        if votes:
            majority = 1 if sum(votes) >= len(votes) / 2 else 0
            if majority == data[i][1]:
                correct += 1
            evaluated += 1

    acc = correct / evaluated if evaluated > 0 else 0.0
    return acc, oob_preds


# 执行训练与评估
trees = build_forest(dataset, n_trees=5, max_features=2)
oob_accuracy, sample_votes = evaluate_oob(trees, dataset)

# 诊断特征重要性（简易特征使用频次与划分统计）
feature_splits = [t["split_feature"] for t in trees]
importances = {
    f"f{f}": feature_splits.count(f) / len(trees)
    for f in [0, 1, 2]
}
