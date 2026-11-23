---
sprint: 0
prd: [FR-2]
depends: [add-item]
estimate_days: 1
kind: boundary
owner:
status: draft
scope: [src/cart/routes/get_item.py, tests/test_get_item.py, docs/contracts/get-item.yaml, docs/contracts/examples/get-item-200.json, docs/contracts/examples/get-item-404.json]
touches: []
---
# View an item by id

## Intent

A user retrieves one item with GET /items/{id}, using the `id` from the POST answer. Done: S1 step 2 works, and an id nobody has answers 404 `{"detail": "Item not found"}`. It adds one route module; `routes/__init__.py` picks it up, so no shared file changes.

## Non-goals

- Do not add update or delete of an item.
- Do not parse or validate the id format: any string is looked up as given.
- Do not edit `main.py`, `store.py`, `models.py` or `routes/list_items.py`.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| get_item route (routes/get_item.py) | GET /items/{id}: `store.get(id)`, answer 200 with the Item or raise `HTTPException(404, "Item not found")` | read the store's dict directly, or answer 400 or 422 |

## Interfaces

- Contract: docs/contracts/get-item.yaml
- Example: docs/contracts/examples/get-item-200.json
- Example: docs/contracts/examples/get-item-404.json

## Behaviours

- B1 (FR-2, AC-2.1): GET /items/{id} with the `id` of an item in the cart answers 200 OK with exactly that item (`id`, `name`, `price`, `quantity`, equal to the POST answer for it).
- B2 (FR-2, AC-2.1, DR-1): with several items in the cart, the answer is the one whose `id` matches, never another item.
- B3 (FR-2, AC-2.2): GET /items/{id} with an `id` no item has answers 404 Not Found with the body `{"detail": "Item not found"}`.

### Failure behaviour

- B4 (FR-2, AC-2.2, DR-1): an id that is not a UUID (`abc`, a very long string) or differs from a stored id only in letter case answers the same 404 `{"detail": "Item not found"}`, never 400 or 422 (proposed at chart).

## Tests required

- B1, B2, B3, B4: contract, tests/test_get_item.py (items created through POST /items on a fresh `create_app()`); B1 against get-item-200.json and B3 against get-item-404.json.
- Each test's name or a comment carries its B-number.

## Open questions

none
