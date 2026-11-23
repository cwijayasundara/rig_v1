# Plan: View an item by id

## Files
- src/cart/routes/get_item.py: new route module
- tests/test_get_item.py: new tests

## Interfaces
- `get_item(item_id: str, store: ItemStore) -> Item` on `router`; 404 `{"detail": "Item not found"}` when the store has no such id. Design rows: the intent's `## Design` table.

## Contracts
- none changed: docs/contracts/get-item.yaml and its examples were written at chart and are only read.

## Tests
- B1: tests/test_get_item.py, contract
- B2: tests/test_get_item.py, contract
- B3: tests/test_get_item.py, contract
- B4: tests/test_get_item.py, contract

## Decisions
- No existing test pins behaviour this change alters.
