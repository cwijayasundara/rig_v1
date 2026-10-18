# PRD: Simple Shopping Cart (Python)

Status: Draft v1 · 2026-10-17
Purpose: a small, fully specified greenfield app, used to exercise the rig harness end to end (intent, build, verify).

## 1. Summary

A single-user shopping cart written in Python. A user can add an item to the cart, edit an item already in the cart, and remove an item from the cart. The cart always shows correct line totals and an overall total. State survives between runs.

## 2. Goals

- G1. Add an item to the cart.
- G2. Edit an item already in the cart (quantity and unit price).
- G3. Remove an item from the cart.
- G4. Show the cart contents with line totals and a grand total.
- G5. Keep the cart between runs.
- G6. Keep the business logic separate from the interface so it can be tested without the CLI.

## 3. Non-goals

- User accounts, login, multiple carts or multi-user concurrency.
- Product catalogue, inventory, stock checks.
- Checkout, payment, shipping, tax, discounts, currency conversion.
- A web UI or GUI.

## 4. Users and scenarios

One persona: a shopper managing a personal cart from the command line.

- S1. Adds "Coffee beans" x2 at 8.50. The cart shows one line, line total 17.00, grand total 17.00.
- S2. Realises they need 3. Edits the quantity. Line total 25.50.
- S3. Changes their mind and removes the item. The cart is empty, total 0.00.

## 5. Functional requirements

An **item** has: `sku` (string, the unique key within a cart), `name` (string), `quantity` (integer), `unit_price` (decimal, 2 places).

| ID | Requirement |
|---|---|
| FR-1 | **Add.** `add(sku, name, quantity, unit_price)` puts a new line in the cart. |
| FR-2 | Adding a `sku` already in the cart increases that line's quantity by the added amount. It does not create a second line, and it does not change the stored name or price. |
| FR-3 | **Edit.** `edit(sku, quantity=None, unit_price=None)` changes the given fields of an existing line. Fields left as `None` are unchanged. |
| FR-4 | Editing quantity to 0 is rejected. Removal is a separate, explicit action. |
| FR-5 | **Remove.** `remove(sku)` deletes the whole line. |
| FR-6 | **View.** `list()` returns all lines in the order they were first added, each with its line total (`quantity * unit_price`), plus the grand total. |
| FR-7 | Money uses `decimal.Decimal` and is rounded half-up to 2 places. Floats are never used for money. |
| FR-8 | The cart persists to a JSON file after every successful change and loads on start. A missing file means an empty cart. |

## 6. Validation and errors

| Case | Behaviour |
|---|---|
| `quantity` is not an integer, or is < 1 (add) | `ValidationError`, cart unchanged |
| `unit_price` is negative or not a valid decimal | `ValidationError`, cart unchanged |
| `sku` or `name` empty or whitespace only | `ValidationError`, cart unchanged |
| `edit` with no fields given | `ValidationError`, cart unchanged |
| `edit` or `remove` on a `sku` not in the cart | `ItemNotFoundError`, cart unchanged |
| Corrupt or unreadable JSON file on load | `StorageError` naming the file. The file is not overwritten. |

A failed operation never writes to disk.

## 7. CLI

Command `cart`, using `argparse`. Exit code 0 on success, 1 on a user error (message to stderr), 2 on a storage error.

```
cart add <sku> <name> <quantity> <unit_price>
cart edit <sku> [--quantity N] [--price P]
cart remove <sku>
cart list
```

The cart file defaults to `~/.simple_cart.json` and can be overridden with `--file PATH` or `CART_FILE`.

`cart list` output:

```
SKU     NAME          QTY   PRICE   TOTAL
coffee  Coffee beans    3    8.50   25.50
                           TOTAL   25.50
```

## 8. Acceptance criteria

Each is a testable statement.

- AC-1. Adding a new item gives a cart with exactly one line holding the given values.
- AC-2. Adding the same `sku` twice (qty 2 then 3) gives one line with quantity 5.
- AC-3. Editing quantity changes only the quantity. Editing price changes only the price. Editing both changes both.
- AC-4. `edit(sku, quantity=0)` raises `ValidationError` and the line is unchanged.
- AC-5. Removing an item leaves other lines untouched and in order.
- AC-6. `edit` and `remove` on an unknown `sku` raise `ItemNotFoundError`.
- AC-7. Grand total equals the sum of line totals. 3 x 0.10 totals exactly 0.30. A half-cent result rounds up.
- AC-8. Every invalid input in section 6 raises the named error and leaves both the in-memory cart and the file unchanged.
- AC-9. After add, edit and remove, a new `Cart` loaded from the same file equals the previous one.
- AC-10. A corrupt file raises `StorageError` and is left byte-for-byte unchanged.
- AC-11. Each CLI command works end to end against a temp file and returns the exit codes in section 7.

## 9. Technical constraints (my defaults, change freely)

- Python 3.11+, standard library only at runtime.
- pytest for tests. Aim for every acceptance criterion above to map to at least one test.
- Layout: `src/cart/` with `models.py` (item and cart logic), `storage.py` (JSON load/save), `cli.py` (argparse only, no business logic), `errors.py`. Tests in `tests/`.
- Money is stored in JSON as strings (e.g. `"8.50"`), never floats.
- Writes are atomic (write a temp file, then rename) so a crash cannot leave a half-written cart.

## 10. Out of scope for v1, possible later

Clearing the whole cart, a quantity-decrement shortcut, a catalogue lookup, a REST API.

## 11. Success measure

All acceptance criteria pass under `pytest`, and the three scenarios in section 4 work by hand from the CLI.

## 12. Open assumptions

- A1. One cart per file is enough.
- A2. Prices are in a single unspecified currency, shown without a symbol.
- A3. `sku` matching is case-sensitive and exact.
