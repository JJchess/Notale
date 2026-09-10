def _safe_float(val):
    try:
        return float(val)
    except Exception:
        return 0.0


def capture(frame, event, previous_state):
    func_name = frame.f_code.co_name
    if func_name != "evaluate_forest" or not frame.f_code.co_filename.endswith("starter.py"):
        return None
    
    values = frame.f_locals
    t = values.get("t")
    if not isinstance(t, int) or t <= 0:
        return None
        
    n_trees = values.get("n_trees", 1)
    max_features = values.get("max_features", 1)
    selected_features = list(values.get("selected_features", []))
    current_oob = _safe_float(values.get("current_oob", 0.45))
    total_splits_cost = values.get("total_splits_cost", 0)
    history = values.get("history", [])
    
    oob_curve = [item.get("current_oob_error", 0) for item in history]
    if current_oob and (not oob_curve or oob_curve[-1] != current_oob):
        oob_curve.append(current_oob)
        
    return {
        "kind": "forest_step",
        "state": {
            "current_tree": t,
            "total_trees": n_trees,
            "max_features": max_features,
            "total_features": 8,
            "selected_features": selected_features,
            "current_oob": current_oob,
            "total_cost": total_splits_cost,
            "oob_curve": oob_curve,
            "complete": False,
        },
        "focus": [{"role": "tree", "id": t}, {"role": "features", "list": selected_features}],
        "changes": [{"role": "tree_added", "id": t}],
        "metrics": {
            "当前树编号": f"{t}/{n_trees}",
            "OOB泛化误差": f"{current_oob:.4f}",
            "累计分裂耗时": total_splits_cost,
        },
        "annotation": f"第 {t} 棵树建立完成：抽取特征子集 {selected_features}，OOB 误差刷新为 {current_oob:.4f}。",
    }


def finalize(namespace, previous_state):
    result = namespace.get("result", {})
    history = result.get("history", [])
    n_trees = result.get("n_trees", len(history))
    max_features = result.get("max_features", 3)
    final_oob = _safe_float(result.get("final_oob_error", 0.25))
    total_cost = result.get("total_cost", 0)
    
    last_features = history[-1].get("sampled_features", []) if history else []
    oob_curve = [item.get("current_oob_error", 0) for item in history]
    
    return {
        "kind": "forest_step",
        "state": {
            "current_tree": n_trees,
            "total_trees": n_trees,
            "max_features": max_features,
            "total_features": 8,
            "selected_features": last_features,
            "current_oob": final_oob,
            "total_cost": total_cost,
            "oob_curve": oob_curve,
            "complete": True,
        },
        "focus": [],
        "changes": [],
        "metrics": {
            "完成树总数": n_trees,
            "最终OOB误差": f"{final_oob:.4f}",
            "总计算开销": total_cost,
        },
        "annotation": f"随机森林构建结束！共训练 {n_trees} 棵树，最终 OOB 误差稳定在 {final_oob:.4f}。",
    }
