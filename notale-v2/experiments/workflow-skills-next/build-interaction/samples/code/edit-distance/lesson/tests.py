def run_tests(namespace):
    edit_distance = namespace.get("edit_distance")
    result = namespace.get("result")
    matrix = namespace.get("matrix", [])
    first_row_initialized = bool(matrix) and matrix[0] == list(range(len(matrix[0])))
    first_column_initialized = bool(matrix) and [row[0] for row in matrix] == list(range(len(matrix)))
    boundary_ok = first_row_initialized and first_column_initialized
    small_cases = (
        edit_distance("", "abc")[0] == 3
        and edit_distance("same", "same")[0] == 0
        and edit_distance("ab", "ba")[0] == 2
    ) if callable(edit_distance) else False
    return [
        {
            "name": "KITTEN → SITTING 的距离为 3",
            "passed": result == 3,
            "message": "一次替换、一次替换和一次插入即可完成转换。",
            "expected": 3,
            "observed": result,
        },
        {
            "name": "空前缀边界按长度初始化",
            "passed": boundary_ok,
            "message": "空串变为长度 j 的前缀需要 j 次插入，反向同理。",
        },
        {
            "name": "递推适用于边界与相同字符",
            "passed": small_cases,
            "message": "实现应处理空串、完全相同和交叉字符，而非记住一个答案。",
        },
    ]
