from collections import deque


grid = [
    "#########",
    "#S..#...#",
    "#.#.#.#.#",
    "#.#...#.#",
    "#.#####.#",
    "#......G#",
    "#########",
]
start = (1, 1)
goal = (5, 7)
queue = deque([start])
visited = {start}
parent = {start: None}
directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]

while queue:
    current = queue.popleft()
    if current == goal:
        break
    for dr, dc in directions:
        candidate = (current[0] + dr, current[1] + dc)
        row, column = candidate
        if grid[row][column] != "#" and candidate not in visited:
            visited.add(candidate)
            parent[candidate] = current
            queue.append(candidate)

path = []
cursor = goal if goal in parent else None
while cursor is not None:
    path.append(cursor)
    cursor = parent[cursor]
path.reverse()
result = path
