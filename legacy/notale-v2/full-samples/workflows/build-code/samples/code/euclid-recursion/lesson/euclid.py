def gcd(a, b):
    if b == 0:
        return a
    return gcd(b, a % b)


initial_a = 1071
initial_b = 462
result = gcd(initial_a, initial_b)
