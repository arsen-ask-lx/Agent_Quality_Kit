import pytest


def test_total_is_summed():
    order = {"items": [{"price": "1.50"}, {"price": "2.50"}]}
    assert total(order) == 4


# Тест, который проверяет «не падает», — законный стиль: утверждение здесь в самом отсутствии
# исключения. Эта запись про выключенный тест, а не про то, как его следует писать.
def test_import_does_not_explode():
    build_report({"items": []})


@pytest.mark.skip(reason="ждёт песочницы платёжного шлюза, задача PAY-214")
def test_refund_is_reversible():
    assert refund(pay(100)) == 0
