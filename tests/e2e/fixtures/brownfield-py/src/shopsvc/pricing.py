"""Order pricing in integer cents."""

DISCOUNTS = {"SAVE10": 10, "SAVE20": 20}


def total(lines: list[tuple[int, int]], code: str | None = None) -> int:
    """Sum (unit_cents, quantity) lines, then apply a discount code."""
    if code is not None and code not in DISCOUNTS:
        raise ValueError(f"unknown code {code}")
    gross = sum(unit * qty for unit, qty in lines)
    return gross - gross * DISCOUNTS.get(code, 0) // 100
