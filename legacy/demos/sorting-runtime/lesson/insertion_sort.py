numbers = [38, 17, 43, 3, 29, 51, 9, 26, 14, 35]
original = numbers.copy()


def insertion_sort(values):
    """把当前元素插入左侧已经排好序的前缀。"""
    for i in range(1, len(values)):
        key = values[i]
        j = i - 1
        while j >= 0 and values[j] > key:
            values[j + 1] = values[j]
            j -= 1
        values[j + 1] = key
    return values


result = insertion_sort(numbers)
