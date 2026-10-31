# API conventions for the orders endpoints

These rules apply to every route under `/orders`. The older routes (`/products`, `/cart`, `/checkout`) keep their behaviour and their plain `{ error }` bodies.

## Handler and server

- `handle({ method, path, body, headers })` receives the request headers with lowercase names, and returns `{ status, body, headers }`. Response header names are lowercase. `path` includes the query string.
- `src/server.js` passes the request headers to the handler and writes the response headers it returns. A response whose `body` is `undefined` sends no body.

## Orders

1. An order in a response has `id`, `status`, `customer`, `lines`, `subtotalCents`, `discountCents`, `totalCents`, `shippingCents`, `taxCents`, `payableCents` and `version`, plus `code` when it had one. `version` is an integer: 1 when the order is placed, and it goes up by 1 each time the order changes (a cancel).
2. `ETag` is the strong tag `"<id>-v<version>"`, quotes included, for example `"ORD-0007-v2"`.

## Errors

3. Every error on `/orders` routes is a problem document: `content-type: application/problem+json`, body `{ type, title, status, detail }`. `type` is `https://shop.example/errors/<slug>`, `title` is the standard reason phrase for `status` (`Not Found`, `Bad Request`, `Method Not Allowed`, `Conflict`, `Precondition Failed`, `Precondition Required`, `Unprocessable Entity`), `detail` is a sentence. The slugs are `not-found`, `invalid-limit`, `invalid-cursor`, `method-not-allowed`, `already-cancelled`, `precondition-required`, `precondition-failed` and `idempotency-conflict`.
4. A known path with a method it does not serve answers 405 `method-not-allowed` with an `allow` header naming the one method it serves: `GET` for `/orders` and `/orders/<id>`, `POST` for `/orders/<id>/cancel`. This is decided before anything else.

## Every response on /orders routes

5. `x-request-id`: the request's own `x-request-id` when it sent one, otherwise a generated one that starts with `req-`. It is on every response, errors and 304 included.

## GET /orders

6. Query `limit` is an integer from 1 to 50 and defaults to 20; anything else is 400 `invalid-limit`. Query `cursor` is optional.
7. 200 with `{ items, nextCursor }`, newest order first. `nextCursor` is `null` on the last page, otherwise the base64url encoding of the `id` of the last item on this page; passing it as `cursor` returns the orders after that one. A cursor that does not decode to the id of an existing order (a cancelled one still exists) is 400 `invalid-cursor`.
8. The response has `cache-control: no-store`.

## GET /orders/<id>

9. 200 with the order and its `etag`; an unknown id is 404 `not-found`.
10. When the request's `if-none-match` equals the current `etag`, the answer is 304 with the `etag` header and no body.

## POST /orders/<id>/cancel

11. Checks run in this order, the first that fails answers: a stored `idempotency-key` (rule 14) → unknown id 404 `not-found` → no `if-match` header 428 `precondition-required` → `if-match` different from the current `etag` 412 `precondition-failed` → the order already cancelled 409 `already-cancelled`.
12. Success is 200 with the cancelled order and its new `etag` (version up by 1). It cancels as the `cancelOrder` function does.
13. The request body is ignored.
14. The optional `idempotency-key` header: when the same key was used by an earlier request that succeeded (2xx) for the same order id, that earlier response is returned again (status, body and `etag`) with the extra header `idempotent-replay: true`, and nothing else is checked or changed. The same key on a different order id is 422 `idempotency-conflict`. Only successful responses are remembered, so a key whose first request failed can be used again.

## The contract files

15. Every `/orders` route and each status it can answer is declared in `api/openapi.yaml` (which stays JSON-syntax, as the contract tool reads it), with at least one example per route in `contracts/examples/`, numbered after the existing ones. `node scripts/contract.mjs validate` and `run` must both pass.
