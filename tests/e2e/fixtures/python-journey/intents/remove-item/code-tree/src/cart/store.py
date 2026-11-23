import threading
import uuid

from cart.models import Item, NewItem


class ItemStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, Item] = {}

    def add(self, new_item: NewItem) -> Item:
        item = Item(
            id=str(uuid.uuid4()),
            name=new_item.name,
            price=new_item.price,
            quantity=new_item.quantity,
        )
        with self._lock:
            self._items[item.id] = item
        return item

    def get(self, item_id: str) -> Item | None:
        with self._lock:
            return self._items.get(item_id)

    def all(self) -> list[Item]:
        with self._lock:
            return list(self._items.values())

    def remove(self, item_id: str) -> Item | None:
        with self._lock:
            return self._items.pop(item_id, None)