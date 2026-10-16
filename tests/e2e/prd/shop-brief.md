# Product brief: shop-app

## Context and intent

A small shop library: a catalog of products, a cart priced from it, a checkout with discount codes, and a transport-agnostic request handler. Prices are integer cents. No runtime dependencies.

## Non-goals

- Do not add payment, persistence or a real HTTP server.
- Do not add operations not listed under Interfaces.

## Architecture

`src/catalog`, `src/cart`, `src/orders` and `src/http`, each a plain ES module; `http` depends on the other three, nothing depends on `http`.

## Constraints

Node 22 ESM, `node --test`, no dependencies, integer cents throughout.

## Interfaces

- `Catalog` (`add`, `get`, `list`), `Cart` (`add`, `remove`, `lines`, `subtotalCents`), `checkout(cart, { code })`, `createHandler(catalog)`.

## Behaviours

- B1: the catalog rejects an invalid SKU and a non-positive price.
- B2: the cart sums quantities and prices from the catalog.
- B3: checkout applies SAVE10 and SAVE20 and rejects an unknown code or an empty cart.
- B4: the handler serves GET /products, POST /cart and POST /checkout; 400 on error, 404 on an unknown path.
- B5: the cart removes a whole line and throws for an absent SKU.
- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.

## Tests required

- B1–B4: unit tests in test/shop.test.js. B5–B6: unit tests in test/remove.test.js.
