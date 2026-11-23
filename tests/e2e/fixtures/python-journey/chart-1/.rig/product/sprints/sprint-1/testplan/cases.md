# Test cases

| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |
|---|---|---|---|---|---|---|---|
| TC-1 | FR-1, AC-1.1, DR-1 | remove-item | B1 | holdout | data/items.json | after POSTing Coffee beans, DELETE /items/{id} of its id answers 204 with an empty body | - |
| TC-2 | FR-1, AC-1.2 | remove-item | B2 | integration | data/items.json | after DELETE of the Coffee beans id, GET /items/{id} answers 404 | - |
| TC-3 | FR-1, AC-1.3 | remove-item | B3 | integration | data/items.json | with three items posted, DELETE of the second leaves GET /items without it and the other two in their order | - |
| TC-4 | FR-1, AC-1.4, DR-1 | remove-item | B4 | holdout | data/items.json | DELETE /items/does-not-exist answers 404 {"detail": "Item not found"} and the posted item is still there | - |
| TC-5 | FR-1, AC-1.4, DR-1 | remove-item | B4 | contract | data/items.json | an upper-cased copy of a stored id answers 404 and the item stays | - |
| TC-6 | FR-1, AC-1.1, AC-1.4 | remove-item | B5 | contract | data/items.json | a second DELETE of the same id answers 404 | - |
| TC-7 | FR-1, AC-1.1, AC-1.4 | remove-item | B6 | unit | data/items.json | two threads deleting one id get one 204 and one 404 | - |
| TC-8 | FR-1, AC-1.4 | remove-item | B7 | contract | data/items.json | no DELETE answers 400 or 422; statuses are 204 or 404 | - |
