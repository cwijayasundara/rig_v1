---
product: Library Desk
sprint: 2
engineers: 1
owner: rig-e2e
---
# PRD: Library Desk, sprint 2 (changes to sprint 1)

## Context and problem

The desk runs on the sprint 1 library. Books are now lent for 21 days, the "not on loan" error message is reworded, the librarian wants to renew a loan and to see overdue loans, and the old `raise_missing` flag of `find_book` is no longer wanted and is removed. Everything else in sprint 1 keeps working exactly as it does.

Business rules of the desk now:

- A book is lent for 21 days; the due date is 21 days after the day it is checked out.
- A member may still hold at most 3 books on loan at the same time.
- A loan can be renewed once: its due date moves forward by the loan period (21 days), counted from the old due date.

**Changes since sprint 1**

| Requirement | Kind | Change |
|---|---|---|
| FR-3 Find a book | modified | the `raise_missing` flag of `find_book` is removed; a missing isbn always raises |
| FR-4 Check out a book | modified | loan period 14 days becomes 21; loans gain a `renewed` flag and data files written by sprint 1 (no flag) still load as not renewed |
| FR-5 Return a book | modified | the error message for a book not on loan changes (see AC-5.2) |
| FR-6 Renew a loan | new | |
| FR-7 Overdue report | new | |
| FR-1, FR-2 | unchanged | must behave exactly as in sprint 1 |

## Goals and success metrics

| Goal | Metric | Target | How measured |
|---|---|---|---|
| G4. The new rules hold | Acceptance criteria for FR-3, FR-4, FR-5 (modified) | All pass | `pytest` |
| G5. New operations work | Acceptance criteria for FR-6, FR-7 | All pass | `pytest` |
| G6. No regression | Sprint 1 tests for unchanged requirements | All still pass, unedited | `pytest`, diff review |

## Non-goals

- Do not change FR-1 or FR-2, or the data file format beyond the optional `renewed` field.
- No fines, reservations or notifications. No more than one renewal.

## Functional requirements

### FR-3: Find a book

Need: the librarian looks a book up by isbn.
Priority: must
Depends on: FR-2

- AC-3.1: Given a book with isbn "978-1", when find_book("978-1") is called, then it returns the book with its title and copies
- AC-3.2: WHEN find_book is called with an isbn that is not in the catalogue THE SYSTEM SHALL raise BookNotFoundError
- AC-3.3: WHEN find_book is called with a raise_missing argument THE SYSTEM SHALL raise TypeError (the flag no longer exists)
- AC-3.4: Given a book with isbn "ABC-1", when find_book("abc-1") is called, then BookNotFoundError is raised (isbn matching is exact and case-sensitive)

### FR-4: Check out a book

Need: the librarian lends a free copy of a book to a member under the desk's rules.
Priority: must
Depends on: FR-1, FR-3

- AC-4.1: Given a book with a free copy, when check_out("m1", "978-1", date(2026, 3, 1)) is called, then a loan is recorded with due date 2026-03-22 and the book has one free copy fewer
- AC-4.2: WHEN check_out is called for a member who already holds 3 loans THE SYSTEM SHALL raise LoanLimitError and leave the library unchanged
- AC-4.3: WHEN check_out is called for a book with no free copy THE SYSTEM SHALL raise NoCopyAvailableError and leave the library unchanged
- AC-4.4: WHEN check_out is called for an isbn not in the catalogue THE SYSTEM SHALL raise BookNotFoundError and leave the library unchanged
- AC-4.5: WHEN check_out is called for a member who has an overdue loan THE SYSTEM SHALL refuse with OverdueLoanError and leave the library unchanged
- AC-4.6: Given a data file written by sprint 1 (loans without a renewed field), when the library is loaded, then every such loan loads as not renewed

### FR-5: Return a book

Need: the librarian takes a book back and the copy becomes free.
Priority: must
Depends on: FR-4

- AC-5.1: Given m1 holds a loan of "978-1", when return_book("m1", "978-1") is called, then the loan is removed and the book has one free copy more
- AC-5.2: WHEN return_book is called for a member who does not hold that book THE SYSTEM SHALL raise LoanNotFoundError with the message "Member m1 has no loan of book 978-1" and leave the library unchanged
- AC-5.3: Given a book with 2 copies, when check_out and return_book calls are applied in any order, then available("978-1") is always between 0 and 2

### FR-6: Renew a loan

Need: a member keeps a book for one more loan period.
Priority: must
Depends on: FR-4

- AC-6.1: Given m1 holds a loan of "978-1" due 2026-03-22, when renew("m1", "978-1", date(2026, 3, 20)) is called, then the due date becomes 2026-04-12
- AC-6.2: WHEN renew is called for a loan that has already been renewed once THE SYSTEM SHALL raise RenewalLimitError and leave the loan unchanged
- AC-6.3: WHEN renew is called for a loan whose due date is before the given day THE SYSTEM SHALL raise OverdueLoanError and leave the loan unchanged
- AC-6.4: WHEN renew is called for a loan that does not exist THE SYSTEM SHALL raise LoanNotFoundError with the message "Member m1 has no loan of book 978-1"

### FR-7: Overdue report

Need: the librarian sees which loans are overdue on a given day.
Priority: must
Depends on: FR-4

- AC-7.1: Given loans due 2026-03-22 and 2026-03-25, when overdue_loans(date(2026, 3, 24)) is called, then it returns only the loan due 2026-03-22
- AC-7.2: Given a loan due 2026-03-22, when overdue_loans(date(2026, 3, 22)) is called, then it returns no loans (due today is not overdue)
- AC-7.3: Given loans due 2026-03-23 and 2026-03-22, when overdue_loans(date(2026, 3, 30)) is called, then it returns the loan due 2026-03-22 first
- AC-7.4: WHEN overdue_loans is called THE SYSTEM SHALL NOT write the data file

## Data rules

- DR-4: A loan records whether it has been renewed; a missing field in a stored loan means not renewed.

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | reliability | Writes stay atomic | 0 half-written files after a failed or interrupted write | unit test |
| NFR-2 | maintainability | The loan limit and the loan period are each defined in exactly one place | 1 definition each, 0 repeated literals | review |
| NFR-3 | compatibility | Tests for unchanged requirements pass without edits | 0 edits to tests of FR-1 and FR-2 | `pytest`, diff review |

## Boundaries

- Never: edit a sprint 1 test whose requirement is unchanged, or write the data file in a read-only operation.

## Integrations and constraints

- Same stack and layout as sprint 1 (Python 3.11+, standard library only, pytest, `src/library/`, `tests/`).
- Tests for modified acceptance criteria (FR-3, FR-4, FR-5) may change only where the criterion changed.

## Decisions

- 2026-10-31: renewal counts the new period from the old due date, not from the renewal day — keeps due dates predictable.

## Open questions

none
