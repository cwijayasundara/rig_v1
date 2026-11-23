# Conversion of source.md, sprint 1

- context source.md:4 "Extend the existing Shopping Cart App (see `docs/shopping-cart-prd.md`) by adding the ability to remove an item from the cart using its unique `id`." — overview prose, kept in Context
- FR-1 source.md:8 "Remove an existing item from the shopping cart by its `id`."
- AC-1.2, AC-1.3 source.md:9 "Ensure removed items are no longer returned when viewing a single item or all items."
- context source.md:12 "Partial quantity decrements (updating item quantity)." — non-goal
- context source.md:13 "Bulk deletion or clearing the entire cart at once." — non-goal
- context source.md:14 "Undo / soft-delete / item restoration." — non-goal
- FR-1 source.md:19 "**Description:** Deletes a single item from the cart matching the provided `id`."
- DR-1 source.md:20 "**Input:** `id` (string, required)"
- context source.md:21 "**Behavior:**" — label
- AC-1.4 source.md:22 "Look up the item matching `id` in the cart."
- AC-1.1 source.md:23 "If found, remove it from the cart and return a success response (e.g., `204 No Content` or `200 OK` with confirmation/removed item)."
- context source.md:24 "**Error Handling:**" — label
- AC-1.4 source.md:25 "Return a not-found error (e.g., `404 Not Found`) if no item matches the given `id`."
- AC-1.1, AC-1.4 source.md:28 "`DELETE /items/:id` — Remove an item by ID (`204 No Content` or `200 OK` / `404 Not Found`)"
- AC-1.1 source.md:31 "Removing an existing item by `id` deletes it from the cart and returns a success response."
- AC-1.2 source.md:32 "Subsequent `GET /items/:id` for the removed `id` returns a not-found error."
- AC-1.3 source.md:33 "Subsequent `GET /items` no longer includes the removed item."
- AC-1.4 source.md:34 "Attempting to remove a non-existent `id` returns a not-found error without affecting other items in the cart."
