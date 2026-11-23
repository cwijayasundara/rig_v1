# Spec: Add an item to the cart

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
- B11 (FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5): no validation failure answers 422 or a `detail` that is a list; the status is always 400 with a string `detail`.
- B12 (FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5): a body that is not valid JSON, empty, or not a JSON object (an array, a string) answers 400 `{"detail": "body: must be a JSON object"}` and stores nothing (proposed at chart).
- B13 (FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5): when more than one field is invalid the message names the first of `name`, `price`, `quantity` in that order, and nothing is stored (proposed at chart).

## Blast radius
pyproject.toml
src/cart/main.py
src/cart/models.py
src/cart/store.py
src/cart/errors.py
src/cart/deps.py
src/cart/routes/__init__.py
src/cart/routes/add_item.py
src/cart/routes/list_items.py
tests/conftest.py
tests/test_store.py
tests/test_add_item.py
tests/test_add_item_concurrency.py
tests/test_smoke.py
docs/contracts/add-item.yaml
docs/contracts/examples/add-item-201.json
docs/contracts/examples/add-item-400.json
uv.lock

## Out of scope
- Update, delete or any operation not listed in docs/contracts/add-item.yaml.
- Persisting the cart outside process memory.
- Taking the `id` from the request body.
- Answering any request with 422.
- Changing GET /items behaviour or adding GET /items/{id} (those are list-items and get-item).

## Open questions
none
