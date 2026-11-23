# Product Requirements Document (PRD): Remove Item from Shopping Cart

## 1. Overview
Extend the existing Shopping Cart App (see `docs/shopping-cart-prd.md`) by adding the ability to remove an item from the cart using its unique `id`.

## 2. Goals & Non-Goals
### Goals
- Remove an existing item from the shopping cart by its `id`.
- Ensure removed items are no longer returned when viewing a single item or all items.

### Non-Goals (Out of Scope)
- Partial quantity decrements (updating item quantity).
- Bulk deletion or clearing the entire cart at once.
- Undo / soft-delete / item restoration.

## 3. Functional Requirements

### 3.1 Remove an Item by ID
- **Description:** Deletes a single item from the cart matching the provided `id`.
- **Input:** `id` (string, required)
- **Behavior:**
  - Look up the item matching `id` in the cart.
  - If found, remove it from the cart and return a success response (e.g., `204 No Content` or `200 OK` with confirmation/removed item).
- **Error Handling:**
  - Return a not-found error (e.g., `404 Not Found`) if no item matches the given `id`.

## 4. Suggested API Endpoint (if REST)
- `DELETE /items/:id` — Remove an item by ID (`204 No Content` or `200 OK` / `404 Not Found`)

## 5. Acceptance Criteria
- Removing an existing item by `id` deletes it from the cart and returns a success response.
- Subsequent `GET /items/:id` for the removed `id` returns a not-found error.
- Subsequent `GET /items` no longer includes the removed item.
- Attempting to remove a non-existent `id` returns a not-found error without affecting other items in the cart.
