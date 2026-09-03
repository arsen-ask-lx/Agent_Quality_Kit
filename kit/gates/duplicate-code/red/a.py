def sum_a(rows):
    total = 0
    for row in rows:
    value = compute(row[0])
    if value is None:
        continue
    total += value
    value = compute(row[1])
    if value is None:
        continue
    total += value
    return total
