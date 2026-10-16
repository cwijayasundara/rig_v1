---
product: shop-app
sprint: 0
status: accepted
owner: Pat (product owner)
contributors: [Bea (BA), Ari (architect), Tess (test lead)]
---
# PRD: shop-app, sprint 0

## Context and problem
A small shop has no code at all. Sellers cannot list products, shoppers cannot collect items, and nothing can be
checked out. This sprint builds the whole shop as a Node.js 22 ESM library with a transport-agnostic HTTP-style
handler, so a real HTTP layer can be attached later without changing the domain.

## Goals and success metrics
| ID | Goal | Metric | Baseline | Target | How measured |
|---|---|---|---|---|---|
| G-1 | A shopper can buy listed products end to end | scripted purchase through the handler | impossible (no code) | 1 purchase of 2 products in the acceptance tests | `npm test` |
| G-2 | Money is never mispriced by float rounding | totals computed in integer cents | n/a | 100% of totals integer cents | code inspection + tests |

## Non-goals
Deleting or editing a cart line once added (arrives as a later change), payment, accounts and authentication,
persistence, a real HTTP server, discounts beyond the two named codes.

## Users and personas
Shopper, several times a week, anonymous. Seller, seeds the catalog at startup, trusted.

## Functional requirements
### FR-1: Product catalog
- Contract: `Catalog` exported from `src/catalog/products.js` with `add({ sku, name, priceCents })`, `get(sku)` and `list()`
- Need: the seller lists products shoppers can buy
- Acceptance criteria: Given a product `{ sku: 'TEA-001', name: 'Green tea', priceCents: 450 }`, when it is added, then `get` and `list` return it; given a SKU that is not three capitals, a dash and three digits, when it is added, then it throws an error containing `invalid sku`; given a price that is not a positive integer, when it is added, then it throws
- Priority: must
- Depends on: none
- Delta: new

### FR-2: Cart
- Contract: `Cart` exported from `src/cart/cart.js`, constructed with a catalog, with `add(sku, qty = 1)`, `lines()` returning `[{ sku, qty, unitCents }]` and `subtotalCents()`
- Need: a shopper collects products and sees what they owe
- Acceptance criteria: Given a catalog with TEA-001 at 450 and MUG-002 at 1200, when the cart adds TEA-001 twice, MUG-002 once and TEA-001 once more, then `lines()` reports quantities 3 and 1 with the catalog prices and `subtotalCents()` is 2550; given a SKU the catalog does not know, when it is added, then it throws; given a quantity that is not a positive integer, when it is added, then it throws
- Priority: must
- Depends on: FR-1
- Delta: new

### FR-3: Checkout with a discount code
- Contract: `checkout(cart, { code } = {})` exported from `src/orders/orders.js`, returning `{ lines, subtotalCents, discountCents, totalCents }`; discount codes SAVE10 (10%) and SAVE20 (20%)
- Need: a shopper checks out and a known code discounts the order
- Acceptance criteria: Given a cart with two MUG-002 at 1200, when checkout runs with code SAVE10, then the total is 2160; given code FREE, then checkout throws an error containing `unknown discount`; given an empty cart, then checkout throws an error containing `empty`; given no code, then the total equals the subtotal
- Priority: must
- Depends on: FR-2
- Delta: new

### FR-4: HTTP-style handler
- Contract: `createHandler(catalog)` exported from `src/http/handler.js`, returning the handler function itself (not an object holding it): `createHandler(catalog)({ method, path, body }) -> { status, body }`
- Need: the shop is usable through one request/response function
- Acceptance criteria: Given a seeded catalog, when `GET /products` is handled, then the status is 200 and the body lists the products; when `POST /cart` adds a known SKU, then the status is 201; when `POST /checkout` follows, then the body carries the order total; when `POST /cart` names an unknown SKU, then the status is 400; when the path is unknown, then the status is 404
- Priority: must
- Depends on: FR-1, FR-2, FR-3
- Delta: new

## Non-functional requirements
| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | performance | the full test suite on a developer laptop | under 5000 ms | unit (suite timing) |
| NFR-2 | operability | runtime dependencies | 0 (Node built-ins only) | unit (package.json inspection) |
| NFR-3 | security | money and quantities are validated integers; no float money anywhere | 100% of prices and totals integer cents | unit + code inspection |

## Data
Products, cart lines and orders live in memory only; no personal data; nothing is retained between restarts.

## Integrations and constraints
Node.js 22, ESM, no dependencies, tests with `node --test`. No external systems, no network, no database.

## Release and rollout
Local only. The production gate is the harness's own gate; rollback is reverting the merge commit.

## Risks and assumptions
| ID | Risk or assumption | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | prices as floats round badly | medium | medium | integer cents everywhere (NFR-3) | Ari |
| R-2 | the handler is mistaken for a real HTTP server | low | low | transport-agnostic contract stated in FR-4 | Bea |

## Changes since last sprint
none (sprint 0)

## Open questions
none
