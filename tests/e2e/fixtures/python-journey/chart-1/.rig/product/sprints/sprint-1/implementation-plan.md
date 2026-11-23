---
sprint: 1
updated: 2026-11-23
---
# Sprint 1 implementation plan

**Goal:** a user removes an item from the in-memory cart with DELETE /items/{id}.

**Architecture:** `ItemStore` gains `remove`; one new route module `routes/remove_item.py` is picked up by `routes/__init__.py`. See .rig/product/architecture.md.

**Tech stack:** Python 3.12, uv, FastAPI with Pydantic v2, pytest with httpx TestClient, ruff, mypy.

**Design:** none (tier S)

## Global constraints

- Errors are `{"detail": "<string>"}` (ADR-0002); a removal never answers 422.
- Routes reach the store only through `deps.get_store`; the store never imports FastAPI.
- Cart state stays in process memory only.

## Review focus

- The check-then-delete in `ItemStore.remove` is done under the store lock, so two concurrent DELETEs give one 204 and one 404.
- A 404 changes nothing: other items stay.

## Allocation

| Lane | Intents | Days | Suits | Why |
|---|---|---|---|---|
| 1 | remove-item | 1 | senior | concurrency on the shared store |

## Intents

### remove-item

Depends on: none · Estimate: 1 · Suits: senior

Files: src/cart/store.py, src/cart/routes/remove_item.py, docs/contracts/remove-item.yaml and its example; tests: tests/test_remove_item.py, tests/test_store.py.

Interfaces: `ItemStore.remove(item_id: str) -> Item | None`; `remove_item` on `router` in routes/remove_item.py.

- [ ] B1, B4, B5, B7: write the failing contract tests in tests/test_remove_item.py; run them and see them fail
- [ ] B2, B3: write the failing integration tests in tests/test_remove_item.py; run them and see them fail
- [ ] B6: write the failing threaded test and the `ItemStore.remove` unit test in tests/test_store.py; run and see them fail
- [ ] B1 to B7: implement `ItemStore.remove` in store.py and routes/remove_item.py; the tests pass
- [ ] run `make test`, `make lint` and `make types`
