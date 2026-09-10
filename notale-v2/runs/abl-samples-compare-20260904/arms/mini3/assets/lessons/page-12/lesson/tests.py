def run_tests(namespace):
    oob_accuracy = namespace.get("oob_accuracy")
    feature_importances = namespace.get("feature_importances")
    forest = namespace.get("forest")

    has_forest = isinstance(forest, list) and len(forest) >= 2
    oob_valid = isinstance(oob_accuracy, (int, float)) and 0.5 <= oob_accuracy <= 1.0
    importances_valid = (
        isinstance(feature_importances, list)
        and len(feature_importances) == 3
        and feature_importances[2] >= feature_importances[1]  # f2逾期重要性高于f1
        and feature_importances[1] >= feature_importances[0]  # f1负债重要性高于f0年龄
    )

    return [
        {
            "name": "随机森林包含有效基决策树桩",
            "passed": has_forest,
            "message": "森林应至少包含 2 棵针对不同划分特征的基树。",
            "expected": ">= 2 棵树",
            "observed": len(forest) if isinstance(forest, list) else 0,
        },
        {
            "name": "袋外评估 (OOB) 计算合理",
            "passed": oob_valid,
            "message": "利用未参与训练的样本做袋外验证，OOB 准确率应处于合理区间 (>= 50%)。",
            "expected": ">= 0.50",
            "observed": oob_accuracy,
        },
        {
            "name": "特征重要性置换排序正确 (f2 > f1 > f0)",
            "passed": importances_valid,
            "message": "置换真实强相关特征 (逾期) 应导致比噪声特征 (年龄) 更显著的准确率跌幅。",
            "expected": "f2 跌幅 >= f1 跌幅 >= f0 跌幅",
            "observed": str(feature_importances),
        },
    ]
