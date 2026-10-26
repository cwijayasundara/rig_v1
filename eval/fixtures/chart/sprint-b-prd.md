---
product: cart-cli
sprint: 1
engineers: 1
owner: product owner
---
# PRD: cart-cli, sprint 1

## Context and problem

Shoppers keep a cart in a JSON file and edit it from the command line. Scripts refer to items by id.

## Functional requirements

### FR-1: Add an item

- Need: `cart add <sku> <quantity>` adds an item and prints its id.
- AC-1.1. Given an empty cart, when `cart add coffee 2` runs, then the cart file holds one item with sku `coffee` and quantity 2.

### FR-2: Remove an item

- Need: `cart remove <id>` removes the item with that id.
- AC-2.1. Given a cart holding item 1, when `cart remove 1` runs, then the cart file holds no item with id 1.

## Data model

The cart file holds `nextId` and a list of items, each with an id, a sku and a quantity. Ids start at 1. Ids are never reused, even after an item is removed.

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | performance | add and remove finish quickly on a 1 000-item cart | under 200 ms | unit |

## Integrations and constraints

Node.js 20, no dependencies, the cart file at `~/.cart.json`.

## Open questions

none
