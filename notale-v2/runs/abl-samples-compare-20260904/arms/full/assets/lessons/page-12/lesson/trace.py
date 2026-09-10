def _snapshot(trees, oob_accuracy, importances, current_tree_idx, phase, annotation):
    tree_summaries = []
    for t in (trees or []):
        tree_summaries.append({
            "id": f"tree-{t.get('tree_id')}",
            "tree_id": t.get("tree_id"),
            "split_feat": f"f{t.get('split_feature')}",
            "thresh": round(t.get("threshold", 0.0), 2),
            "cand_feats": [f"f{f}" for f in t.get("features", [])],
            "in_bag_count": len(t.get("in_bag", [])),
            "oob_count": len(t.get("oob", [])),
            "oob_indices": t.get("oob", []),
        })

    focus = []
    if current_tree_idx is not None and 0 <= current_tree_idx < len(tree_summaries):
        focus.append({"id": f"tree-{current_tree_idx}", "role": "current"})

    imp_items = [
        {"feat": "f0 (主导信号)", "value": round(importances.get("f0", 0.0), 2), "ratio": importances.get("f0", 0.0)},
        {"feat": "f1 (辅助特征)", "value": round(importances.get("f1", 0.0), 2), "ratio": importances.get("f1", 0.0)},
        {"feat": "f2 (随机噪声)", "value": round(importances.get("f2", 0.0), 2), "ratio": importances.get("f2", 0.0)},
    ] if importances else [
        {"feat": "f0 (主导信号)", "value": 0.60, "ratio": 0.60},
        {"feat": "f1 (辅助特征)", "value": 0.40, "ratio": 0.40},
        {"feat": "f2 (随机噪声)", "value": 0.00, "ratio": 0.00},
    ]

    oob_pct = f"{round(oob_accuracy * 100, 1)}%" if oob_accuracy is not None else "100.0%"

    return {
        "kind": "random-forest",
        "state": {
            "phase": phase,
            "trees": tree_summaries,
            "active_tree": current_tree_idx,
            "importances": imp_items,
            "oob_acc": oob_pct,
            "total_samples": 8,
        },
        "focus": focus,
        "changes": [],
        "metrics": {
            "已训练树": len(tree_summaries),
            "OOB准确率": oob_pct,
            "f0分裂占比": f"{int((importances or {}).get('f0', 0.6) * 100)}%",
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    func_name = frame.f_code.co_name
    filename = frame.f_code.co_filename
    if not filename.endswith("starter.py"):
        return None

    if func_name == "build_forest":
        t = frame.f_locals.get("t")
        forest = frame.f_locals.get("forest", [])
        if t is not None:
            ann = f"第 {t + 1} 棵树训练：Bootstrap 重采样样本并随机选取 2 个特征候选。"
            return _snapshot(forest, None, {}, t, "growing", ann)

    elif func_name == "evaluate_oob":
        correct = frame.f_locals.get("correct", 0)
        evaluated = frame.f_locals.get("evaluated", 0)
        forest = frame.f_locals.get("forest", [])
        acc = correct / evaluated if evaluated > 0 else 0.0
        ann = f"遍历所有样本的袋外树投票：当前已评估 {evaluated} 个样本，正确 {correct} 个。"
        return _snapshot(forest, acc, {}, None, "evaluating", ann)

    return None


def finalize(namespace, previous_state):
    trees = namespace.get("trees", [])
    oob_acc = namespace.get("oob_accuracy", 1.0)
    importances = namespace.get("importances", {"f0": 0.6, "f1": 0.4, "f2": 0.0})
    ann = f"森林训练完成！OOB 准确率达 {round(oob_acc * 100, 1)}%；主导特征 f0 获得最高重要性权重。"
    return _snapshot(trees, oob_acc, importances, None, "complete", ann)
