# Test plan: sprint 0 (Shopping Cart API)

## Strategy

Tier S, no roles, no NFR. Levels:
- contract: each HTTP route against docs/contracts/*.yaml and its examples (status, body shape, `{"detail"}` errors, never 422).
- integration: multi-request flows through the real app (add, then get or list; ids, ordering).
- unit: `ItemStore` and threaded add/list behaviour (no lost item, distinct ids, no iteration error).
- holdout: black-box HTTP tests in holdout/, one happy path per FR (FR-1, FR-2, FR-3) and one case per error status the client wrote (400 for FR-1, 404 for FR-2). They use only the public interface (FastAPI TestClient on cart.main.app), with expected values inline.

No Access section in architecture.md, so no access cases. Every FR, AC and DR id of requirements.md is cited by at least one case in cases.md.

## Environments and data

Local developer machine, Python 3.12 via uv, pytest, httpx TestClient; no external service. Data is synthetic: .rig/product/sprints/sprint-0/testplan/data/items.json holds valid items and invalid bodies (no real data; the client supplied none).

## Entry and exit criteria

Entry: the sprint chart is approved and the intents are built. Exit: every case passes, tests/test_smoke.py is green, ruff and mypy are clean, and all holdout cases pass.

## Regression scope

tests/test_smoke.py (GET /items answers 200 `[]` on an empty cart) and every test_<intent>.py of sprint 0.
