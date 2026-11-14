# UI conventions for the server-rendered pages

A page is a route in `src/http/routes.js` that answers `text/html; charset=utf-8` with a string body.

1. **Error state.** When the store throws, the page answers HTTP 503 and renders `<p role="alert">...</p>` with a one-sentence message. It never answers 200 or a bare 500. In tests, `failStore(new Error('down'))` from `src/orders/orders.js` makes the store throw (`failStore(null)` clears it).
2. **Empty state.** A list with no rows renders `<p>No orders yet</p>` (for the orders page) instead of an empty table.
3. **Columns.** A table has a `<th data-field="name">` per column and a `<td data-field="name">` per cell. A page renders only fields that `api/openapi.yaml` declares in `components.schemas.Order.properties`. A field the contract does not declare yet is added to the contract first (with a description), then rendered.
4. A derived display value (a label) is its own field, named for what it shows, and is declared like any other.
