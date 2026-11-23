# Product Requirements Document (PRD): Shopping Cart App

## 1. Overview
A lightweight shopping cart application that allows users to add items to a cart, retrieve a specific item by its ID, and view all items currently in the cart.

## 2. Goals & Non-Goals
### Goals
- Add a new item to the shopping cart.
- View a single item using its unique `id`.
- View all items in the shopping cart.

### Non-Goals (Out of Scope for v1)
- User authentication or multi-user carts.
- Updating or deleting items.
- Checkout, payments, taxes, or discounts.
- Persistent database storage (in-memory storage is acceptable for v1).

## 3. Data Model

### Item
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | string | Yes (auto-generated) | Unique identifier for the item |
| `name` | string | Yes | Name of the item (non-empty) |
| `price` | number | Yes | Unit price of the item (`>= 0`) |
| `quantity` | integer | Yes | Quantity of the item (`>= 1`) |

## 4. Functional Requirements

### 4.1 Add an Item
- **Description:** Allows a user to add a new item to the cart.
- **Input:** `name`, `price`, `quantity`
- **Behavior:**
  - Validate that `name` is a non-empty string, `price >= 0`, and `quantity >= 1`.
  - Generate a unique `id` for the item and store it in the cart.
  - Return the created item (including its `id`).
- **Error Handling:** Return a validation error (e.g., `400 Bad Request`) if any required field is missing or invalid.

### 4.2 View an Item by ID
- **Description:** Retrieves a single item from the cart using its `id`.
- **Input:** `id`
- **Behavior:**
  - Look up the item matching `id`.
  - Return the item details if found.
- **Error Handling:** Return a not-found error (e.g., `404 Not Found`) if no item matches the given `id`.

### 4.3 View All Items
- **Description:** Retrieves all items currently in the cart.
- **Input:** None
- **Behavior:**
  - Return a list of all items in the cart.
  - Return an empty list (`[]`) if the cart has no items.

## 5. Suggested API Endpoints (if REST)
- `POST /items` — Add a new item (`201 Created`)
- `GET /items/:id` — View a single item by ID (`200 OK` / `404 Not Found`)
- `GET /items` — View all items (`200 OK`)

## 6. Acceptance Criteria
- Adding a valid item stores it and returns the item with a unique `id`.
- Adding an item with invalid or missing fields is rejected with a clear error message.
- Requesting an existing item by `id` returns the exact item.
- Requesting a non-existent `id` returns a not-found error.
- Requesting all items returns every added item, or an empty list when the cart is empty.
