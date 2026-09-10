numbers = [64, 25, 12, 22, 11, 48, 36, 7, 51, 19]
original = numbers.copy()


def selection_sort(values):
    """为每个位置选择未排序区间中的最小值。"""
    for i in range(len(values) - 1):
        min_idx = i
        for j in range(i + 1, len(values)):
            if values[j] < values[min_idx]:
                min_idx = j
        if min_idx != i:
            values[i], values[min_idx] = values[min_idx], values[i]
    return values


result = selection_sort(numbers)
