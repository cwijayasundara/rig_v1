---
product: Library Desk
sprint: 1
engineers: 1
owner: rig-e2e
---
# PRD: Library Desk, sprint 1

## Context and problem

A small library desk keeps its books and loans on paper, so staff lose track of who holds which book and how many copies are free. This sprint delivers a small Python library that keeps the catalogue and the loans in one JSON file and checks the desk's rules when a book is borrowed or returned.

The desk's lending rules are the data rules DR-4 to DR-7 below.

## Goals and success metrics

| Goal | Metric | Target | How measured |
|---|---|---|---|
| G1. Keep a catalogue | Acceptance criteria for FR-2, FR-3 | All pass | `pytest` |
| G2. Lend and take back books under the desk's rules | Acceptance criteria for FR-4, FR-5 | All pass | `pytest` |
| G3. Data is safe on disk | Acceptance criteria for FR-1 | All pass | `pytest` |

## Non-goals

- No fines, reservations, renewals or reports.
- No member registry: a member is just an id string on a loan.
- No command line, web UI or GUI.
- No editing or removing a book.

## Users and scenarios

- S1. The librarian adds a book (isbn "978-1", "Dune", 2 copies) and checks it out to member "m1" on 2026-03-01. The due date is 2026-03-15 and 1 copy is free.
- S2. "m1" holds 3 books and tries a fourth. The desk refuses and nothing changes.
- S3. "m1" returns the book. The copy is free again.

## Functional requirements

### FR-1: One data file

Need: books and loans survive between runs in one JSON file that is never left half-written.
Priority: must

- AC-1.1: Given no data file, when the library is loaded, then it holds no books and no loans
- AC-1.2: Given a book and a loan saved, when the library is loaded again from the same file, then it holds the same book and loan
- AC-1.3: WHEN any operation raises an error THE SYSTEM SHALL NOT write the data file
- AC-1.4: WHEN the data file is not valid JSON THE SYSTEM SHALL raise StorageError naming the file and leave the file byte-for-byte unchanged

### FR-2: Add a book

Need: the librarian adds a book with an isbn, a title and a number of copies.
Priority: must
Depends on: FR-1

- AC-2.1: Given an empty library, when add_book("978-1", "Dune", 2) is called, then the library holds that book with 2 copies
- AC-2.2: WHEN add_book is called with an empty isbn or an empty title THE SYSTEM SHALL raise ValidationError and leave the library unchanged
- AC-2.3: WHEN add_book is called with copies below 1 or not an integer THE SYSTEM SHALL raise ValidationError and leave the library unchanged
- AC-2.4: WHEN add_book is called with an isbn already in the catalogue THE SYSTEM SHALL raise DuplicateIsbnError and leave the library unchanged

### FR-3: Find a book

Need: the librarian looks a book up by isbn.
Priority: must
Depends on: FR-2

- AC-3.1: Given a book with isbn "978-1", when find_book("978-1") is called, then it returns the book with its title and copies
- AC-3.2: WHEN find_book is called with an isbn that is not in the catalogue THE SYSTEM SHALL raise BookNotFoundError
- AC-3.3: Given a book with isbn "978-1", when find_book("999", raise_missing=False) is called, then it returns None instead of raising
- AC-3.4: Given a book with isbn "ABC-1", when find_book("abc-1") is called, then BookNotFoundError is raised (isbn matching is exact and case-sensitive)

### FR-4: Check out a book

Need: the librarian lends a free copy of a book to a member under the desk's rules.
Priority: must
Depends on: FR-1, FR-3

- AC-4.1: Given a book with a free copy, when check_out("m1", "978-1", date(2026, 3, 1)) is called, then a loan is recorded with the due date set by the desk's loan period and the book has one free copy fewer
- AC-4.2: WHEN check_out is called for a member who already holds the maximum number of loans THE SYSTEM SHALL raise LoanLimitError and leave the library unchanged
- AC-4.3: WHEN check_out is called for a book with no free copy THE SYSTEM SHALL raise NoCopyAvailableError and leave the library unchanged
- AC-4.4: WHEN check_out is called for an isbn not in the catalogue THE SYSTEM SHALL raise BookNotFoundError and leave the library unchanged
- AC-4.5: WHEN check_out is called for a member who has an overdue loan THE SYSTEM SHALL refuse with OverdueLoanError and leave the library unchanged

### FR-5: Return a book

Need: the librarian takes a book back and the copy becomes free.
Priority: must
Depends on: FR-4

- AC-5.1: Given m1 holds a loan of "978-1", when return_book("m1", "978-1") is called, then the loan is removed and the book has one free copy more
- AC-5.2: WHEN return_book is called for a member who does not hold that book THE SYSTEM SHALL raise LoanNotFoundError with the message "Book 978-1 is not on loan to member m1" and leave the library unchanged
- AC-5.3: Given a book with 2 copies, when check_out and return_book calls are applied in any order, then available("978-1") is always between 0 and 2

## Data rules

- DR-1: An isbn is a non-empty string, matched exactly, and unique in the catalogue.
- DR-2: A loan records member id, isbn, the day it was checked out and its due date.
- DR-3: copies is an integer of 1 or more.
- DR-4: A member may hold at most 3 books on loan at the same time.
- DR-5: A book is lent for 14 days; the due date is 14 days after the day it is checked out.
- DR-6: A member with an overdue loan cannot borrow another book.
- DR-7: A book can only be lent while at least one of its copies is free.

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | reliability | Writes are atomic (write a temp file, then rename) | 0 half-written files after a failed or interrupted write | unit test |
| NFR-2 | maintainability | The loan limit and the loan period are each defined in exactly one place | 1 definition each, 0 repeated literals | review |

## Boundaries

- Always: run `pytest` before every commit.
- Ask first: adding a runtime dependency or changing the data file format.
- Never: write the data file when an operation fails.

## Integrations and constraints

- Python 3.11+, standard library only at runtime, pytest for tests.
- Source in `src/library/`, tests in `tests/`. Dates are `datetime.date`.
- Every acceptance criterion maps to at least one test.

## Decisions

- 2026-10-31: one JSON file, no database — a small desk needs no more.
- 2026-10-31: single user, one process at a time: no locking and no file permission handling.
- 2026-10-31: a member may hold more than one loan of the same isbn; each counts toward the limit.
- 2026-10-31: the day is a required argument of check_out and return_book; there is no default of today.
- 2026-10-31: check_out refuses in this order: unknown isbn, overdue loan, loan limit, no free copy.

## Open questions

- OQ-1: What counts as an overdue loan for AC-4.5?
