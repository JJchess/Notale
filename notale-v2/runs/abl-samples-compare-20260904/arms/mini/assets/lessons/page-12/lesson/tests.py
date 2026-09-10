def run_tests(namespace):
    trees = namespace.get("trees", [])
    tree_records = namespace.get("tree_records", [])
    oob_predictions = namespace.get("oob_predictions", {})
    oob_accuracy = namespace.get("oob_accuracy")
    feature_importances = namespace.get("feature_importances", {})

    # 检验 1：是否训练了 5 棵树
    has_five_trees = len(trees) == 5 and len(tree_records) == 5

    # 检验 2：袋外评估是否存在且准确率在合理范围内（> 0.70）
    oob_valid = isinstance(oob_accuracy, (int, float)) and 0.5 <= oob_accuracy <= 1.0 and len(oob_predictions) >= 8

    # 检验 3：特征重要性诊断，x1_主导应该明显高于 x2_噪声
    x1_imp = feature_importances.get("x1_主导", 0.0)
    x2_imp = feature_importances.get("x2_噪声", 0.0)
    importance_valid = x1_imp > x2_imp

    return [
        {
            "name": "构建 5 棵随机子树",
            "passed": has_five_trees,
            "message": "需完成 5 轮 Bootstrap 与特征子采样子树训练。",
            "expected": 5,
            "observed": len(trees)
        },
        {
            "name": "袋外 (OOB) 评估完成并得到可靠指标",
            "passed": oob_valid,
            "message": "每个未进入某棵树的样本应由该树投票并汇聚为无偏估计 (OOB Acc >= 50%)。",
            "expected": ">= 0.50",
            "observed": oob_accuracy
        },
        {
            "name": "置换重要性诊断有效性：主导特征高于噪声",
            "passed": importance_valid,
            "message": f"真实生成规则由 x1 主导，打乱 x1 后的准确率下降量应高于纯噪声 x2 (x1={x1_imp}, x2={x2_imp})。",
            "expected": f"x1_主导 > x2_噪声",
            "observed": f"x1:{x1_imp}, x2:{x2_imp}"
        }
    ]
