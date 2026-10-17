| ID | Requirement | Intent | Behaviour | Level | Data | Expected |
|---|---|---|---|---|---|---|
| TC-1 | FR-1 | stock-model | B1 | unit | - | get and list report the stock |
| TC-2 | NFR-1 | stock-model | B2 | unit | - | the message names the SKU |
| TC-3 | FR-2 | cart-stock-limit | B1 | unit | - | adding past the stock throws |
| TC-4 | NFR-1 | cart-stock-limit | B2 | unit | - | the message names the SKU |
| TC-5 | FR-3 | stock-endpoint | B1 | contract | data/stock.json | 200 with the level, 404 for an unknown SKU |
