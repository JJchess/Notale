# 教学目标：
# 探究基学习器数量 (n_estimators) 与特征子采样 (max_features)
# 对训练耗时（成本）与泛化表现（袋外准确率 / 测试准确率）的影响。

import random
import math

# 8个样本的二分类小型合成数据集：4个特征 [f0, f1, f2, f3]
# f0 与标签正相关，f1 为非线性特征，f2, f3 为微弱/噪声特征
data = [
    ([2.5, 1.2, 0.5, 0.1], 1),
    ([1.8, 0.9, 0.8, 0.2], 1),
    ([2.9, 1.5, 0.3, 0.4], 1),
    ([2.1, 0.7, 0.9, 0.0], 1),
    ([0.8, 0.2, 1.5, 0.8], 0),
    ([0.5, 0.1, 1.2, 0.9], 0),
    ([1.1, 0.4, 1.8, 0.7], 0),
    ([0.3, 0.0, 1.0, 0.6], 0),
]


def train_stump(samples, features_subset):
    """在选定的特征子集上寻找最佳单层决策树（桩模型）"""
    best_feat = features_subset[0]
    best_thresh = 0.0
    best_acc = -1
    best_pred_gt = 1  # 大于阈值时的预测类

    for feat in features_subset:
        vals = [s[0][feat] for s in samples]
        # 候选分割点取排序后的相邻中点
        sorted_vals = sorted(list(set(vals)))
        candidates = [(sorted_vals[i] + sorted_vals[i+1]) / 2.0 for i in range(len(sorted_vals) - 1)]
        if not candidates:
            candidates = sorted_vals

        for thresh in candidates:
            # 尝试 x[feat] > thresh -> 1 或 0
            for pred_gt in (1, 0):
                corr = 0
                for x, y in samples:
                    pred = pred_gt if x[feat] > thresh else (1 - pred_gt)
                    if pred == y:
                        corr += 1
                acc = corr / len(samples)
                if acc > best_acc:
                    best_acc = acc
                    best_feat = feat
                    best_thresh = thresh
                    best_pred_gt = pred_gt

    return {"feature": best_feat, "threshold": round(best_thresh, 2), "pred_gt": best_pred_gt}


def predict_stump(tree, x):
    feat = tree["feature"]
    thresh = tree["threshold"]
    pred_gt = tree["pred_gt"]
    return pred_gt if x[feat] > thresh else (1 - pred_gt)


def run_random_forest(n_estimators=5, max_features=2, seed=42):
    rng = random.Random(seed)
    n_samples = len(data)
    n_total_features = 4

    forest = []
    tree_logs = []
    oob_preds = {i: [] for i in range(n_samples)}

    # 模拟训练每棵树并跟踪代价与袋外预测
    total_splits_evaluated = 0

    for tree_id in range(n_estimators):
        # 1. Bootstrap 样本重采样
        boot_indices = [rng.randint(0, n_samples - 1) for _ in range(n_samples)]
        oob_indices = [i for i in range(n_samples) if i not in set(boot_indices)]
        boot_samples = [data[i] for i in boot_indices]

        # 2. 特征子采样 (随机选取 max_features 个特征)
        all_feats = list(range(n_total_features))
        rng.shuffle(all_feats)
        selected_features = sorted(all_feats[:max_features])

        # 训练基学习器
        tree = train_stump(boot_samples, selected_features)
        total_splits_evaluated += len(selected_features) * 3  # 训练代价指标
        forest.append(tree)

        # 记录 OOB 预测
        for idx in oob_indices:
            pred = predict_stump(tree, data[idx][0])
            oob_preds[idx].append(pred)

        # 计算当前累积的 OOB 准确率
        valid_oob_evals = 0
        correct_oob = 0
        for idx, votes in oob_preds.items():
            if votes:
                valid_oob_evals += 1
                maj_vote = 1 if sum(votes) >= len(votes) / 2.0 else 0
                if maj_vote == data[idx][1]:
                    correct_oob += 1
        current_oob_acc = round(correct_oob / valid_oob_evals, 3) if valid_oob_evals > 0 else 0.0

        tree_logs.append({
            "tree_id": tree_id + 1,
            "features": selected_features,
            "chosen_feature": tree["feature"],
            "threshold": tree["threshold"],
            "oob_acc": current_oob_acc,
            "splits_cost": total_splits_evaluated,
        })

    # 计算整体全量集成准确率
    full_correct = 0
    for x, y in data:
        votes = [predict_stump(t, x) for t in forest]
        maj = 1 if sum(votes) >= len(forest) / 2.0 else 0
        if maj == y:
            full_correct += 1
    ensemble_acc = round(full_correct / n_samples, 3)

    return {
        "n_estimators": n_estimators,
        "max_features": max_features,
        "forest": forest,
        "tree_logs": tree_logs,
        "final_oob_acc": tree_logs[-1]["oob_acc"] if tree_logs else 0.0,
        "ensemble_acc": ensemble_acc,
        "total_cost": total_splits_evaluated,
    }


# 读者可尝试修改 n_estimators (树数量: 1~8) 与 max_features (子特征数: 1~4)
n_estimators = 5
max_features = 2

experiment = run_random_forest(n_estimators=n_estimators, max_features=max_features, seed=42)
result = experiment["ensemble_acc"]
oob_acc = experiment["final_oob_acc"]
print(f"树数量: {n_estimators}, 特征子采样: {max_features}/4")
print(f"训练评估切分点总耗费 (Cost): {experiment['total_cost']}")
print(f"集成训练准确率: {result * 100:.1f}%, OOB袋外准确率: {oob_acc * 100:.1f}%")
