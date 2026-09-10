numbers = [42, 18, 67, 9, 55, 31, 73, 24, 60, 12]
original = numbers.copy()


def bubble_sort(values):
    """逐轮把未排序区间中的最大值推到右侧。"""
    for end in range(len(values) - 1, 0, -1):
        swapped = False
        for j in range(end):
            if values[j] > values[j + 1]:
                values[j], values[j + 1] = values[j + 1], values[j]
                swapped = True
        if not swapped:
            break
    return values


result = bubble_sort(numbers)
