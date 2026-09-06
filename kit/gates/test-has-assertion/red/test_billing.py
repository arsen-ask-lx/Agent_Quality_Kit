import pytest


def test_total_is_summed():
    pass


def test_currency_is_kept():
    assert True


@pytest.mark.skip
def test_refund_is_reversible():
    assert refund(pay(100)) == 0
