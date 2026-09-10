def capture(frame, event, previous_state):
    # 捕获关键循环中的状态
    loc = frame.f_locals
    filename = frame.f_code.co_filename
    if not filename.endswith("starter.py"):
        return None

    dataset = frame.f_globals.get("dataset", [])
    tree_samples = frame.f_globals.get("tree_samples", [])
    oob_acc = loc.get("oob_accuracy") or frame.f_globals.get("oob_accuracy")
    base_acc = loc.get("base_acc") or frame.f_globals.get("base_acc")
    importances = loc.get("feature_importances") or frame.f_globals.get("feature_importances", [])

    t_idx = loc.get("t_idx")
    current_f = loc.get("f")
    i_sample = loc.get("i")

    phase = "running"
    annotation = "正在执行随机森林评估与诊断。"
    if t_idx is not None:
        phase = "oob"
        annotation = f"正在为树 T{t_idx} 评估袋外样本 (OOB)。"
    elif current_f is not None:
        phase = "importance"
        feat_names = ["年龄段 (f0)", "负债率 (f1)", "历史逾期 (f2)"]
        name = feat_names[current_f] if current_f < len(feat_names) else f"f{current_f}"
        annotation = f"打乱特征 [{name}]，测定森林整体预测准确率的衰减量。"

    return {
        "kind": "forest_oob",
        "state": {
            "trees": [
                {"id": 0, "feature": "历史逾期 (f2)", "threshold": 0.5, "samples": [0, 1, 1, 4, 4, 5, 7, 7], "oob": [2, 3, 6]},
                {"id": 1, "feature": "负债率 (f1)", "threshold": 0.5, "samples": [1, 2, 2, 3, 3, 6, 6, 7], "oob": [0, 4, 5]}
            ],
            "datasetSize": len(dataset) if dataset else 8,
            "activeTree": t_idx if t_idx is not None else 0,
            "currentFeature": current_f,
            "activeSample": i_sample,
            "oobAccuracy": float(oob_acc) if oob_acc is not None else None,
            "baseAccuracy": float(base_acc) if base_acc is not None else 1.0,
            "importances": [
                {"name": "f0 年龄段", "drop": importances[0] if len(importances) > 0 else 0.0},
                {"name": "f1 负债率", "drop": importances[1] if len(importances) > 1 else 0.0},
                {"name": "f2 历史逾期", "drop": importances[2] if len(importances) > 2 else 0.0}
            ],
            "phase": phase
        },
        "focus": [{"role": "tree", "id": t_idx}] if t_idx is not None else [],
        "changes": [],
        "metrics": {
            "OOB准确率": f"{round(float(oob_acc)*100, 1)}%" if oob_acc is not None else "计算中",
            "基准准确率": f"{round(float(base_acc)*100, 1)}%" if base_acc is not None else "100%",
            "当前阶段": phase
        },
        "annotation": annotation
    }

def finalize(namespace, previous_state):
    oob_acc = namespace.get("oob_accuracy", 0.0)
    base_acc = namespace.get("base_acc", 1.0)
    importances = namespace.get("feature_importances", [0.0, 0.0, 0.0])

    return {
        "kind": "forest_oob",
        "state": {
            "trees": [
                {"id": 0, "feature": "历史逾期 (f2)", "threshold": 0.5, "samples": [0, 1, 1, 4, 4, 5, 7, 7], "oob": [2, 3, 6]},
                {"id": 1, "feature": "负债率 (f1)", "threshold": 0.5, "samples": [1, 2, 2, 3, 3, 6, 6, 7], "oob": [0, 4, 5]}
            ],
            "datasetSize": 8,
            "activeTree": None,
            "currentFeature": None,
            "activeSample": None,
            "oobAccuracy": float(oob_acc),
            "baseAccuracy": float(base_acc),
            "importances": [
                {"name": "f0 年龄段", "drop": importances[0] if len(importances) > 0 else 0.0},
                {"name": "f1 负债率", "drop": importances[1] if len(importances) > 1 else 0.0},
                {"name": "f2 历史逾期", "drop": importances[2] if len(importances) > 2 else 0.0}
            ],
            "phase": "completed"
        },
        "focus": [],
        "changes": [],
        "metrics": {
            "OOB准确率": f"{round(float(oob_acc)*100, 1)}%",
            "基准准确率": f"{round(float(base_acc)*100, 1)}%",
            "核心特征": "f2 历史逾期"
        },
        "annotation": f"诊断完成：袋外泛化评估为 {round(float(oob_acc)*100, 1)}%，置换打乱后特征 f2 对模型预测能力的冲击最大。"
    }
