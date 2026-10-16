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

Modules:
- `src/catalog/products.js` exports `Catalog`. `add({ sku, name, priceCents })`: a SKU is three capital letters, a hyphen and three digits (`TEA-001`); anything else throws `invalid sku: <sku>`. `priceCents` must be a positive integer, or `add` throws. `get(sku)` returns the product or `null`; `list()` returns every product as `{ sku, name, priceCents }`.
- `src/cart/cart.js` exports `Cart`, constructed with a catalog. `add(sku, qty)`: `qty` defaults to 1 and must be a positive integer; a SKU not in the catalog throws `unknown sku: <sku>`; adding a SKU again adds to its quantity. `lines()` returns one `{ sku, qty, unitCents }` per SKU, priced from the catalog. `subtotalCents()` is the sum of `qty × unitCents`. `remove(sku)` deletes the whole line and throws when the SKU is not in the cart.
- `src/orders/orders.js` exports `checkout(cart, { code } = {})`; the options may be omitted. It returns the order `{ lines, subtotalCents, discountCents, totalCents }` and does not change the cart. No code means no discount; `SAVE10` takes 10% off and `SAVE20` 20%; `discountCents` is rounded to the nearest cent and `totalCents = subtotalCents − discountCents`. Any other code throws `unknown discount code: <code>`; an empty cart throws `cart is empty`.
- `src/http/handler.js` exports `createHandler(catalog)`, which uses the catalog it is given and adds no products of its own, and returns the function `handle({ method, path, body })` itself (synchronous, returning `{ status, body }`), with one cart per handler; a request with no body counts as `{}`:
  - `GET /products` → 200 with the products as a bare JSON array (`[{ sku, name, priceCents }]`, not wrapped in an object);
  - `POST /cart` with `{ sku, qty }` → 201 with the cart lines as a JSON array;
  - `DELETE /cart/<sku>` → 200 with the remaining lines as a JSON array; 400 when the SKU is not in the cart;
  - `POST /checkout` with `{ code }` (optional) → 201 with the order;
  - any error → 400 with `{ error: <message> }`; an unknown path → 404.
- `src/server.js`: `npm start` serves the handler over `node:http` on `$PORT` (0 picks a free port), prints `listening on <port>`, keeps one cart per running server, and seeds the catalog with TEA-001 (Green tea, 450) and MUG-002 (Mug, 1200). Request and response bodies are JSON.
- The HTTP contract is `api/openapi.yaml` with examples in `contracts/examples/`.

## Behaviours

- B1: the catalog rejects an invalid SKU and a non-positive price.
- B2: the cart sums quantities and prices from the catalog.
- B3: checkout applies SAVE10 and SAVE20 and rejects an unknown code or an empty cart.
- B4: the handler serves GET /products, POST /cart and POST /checkout, over HTTP through `npm start`; 400 on error, 404 on an unknown path.
- B5: the cart removes a whole line and throws for an absent SKU.
- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.

## Tests required

- B1–B4: unit tests in test/shop.test.js. B5–B6: unit tests in test/remove.test.js.
