import json  # noqa
from decimal import Decimal


def total(order):  # type: ignore
    return sum(Decimal(i["price"]) for i in order["items"])
