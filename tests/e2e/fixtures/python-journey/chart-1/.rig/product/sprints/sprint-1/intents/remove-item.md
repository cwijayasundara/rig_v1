---
sprint: 1
prd: [FR-1]
depends: []
estimate_days: 1
kind: boundary
owner:
status: draft
scope: [src/cart/store.py, src/cart/routes/remove_item.py, tests/test_remove_item.py, tests/test_store.py, docs/contracts/remove-item.yaml, docs/contracts/examples/remove-item-404.json]
touches: [tests/conftest.py]
---
# Remove an item from the cart

## Intent

A user removes an item from the cart with DELETE /items/{id}. The in-memory `ItemStore` gets a `remove` operation and one new route module adds the endpoint; `routes/__init__.py` includes it without being edited. Done: DELETE of a stored id answers 204 and the item is gone from the store, and DELETE of an unknown id answers 404 `{"detail": "Item not found"}` and changes nothing.

## Non-goals

- Do not add quantity decrement, bulk delete, clear-cart, undo or restore.
- Do not change POST /items, GET /items or the 400 error handler.
- Do not touch the store's dict from a route; go through `ItemStore.remove`.
- Do not answer any request with 422.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| ItemStore.remove (store.py) | deletes the item with this id under the store lock and returns it, or returns None when no item has that id | import FastAPI |
| remove_item (routes/remove_item.py) | maps DELETE /items/{id} to `store.remove`: 204 when found, 404 when None | touch the store's dict |

## Interfaces

Contract: docs/contracts/remove-item.yaml
Example: docs/contracts/examples/remove-item-404.json

`ItemStore.remove(item_id: str) -> Item | None`; `remove_item(item_id, store) -> Response` on `router`.

## Behaviours

- B1 (FR-1, AC-1.1, DR-1): DELETE /items/{id} with the id of a stored item answers 204 No Content with an empty body and the item is removed from the store.
- B2 (FR-1, AC-1.2): after a removal, GET /items/{id} for that id answers 404 Not Found.
- B3 (FR-1, AC-1.3): after a removal, GET /items does not include the removed item and keeps the other items in their order.
- B4 (FR-1, AC-1.4, DR-1): DELETE /items/{id} with an id that matches no item answers 404 `{"detail": "Item not found"}` and every other item stays in the cart; the id is matched by exact equality, so a non-UUID or upper-cased id of a stored item is also a 404.
- B5 (FR-1, AC-1.1, AC-1.4): a second DELETE of the same id answers 404 (proposed at chart).
- B6 (FR-1, AC-1.1, AC-1.4): two DELETEs of the same id handled at the same moment answer one 204 and one 404, never two 204s (proposed at chart).

### Failure behaviour

- B7 (FR-1, AC-1.4): no DELETE answers 422 or 400; the only statuses are 204 and 404 (proposed at chart).

## Tests required

- B1, B4, B5, B7: contract, tests/test_remove_item.py (TestClient on `create_app()` from tests/conftest.py); the 404 body is checked against docs/contracts/examples/remove-item-404.json.
- B2, B3: integration, tests/test_remove_item.py (POST items, DELETE one, then GET).
- B6: unit with threads, tests/test_remove_item.py, plus tests/test_store.py for `ItemStore.remove`.
- Each test's name or a comment carries its B-number.

## Open questions

none
