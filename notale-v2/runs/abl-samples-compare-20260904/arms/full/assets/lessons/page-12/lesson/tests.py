def run_tests(namespace):
    dataset = namespace.get("dataset", [])
    trees = namespace.get("trees", [])
    oob_accuracy = namespace.get("oob_accuracy")
    importances = namespace.get("importances", {})
    build_forest = namespace.get("build_forest")

    has_5_trees = isinstance(trees, list) and len(trees) == 5
    has_oob = has_5_trees and all("oob" in t and len(t["oob"]) > 0 for t in trees)
    valid_acc = isinstance(oob_accuracy, float) and 0.5 <= oob_accuracy <= 1.0
    f0_dominant = importances.get("f0", 0) >= 0.4

    return [
        {
            "name": "随机森林包含 5 棵树且每棵树都有 OOB 样本",
            "passed": bool(has_5_trees and has_oob),
            "message": "每棵树通过 Bootstrap 抽样，未被抽中的样本构成该树的 OOB 袋外集。",
            "expected": 5,
            "observed": len(trees) if isinstance(trees, list) else 0,
        },
        {
            "name": "袋外预测准确率 OOB Accuracy ≥ 75%",
            "passed": bool(valid_acc and oob_accuracy >= 0.75),
            "message": "多数表决汇总各样本在其袋外树上的投票，得到无偏的袋外评估准确率。",
            "expected": "≥ 0.75",
            "observed": round(oob_accuracy, 3) if isinstance(oob_accuracy, float) else oob_accuracy,
        },
        {
            "name": "特征重要性诊断：有效特征 f0 获得最高划分权重",
            "passed": bool(f0_dominant),
            "message": "f0 与标签高度强相关，在多棵树的候选子集中被选为最佳分裂特征的频率最高。",
            "expected": "f0 频率 ≥ 40%",
            "observed": f"f0: {round(importances.get('f0', 0) * 100, 1)}%",
        },
    ]
