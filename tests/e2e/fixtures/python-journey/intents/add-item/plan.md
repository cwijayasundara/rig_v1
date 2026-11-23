# Plan: add-item

## Files
- pyproject.toml (requires-python >=3.12)
- uv.lock (refreshed by uv sync)
- src/cart/main.py
- src/cart/models.py
- src/cart/store.py
- src/cart/errors.py
- src/cart/deps.py
- src/cart/routes/__init__.py
- src/cart/routes/add_item.py
- src/cart/routes/list_items.py (moved GET stub, unchanged behaviour)
- tests/conftest.py
- tests/test_store.py
- tests/test_add_item.py
- tests/test_add_item_concurrency.py
- tests/test_smoke.py: existing test; its expectation (GET returns 200 []) is unchanged and must stay green; the module-level app stays in src/cart/main.py as create_app().

## Interfaces
- Per the intent's `## Design` rows (.rig/product/sprints/sprint-0/intents/add-item.md): `create_app() -> FastAPI`; `NewItem(name: StrictStr, min 1; price: StrictFloat|StrictInt, finite, >= 0; quantity: StrictInt >= 1)`, unknown keys ignored; `Item(id: str, name, price, quantity)`; `ItemStore.add(NewItem) -> Item` (UUID4 id, lock-guarded), `.get(id: str) -> Item | None`, `.all() -> list[Item]` (insertion-ordered copy); `get_store(request: Request) -> ItemStore`; each route module exposes `router: APIRouter`.
- Errors (ADR-0002): RequestValidationError -> 400 `{"detail": "<field>: <reason>"}`, first invalid of name, price, quantity; non-object/invalid JSON body -> 400 `{"detail": "body: must be a JSON object"}`.

## Tests
- B1, B2, B3, B8: tests/test_add_item.py, contract (201 name, price, quantity vs docs/contracts/examples/add-item-201.json; id is a str with uuid.UUID(id).version == 4, never compared to the example id)
- B2: tests/test_store.py, unit (add/get/all, distinct ids, insertion order)
- B4, B5, B6, B7, B9: tests/test_add_item.py, contract (one case per field and bad value; store stays empty; first 400 vs add-item-400.json)
- B10: tests/test_add_item_concurrency.py, unit with threads (50 concurrent POSTs -> 50 items, 50 distinct ids)
- B11 (failure): tests/test_add_item.py, contract (no 422, detail is a string, for every invalid case)
- B12 (failure): tests/test_add_item.py, contract (invalid JSON, empty, array, string bodies; store stays empty)
- B13 (failure): tests/test_add_item.py, contract (two invalid fields -> first in name, price, quantity order; store stays empty)

## Contracts
- docs/contracts/add-item.yaml (POST /items: 201 Item, 400 {"detail": string}; written at chart, implemented here, not edited)
- docs/contracts/examples/add-item-201.json
- docs/contracts/examples/add-item-400.json

## Verification
- make test, make lint, make types

## Decisions
- Kept the sprint implementation-plan's add-item section as is; added uv.lock to the files because `uv sync` rewrites it after the requires-python change.
- Test order (plan-review.md): the B8 and B10 tests are written with the first B1-B3 tests, before models.py and store.py exist, so each is seen failing (no POST /items yet) before the code that proves it.

## Open questions
none
