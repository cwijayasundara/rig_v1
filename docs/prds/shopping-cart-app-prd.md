---
product: simple-cart
sprint: 0
engineers: 1
owner: product owner
---
# PRD: Simple Shopping Cart (Python), sprint 0

<!-- The reference example of templates/prd-format.md: a small, fully specified greenfield app used to exercise rig end to end. -->

## Context and problem

A single shopper keeps a cart from the command line and needs correct line totals and an overall total, kept between runs.

## Goals and success metrics

- Every criterion below passes under pytest, and the three scenarios work by hand from the CLI.

## Non-goals

- User accounts, login, multiple carts or multi-user concurrency.
- Product catalogue, inventory, stock checks.
- Checkout, payment, shipping, tax, discounts, currency conversion.
- A web UI or GUI.

## Users and scenarios

One persona: a shopper managing a personal cart from the command line.

- S1. Adds "Coffee beans" x2 at 8.50. The cart shows one line, line total 17.00, grand total 17.00.
- S2. Realises they need 3. Edits the quantity. Line total 25.50.
- S3. Changes their mind and removes the item. The cart is empty, total 0.00.

## Functional requirements

### FR-1: Add an item

Need: put a new line in the cart.
Priority: must

- AC-1.1: Given an empty cart, when add("coffee", "Coffee beans", 2, "8.50") is called, then the cart holds exactly one line with those values
- AC-1.2: WHEN quantity is not an integer or is below 1 THE SYSTEM SHALL raise ValidationError and leave the cart and the file unchanged
- AC-1.3: WHEN unit_price is negative or not a valid decimal THE SYSTEM SHALL raise ValidationError and leave the cart and the file unchanged
- AC-1.4: WHEN sku or name is empty or whitespace only THE SYSTEM SHALL raise ValidationError and leave the cart and the file unchanged

### FR-2: Add the same sku twice

Need: adding a sku already in the cart grows that line.
Priority: must

- AC-2.1: Given a cart holding coffee with quantity 2, when add("coffee", "Coffee beans", 3, "8.50") is called, then the cart holds one coffee line with quantity 5 and its stored name and price unchanged

### FR-3: Edit an item

Need: change the quantity or unit price of an existing line.
Priority: must

- AC-3.1: WHEN edit(sku, quantity=N) is called THE SYSTEM SHALL change only that line's quantity
- AC-3.2: WHEN edit(sku, unit_price=P) is called THE SYSTEM SHALL change only that line's unit price
- AC-3.3: WHEN edit is called with neither field THE SYSTEM SHALL raise ValidationError and leave the cart unchanged
- AC-3.4: WHEN edit(sku, quantity=0) is called THE SYSTEM SHALL raise ValidationError and leave the line unchanged
- AC-3.5: WHEN edit is called on a sku not in the cart THE SYSTEM SHALL raise ItemNotFoundError and leave the cart unchanged

### FR-4: Remove an item

Need: delete a whole line.
Priority: must

- AC-4.1: WHEN remove(sku) is called THE SYSTEM SHALL delete that line and leave the other lines untouched and in order
- AC-4.2: WHEN remove is called on a sku not in the cart THE SYSTEM SHALL raise ItemNotFoundError and leave the cart unchanged

### FR-5: View the cart

Need: see every line with its total and the grand total.
Priority: must

- AC-5.1: WHEN list() is called THE SYSTEM SHALL return the lines in the order they were first added, each with quantity * unit_price as its line total, plus the grand total
- AC-5.2: Given lines of 3 x 0.10, when list() is called, then the grand total is exactly 0.30
- AC-5.3: WHEN a line total has a half cent THE SYSTEM SHALL round it half up to 2 places

### FR-6: Keep the cart between runs

Need: the cart survives a restart.
Priority: must

- AC-6.1: WHEN a change succeeds THE SYSTEM SHALL write the cart to the JSON file, and a new Cart loaded from that file SHALL equal the previous one
- AC-6.2: WHEN the file does not exist THE SYSTEM SHALL start with an empty cart
- AC-6.3: WHEN the file is corrupt or unreadable THE SYSTEM SHALL raise StorageError naming the file and leave it byte-for-byte unchanged
- AC-6.4: WHEN an operation fails THE SYSTEM SHALL not write to disk

### FR-7: Command line

Need: every operation is a `cart` command.
Priority: must

- AC-7.1: WHEN a command succeeds THE SYSTEM SHALL exit 0
- AC-7.2: WHEN a command fails on user input THE SYSTEM SHALL print the message to stderr and exit 1
- AC-7.3: WHEN a command fails on storage THE SYSTEM SHALL exit 2
- AC-7.4: WHEN --file PATH or CART_FILE is given THE SYSTEM SHALL use that file instead of ~/.simple_cart.json

## Data rules

- DR-1: sku is the unique key of a line within a cart, matched case-sensitively and exactly.
- DR-2: quantity is an integer of at least 1.
- DR-3: Money is a decimal.Decimal with 2 places, never a float, and is stored in JSON as a string such as "8.50".

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | reliability | a crash during a save cannot leave a half-written cart file | 0 partial files in a kill-during-write test | unit |

## Examples

`cart list` output (AC-5.1):

```
SKU     NAME          QTY   PRICE   TOTAL
coffee  Coffee beans    3    8.50   25.50
                           TOTAL   25.50
```

Commands (FR-7):

```
cart add <sku> <name> <quantity> <unit_price>
cart edit <sku> [--quantity N] [--price P]
cart remove <sku>
cart list
```

## Boundaries

- Always: keep the business logic out of cli.py (argparse only).
- Ask first: adding a runtime dependency.
- Never: use floats for money.

## Integrations and constraints

- Python 3.11+, standard library only at runtime; pytest for tests.
- Layout: `src/cart/` with `models.py`, `storage.py`, `cli.py`, `errors.py`; tests in `tests/`.
- Writes are atomic: write a temp file, then rename.

## Decisions

- 2026-10-17: one cart per file; prices in one unspecified currency, shown without a symbol.

## Open questions

none
