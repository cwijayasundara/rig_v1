# Plan: View all items

## Files
- src/cart/routes/list_items.py: read the store in place of the stub
- tests/test_list_items.py: new tests

## Interfaces
- `list_items(store: ItemStore) -> list[Item]` on `router`: 200 with `store.all()`. Design rows: the intent's `## Design` table.

## Contracts
- none changed: docs/contracts/list-items.yaml and its example were written at chart and are only read.

## Tests
- B1: tests/test_list_items.py, contract
- B2: tests/test_list_items.py, contract
- B3: tests/test_list_items.py, contract
- B4: tests/test_list_items.py, unit
- B5: tests/test_list_items.py, contract

## Decisions
- The empty-cart smoke case in tests/test_smoke.py keeps its expectation; no existing test pins behaviour this change alters.
