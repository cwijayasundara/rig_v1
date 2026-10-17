---
sprint: 1
prd: [FR-2, NFR-1]
depends: [stock-model]
estimate_days: 1
kind: internal
owner:
status: draft
---
# The cart cannot hold more than the stock

## Intent

Adding to the cart checks the catalog's stock.

## Non-goals

- Do not reserve stock between carts.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| src/cart | checks the catalog stock before adding | change the stock count |

## Interfaces

none

## Behaviours

### Failure behaviour

- B1 (FR-2): adding more than the stock throws.
- B2 (NFR-1): the message names the SKU.

## Tests required

- B1, B2: unit tests in test/cart-stock.test.js.

## Open questions

none
