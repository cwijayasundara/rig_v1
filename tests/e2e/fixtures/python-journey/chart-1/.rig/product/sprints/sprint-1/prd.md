---
product: Shopping Cart API
sprint: 1
engineers: 1
owner: cwijayasundaragmail.com
---
# PRD: Shopping Cart API, sprint 1

## Context and problem

Extend the existing Shopping Cart App (see `docs/shopping-cart-prd.md`) by adding the ability to remove an item from the cart using its unique `id`.

## Goals and success metrics

- Remove an existing item from the shopping cart by its `id`.
- Ensure removed items are no longer returned when viewing a single item or all items.

## Non-goals

- Partial quantity decrements (updating item quantity).
- Bulk deletion or clearing the entire cart at once.
- Undo / soft-delete / item restoration.

## Users and scenarios

S1. A cart holds "Coffee beans" and "Tea bags"; the user removes "Coffee beans" by its id and the cart then lists only "Tea bags".

## Functional requirements

### FR-1: Remove an item by id

Need: a user removes a single item from the cart using its `id`.
Priority: must

- AC-1.1: WHEN DELETE /items/{id} is called with the `id` of an item in the cart THE SYSTEM SHALL remove that item from the cart and respond 204 No Content with no body (proposed at chart)
- AC-1.2: WHEN GET /items/{id} is called with the `id` of a removed item THE SYSTEM SHALL respond 404 Not Found
- AC-1.3: WHEN GET /items is called after an item was removed THE SYSTEM SHALL not include the removed item in the list
- AC-1.4: WHEN DELETE /items/{id} is called with an `id` that matches no item THE SYSTEM SHALL respond 404 Not Found and leave every other item in the cart unchanged

## Data rules

- DR-1: `id` is a required string path parameter, matched by exact equality against the ids of the items in the cart.

## Non-functional requirements

none

## Examples

## Boundaries

none

## Integrations and constraints

The existing FastAPI service of sprint 0 (Python 3.12, uv, in-memory `ItemStore`).

## Decisions

- The source allows `204 No Content` or `200 OK` for a successful removal; 204 is chosen (proposed at chart).

## Open questions

none
