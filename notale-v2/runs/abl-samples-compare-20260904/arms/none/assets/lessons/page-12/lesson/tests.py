def run_tests(namespace):
    rf = namespace.get("rf")
    dataset_X = namespace.get("dataset_X")
    dataset_y = namespace.get("dataset_y")

    tests = []

    # 1. 检查是否成功构建 MiniRandomForest 实例
    is_rf_valid = rf is not None and hasattr(rf, "trees") and len(rf.trees) == 5
    tests.append({
        "name": "随机森林基分类器构建",
        "passed": is_rf_valid,
        "message": "森林应成功训练并包含 5 棵决策树桩 (n_estimators=5)。",
        "expected": 5,
        "observed": len(rf.trees) if rf and hasattr(rf, "trees") else 0,
    })

    # 2. 检查每棵树的袋外样本集合非空且不包含全部样本
    oob_valid = False
    if is_rf_valid and hasattr(rf, "oob_indices_per_tree"):
        oob_valid = all(0 < len(indices) < len(dataset_X) for indices in rf.oob_indices_per_tree)

    tests.append({
        "name": "Bootstrap 与袋外 (OOB) 样本切分",
        "passed": oob_valid,
        "message": "每棵树应通过 Bootstrap 产生约 36.8% 的袋外未抽中样本 (OOB)。",
        "expected": "每棵树都有部分袋外样本",
        "observed": f"袋外样本记录数: {len(rf.oob_indices_per_tree) if rf and hasattr(rf, 'oob_indices_per_tree') else 0}",
    })

    # 3. 检查袋外评估准确率在合理有效区间
    oob_score = getattr(rf, "oob_score_", None)
    score_valid = isinstance(oob_score, float) and 0.5 <= oob_score <= 1.0
    tests.append({
        "name": "袋外准确率 (OOB Score) 计算",
        "passed": score_valid,
        "message": "袋外汇总投票应得出 0.5 到 1.0 之间的可靠泛化评估。",
        "expected": ">= 0.5",
        "observed": oob_score,
    })

    # 4. 检查特征重要性归一化与区分度（特征0应明显大于特征1）
    importances = getattr(rf, "feature_importances_", None)
    imp_valid = (
        isinstance(importances, list)
        and len(importances) == 2
        and abs(sum(importances) - 1.0) < 0.01
        and importances[0] > importances[1]
    )
    tests.append({
        "name": "特征重要性归一化与诊断",
        "passed": imp_valid,
        "message": "特征重要性总和应归一化为 1.0，且强分离特征0的重要性应显著高于弱特征1。",
        "expected": "特征0 > 特征1, 和约为1.0",
        "observed": importances,
    })

    return tests
