"""Tests for cart-operations: Cart.add, Cart.remove and parse_quantity (B1-B18)."""

import json
from pathlib import Path
from typing import Any

import pytest

from cart.errors import ItemNotFoundError, StorageError, ValidationError
from cart.models import Cart, Item, parse_quantity
from cart.storage import JsonFileStore

DATA = Path(__file__).resolve().parent.parent / ".rig" / "product" / "sprints" / "sprint-1" / "testplan" / "data"

COFFEE = {"sku": "coffee", "name": "Coffee beans", "quantity": 2}
MILK = {"sku": "milk", "name": "Whole milk", "quantity": 1}


def _cart_path(tmp_path: Path, fixture: str | None = None) -> Path:
    """The cart file in `tmp_path`, holding the test-plan fixture's bytes when one is named."""
    path = tmp_path / "cart.json"
    if fixture is not None:
        path.write_bytes((DATA / fixture).read_bytes())
    return path


def _items_in(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))["items"]
    return items


def _assert_add_refused(path: Path, sku: Any, name: Any, quantity: Any) -> None:
    before = path.read_bytes()
    cart = Cart(JsonFileStore(path))
    with pytest.raises(ValidationError):
        cart.add(sku, name, quantity)
    assert path.read_bytes() == before


# B1
def test_ac_1_1_b1_add_to_empty_cart_writes_exactly_one_item(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-empty.json")
    Cart(JsonFileStore(path)).add("coffee", "Coffee beans", 2)
    assert json.loads(path.read_text(encoding="utf-8")) == {"items": [COFFEE]}


# B2
@pytest.mark.parametrize(
    ("sku", "name"),
    [("", "Coffee beans"), ("   ", "Coffee beans"), ("coffee", ""), ("coffee", "\t "),
     (None, "Coffee beans"), (5, "Coffee beans"), ("coffee", None)],
)
def test_ac_1_2_b2_blank_or_non_string_sku_or_name_is_refused(tmp_path: Path, sku: Any, name: Any) -> None:
    _assert_add_refused(_cart_path(tmp_path, "valid-empty.json"), sku, name, 1)


# B3
@pytest.mark.parametrize("quantity", [0, -1, 2.5, "2", None, True, False])
def test_ac_1_3_ac_1_5_b3_non_integer_boolean_or_below_one_quantity_is_refused(
    tmp_path: Path, quantity: Any
) -> None:
    _assert_add_refused(_cart_path(tmp_path, "valid-empty.json"), "coffee", "Coffee beans", quantity)


# B3
def test_ac_1_3_b3_quantity_one_is_accepted(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-empty.json")
    Cart(JsonFileStore(path)).add("coffee", "Coffee beans", 1)
    assert _items_in(path) == [{**COFFEE, "quantity": 1}]


# B4
def test_ac_1_4_b4_sku_and_name_are_stored_untrimmed(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-empty.json")
    Cart(JsonFileStore(path)).add(" coffee ", " Coffee beans ", 1)
    assert json.loads(path.read_text(encoding="utf-8")) == json.loads((DATA / "valid-padded.json").read_text())


# B5
def test_ac_2_1_b5_adding_an_existing_sku_adds_the_quantities(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-one.json")
    Cart(JsonFileStore(path)).add("coffee", "Coffee beans", 3)
    assert json.loads(path.read_text(encoding="utf-8")) == json.loads((DATA / "valid-qty5.json").read_text())


# B6
def test_ac_2_2_b6_merge_keeps_the_stored_name(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-one.json")
    Cart(JsonFileStore(path)).add("coffee", "Other name", 1)
    assert _items_in(path) == [{**COFFEE, "quantity": 3}]


# B7
def test_dr_2_b7_sku_is_compared_case_sensitively(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-one.json")
    cart = Cart(JsonFileStore(path))
    cart.add("Coffee", "Coffee capsules", 1)
    assert _items_in(path) == [COFFEE, {"sku": "Coffee", "name": "Coffee capsules", "quantity": 1}]
    cart.add("coffee", "Coffee beans", 1)
    assert _items_in(path) == [{**COFFEE, "quantity": 3}, {"sku": "Coffee", "name": "Coffee capsules", "quantity": 1}]


# B12
def test_dr_4_b12_merged_add_keeps_the_items_position(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-coffee-milk.json")
    Cart(JsonFileStore(path)).add("coffee", "Coffee beans", 1)
    assert _items_in(path) == [{**COFFEE, "quantity": 3}, MILK]


# B12
def test_dr_4_b12_removed_then_re_added_sku_goes_to_the_end(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-coffee-milk.json")
    cart = Cart(JsonFileStore(path))
    cart.remove("coffee")
    cart.add("coffee", "Coffee beans", 2)
    assert _items_in(path) == [MILK, COFFEE]


# B8
def test_ac_3_1_b8_remove_leaves_the_other_item_unchanged(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-coffee-milk.json")
    Cart(JsonFileStore(path)).remove("coffee")
    assert _items_in(path) == [MILK]


# B9
def test_fr_3_b9_remove_drops_the_whole_item_whatever_its_quantity(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-qty5.json")
    Cart(JsonFileStore(path)).remove("coffee")
    assert json.loads(path.read_text(encoding="utf-8")) == {"items": []}


# B10
@pytest.mark.parametrize(
    ("fixture", "sku"),
    [("valid-coffee-milk.json", "tea"), ("valid-one.json", "Coffee"), ("valid-empty.json", "coffee")],
)
def test_ac_3_2_b10_removing_an_absent_sku_raises_item_not_found(tmp_path: Path, fixture: str, sku: str) -> None:
    path = _cart_path(tmp_path, fixture)
    before = path.read_bytes()
    cart = Cart(JsonFileStore(path))
    with pytest.raises(ItemNotFoundError):
        cart.remove(sku)
    assert path.read_bytes() == before


# B11
def test_ac_4_2_b11_a_new_cart_reloads_the_same_items_in_order(tmp_path: Path) -> None:
    path = _cart_path(tmp_path)
    cart = Cart(JsonFileStore(path))
    cart.add("coffee", "Coffee beans", 2)
    cart.add("milk", "Whole milk", 1)
    cart.add("coffee", "Coffee beans", 1)
    cart.remove("milk")
    cart.add("tea", "Green tea", 4)
    Cart(JsonFileStore(path)).add("milk", "Whole milk", 1)
    assert _items_in(path) == [{**COFFEE, "quantity": 3}, {"sku": "tea", "name": "Green tea", "quantity": 4}, MILK]


# B15
def test_ac_4_3_b15_refused_calls_leave_an_existing_file_byte_for_byte(tmp_path: Path) -> None:
    path = _cart_path(tmp_path, "valid-coffee-milk.json")
    before = path.read_bytes()
    cart = Cart(JsonFileStore(path))
    with pytest.raises(ValidationError):
        cart.add("", "Coffee beans", 1)
    with pytest.raises(ItemNotFoundError):
        cart.remove("tea")
    assert path.read_bytes() == before


# B15
def test_ac_4_3_b15_refused_calls_leave_a_missing_file_absent(tmp_path: Path) -> None:
    path = _cart_path(tmp_path)
    cart = Cart(JsonFileStore(path))
    with pytest.raises(ValidationError):
        cart.add("coffee", "Coffee beans", 0)
    with pytest.raises(ItemNotFoundError):
        cart.remove("coffee")
    assert not path.exists()


# B14
def test_ac_4_1_b14_cart_on_a_missing_file_is_empty_and_writes_nothing(tmp_path: Path) -> None:
    path = _cart_path(tmp_path)
    cart = Cart(JsonFileStore(path))
    assert not path.exists()
    cart.add("milk", "Whole milk", 1)
    assert _items_in(path) == [MILK]


class FailOnceStore:
    """An in-memory CartStore whose next save raises StorageError once `fail_next` is set."""

    def __init__(self, items: list[Item]) -> None:
        self._items = items
        self.saved: list[list[Item]] = []
        self.fail_next = False
        self.error = StorageError(Path("fake.json"), "cannot be written (injected)")

    def load(self) -> list[Item]:
        return list(self._items)

    def save(self, items: list[Item]) -> None:
        if self.fail_next:
            self.fail_next = False
            raise self.error
        self.saved.append(list(items))


BEANS = Item("coffee", "Coffee beans", 2)
TEA = Item("tea", "Green tea", 1)


# B16
def test_ac_4_3_b16_failed_save_during_add_propagates_and_is_not_committed() -> None:
    store = FailOnceStore([BEANS])
    cart = Cart(store)
    store.fail_next = True
    with pytest.raises(StorageError) as excinfo:
        cart.add("milk", "Whole milk", 1)
    assert excinfo.value is store.error
    cart.add("tea", "Green tea", 1)
    assert store.saved == [[BEANS, TEA]]


# B16
def test_ac_4_3_b16_failed_save_during_remove_propagates_and_is_not_committed() -> None:
    store = FailOnceStore([BEANS])
    cart = Cart(store)
    store.fail_next = True
    with pytest.raises(StorageError) as excinfo:
        cart.remove("coffee")
    assert excinfo.value is store.error
    cart.add("tea", "Green tea", 1)
    assert store.saved == [[BEANS, TEA]]


# B17
@pytest.mark.parametrize("fixture", ["invalid-json.json", "wrong-top-array.json", "duplicate-sku.json"])
def test_ac_4_4_ac_4_5_b17_damaged_file_makes_cart_raise_storage_error(tmp_path: Path, fixture: str) -> None:
    path = _cart_path(tmp_path, fixture)
    before = path.read_bytes()
    with pytest.raises(StorageError) as excinfo:
        Cart(JsonFileStore(path))
    assert str(path) in str(excinfo.value)
    assert path.read_bytes() == before


# B13, B18
@pytest.mark.parametrize(("text", "expected"), [("2", 2), ("1", 1), ("02", 2)])
def test_ac_1_3_b13_b18_parse_quantity_reads_ascii_digits(text: str, expected: int) -> None:
    assert parse_quantity(text) == expected


# B13
@pytest.mark.parametrize("text", ["abc", "2.5", "0", "-1", "", " ", "1e3", "True"])
def test_ac_1_3_b13_parse_quantity_refuses_non_integers_and_values_below_one(text: str) -> None:
    with pytest.raises(ValidationError):
        parse_quantity(text)


# B18
@pytest.mark.parametrize("text", ["1_000", " 2", "2 ", "+2", "00", "٣", "1" * 5000])
def test_ac_1_3_b18_parse_quantity_accepts_only_plain_ascii_digits(text: str) -> None:
    with pytest.raises(ValidationError):
        parse_quantity(text)
