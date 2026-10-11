---
sprint: 1
updated: 2026-10-11
---
# Architecture: cart

## Context
A shopper uses the cart module in-process; no external systems.

## Building blocks
- `cart` (domain): lines and totals in integer cents. No dependencies.
- `cart-api` (application): add, remove and view operations over `cart`.

## Data
Cart lines in memory, owned by `cart`.

## Integrations
none

## Quality attributes
| NFR | Tactic | Where | Verified by |
|---|---|---|---|
| NFR-1 | O(1) append, no I/O | cart | TC-3 |

## Deployment
Local only.

## Decisions
| ADR | Title | Status |
|---|---|---|
| 0001 | Money in integer cents | accepted |
| 0002 | Remove by line id, not by name | accepted |

## Concerns
none

## Open questions
none
