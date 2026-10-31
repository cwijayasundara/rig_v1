---
product: Library Desk
sprint: 1
engineers: 1
owner: rig-e2e
---
# PRD: Library Desk, sprint 1

## Context and problem

A small library desk keeps its books, members and loans on paper. Staff lose track of who holds which book and of how many copies are free. This sprint delivers a command-line tool that keeps the catalogue, the members and the loans in one JSON file, and checks the desk's rules when a book is borrowed or returned.

Business rules of the desk, as the librarian states them:

- A member may hold at most 3 books on loan at the same time.
- A book is lent for 14 days; the due date is 14 days after the day it is checked out.
- A member with an overdue loan cannot borrow another book.
- A book can only be lent while at least one of its copies is free.

## Goals and success metrics

| Goal | Metric | Target | How measured |
|---|---|---|---|
| G1. Keep a catalogue | Acceptance criteria for FR-2 to FR-4 | All pass | `pytest` |
| G2. Keep members | Acceptance criteria for FR-5, FR-6 | All pass | `pytest` |
| G3. Lend and take back books under the desk's rules | Acceptance criteria for FR-7 to FR-9 | All pass | `pytest` |
| G4. Usable from the shell and safe on disk | Acceptance criteria for FR-1, FR-10 | All pass | `pytest` |

## Non-goals

- No fines, reservations, holds or waiting lists.
- No multiple branches, accounts, passwords or roles.
- No web UI or GUI.
- No editing of a book or a member after it is created.
- No renewals and no reports (a later sprint).

## Users and scenarios

- S1. The librarian adds a book (isbn "978-1", "Dune", 2 copies), registers member "m1" ("Ada"), checks the book out to "m1" on 2026-03-01. The due date is 2026-03-15 and 1 copy is free.
- S2. "m1" holds 3 books and tries a fourth. The desk refuses and nothing changes.
- S3. "m1" returns the book. The copy is free again.

## Functional requirements

### FR-1: One data file

Need: books, members and loans survive between runs in one JSON file that is never left half-written.
Priority: must

- AC-1.1: Given no data file, when the library is loaded, then it holds no books, no members and no loans
- AC-1.2: Given a book, a member and a loan saved, when the library is loaded again from the same file, then it holds the same books, members and loans
- AC-1.3: WHEN any operation raises an error THE SYSTEM SHALL NOT write the data file
- AC-1.4: WHEN the data file is not valid JSON THE SYSTEM SHALL raise StorageError naming the file and leave the file byte-for-byte unchanged
- AC-1.5: WHEN the data file path is not given THE SYSTEM SHALL use the --file option, else the LIBRARY_FILE environment variable, else ~/.library_desk.json

### FR-2: Add a book

Need: the librarian adds a book with an isbn, a title and a number of copies.
Priority: must
Depends on: FR-1

- AC-2.1: Given an empty library, when add_book("978-1", "Dune", 2) is called, then the library holds that book with 2 copies
- AC-2.2: WHEN add_book is called with an empty isbn or an empty title THE SYSTEM SHALL raise ValidationError and leave the library unchanged

### FR-3: Find a book

Need: the librarian looks a book up by isbn.
Priority: must
Depends on: FR-2

- AC-3.1: Given a library holding isbn "978-1", when find_book("978-1") is called, then it returns the book with its title and copies
- AC-3.2: WHEN find_book is called with an isbn that is not in the catalogue THE SYSTEM SHALL raise BookNotFoundError
- AC-3.3: Given a book with isbn "ABC-1", when find_book("abc-1") is called, then BookNotFoundError is raised (isbn matching is exact and case-sensitive)

### FR-4: Reject bad books

Need: the catalogue never holds a duplicate isbn or an impossible copy count.
Priority: must
Depends on: FR-2

- AC-4.1: WHEN add_book is called with an isbn already in the catalogue THE SYSTEM SHALL raise DuplicateIsbnError and leave the library unchanged
- AC-4.2: WHEN add_book is called with copies below 1 or not an integer THE SYSTEM SHALL raise ValidationError and leave the library unchanged

### FR-5: Register a member

Need: the librarian registers a member with an id and a name.
Priority: must
Depends on: FR-1

- AC-5.1: Given no member "m1", when register_member("m1", "Ada") is called, then the library holds member m1 named Ada
- AC-5.2: WHEN register_member is called with an empty id or an empty name THE SYSTEM SHALL raise ValidationError and leave the library unchanged

### FR-6: Reject duplicate members

Need: two members never share an id.
Priority: must
Depends on: FR-5

