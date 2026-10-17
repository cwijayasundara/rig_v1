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

## Interfaces

Contract: api/stock.yaml
Example: contracts/examples/stock-low.json

## Behaviours

- B1 (FR-3): GET /stock/<sku> returns 200 with { sku, stock }, and 404 for an unknown SKU.

## Tests required

- B1: a contract test against api/stock.yaml.

## Open questions

none
