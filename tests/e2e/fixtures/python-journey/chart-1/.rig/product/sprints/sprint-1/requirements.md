# Requirements (generated from prd.md by rig: never edit)

- AC-1.1 [rule, proposed] prd.md:35 "WHEN DELETE /items/{id} is called with the id of an item in the cart THE SYSTEM SHALL remove that item from the cart and respond 204 No Content with no body"
- AC-1.2 [rule] prd.md:36 "WHEN GET /items/{id} is called with the id of a removed item THE SYSTEM SHALL respond 404 Not Found"
- AC-1.3 [rule] prd.md:37 "WHEN GET /items is called after an item was removed THE SYSTEM SHALL not include the removed item in the list"
- AC-1.4 [rule] prd.md:38 "WHEN DELETE /items/{id} is called with an id that matches no item THE SYSTEM SHALL respond 404 Not Found and leave every other item in the cart unchanged"
- DR-1 [rule] prd.md:42 "id is a required string path parameter, matched by exact equality against the ids of the items in the cart."
