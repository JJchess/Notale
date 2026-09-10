history_train_mse = [0.38, 0.28, 0.22, 0.17, 0.14, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04, 0.03]
history_val_mse = [0.36, 0.27, 0.21, 0.18, 0.16, 0.15, 0.16, 0.17, 0.18, 0.20, 0.22, 0.25]
n_trees = 12
learning_rate = 0.35

result = []
for i in range(n_trees):
    t_err = history_train_mse[i]
    v_err = history_val_mse[i]
    result.append((t_err, v_err))

min_val = min(history_val_mse)
best_iteration = history_val_mse.index(min_val) + 1
