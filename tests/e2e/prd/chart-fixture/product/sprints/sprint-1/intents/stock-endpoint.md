---
sprint: 1
prd: [FR-3]
depends: [stock-model]
estimate_days: 2
kind: boundary
owner:
status: draft
---
# Stock is readable over HTTP

## Intent

GET /stock/<sku> returns the stock level.

## Non-goals

- Do not add operations not listed under Interfaces.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| src/http | maps GET /stock/<sku> to the catalog | change the stock count |

## Interfaces

Contract: api/stock.yaml
Example: contracts/examples/stock-low.json

## Behaviours

- B1 (FR-3, FR-3.1): GET /stock/<sku> returns 200 with { sku, stock }.

### Failure behaviour

- B2 (FR-3, FR-3.1): GET /stock/<sku> for an unknown SKU returns 404.

## Tests required

- B1, B2: contract tests against api/stock.yaml.

## Open questions

none
