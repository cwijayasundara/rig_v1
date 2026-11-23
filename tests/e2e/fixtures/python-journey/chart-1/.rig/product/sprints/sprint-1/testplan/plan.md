# Test plan: sprint 1 (remove an item)

## Strategy

Tier S, no roles, no NFR. Levels:
- contract: DELETE /items/{id} against docs/contracts/remove-item.yaml and its example (204 empty, 404 `{"detail": "Item not found"}`, never 400 or 422).
- integration: POST, DELETE, then GET flows through the real app.
- unit: `ItemStore.remove` and two threaded DELETEs of one id.
- holdout: black-box HTTP tests in holdout/, one happy path for FR-1 and one case for the 404 the client wrote. They boot a fresh `create_app()` per test and use the public HTTP interface only, with expected values inline.

No Access section in architecture.md, so no access cases. Every FR, AC and DR id of requirements.md is cited by at least one case in cases.md.

## Environments and data

Local developer machine, Python 3.12 via uv, pytest, httpx TestClient; no external service. Data is synthetic: .rig/product/sprints/sprint-1/testplan/data/items.json holds the items to post and the ids to delete.

## Entry and exit criteria

Entry: the sprint chart is approved. Exit: every case passes, tests/test_smoke.py and the sprint 0 tests stay green, ruff and mypy are clean, and all holdout cases pass.

## Regression scope

tests/test_smoke.py, every sprint 0 test_<intent>.py and tests/test_remove_item.py.
