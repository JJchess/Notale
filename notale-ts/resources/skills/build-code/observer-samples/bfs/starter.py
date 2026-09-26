"""BFS：入队时记录距离与前驱，因此环不会造成重复访问。"""
from collections import deque

GRAPH = {"A": ["B", "C"], "B": ["D"], "C": ["D", "E"],
         "D": ["A", "F"], "E": ["F"], "F": [], "G": []}
START, TARGET = "A", "F"


def dequeue(queue, order):
    # 取出队首并记入访问顺序。
    node = queue.popleft()
    order.append(node)
    return node


def discover(neighbor, node, dist, parent, queue):
    # 首次遇到的邻居：入队的那一刻就定下距离和前驱。
    dist[neighbor] = dist[node] + 1
    parent[neighbor] = node
    queue.append(neighbor)


def bfs(graph, start):
    dist, parent = {start: 0}, {start: None}
    queue = deque([start])
    order = []
    while queue:
        node = dequeue(queue, order)
        for neighbor in graph.get(node, []):
            if neighbor not in dist:
                discover(neighbor, node, dist, parent, queue)
    return {"dist": dist, "parent": parent, "order": order}


def shortest_path(parent, target):
    if target not in parent:
        return []
    path = []
    node = target
    while node is not None:
        path.append(node)
        node = parent[node]
    return path[::-1]


result = bfs(GRAPH, START)
path = shortest_path(result["parent"], TARGET)
print("距离:", result["dist"])
print("访问顺序:", result["order"])
print("最短路径:", path)
