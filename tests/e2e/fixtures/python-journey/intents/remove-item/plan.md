# Plan: Remove an item from the cart

## Files
- src/cart/store.py: add `ItemStore.remove`
- src/cart/routes/remove_item.py: new route module, DELETE /items/{id}
- tests/test_remove_item.py: new tests
- tests/test_store.py: tests for `ItemStore.remove`

## Interfaces
- `ItemStore.remove(item_id: str) -> Item | None`: deletes under the store lock and returns the item, or None.
- `remove_item(item_id: str, store: ItemStore) -> Response` on `router`: 204 when found, 404 `{"detail": "Item not found"}` when None.
- Design rows: the intent's `## Design` table (ItemStore.remove, remove_item).

## Contracts
- none changed: docs/contracts/remove-item.yaml and its 404 example were written at chart and are only read.

## Tests
- B1: tests/test_remove_item.py, contract
- B2: tests/test_remove_item.py, integration
- B3: tests/test_remove_item.py, integration
- B4: tests/test_remove_item.py, contract
- B5: tests/test_remove_item.py, contract
- B6: tests/test_remove_item.py and tests/test_store.py, unit
- B7: tests/test_remove_item.py, contract

## Decisions
- No existing test pins behaviour this change alters.
