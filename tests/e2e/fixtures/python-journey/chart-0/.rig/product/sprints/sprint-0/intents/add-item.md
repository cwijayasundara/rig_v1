---
sprint: 0
prd: [FR-1]
depends: []
estimate_days: 2
kind: boundary
owner:
status: draft
scope: [pyproject.toml, src/cart/main.py, src/cart/models.py, src/cart/store.py, src/cart/errors.py, src/cart/deps.py, src/cart/routes/__init__.py, src/cart/routes/add_item.py, src/cart/routes/list_items.py, tests/conftest.py, tests/test_store.py, tests/test_add_item.py, tests/test_add_item_concurrency.py, docs/contracts/add-item.yaml, docs/contracts/examples/add-item-201.json, docs/contracts/examples/add-item-400.json]
touches: [tests/test_smoke.py]
---
# Add an item to the cart

## Intent

A user adds an item (name, price, quantity) with POST /items. This intent also lays the shared base the two read intents build on: the app factory, the in-memory `ItemStore` (with `get` and `all` for them), the 400 error handler and the route discovery in `routes/__init__.py`, so `get-item` and `list-items` each add only their own route module. The existing GET /items handler moves unchanged from `main.py` to `routes/list_items.py` (still answers 200 `[]`) so `tests/test_smoke.py` stays green until `list-items` replaces it. Done: S1 step 1 works over HTTP and every rejection is a 400 `{"detail": "<message>"}`.

## Non-goals

- Do not add update, delete or any operation not listed under Interfaces.
- Do not persist the cart outside process memory.
- Do not take the `id` from the request body.
- Do not answer any request with 422.
- Do not change the behaviour of GET /items or add GET /items/{id}; those are `list-items` and `get-item`.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| create_app (main.py) | builds the FastAPI app, creates one ItemStore in `app.state`, registers the error handler and the routers; `app = create_app()` stays the `make run` entry point | hold a module-level store |
| NewItem, Item (models.py) | Pydantic request and response shapes: name non-empty string, price number >= 0, quantity integer >= 1, all strict | import FastAPI routes or the store |
| ItemStore (store.py) | in-memory dict keyed by id: `add(NewItem) -> Item` (generates the UUID4 id, ADR-0001), `get(id) -> Item or None`, `all() -> list[Item]` (insertion-ordered snapshot copy) | know about HTTP or raise HTTP errors |
| validation handler (errors.py) | turns every RequestValidationError into 400 `{"detail": "<field>: <reason>"}` (ADR-0002) | answer 422 |
| get_store (deps.py) | FastAPI dependency returning `request.app.state.store` | create a store |
| routes package (routes/__init__.py) | imports every module in the package and includes its `router` | name a route module explicitly (so new route modules need no edit here) |
| add_item route (routes/add_item.py) | POST /items: validate via NewItem, call `store.add`, answer 201 | build ids or touch the dict |
| project config (pyproject.toml) | sets `requires-python = ">=3.12"` (concern resolved by cwijayasundaragmail.com) | add dependencies |
| list_items route (routes/list_items.py) | the moved stub: GET /items answers 200 `[]` | read the store (that is `list-items`) |

## Interfaces

- Contract: docs/contracts/add-item.yaml
- Example: docs/contracts/examples/add-item-201.json
- Example: docs/contracts/examples/add-item-400.json

## Behaviours

- B1 (FR-1, AC-1.1, DR-1): POST /items with a non-empty string `name`, a number `price` >= 0 and an integer `quantity` >= 1 stores the item and answers 201 Created with the item as JSON: `id`, `name`, `price`, `quantity`, the last three as sent (S1: "Coffee beans", 8.5, 2).
- B2 (FR-1, AC-1.1, DR-1): the `id` is a string the server generates (a UUID4, ADR-0001), unique among the items in the cart; two POSTs of the same body get two different ids.
- B3 (FR-1, AC-1.1, DR-3, DR-4): the lowest valid values are accepted: `price` 0 and `quantity` 1 answer 201.
- B4 (FR-1, AC-1.2, DR-2): `name` missing, not a string, or the empty string answers 400 Bad Request and stores nothing.
- B5 (FR-1, AC-1.3, DR-3): `price` missing, not a number, or below 0 answers 400 Bad Request and stores nothing.
- B6 (FR-1, AC-1.4, DR-4): `quantity` missing, not an integer, or below 1 answers 400 Bad Request and stores nothing.
- B7 (FR-1, AC-1.5): every rejected POST /items answers the body `{"detail": "<message>"}` where the message names the invalid field, as `<field>: <reason>` (for example `price: must be a number >= 0`).
- B8 (FR-1, AC-1.1, DR-1): a body key `id` sent by the client is ignored and the stored item gets a generated id; any other unknown key is ignored and not echoed (proposed at chart).
- B9 (FR-1, AC-1.3, AC-1.4, DR-3, DR-4): a JSON boolean, a numeric string such as `"8.5"`, `NaN` or `Infinity` is not a number for `price`, and `2.0`, `"2"` or a boolean is not an integer for `quantity`: each answers 400 (proposed at chart).
- B10 (FR-1, AC-1.1, DR-1): POSTs handled at the same moment (the sync handlers run in a threadpool) lose no item and never hand out the same id: after N concurrent valid POSTs the store holds N items with N distinct ids (proposed at chart).

### Failure behaviour

- B11 (FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5): no validation failure answers 422 or a `detail` that is a list; the status is always 400 with a string `detail`.
- B12 (FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5): a body that is not valid JSON, empty, or not a JSON object (an array, a string) answers 400 `{"detail": "body: must be a JSON object"}` and stores nothing (proposed at chart).
- B13 (FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5): when more than one field is invalid the message names the first of `name`, `price`, `quantity` in that order, and nothing is stored (proposed at chart).

## Tests required

- B1, B2, B3, B8: contract, tests/test_add_item.py (TestClient against `create_app()` from tests/conftest.py); the 201 body is checked against docs/contracts/examples/add-item-201.json.
- B4, B5, B6, B7, B9, B11, B12, B13: contract, tests/test_add_item.py, one case per field and bad value; each asserts the 400 body and that `app.state.store.all()` is still empty; the first 400 case is checked against add-item-400.json.
- B10: unit with threads, tests/test_add_item_concurrency.py (ThreadPoolExecutor posting N=50 items), plus tests/test_store.py for `ItemStore` add, get, all.
- Each test's name or a comment carries its B-number. tests/test_smoke.py must stay green.

## Open questions

none
