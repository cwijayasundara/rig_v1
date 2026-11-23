---
sprint: 0
status: proposed
decides: [AC-1.2, AC-1.3, AC-1.4, AC-1.5, AC-2.2]
---
# ADR-0002: Errors are `{"detail": "<message>"}`, validation failures answer 400

## Context

AC-1.5 and AC-2.2 fix the error body as `{"detail": "<message>"}`; AC-1.2 to AC-1.4 want 400 for a rejected POST. FastAPI answers a validation failure with 422 and a list under `detail`, so the default does not meet the PRD. The error body is a wire format clients will parse, a one-way door.

## Decision

- Every error body is a JSON object with the single key `detail` holding a string. No other key, never a list.
- A `RequestValidationError` handler in `src/cart/errors.py` turns every validation failure into 400 with `{"detail": "<field>: <reason>"}`, for example `{"detail": "price: must be a number >= 0"}`. `<field>` is `name`, `price`, `quantity` or `body` (malformed or non-object JSON).
- An unknown id is `HTTPException(404, "Item not found")`, which FastAPI renders as `{"detail": "Item not found"}`.
- No route answers 422.

## Consequences

- Rejected: keep 422 (the PRD says 400); a list of errors (the PRD says one message string).
- The handler replaces FastAPI's default for the whole app; every future route gets the same shape.
