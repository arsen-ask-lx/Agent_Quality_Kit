def accumulate(rows, count):
    total = 0
    for row in rows:
        for i in range(count):
            value = compute(row[i])
            if value is None:
                continue
            total += value
    return total
