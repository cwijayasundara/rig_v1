---
product: shop-app
sprint: 1
engineers: 2
owner: product owner
---
# PRD: shop-app, sprint 1

## Context and problem

Customers can put more of a product in the cart than the shop has.

## Functional requirements

### FR-1: Products have a stock level

Need: the catalog knows how many of each product are in stock.

- AC-1.1: WHEN a product is added with a stock count THE SYSTEM SHALL report that count from get and list

### FR-2: The cart cannot hold more than the stock

Need: adding more than the stock is refused.

- AC-2.1: WHEN more than the stock is added to the cart THE SYSTEM SHALL refuse it with a message that names the SKU

### FR-3: Stock is readable over HTTP

Need: a client can ask how many of a product are in stock.

- AC-3.1: WHEN a client sends GET /stock/<sku> THE SYSTEM SHALL answer with the stock of that product

## Data rules

none

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | operability | every refusal names the SKU | 100% of messages | unit |

## Boundaries

none

## Open questions

none
