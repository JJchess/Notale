source = "KITTEN"
target = "SITTING"


def edit_distance(source, target):
    dp = [[None] * (len(target) + 1) for _ in range(len(source) + 1)]
    for i in range(len(source) + 1):
        dp[i][0] = i
    for j in range(len(target) + 1):
        dp[0][j] = j

    for i in range(1, len(source) + 1):
        for j in range(1, len(target) + 1):
            cost = 0 if source[i - 1] == target[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[-1][-1], dp


result, matrix = edit_distance(source, target)
