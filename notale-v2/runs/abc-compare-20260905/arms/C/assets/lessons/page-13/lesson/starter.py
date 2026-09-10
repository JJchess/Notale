def train_and_evaluate(n_estimators=10, max_features="sqrt", random_state=42):
    """
    随机森林实验评估：
    - n_estimators: 基学习器（树）数量
    - max_features: 节点分裂特征子采样策略 ("sqrt", "all", 或整数)
    返回森林训练动态与泛化指标。
    """
    import random
    import math

    # 1. 敏捷模拟数据集 (40 个样本, 4 个特征) 确保步数精简且具教学对比意义
    rng = random.Random(random_state)
    n_samples = 40
    n_features = 4
    
    X = []
    y = []
    for _ in range(n_samples):
        row = [round(rng.uniform(-2.0, 2.0), 2) for _ in range(n_features)]
        # 具有交互与非线性特征的真实信号
        signal = row[0] * 1.2 - row[1] * 0.9 + 0.4 * row[2] + rng.gauss(0, 0.2)
        y.append(1 if signal > 0 else 0)
        X.append(row)

    train_X, test_X = X[:28], X[28:]
    train_y, test_y = y[:28], y[28:]

    if max_features == "sqrt":
        m_features = max(1, int(math.isqrt(n_features)))
    elif max_features == "all":
        m_features = n_features
    else:
        m_features = min(n_features, max(1, int(max_features)))

    # 2. 简明决策树构建器
    def build_tree(data_x, data_y, max_depth=2, seed_val=0):
        t_rng = random.Random(seed_val)

        def split(indices, depth):
            pos = sum(data_y[idx] for idx in indices)
            pred = 1 if pos >= len(indices) / 2 else 0
            if depth >= max_depth or len(indices) <= 3:
                return {"leaf": True, "pred": pred}

            candidates = t_rng.sample(range(n_features), m_features)
            best_rule = None
            best_score = -1

            for f in candidates:
                vals = [data_x[i][f] for i in indices]
                pivot = sum(vals) / len(vals)
                left = [i for i in indices if data_x[i][f] <= pivot]
                right = [i for i in indices if data_x[i][f] > pivot]
                if not left or not right:
                    continue
                # 分类纯度收益
                p_l = sum(data_y[i] for i in left) / len(left)
                p_r = sum(data_y[i] for i in right) / len(right)
                purity = abs(p_l - 0.5) * len(left) + abs(p_r - 0.5) * len(right)
                if purity > best_score:
                    best_score = purity
                    best_rule = (f, pivot, left, right)

            if not best_rule:
                return {"leaf": True, "pred": pred}

            feat, thresh, left_idx, right_idx = best_rule
            return {
                "leaf": False,
                "feat": feat,
                "thresh": thresh,
                "left": split(left_idx, depth + 1),
                "right": split(right_idx, depth + 1),
            }

        return split(list(range(len(data_x))), 0)

    def predict_tree(node, row):
        curr = node
        while not curr["leaf"]:
            curr = curr["left"] if row[curr["feat"]] <= curr["thresh"] else curr["right"]
        return curr["pred"]

    # 3. 集成装袋与 OOB 跟踪
    trees = []
    oob_votes = {i: [] for i in range(len(train_X))}
    forest_progress = []
    n_train = len(train_X)

    for t in range(n_estimators):
        seed_t = random_state * 100 + t
        sub_rng = random.Random(seed_t)
        
        # Bootstrap 有放回抽样
        sample_indices = [sub_rng.randint(0, n_train - 1) for _ in range(n_train)]
        in_bag = set(sample_indices)
        oob_indices = [i for i in range(n_train) if i not in in_bag]
        
        tree = build_tree([train_X[i] for i in sample_indices], [train_y[i] for i in sample_indices], max_depth=2, seed_val=seed_t)
        trees.append(tree)

        for idx in oob_indices:
            oob_votes[idx].append(predict_tree(tree, train_X[idx]))

        # 测试集当前集成多数投票
        correct = sum(
            1 for sample, label in zip(test_X, test_y)
            if (1 if sum(predict_tree(tr, sample) for tr in trees) > len(trees) / 2 else 0) == label
        )
        acc = round(correct / len(test_y), 3)

        forest_progress.append({
            "tree_index": t + 1,
            "oob_count": len(oob_indices),
            "test_accuracy": acc,
        })

    # 计算 OOB 验证准度
    valid_oob = [idx for idx, v in oob_votes.items() if v]
    oob_acc = (
        round(sum(1 for idx in valid_oob if (1 if sum(oob_votes[idx]) > len(oob_votes[idx]) / 2 else 0) == train_y[idx]) / len(valid_oob), 3)
        if valid_oob else 0.0
    )

    return {
        "n_estimators": n_estimators,
        "max_features": max_features,
        "m_per_split": m_features,
        "progress": forest_progress,
        "final_oob_acc": oob_acc,
        "final_test_acc": forest_progress[-1]["test_accuracy"],
    }


# 运行基准实验：8 棵树，结合特征子采样
experiment = train_and_evaluate(n_estimators=8, max_features="sqrt", random_state=42)
result = experiment["progress"]
