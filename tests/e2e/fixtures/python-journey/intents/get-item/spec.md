# Spec: View an item by id

## Behaviours
- B1 (FR-2, AC-2.1): GET /items/{id} with the `id` of an item in the cart answers 200 OK with exactly that item (`id`, `name`, `price`, `quantity`, equal to the POST answer for it).
- B2 (FR-2, AC-2.1, DR-1): with several items in the cart, the answer is the one whose `id` matches, never another item.
- B3 (FR-2, AC-2.2): GET /items/{id} with an `id` no item has answers 404 Not Found with the body `{"detail": "Item not found"}`.
- B4 (FR-2, AC-2.2, DR-1): an id that is not a UUID (`abc`, a very long string) or differs from a stored id only in letter case answers the same 404 `{"detail": "Item not found"}`, never 400 or 422 (proposed at chart).

## Out of scope
- nothing beyond the intent's non-goals

## Blast radius
- src/cart/routes/get_item.py
- tests/test_get_item.py

## Open questions
none
