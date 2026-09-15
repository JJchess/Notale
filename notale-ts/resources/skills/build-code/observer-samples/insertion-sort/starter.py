"""相邻交换式插入排序：当前元素逐格向左归位；相等元素不交换，保持稳定。"""
NUMBERS = [7, 3, 5, 3, 2, 6]


def insertion_sort(values):
    for i in range(1, len(values)):
        j = i
        # 左邻更大才交换；每次交换使当前元素向左前进一步。
        while j > 0 and values[j - 1] > values[j]:
            values[j - 1], values[j] = values[j], values[j - 1]
            j -= 1
    return values


result = insertion_sort(list(NUMBERS))
print("排序结果:", result)
