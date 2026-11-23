---
sprint: 0
status: proposed
decides: [DR-1, AC-1.1]
---
# ADR-0001: Item id is a server-generated UUID4 string

## Context

DR-1 says each item has an `id`: a string the system generates, unique among items in the cart. The id is public: clients put it in GET /items/{id}. Once clients hold ids, the format cannot change without breaking them, so this is a one-way door. The cart is in memory in one process, and FastAPI runs the sync handlers in a threadpool, so two POSTs can run at the same moment.

## Decision

- The id is `str(uuid.uuid4())`, for example `"3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b"`, generated in `ItemStore.add`, never taken from the request body.
- Ids are opaque strings to clients and to GET /items/{id}: matched by exact string equality, never parsed.
- Uniqueness needs no counter and no lock: two concurrent POSTs never get the same id.

## Consequences

- Rejected: a counter (needs a lock under the threadpool, and reuse after a restart looks like a stable id); a UUID1 or timestamp id (leaks time, can collide).
- Ids are not ordered; list order comes from insertion order in the store, not from the id.
- A restart empties the cart, so no id survives a restart (PRD non-goal: no persistence).
