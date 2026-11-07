# Intent map

## Said
- S1: You only get a token with the right password.
- S2: Only admin accounts get admin tokens.

## Decisions
- D1: both-ways. A right password gets a token and a wrong one is refused.

## Map
- R1: said S1. decision D1. kind formal. clauses C2, C3.
- N1: kind not-promised.

## Formal
### C2 only-when
A token implies the right password.
### C3 always
The right password gets a token unless lookup or signing failed.

## Empirical

## Not promised
- N1: Login finishes.
