---
product: shopping-cart
sprint: 1
engineers: 1
owner: product owner
---
# PRD: Shopping Cart API, sprint 1: remove an item

<!-- Builds on sprint 0 (docs/prd/sprint-0/prd.md) in the same codebase. The stack, layout, error shape and data rules there apply unchanged; ids FR-1..FR-3 are sprint 0's. -->

## Context and problem

Sprint 0 lets a client add and read items but never take one out. A client that added an item by mistake has no way to correct the cart short of restarting the service.

## Goals and success metrics

- Every criterion below and every sprint 0 criterion pass under `uv run pytest -q`.
- `ruff check .` and `mypy .` still report no errors.

## Non-goals

- No quantity decrement or any other update of an item.
- No clearing the whole cart or deleting several items in one request.
- No undo, soft delete or restore.

## Users and scenarios

- S1. Adds "Coffee beans" and "Tea", then DELETE `/items/<coffee id>`. Response 204. GET `/items` now lists only Tea.
- S2. DELETE the same id again. Response 404, and Tea is still in the cart.

## Functional requirements

### FR-4: Remove an item by id

Need: delete one item from the cart.
Priority: must
Depends on: FR-1

- AC-4.1: Given an item exists, when DELETE /items/{id} is called with its id, then the response is 204 with an empty body and the item is removed
- AC-4.2: Given an item was removed, when GET /items/{id} is called with its id, then the response is 404 `not_found`
- AC-4.3: Given an item was removed, when GET /items is called, then the list no longer contains it and the other items keep their order
- AC-4.4: WHEN DELETE /items/{id} is called with an id that is not in the cart THE SYSTEM SHALL respond 404 `not_found` with the message "Item <id> not found" and leave every other item unchanged
- AC-4.5: WHEN an item is removed THE SYSTEM SHALL never issue its id again to a later item
- AC-4.6: WHEN DELETE /items/{id} is called twice with the same id THE SYSTEM SHALL respond 204 the first time and 404 the second

## Data rules

- DR-6: A removed item is gone permanently; no field or record of it remains in the cart.

(DR-1 to DR-5 from sprint 0 still apply.)

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-3 | correctness | concurrent removes of the same id remove it once | exactly one 204 and the rest 404 across 50 concurrent calls | unit |

## Examples

Remove (AC-4.1):

```
DELETE /items/3f2b8c1e-6d1a-4c53-9a7e-0b5d2f6c8e11

204 No Content
```

Remove again (AC-4.4):

```
DELETE /items/3f2b8c1e-6d1a-4c53-9a7e-0b5d2f6c8e11

404 Not Found
{"error": "not_found", "message": "Item 3f2b8c1e-6d1a-4c53-9a7e-0b5d2f6c8e11 not found"}
```

## Boundaries

- Always: add `remove` to `store.py` and keep the route in `main.py` thin; extend the existing tests.
- Ask first: changing any sprint 0 response shape.
- Never: change sprint 0 behaviour; add other endpoints.

## Integrations and constraints

Unchanged from sprint 0 (Python 3.12, FastAPI, uv, pytest, ruff, mypy, in-memory store, `src/cart/` layout).

## Decisions

- 2026-11-23: success is 204 with no body, not 200 with the removed item — the original PRD allowed either (proposed).
- 2026-11-23: DELETE is not idempotent: a second call is 404 (proposed, follows the original acceptance criteria).

## Open questions

none
