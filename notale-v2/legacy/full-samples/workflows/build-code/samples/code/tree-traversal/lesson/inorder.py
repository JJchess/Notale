class Node:
    def __init__(self, value, left=None, right=None):
        self.value = value
        self.left = left
        self.right = right


root = Node(
    4,
    Node(2, Node(1), Node(3)),
    Node(6, Node(5), Node(7)),
)
visited = []


def inorder(node):
    if node is None:
        return
    inorder(node.left)
    visited.append(node.value)
    inorder(node.right)


inorder(root)
result = visited.copy()
