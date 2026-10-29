"""Cart domain values and rules (no I/O)."""

from dataclasses import dataclass, replace
from typing import Any, Protocol

from cart.errors import ItemNotFoundError, ValidationError


@dataclass(frozen=True)
class Item:
    """One line of the cart; immutable so callers cannot change the cart through it."""

    sku: str
    name: str
    quantity: int


class CartStore(Protocol):
    """The port the cart persists through; the real one is storage.JsonFileStore."""

    def load(self) -> list[Item]: ...

    def save(self, items: list[Item]) -> None: ...


class Cart:
    """A shopping cart: validates, saves through its store, and only then commits."""

    def __init__(self, store: CartStore) -> None:
        self._store = store
        self._items: tuple[Item, ...] = tuple(store.load())

    def add(self, sku: str, name: str, quantity: int) -> None:
        """Add an item, or add `quantity` to the item with the same sku (keeping its name and position)."""
        _require_text("sku", sku)
        _require_text("name", name)
        _require_quantity(quantity)
        items = list(self._items)
        for position, item in enumerate(items):
            if item.sku == sku:
                items[position] = replace(item, quantity=item.quantity + quantity)
                break
        else:
            items.append(Item(sku, name, quantity))
        self._commit(items)

    def remove(self, sku: str) -> None:
        """Remove the item with this sku, whatever its quantity."""
        items = [item for item in self._items if item.sku != sku]
        if len(items) == len(self._items):
            raise ItemNotFoundError(f"no item with sku {sku!r} in the cart")
        self._commit(items)

    def _commit(self, items: list[Item]) -> None:
        self._store.save(items)
        self._items = tuple(items)


def parse_quantity(text: str) -> int:
    """The quantity a person typed: plain ASCII digits with a value of at least 1."""
    if not (text.isascii() and text.isdigit()):
        raise ValidationError(f"quantity {text!r} must be a whole number of at least 1")
    try:
        quantity = int(text)
    except ValueError as error:  # more digits than int() converts (sys.get_int_max_str_digits)
        raise ValidationError("quantity has too many digits") from error
    _require_quantity(quantity)
    return quantity


def _require_text(field: str, value: Any) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{field} must be a non-empty string")


def _require_quantity(quantity: Any) -> None:
    if type(quantity) is not int or quantity < 1:
        raise ValidationError("quantity must be an integer of at least 1")
