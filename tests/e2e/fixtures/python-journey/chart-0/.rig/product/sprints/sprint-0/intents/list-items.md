---
sprint: 0
prd: [FR-3]
depends: [add-item]
estimate_days: 1
kind: boundary
owner:
status: draft
scope: [src/cart/routes/list_items.py, tests/test_list_items.py, docs/contracts/list-items.yaml, docs/contracts/examples/list-items-200.json]
touches: [tests/test_smoke.py]
---
# View all items

## Intent

A user sees every item in the cart with GET /items. Done: S1 step 3 works, an empty cart answers `[]`, and items come oldest first. It replaces the stub that `add-item` moved into `routes/list_items.py` with a read of the store; no other file changes.

## Non-goals

- Do not add paging, filtering or sorting options.
- Do not change `store.py`, `main.py` or any other route module.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| list_items route (routes/list_items.py) | GET /items: answer 200 with `store.all()` | sort, filter or mutate the store |

## Interfaces

- Contract: docs/contracts/list-items.yaml
- Example: docs/contracts/examples/list-items-200.json

## Behaviours

- B1 (FR-3, AC-3.1): with items in the cart, GET /items answers 200 OK with a JSON list holding every added item, each as `id`, `name`, `price`, `quantity` equal to the POST answer for it.
- B2 (FR-3, AC-3.2): with an empty cart, GET /items answers 200 OK with `[]`.
- B3 (FR-3, AC-3.3): the list is in insertion order, oldest first, and the same order on every call.
- B4 (FR-3, AC-3.1): GET /items called while POSTs are being handled in other threads answers 200 with a list of whole items only, and never an error such as "dictionary changed size during iteration" (proposed at chart).

### Failure behaviour

- B5 (FR-3, AC-3.1): any query string on GET /items is ignored and the answer is the full list; the route has no error response of its own, so a failure inside it surfaces as a 500, never as a partial or empty list (proposed at chart).

## Tests required

- B1, B2, B3, B5: contract, tests/test_list_items.py; B1 against list-items-200.json; B2 is the existing smoke case, kept in tests/test_smoke.py.
- B4: unit with threads, tests/test_list_items.py (a thread posting 50 items while the main thread calls GET /items repeatedly).
- Each test's name or a comment carries its B-number.

## Open questions

none
