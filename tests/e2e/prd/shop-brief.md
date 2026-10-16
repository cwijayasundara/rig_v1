# Product brief: shop-app

## Context and intent

A small shop library: a catalog of products, a cart priced from it, a checkout with discount codes, and a request handler served over HTTP by `npm start`. Prices are integer cents. No runtime dependencies.

## Non-goals

- Do not add payment or persistence.
- Do not add operations not listed under Interfaces.

## Architecture

`src/catalog`, `src/cart`, `src/orders` and `src/http`, each a plain ES module; `http` depends on the other three, nothing depends on `http`. `src/server.js` serves the handler over `node:http`; nothing imports it.

## Constraints

Node 22 ESM, `node --test`, no dependencies, integer cents throughout.

## Interfaces

- `Catalog` (`add`, `get`, `list`), `Cart` (`add`, `remove`, `lines`, `subtotalCents`), `checkout(cart, { code })`, `createHandler(catalog)`.
- `npm start` serves the handler on `$PORT` (0 picks a free port), prints `listening on <port>`, and seeds the catalog with TEA-001 (Green tea, 450) and MUG-002 (Mug, 1200). The HTTP contract is `api/openapi.yaml` with examples in `contracts/examples/`.

## Behaviours

- B1: the catalog rejects an invalid SKU and a non-positive price.
- B2: the cart sums quantities and prices from the catalog.
- B3: checkout applies SAVE10 and SAVE20 and rejects an unknown code or an empty cart.
- B4: the handler serves GET /products, POST /cart and POST /checkout, over HTTP through `npm start`; 400 on error, 404 on an unknown path.
- B5: the cart removes a whole line and throws for an absent SKU.
- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.

## Tests required

- B1–B4: unit tests in test/shop.test.js. B5–B6: unit tests in test/remove.test.js.
