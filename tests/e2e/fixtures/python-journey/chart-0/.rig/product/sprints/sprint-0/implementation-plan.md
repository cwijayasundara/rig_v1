---
sprint: 0
updated: 2026-11-22
---
# Sprint 0 implementation plan

**Goal:** a user adds an item to the in-memory cart, views it by id and lists all items, over a FastAPI REST API.

**Architecture:** `add-item` lays the base (app factory, `ItemStore`, 400 handler, route discovery); `get-item` and `list-items` each add one route module. See .rig/product/architecture.md.

**Tech stack:** Python 3.12, uv, FastAPI with Pydantic v2, uvicorn, pytest with httpx TestClient, ruff, mypy.

**Design:** none (tier S)

## Global constraints

- Ids are UUID4 strings made by the store (ADR-0001); every error body is `{"detail": "<string>"}` and validation is 400, never 422 (ADR-0002).
- No module-level store: one `ItemStore` in `app.state`, reached through `deps.get_store`; tests build a fresh app with `create_app()`.
- Routes never touch the store's dict; the store never imports FastAPI.
- Cart state stays in process memory only.

## Review focus

- Strict validation: booleans, numeric strings, `NaN`, `2.0` for quantity must be 400 (B9 of add-item).
- A rejected POST stores nothing, whatever the field order.
- GET /items reads a snapshot copy, so concurrent POSTs never break it.
- `routes/__init__.py` includes route modules without naming them; check the new routes are really registered.

## Allocation

| Lane | Intents | Days | Suits | Why |
|---|---|---|---|---|
| 1 | add-item → get-item → list-items | 4 | senior | add-item holds the interface and the concurrency the other two build on; the reads depend on it |

## Intents

### add-item

Depends on: none · Estimate: 2 · Suits: senior

Files: pyproject.toml (`requires-python = ">=3.12"`), src/cart/main.py, models.py, store.py, errors.py, deps.py, routes/__init__.py, routes/add_item.py, routes/list_items.py (moved stub), docs/contracts/add-item.yaml and its two examples; tests: tests/conftest.py, test_store.py, test_add_item.py, test_add_item_concurrency.py.

Interfaces: `create_app() -> FastAPI`; `NewItem(name, price, quantity)`, `Item(id, name, price, quantity)`; `ItemStore.add(NewItem) -> Item`, `.get(id) -> Item | None`, `.all() -> list[Item]`; `get_store(request) -> ItemStore`; each route module exposes `router`.

- [ ] set `requires-python = ">=3.12"` in pyproject.toml and run `uv sync` (concern resolved by cwijayasundaragmail.com)
- [ ] B1, B2, B3: write the failing tests in tests/conftest.py (fixture `client` on `create_app()`) and tests/test_add_item.py for the 201 answer, unique ids, price 0 and quantity 1; run them and see them fail
- [ ] B1, B2: write the failing unit test tests/test_store.py for `ItemStore` add, get, all (insertion order); run it and see it fail
- [ ] B1, B2: implement models.py and store.py, then routes/add_item.py, routes/__init__.py, deps.py and the `create_app` factory in main.py; move the GET /items stub to routes/list_items.py; the tests and tests/test_smoke.py pass
- [ ] B4, B5, B6, B7, B9, B11, B12, B13: write the failing 400 tests in tests/test_add_item.py (one case per field and bad value, body shape, no 422, malformed body, first invalid field named, nothing stored); run and see them fail
- [ ] B4, B5, B6, B7, B9, B11, B12, B13: implement strict fields in models.py and the handler in errors.py, register it in main.py; the tests pass
- [ ] B8: write the failing test for an ignored client `id` and unknown keys, then make it pass in models.py
- [ ] B10: write the failing threaded test tests/test_add_item_concurrency.py (50 concurrent POSTs: 50 items, 50 distinct ids); run it, then make it pass in store.py if it fails
- [ ] run `make test`, `make lint` and `make types`

### get-item

Depends on: add-item · Estimate: 1 · Suits: any

Files: src/cart/routes/get_item.py, docs/contracts/get-item.yaml and its two examples; tests: tests/test_get_item.py.

Interfaces: `GET /items/{id}` -> 200 `Item` or 404 `{"detail": "Item not found"}`; module `router`.

- [ ] B1, B2, B3, B4: write the failing tests in tests/test_get_item.py (found, several items, unknown id, non-UUID id and a case-changed id are 404); run them and see them fail
- [ ] B1, B2, B3, B4: implement routes/get_item.py with `store.get` and `HTTPException(404, "Item not found")`; the tests pass
- [ ] run `make test`, `make lint` and `make types`

### list-items

Depends on: add-item · Estimate: 1 · Suits: any

Files: src/cart/routes/list_items.py (replaces the stub), docs/contracts/list-items.yaml and its example; tests: tests/test_list_items.py (tests/test_smoke.py stays).

Interfaces: `GET /items` -> 200 `list[Item]`, insertion order, `[]` when empty; module `router`.

- [ ] B1, B2, B3: write the failing tests in tests/test_list_items.py (every item listed, empty cart `[]`, oldest first on repeated calls); run them and see them fail
- [ ] B1, B2, B3: make routes/list_items.py return `store.all()`; the tests and tests/test_smoke.py pass
- [ ] B5: write the failing test in tests/test_list_items.py (GET /items?limit=1 returns the full list); run it and see it fail, then make it pass
- [ ] B4: write the threaded test (a thread posts 50 items while GET /items is called repeatedly: always 200, whole items); run it and see it pass or fix the snapshot read
- [ ] run `make test`, `make lint` and `make types`
