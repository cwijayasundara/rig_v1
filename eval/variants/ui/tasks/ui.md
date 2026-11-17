# Customer orders: an endpoint and a screen

## Customer orders endpoint

Support wants to see what one customer has bought. Add `GET /customers/<name>/orders`. It answers 200 with `{ customer, orders }`: the orders placed by that customer, newest first by `placedAt`. Each order has `id`, `status`, `placedAt`, `payableCents` and `lines`, where each line has `sku` and `qty`. A customer with no orders is 404 with `{ error }` saying so. Any other method is 405.

## Customer orders screen

Add a page at `/ui/customers/<name>` that shows what the endpoint above answers for that customer, as a table with one row per order. Each row shows the order id, the status, the date it was placed, the total in dollars (rounded as everywhere else in the shop), and for each line the product name and the quantity. The page is plain HTML served by the shop's own server; it needs no build step.
