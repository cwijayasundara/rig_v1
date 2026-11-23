---
product: Shopping Cart API
sprint: 0
engineers: 1
owner: cwijayasundaragmail.com
---
# PRD: Shopping Cart API, sprint 0

## Context and problem

A lightweight shopping cart application that allows users to add items to a cart, retrieve a specific item by its ID, and view all items currently in the cart.

## Goals and success metrics

- Add a new item to the shopping cart.
- View a single item using its unique `id`.
- View all items in the shopping cart.

## Non-goals

- No user authentication or multi-user carts.
- No updating or deleting items.
- No checkout, payments, taxes or discounts.
- No persistent database storage: the cart is held in memory.

## Users and scenarios

- S1. A user adds "Coffee beans" with price 8.5 and quantity 2; the API answers 201 with the item and a generated id; GET /items/<that id> returns the same item; GET /items returns a list holding it.

## Functional requirements

### FR-1: Add an item

Need: a user adds a new item (name, price, quantity) to the cart.
Priority: must

- AC-1.1: WHEN POST /items is called with a non-empty string `name`, a number `price` >= 0 and an integer `quantity` >= 1 THE SYSTEM SHALL store the item and respond 201 Created with the item as JSON, including a generated unique `id`
- AC-1.2: WHEN POST /items is called with `name` missing or not a non-empty string THE SYSTEM SHALL respond 400 Bad Request with a clear error message and store nothing
- AC-1.3: WHEN POST /items is called with `price` missing, not a number or below 0 THE SYSTEM SHALL respond 400 Bad Request with a clear error message and store nothing
- AC-1.4: WHEN POST /items is called with `quantity` missing, not an integer or below 1 THE SYSTEM SHALL respond 400 Bad Request with a clear error message and store nothing
- AC-1.5: WHEN POST /items is rejected THE SYSTEM SHALL respond with the body `{"detail": "<message>"}` where the message names the invalid field (confirmed at chart by cwijayasundaragmail.com)

### FR-2: View an item by id

Need: a user retrieves one item from the cart by its `id`.
Priority: must
Depends on: FR-1

- AC-2.1: Given an item in the cart, when GET /items/{id} is called with its `id`, then the system responds 200 OK with exactly that item
- AC-2.2: WHEN GET /items/{id} is called with an `id` no item has THE SYSTEM SHALL respond 404 Not Found with the body `{"detail": "Item not found"}` (confirmed at chart by cwijayasundaragmail.com)

### FR-3: View all items

Need: a user sees every item currently in the cart.
Priority: must
Depends on: FR-1

- AC-3.1: Given items in the cart, when GET /items is called, then the system responds 200 OK with a JSON list of every added item
- AC-3.2: Given an empty cart, when GET /items is called, then the system responds 200 OK with `[]`
- AC-3.3: WHEN GET /items is called THE SYSTEM SHALL list the items in insertion order, oldest first (confirmed at chart by cwijayasundaragmail.com)

## Data rules

- DR-1: Each item has an `id`: a string the system generates, unique among items in the cart.
- DR-2: `name` is a required non-empty string.
- DR-3: `price` is a required number >= 0 (the unit price).
- DR-4: `quantity` is a required integer >= 1.

## Non-functional requirements

none

## Examples

## Boundaries

- Always: run the tests before every commit
- Ask first: adding a dependency
- Never: store the cart outside process memory in v1

## Integrations and constraints

- Python 3.12 via uv, FastAPI, uvicorn, pytest (chosen at init by cwijayasundaragmail.com).
- Rollout: local only — run with `make run` (uvicorn) on a developer machine; no deployment, monitoring or rollback (confirmed at chart by cwijayasundaragmail.com)
- Ground truth: the acceptance criteria here define correct; tests use synthetic items, the client supplies no sample data (confirmed at chart by cwijayasundaragmail.com)

## Decisions

- 2026-11-22: Status codes 201, 200, 400 and 404 from the source's suggested REST endpoints are taken as the API's statuses — the stack is a REST API.

## Open questions

none
