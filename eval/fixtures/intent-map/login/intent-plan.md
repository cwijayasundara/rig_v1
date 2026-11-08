# Intent map

## Said
- S1: You only get a token with the right password.
- S2: Only admin accounts get admin tokens.
- S3: Email wins when both an email and a username are sent.

## Decisions
- D1: both-ways. A right password gets a token and a wrong one is refused.
- D2: one-way-because: the words only say which role an admin gets, not that a login succeeds.
- D3: one-way-because: the words only say which table wins when both identities are sent, not how a token is made.

## Map
- R1: said S1. decision D1. kind formal. clauses C2, C3.
- R2: said S2. decision D2. kind formal. clauses C7, C8.
- R3: said S3. decision D3. kind formal. clauses C9.
- T1: kind empirical. scenarios E1, E2.
- N1: kind not-promised.

## Formal
### C2 only-when
A token only for the account the login names, with the right password as `check_password()` judges it, carrying that account's id and its table's role, issued by `signer()` at `clock()` time.
### C3 always
The right password for the named account gets a token, unless `lookup()` or `signer()` failed.
### C7
The admin role only for a username with no email sent.
### C8
An email login's token carries the customer role.
### C9
An email, when sent, selects the customer table.

## Empirical
### E1
title: check_password answers with bcrypt's verdict
given: a hash made from hunter2
when: check_password is called with hunter2, hunter3, and the empty string
then: Ok(true), Ok(false), Ok(false)
status: planned

### E2
title: check_password errors only on an unreadable hash
given: a hash bcrypt cannot read
when: check_password is called with any password
then: an error, and never Ok
status: planned

## Trusted
- check_password: answers with bcrypt's verdict and errors only on an unreadable hash. pin: python3 -m pytest -q tests/test_check_password.py
- lookup: returns the row of the named account in the table the identity selects. pin: python3 -m pytest -q tests/test_trusted_boundary.py
- signer: signs a token carrying the id and role it is given, or fails. pin: python3 -m pytest -q tests/test_trusted_boundary.py
- clock: gives the time a token is issued at. pin: python3 -m pytest -q tests/test_trusted_boundary.py

## Not promised
- N1: Login finishes, and how fast. Other endpoints reading the role. The rate of attempts.
