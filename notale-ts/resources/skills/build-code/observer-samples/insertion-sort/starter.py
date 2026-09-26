"""相邻交换式插入排序：当前元素逐格向左归位；相等元素不交换，保持稳定。"""
NUMBERS = [7, 3, 5, 3, 2, 6]


def should_swap(values, j):
    # 左邻更大才交换；相等不交换，所以排序是稳定的。
    return j > 0 and values[j - 1] > values[j]


def swap(values, j):
    # 一次相邻交换，让当前元素向左前进一步。
    values[j - 1], values[j] = values[j], values[j - 1]


def insertion_sort(values):
    for i in range(1, len(values)):
        j = i
        while should_swap(values, j):
            swap(values, j)
            j -= 1
    return values


result = insertion_sort(list(NUMBERS))
print("排序结果:", result)