- AC-6.1: WHEN register_member is called with an id already registered THE SYSTEM SHALL raise DuplicateMemberError and leave the library unchanged

### FR-7: Check out a book

Need: the librarian lends a free copy of a book to a member under the desk's rules.
Priority: must
Depends on: FR-3, FR-5

- AC-7.1: Given member m1 and a book with a free copy, when check_out("m1", "978-1", date(2026, 3, 1)) is called, then a loan is recorded with the due date set by the desk's loan period and the book has one free copy fewer
- AC-7.2: WHEN check_out is called for a member who already holds the maximum number of loans THE SYSTEM SHALL raise LoanLimitError and leave the library unchanged
- AC-7.3: WHEN check_out is called for a book with no free copy THE SYSTEM SHALL raise NoCopyAvailableError and leave the library unchanged
- AC-7.4: WHEN check_out is called for an unknown member THE SYSTEM SHALL raise MemberNotFoundError, and for an unknown isbn BookNotFoundError, leaving the library unchanged
- AC-7.5: WHEN check_out is called for a member who has an overdue loan THE SYSTEM SHALL refuse with OverdueLoanError and leave the library unchanged

### FR-8: Return a book

Need: the librarian takes a book back and the copy becomes free.
Priority: must
Depends on: FR-7

- AC-8.1: Given m1 holds a loan of "978-1", when return_book("m1", "978-1") is called, then the loan is removed and the book has one free copy more
- AC-8.2: WHEN return_book is called for a member who does not hold that book THE SYSTEM SHALL raise LoanNotFoundError with the message "Book 978-1 is not on loan to member m1" and leave the library unchanged

### FR-9: Free copies stay in range

Need: the count of free copies is always right.
Priority: must
Depends on: FR-7, FR-8

- AC-9.1: Given a book with 2 copies, when check_out and return_book calls are applied in any order, then available("978-1") is always between 0 and 2
- AC-9.2: Given a book with 2 copies and 2 loans, when one loan is returned, then available is 1

### FR-10: Command line

Need: every operation is usable from a `library` command built with argparse.
Priority: must
Depends on: FR-2, FR-3, FR-5, FR-7, FR-8

```
library add-book <isbn> <title> <copies>
library find <isbn> [--json]
library register <member-id> <name>
library checkout <member-id> <isbn> [--on YYYY-MM-DD]
library return <member-id> <isbn>
```

- AC-10.1: Given a temp data file, when `library add-book 978-1 Dune 2` runs, then it exits 0, prints `Added 978-1`, and the file holds the book
- AC-10.2: WHEN `library find 978-1` runs THE SYSTEM SHALL print `978-1  Dune  2 copies` and exit 0
- AC-10.3: WHEN `library find 978-1 --json` runs THE SYSTEM SHALL print the book as one JSON object with keys isbn, title and copies and exit 0
- AC-10.4: WHEN a command fails validation or names an unknown book or member THE SYSTEM SHALL exit 1 with the message on stderr
- AC-10.5: WHEN the data file cannot be read THE SYSTEM SHALL exit 2 and leave the file unchanged
- AC-10.6: WHEN `library --help` runs THE SYSTEM SHALL list all five subcommands and exit 0

## Data rules

- DR-1: An isbn is a non-empty string, matched exactly, and unique in the catalogue.
- DR-2: A member id is a non-empty string, unique among members.
- DR-3: A loan records member id, isbn, the day it was checked out and its due date.
- DR-4: copies is an integer of 1 or more.

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | reliability | Writes are atomic (write a temp file, then rename) | 0 half-written files after a failed or interrupted write | unit test |
| NFR-2 | maintainability | The desk's rules live in one module, apart from the storage code and the CLI | 0 lending rules in the CLI or the storage code | review |
| NFR-3 | maintainability | The loan limit and the loan period are each defined in exactly one place | 1 definition each, 0 repeated literals | review |

## Examples

`library find 978-1` output (AC-10.2):

```
978-1  Dune  2 copies
```

`library checkout m1 978-1 --on 2026-03-01` output:

```
Checked out 978-1 to m1, due 2026-03-15
```

## Boundaries

- Always: run `pytest` before every commit.
- Ask first: adding a runtime dependency or changing the data file format.
- Never: write the data file when an operation fails.

## Integrations and constraints

- Python 3.11+, standard library only at runtime, pytest for tests.
- Source in `src/library/`, tests in `tests/`. Dates are `datetime.date`; the CLI takes ISO dates.
- Every acceptance criterion maps to at least one test.

## Decisions

- 2026-10-31: one JSON file, no database — a small desk needs no more.

## Open questions

- OQ-1: What counts as an overdue loan for AC-7.5?
