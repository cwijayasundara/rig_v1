# Test cases

| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |
|---|---|---|---|---|---|---|---|
| TC-1 | FR-1, AC-1.1, DR-1 | add-item | B1 | holdout | data/items.json | POST {"name":"Coffee beans","price":8.5,"quantity":2} answers 201 with name, price, quantity as sent and a non-empty string id | - |
| TC-2 | FR-1, AC-1.1, DR-1 | add-item | B2 | integration | data/items.json | two POSTs of the same body get two different string ids | - |
| TC-3 | FR-1, AC-1.1, DR-3, DR-4 | add-item | B3 | contract | data/items.json | price 0 and quantity 1 answer 201 | - |
| TC-4 | FR-1, AC-1.2, DR-2 | add-item | B4 | holdout | data/items.json | name missing, empty ("") or not a string (123) each answer 400 with "name" in detail, and GET /items stays [] | - |
| TC-5 | FR-1, AC-1.3, DR-3 | add-item | B5 | contract | data/items.json | price missing, "8.5" or -1 answers 400 and nothing is stored | - |
| TC-6 | FR-1, AC-1.4, DR-4 | add-item | B6 | contract | data/items.json | quantity missing, 0 or 2.0 answers 400 and nothing is stored | - |
| TC-7 | FR-1, AC-1.5 | add-item | B7 | contract | data/items.json | a rejected POST answers {"detail": "price: must be a number >= 0"}, a string naming the field | - |
| TC-8 | FR-1, AC-1.1, DR-1 | add-item | B8 | contract | - | a client-sent id is ignored (generated id differs) and an unknown key is not echoed | - |
| TC-9 | FR-1, AC-1.3, AC-1.4, DR-3, DR-4 | add-item | B9 | contract | - | boolean, numeric string, NaN and Infinity price and boolean, "2" quantity each answer 400 | - |
| TC-10 | FR-1, AC-1.1, DR-1 | add-item | B10 | unit | - | 50 concurrent valid POSTs leave 50 items with 50 distinct ids | - |
| TC-11 | FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5 | add-item | B11 | contract | data/items.json | no invalid body answers 422 or a list detail: status is 400 with a string detail | - |
| TC-12 | FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5 | add-item | B12 | contract | - | invalid JSON, empty body and a JSON array answer 400 {"detail": "body: must be a JSON object"} | - |
| TC-13 | FR-1, AC-1.2, AC-1.3, AC-1.4, AC-1.5 | add-item | B13 | contract | data/items.json | with name, price and quantity all invalid the message names name and nothing is stored | - |
| TC-14 | FR-2, AC-2.1 | get-item | B1 | holdout | data/items.json | GET /items/{id} of a posted Coffee beans item answers 200 with exactly that item | - |
| TC-15 | FR-2, AC-2.1, DR-1 | get-item | B2 | integration | data/items.json | with three items posted, each id returns its own item | - |
| TC-16 | FR-2, AC-2.2 | get-item | B3 | holdout | - | GET /items/does-not-exist answers 404 {"detail": "Item not found"} | - |
| TC-17 | FR-2, AC-2.2, DR-1 | get-item | B4 | contract | - | non-UUID, very long and upper-cased stored id each answer 404 {"detail": "Item not found"} | - |
| TC-18 | FR-3, AC-3.1 | list-items | B1 | holdout | data/items.json | after posting Coffee beans, GET /items answers 200 with a list holding that item | - |
| TC-19 | FR-3, AC-3.2 | list-items | B2 | contract | - | empty cart: GET /items answers 200 [] | - |
| TC-20 | FR-3, AC-3.3 | list-items | B3 | integration | data/items.json | three items posted come back oldest first, in the same order on repeated calls | - |
| TC-21 | FR-3, AC-3.1 | list-items | B4 | unit | - | GET /items during 50 threaded POSTs always answers 200 with whole items | - |
| TC-22 | FR-3, AC-3.1 | list-items | B5 | contract | - | GET /items?x=1 answers the full list, query ignored | - |
