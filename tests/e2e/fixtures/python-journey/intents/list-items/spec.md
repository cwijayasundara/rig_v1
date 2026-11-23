# Spec: View all items

## Behaviours
- B1 (FR-3, AC-3.1): with items in the cart, GET /items answers 200 OK with a JSON list holding every added item, each as `id`, `name`, `price`, `quantity` equal to the POST answer for it.
- B2 (FR-3, AC-3.2): with an empty cart, GET /items answers 200 OK with `[]`.
- B3 (FR-3, AC-3.3): the list is in insertion order, oldest first, and the same order on every call.
- B4 (FR-3, AC-3.1): GET /items called while POSTs are being handled in other threads answers 200 with a list of whole items only, and never an error such as "dictionary changed size during iteration" (proposed at chart).
- B5 (FR-3, AC-3.1): any query string on GET /items is ignored and the answer is the full list; the route has no error response of its own, so a failure inside it surfaces as a 500, never as a partial or empty list (proposed at chart).

## Out of scope
- nothing beyond the intent's non-goals

## Blast radius
- src/cart/routes/list_items.py
- tests/test_list_items.py

## Open questions
none
