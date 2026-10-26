---
sprint: 1
updated: 2026-10-26
---
# Sprint 1 implementation plan

**Goal:** products carry a stock count, the cart refuses more than the stock, and the stock is readable over HTTP.

**Architecture:** `src/catalog` owns the count; `src/cart` and `src/http` read it (see architecture.md).

**Tech stack:** Node.js, node:test.

**Design:** none

## Global constraints

- Every error message names the SKU (NFR-1).

## Review focus

- The cart limit counts what is already in the cart, not just the new quantity.

## Allocation

| Lane | Intents | Days | Suits | Why |
|---|---|---|---|---|
| 1 | stock-model → stock-endpoint | 2 | senior | the model is what both other intents build on; the endpoint is a contract |
| 2 | cart-stock-limit | 1 | any | starts once stock-model is merged |

## Intents

### stock-model

Depends on: none · Estimate: 1 · Suits: senior

Files: src/catalog/catalog.js; tests: test/stock.test.js.

- [ ] B1: failing test that get and list report the stock count; then store it in the catalog
- [ ] B2: failing test that an invalid count throws naming the SKU; then validate it
- [ ] run npm test

### stock-endpoint

Depends on: stock-model · Estimate: 1 · Suits: senior

Files: src/http/stock.js; tests: contract tests against api/stock.yaml.

- [ ] B1: failing contract test for 200 with { sku, stock }; then the handler
- [ ] B2: failing contract test for 404 on an unknown SKU; then the not-found path

### cart-stock-limit

Depends on: stock-model · Estimate: 1 · Suits: any

Files: src/cart/cart.js; tests: test/cart-stock.test.js.

- [ ] B1: failing test that adding more than the stock throws; then the check in add
- [ ] B2: failing test that the message names the SKU; then the message
