def handle(items):
    if not items:
        return 0
    return sum(step(i) for i in items)


def step(i):
    if i < 0:
        return 0
    return i * 2
