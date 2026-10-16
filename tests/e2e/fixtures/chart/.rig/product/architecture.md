---
sprint: 0
updated: 2026-10-15
---
# Architecture: shop-app

## Context
A shopper buys listed products in-process; no external systems, no HTTP server yet (FR-4 is transport-agnostic).

## Building blocks
- `catalog` (domain): products keyed by SKU, validates SKU shape and positive integer prices (FR-1).
- `cart` (domain): quantities per SKU, priced from the catalog; lines and subtotal in integer cents (FR-2).
- `orders` (application): checkout freezes a cart into an order and applies at most one discount code (FR-3).
- `http` (adapter): maps `{ method, path, body }` to `{ status, body }` over catalog, cart and checkout (FR-4).

## Data
Products, cart lines and orders in memory, owned by their module. No personal data.

## Integrations
none

## Quality attributes
| NFR | Tactic | Where | Verified by |
|---|---|---|---|
| NFR-1 | in-memory maps, no I/O | catalog, cart | TC-5 |
| NFR-2 | Node built-ins only | all | TC-6 |
| NFR-3 | integer cents, validated quantities | catalog, cart, orders | TC-7 |

## Deployment
Local only.

## Decisions
| ADR | Title | Status |
|---|---|---|
| 0001 | Money in integer cents | accepted |

## Concerns
none

## Open questions
none
