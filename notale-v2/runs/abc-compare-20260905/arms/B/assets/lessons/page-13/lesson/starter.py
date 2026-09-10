# 探索随机森林的关键超参数：
# 1. n_estimators: 树的数量（通常越多越稳定，但计算成本线性增加，收益递减）
# 2. max_features: 每次分裂允许考虑的特征子集大小（控制树之间的多样性与独立性）

import random

# 固定随机种子以保证实验可复现
random.seed(42)

# 仿真数据集：200 个样本，8 个特征（包含冗余与噪声特征）
N_SAMPLES = 200
N_FEATURES = 8


def evaluate_forest(n_trees=15, max_features=3):
    """
    评估指定树数量和特征子采样数下的森林表现。
    模拟训练过程中的特征子抽样、树间相关度、OOB 泛化误差与分裂开销。
    """
    history = []
    
    # 特征子采样比例：m / M
    feature_ratio = max_features / N_FEATURES
    
    # 随着树数量增加，袋外误差逐渐收敛；
    # 特征子采样降低树间相关性 rho，但如果 max_features 过小，单棵树偏差会上升
    # 理论集成方差公式：Var = rho * sigma^2 + (1 - rho) / T * sigma^2
    tree_diversity = 1.0 - (feature_ratio * 0.55)  # 多样性评分
    base_error = 0.32 - (feature_ratio * 0.08)    # 单树固有偏差
    
    current_oob = 0.45
    total_splits_cost = 0
    
    for t in range(1, n_trees + 1):
        # 模拟第 t 棵树的训练与特征采样
        selected_features = sorted(random.sample(range(N_FEATURES), max_features))
        
        # 模拟训练成本：与特征数和树数量成正比
        split_cost = max_features * 12
        total_splits_cost += split_cost
        
        # 误差随树数量 T 的收敛过程（方差以 1/T 衰减，下限由基偏差与多样性决定）
        target_error = base_error + (0.28 / (1.0 + t * tree_diversity * 0.6))
        current_oob = round(target_error, 4)
        
        history.append({
            "tree_id": t,
            "sampled_features": selected_features,
            "current_oob_error": current_oob,
            "total_cost": total_splits_cost,
        })
        
    return {
        "n_trees": n_trees,
        "max_features": max_features,
        "final_oob_error": current_oob,
        "total_cost": total_splits_cost,
        "history": history,
    }


# 调整这两个参数观察右侧树间特征覆盖率、OOB 误差曲线与计算开销：
n_estimators = 12
max_features = 3

result = evaluate_forest(n_trees=n_estimators, max_features=max_features)
print(f"森林规模: {result['n_trees']} 棵树, 每次分裂考虑特征数: {result['max_features']}/{N_FEATURES}")
print(f"最终 OOB 泛化误差: {result['final_oob_error']:.4f}, 训练总分裂成本: {result['total_cost']}")
