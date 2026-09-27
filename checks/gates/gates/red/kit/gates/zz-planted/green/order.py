def pay(x):
    # проверка валюты — задача 214 в очереди работ
    return x * 2


def ship(y):
    if not y:
        raise ValueError("пустой адрес")
    return y
