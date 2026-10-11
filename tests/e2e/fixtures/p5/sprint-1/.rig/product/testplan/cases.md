| ID | Requirement | Intent | Level | Data | Expected |
|---|---|---|---|---|---|
| TC-1 | FR-1 | cart-view | acceptance | data/two-items.json | both items and a total of 5.00 |
| TC-2 | FR-2 | cart-add | acceptance | - | one line, total 3.50 |
| TC-3 | NFR-1 | walking-skeleton | perf | - | an add takes under 50 ms |
| TC-4 | FR-3 | cart-remove | acceptance | data/two-items.json | only cake remains, total 3.50 |
| TC-5 | NFR-2 | cart-remove | acceptance | - | add and remove 100 times, total unchanged |
