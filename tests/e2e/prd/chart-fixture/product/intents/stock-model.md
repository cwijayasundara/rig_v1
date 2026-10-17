---
sprint: 1
prd: [FR-1, NFR-1]
depends: []
estimate_days: 1
kind: internal
owner:
status: draft
---
# Products have a stock level

## Intent

The catalog stores a stock count per product.

## Non-goals

- Do not add persistence.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| src/catalog | keeps a stock count per product and validates it | know about the cart or HTTP |

## Interfaces

none

## Behaviours

- B1 (FR-1): a product added with a stock count reports it from get and list.
### Failure behaviour

- B2 (NFR-1): an invalid stock count throws a message that names the SKU.

## Tests required

- B1, B2: unit tests in test/stock.test.js.

## Open questions

none
