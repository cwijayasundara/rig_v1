# Error contract

Every error response is JSON `{ "code": string, "message": string }` with the right status, produced by `fail()` in `src/respond.js`.
A handler never sends a bare string as an error.
