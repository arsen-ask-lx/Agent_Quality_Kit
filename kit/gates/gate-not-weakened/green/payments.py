import json  # noqa: F401  — реэкспорт для обратной совместимости, убрать в 2.0
from decimal import Decimal


def total(order):  # type: ignore[no-any-return]  — форма заказа приходит из внешнего API
    return sum(Decimal(i["price"]) for i in order["items"])
