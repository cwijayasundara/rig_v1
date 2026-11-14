import pytest

from shopsvc.pricing import total


def test_total_sums_lines():
    assert total([(250, 2), (100, 1)]) == 600


def test_discount_code_applies():
    assert total([(1000, 1)], "SAVE20") == 800


def test_unknown_code_is_refused():
    with pytest.raises(ValueError):
        total([(1000, 1)], "NOPE")
