# Spec: Remove an item from the cart

## Behaviours
- B1 (FR-1, AC-1.1, DR-1): DELETE /items/{id} with the id of a stored item answers 204 No Content with an empty body and the item is removed from the store.
- B2 (FR-1, AC-1.2): after a removal, GET /items/{id} for that id answers 404 Not Found.
- B3 (FR-1, AC-1.3): after a removal, GET /items does not include the removed item and keeps the other items in their order.
- B4 (FR-1, AC-1.4, DR-1): DELETE /items/{id} with an id that matches no item answers 404 `{"detail": "Item not found"}` and every other item stays in the cart; the id is matched by exact equality, so a non-UUID or upper-cased id of a stored item is also a 404.
- B5 (FR-1, AC-1.1, AC-1.4): a second DELETE of the same id answers 404 (proposed at chart).
- B6 (FR-1, AC-1.1, AC-1.4): two DELETEs of the same id handled at the same moment answer one 204 and one 404, never two 204s (proposed at chart).
- B7 (FR-1, AC-1.4): no DELETE answers 422 or 400; the only statuses are 204 and 404 (proposed at chart).

## Out of scope
- nothing beyond the intent's non-goals

## Blast radius
- src/cart/store.py
- src/cart/routes/remove_item.py
- tests/test_remove_item.py
- tests/test_store.py

## Open questions
none
