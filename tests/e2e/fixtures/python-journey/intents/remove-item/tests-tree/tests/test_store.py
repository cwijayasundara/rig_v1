import uuid

from cart.models import Item, NewItem
from cart.store import ItemStore


def test_b2_ac_1_1_dr_1_add_returns_item_with_uuid4_id() -> None:
    store = ItemStore()
    item = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert isinstance(item, Item)
    assert item.name == "Tea bags"
    assert item.price == 3.25
    assert item.quantity == 12
    assert uuid.UUID(item.id).version == 4


def test_b2_ac_1_1_dr_1_add_gives_distinct_ids() -> None:
    store = ItemStore()
    first = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    second = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert first.id != second.id


def test_b2_ac_1_1_dr_1_get_returns_the_added_item() -> None:
    store = ItemStore()
    item = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert store.get(item.id) == item


def test_b2_ac_1_1_dr_1_get_missing_id_is_none() -> None:
    store = ItemStore()
    store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert store.get("missing") is None


def test_b2_ac_1_1_dr_1_all_is_in_insertion_order() -> None:
    store = ItemStore()
    added = [
        store.add(NewItem(name=name, price=1, quantity=1))
        for name in ("Tea bags", "Oat milk", "Coffee beans")
    ]
    assert store.all() == added


def test_b2_ac_1_1_dr_1_all_returns_a_copy() -> None:
    store = ItemStore()
    store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    listing = store.all()
    listing.clear()
    assert len(store.all()) == 1


def test_b1_ac_1_1_remove_returns_the_item_and_deletes_it() -> None:
    store = ItemStore()
    item = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert store.remove(item.id) == item
    assert store.get(item.id) is None
    assert store.all() == []


def test_b4_ac_1_4_remove_unknown_id_returns_none_and_keeps_items() -> None:
    store = ItemStore()
    item = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert store.remove("does-not-exist") is None
    assert store.all() == [item]


def test_b6_ac_1_4_second_remove_returns_none() -> None:
    store = ItemStore()
    item = store.add(NewItem(name="Tea bags", price=3.25, quantity=12))
    assert store.remove(item.id) == item
    assert store.remove(item.id) is None